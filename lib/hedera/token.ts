import {
  AccountId,
  Client,
  CustomFractionalFee,
  FeeAssessmentMethod,
  PrivateKey,
  Status,
  StatusError,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TokenGrantKycTransaction,
  TokenSupplyType,
  TokenType,
  TransferTransaction,
} from '@hashgraph/sdk'
import { getClient, getOperator, hashscanUrl } from './client'
import { recordTransaction } from '../store'
import { ApiError } from '../errors'

/**
 * Hedera Token Service — fraksiyonel mülk hissesi.
 *
 * Tasarım kararları:
 *  - `decimals = 0`, arz `1000` → bir hisse bölünmez bir birim; "1000'de 3 hisse"
 *    demek kullanıcı için ondalıklı bakiyeden anlaşılır.
 *  - `kycKey` → transfer kimliğe bağlanır. KYC verilmemiş hesap transfer denerse
 *    işlem UYGULAMA kuralıyla değil AĞ SEVİYESİNDE reddedilir. Demonun en güçlü sahnesi.
 *  - `freezeKey` → hesap bazlı dondurma yeteneği (P1 lifecycle için ayrılmış).
 *  - `%2` fractional fee, `min 1` → ikincil transferlerde kira geliri dağıtım
 *    mekanizmasını temsil eder. `FeeAssessmentMethod.Inclusive` seçildi: alıcı 100
 *    isteyince gönderenin bakiyesinden 100 düşer, alıcı 98 alır, 2 collector'a gider.
 *    Exclusive olsaydı gönderenden 102 düşerdi ve "kaç hisse sattım" muhasebesi kayardı.
 *  - Treasury (operator) fee'den muaftır — bu yüzden primary transfer'da fee kesilmez,
 *    yalnız secondary'de görünür. Demoda bu ayrımı jüriye açıkça söylemek gerekiyor.
 */

export const TOTAL_SUPPLY = 1000
export const FRACTIONAL_FEE_BPS = 200 // %2

export type CreatedToken = {
  tokenId: string
  transactionId: string
  hashscanUrl: string
  totalSupply: number
  decimals: number
  fractionalFeeBps: number
}

export async function createPropertyToken(
  params: { propertyId: string; displayName: string; tokenSymbol: string },
  client: Client = getClient(),
): Promise<CreatedToken> {
  const operator = getOperator()

  const fractionalFee = new CustomFractionalFee()
    .setNumerator(FRACTIONAL_FEE_BPS)
    .setDenominator(10_000)
    .setMin(1)
    .setFeeCollectorAccountId(operator.accountId)
    .setAssessmentMethod(FeeAssessmentMethod.Inclusive)

  const response = await new TokenCreateTransaction()
    // Sembol Hedera'da kısa olmalı; uzun isim `setTokenName`'de taşınır.
    .setTokenName(`PPREV ${params.displayName}`.slice(0, 100))
    .setTokenSymbol(params.tokenSymbol.slice(0, 32))
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(0)
    .setInitialSupply(TOTAL_SUPPLY)
    .setSupplyType(TokenSupplyType.Finite)
    .setMaxSupply(TOTAL_SUPPLY)
    .setTreasuryAccountId(operator.accountId)
    .setAdminKey(operator.privateKey.publicKey)
    .setKycKey(operator.privateKey.publicKey)
    .setFreezeKey(operator.privateKey.publicKey)
    .setCustomFees([fractionalFee])
    .setTokenMemo(`PPREV property ${params.propertyId}`)
    .execute(client)

  const receipt = await response.getReceipt(client)
  const tokenId = receipt.tokenId
  if (!tokenId) throw new Error('Token oluşturulamadı')

  const transactionId = response.transactionId.toString()
  const url = hashscanUrl('token', tokenId.toString())

  recordTransaction({
    transactionId,
    kind: 'TOKEN_CREATE',
    propertyId: params.propertyId,
    at: new Date().toISOString(),
    hashscanUrl: url,
  })

  return {
    tokenId: tokenId.toString(),
    transactionId,
    hashscanUrl: url,
    totalSupply: TOTAL_SUPPLY,
    decimals: 0,
    fractionalFeeBps: FRACTIONAL_FEE_BPS,
  }
}

/**
 * Hesabı token'a bağlar. Hedera'da alıcının önce açıkça associate olması gerekir —
 * istenmeyen token gönderimini engelleyen ağ seviyesi kural.
 *
 * Zaten bağlıysa sessizce geçer: seed ve demo akışları birden çok kez çalıştırılıyor,
 * idempotent olmazsa ikinci tur `TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT` ile patlar.
 */
