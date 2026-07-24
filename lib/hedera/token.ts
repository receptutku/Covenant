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
 * Hedera Token Service — fractional property shares.
 *
 * Design decisions:
 *  - `decimals = 0`, supply `1000` → a share is an indivisible unit; "3 shares out of 1000"
 *    is far easier for a user to grasp than a fractional balance.
 *  - `kycKey` → transfers are bound to identity. If an account without a KYC grant attempts a
 *    transfer, it is rejected at the NETWORK level, not by an APPLICATION rule. This is the
 *    strongest scene in the demo.
 *  - `freezeKey` → per-account freeze capability (reserved for the P1 lifecycle).
 *  - A 2% fractional fee with `min 1` → models the rental-income distribution mechanism on
 *    secondary transfers. We chose `FeeAssessmentMethod.Inclusive`: when 100 is sent, 100 is
 *    debited from the sender, the receiver gets 98, and 2 goes to the collector. With
 *    Exclusive the sender would be debited 102 and the "how many shares did I sell"
 *    accounting would drift.
 *  - The treasury (operator) is exempt from the fee — which is why no fee is charged on a
 *    primary transfer and it only appears on secondary ones. This distinction has to be
 *    stated explicitly to the judges during the demo.
 */

export const TOTAL_SUPPLY = 1000
export const FRACTIONAL_FEE_BPS = 200 // 2%

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
    // Hedera requires a short symbol; the long name is carried by `setTokenName`.
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
  if (!tokenId) throw new Error('Failed to create the token')

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
 * Associates an account with a token. On Hedera the receiver must explicitly associate first —
 * a network-level rule that prevents unsolicited token transfers.
 *
 * If the account is already associated we pass silently: the seed and demo flows are run
 * repeatedly, and without idempotency the second run would blow up with
 * `TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT`.
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

/** KYC grant — signed with the token's KYC key (the operator). */
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
 * Share transfer.
 *
 * We read the fee from the transaction RECORD, not the receipt — the receipt only carries a
 * status, while the fees actually assessed live only in the record. The proof that "the fee
 * was really charged" comes from this field.
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
 * Maps Hedera status codes to stable API errors.
 *
 * The raw status string is preserved in the `hederaStatus` field: UI logic keys off `code`,
 * but what gets shown large on screen is the `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` text — that
 * is the evidence for the "the network issued this rejection, not the application" narrative.
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