export async function associateToken(
  tokenId: string,
  account: { accountId: AccountId; privateKey: PrivateKey },
  client: Client = getClient(),
): Promise<{ transactionId: string | null; alreadyAssociated: boolean }> {
  try {
    const response = await (
      await new TokenAssociateTransaction()
        .setAccountId(account.accountId)
        .setTokenIds([tokenId])
        .freezeWith(client)
        .sign(account.privateKey)
    ).execute(client)

    await response.getReceipt(client)
    const transactionId = response.transactionId.toString()

    recordTransaction({
      transactionId,
      kind: 'ASSOCIATE',
      at: new Date().toISOString(),
      hashscanUrl: hashscanUrl('transaction', transactionId),
    })

    return { transactionId, alreadyAssociated: false }
  } catch (error) {
    if (hasStatus(error, Status.TokenAlreadyAssociatedToAccount)) {
      return { transactionId: null, alreadyAssociated: true }
    }
    throw error
  }
}

/** KYC grant — token'ın KYC key'iyle (operator) imzalanır. */
export async function grantKyc(
  tokenId: string,
  accountId: AccountId | string,
  client: Client = getClient(),
): Promise<string> {
  const response = await new TokenGrantKycTransaction()
    .setTokenId(tokenId)
    .setAccountId(typeof accountId === 'string' ? AccountId.fromString(accountId) : accountId)
    .execute(client)

  await response.getReceipt(client)
  const transactionId = response.transactionId.toString()

  recordTransaction({
    transactionId,
    kind: 'GRANT_KYC',
    at: new Date().toISOString(),
    hashscanUrl: hashscanUrl('transaction', transactionId),
  })

  return transactionId
}

export type AssessedFee = {
  amount: number
  tokenId: string | null
  collectorAccountId: string | null
}

export type TransferResult = {
  transactionId: string
  hashscanUrl: string
  assessedCustomFees: AssessedFee[]
}

/**
 * Hisse transferi.
 *
 * Fee'yi transaction RECORD'undan okuyoruz, receipt'ten değil — receipt yalnız durum
 * taşır, fiilen kesilen ücretler yalnız record'da bulunur. "Fee gerçekten kesildi mi"
 * kanıtı bu alandan geliyor.
 */
export async function transferShares(
  params: {
    tokenId: string
    from: { accountId: AccountId; privateKey: PrivateKey }
    to: AccountId | string
    amount: number
  },
  client: Client = getClient(),
): Promise<TransferResult> {
  const toAccount =
    typeof params.to === 'string' ? AccountId.fromString(params.to) : params.to

  try {
    const response = await (
      await new TransferTransaction()
        .addTokenTransfer(params.tokenId, params.from.accountId, -params.amount)
        .addTokenTransfer(params.tokenId, toAccount, params.amount)
        .freezeWith(client)
        .sign(params.from.privateKey)
    ).execute(client)

    const record = await response.getRecord(client)
    const transactionId = response.transactionId.toString()
    const url = hashscanUrl('transaction', transactionId)

    recordTransaction({
      transactionId,
      kind: 'TRANSFER',
      at: new Date().toISOString(),
      hashscanUrl: url,
    })

    return {
      transactionId,
      hashscanUrl: url,
      assessedCustomFees: record.assessedCustomFees.map((fee) => ({
        amount: fee.amount?.toNumber() ?? 0,
        tokenId: fee.tokenId?.toString() ?? null,
        collectorAccountId: fee.feeCollectorAccountId?.toString() ?? null,
      })),
    }
  } catch (error) {
    throw mapTransferError(error)
  }
}

/**
 * Hedera durum kodlarını stabil API hatalarına çevirir.
 *
 * Ham durum string'i `hederaStatus` alanında korunur: UI mantığı `code`'a bakar ama
 * ekranda büyük gösterilen `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` metnidir — "bu reddi
 * uygulama değil ağ verdi" anlatısının kanıtı odur.
 */
function mapTransferError(error: unknown): unknown {
  if (hasStatus(error, Status.AccountKycNotGrantedForToken)) {
    return new ApiError(
      'KYC_DENIED',
      'Hedera rejected the transfer: the receiving account has no KYC grant for this token.',
      { hederaStatus: Status.AccountKycNotGrantedForToken.toString() },
    )
  }
  if (hasStatus(error, Status.TokenNotAssociatedToAccount)) {
    return new ApiError(
      'TOKEN_NOT_ASSOCIATED',
      'Hedera rejected the transfer: the receiving account is not associated with this token.',
      { hederaStatus: Status.TokenNotAssociatedToAccount.toString() },
    )
  }
  return error
}

function hasStatus(error: unknown, status: Status): boolean {
  return error instanceof StatusError && error.status._code === status._code
}
