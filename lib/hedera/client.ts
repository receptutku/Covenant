import { AccountBalanceQuery, AccountId, Client, Hbar, PrivateKey } from '@hashgraph/sdk'

/**
 * Hedera testnet istemcisi ve anahtar çözümlemesi.
 *
 * TEK PARSE NOKTASI: Tüm private key'ler `parseKey()` üzerinden geçer. Demo hesapları
 * karışık algoritmalarda (operator ECDSA secp256k1, script'in ürettiği hesaplar ED25519)
 * olduğu için `fromStringDer` kullanıyoruz — DER başlığındaki OID'ye bakıp doğru eğriyi
 * kendisi seçer. `fromStringECDSA`/`fromStringED25519` sabitlemek yanlış imza üretir ve
 * hata `INVALID_SIGNATURE` olarak döner; teşhisi pahalıdır.
 */

export type HederaNetwork = 'testnet' | 'previewnet' | 'mainnet'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    throw new Error(`Eksik ortam değişkeni: ${name} (.env.local dosyasını kontrol et)`)
  }
  return value.trim()
}

export function parseKey(raw: string): PrivateKey {
  const text = raw.trim()
  try {
    return PrivateKey.fromStringDer(text)
  } catch {
    // Portal bazen 0x önekli ham hex verir; DER değilse ECDSA ham anahtar varsayılır.
    return PrivateKey.fromStringECDSA(text.startsWith('0x') ? text.slice(2) : text)
  }
}

export function getNetwork(): HederaNetwork {
  return (process.env.HEDERA_NETWORK ?? 'testnet') as HederaNetwork
}

export type HederaAccount = {
  accountId: AccountId
  privateKey: PrivateKey
}

export function getOperator(): HederaAccount {
  return {
    accountId: AccountId.fromString(requireEnv('OPERATOR_ID')),
    privateKey: parseKey(requireEnv('OPERATOR_KEY')),
  }
}

/**
 * Demo hesabını env'den okur. `create-accounts` script'i çalışmadıysa anlaşılır hata verir
 * — aksi halde arıza `INVALID_ACCOUNT_ID` olarak çok sonra ortaya çıkar.
 */
export function getDemoAccount(name: 'BUYER1' | 'BUYER2' | 'NOKYC'): HederaAccount {
  const id = process.env[`${name}_ID`]
  const key = process.env[`${name}_KEY`]
  if (!id || !key) {
    throw new Error(
      `${name} hesabı tanımlı değil. Önce \`npm run accounts:create\` çalıştır.`,
    )
  }
  return { accountId: AccountId.fromString(id.trim()), privateKey: parseKey(key) }
}

const CLIENT_KEY = Symbol.for('pprev.hedera.client.v1')
type GlobalWithClient = typeof globalThis & { [CLIENT_KEY]?: Client }

/**
 * Paylaşılan istemci. `globalThis`'te tutulur çünkü Next.js hot reload'da modül yeniden
 * değerlendirilir; her seferinde yeni Client açsaydık gRPC bağlantıları sızardı.
 */
export function getClient(): Client {
  const g = globalThis as GlobalWithClient
  if (!g[CLIENT_KEY]) {
    const operator = getOperator()
    const client = Client.forName(getNetwork())
    client.setOperator(operator.accountId, operator.privateKey)
    // Ağ dalgalanmasında istek sonsuza kadar asılı kalmasın.
    client.setRequestTimeout(30_000)
    g[CLIENT_KEY] = client
  }
  return g[CLIENT_KEY]
}

export function closeClient(): void {
  const g = globalThis as GlobalWithClient
  g[CLIENT_KEY]?.close()
  delete g[CLIENT_KEY]
}

/**
 * Script'ler için: istemciyi kullanır ve ne olursa olsun kapatır.
 * Kapatılmazsa Node süreci açık gRPC bağlantısı yüzünden sonlanmaz.
 */
export async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  try {
    return await fn(getClient())
  } finally {
    closeClient()
  }
}

// ─── HashScan linkleri ───────────────────────────────────────────────────────

export function hashscanUrl(
  kind: 'transaction' | 'token' | 'topic' | 'account',
  id: string,
): string {
  return `https://hashscan.io/${getNetwork()}/${kind}/${id}`
}

export function mirrorNodeBaseUrl(): string {
  return `https://${getNetwork()}.mirrornode.hedera.com/api/v1`
}

// ─── Smoke test ──────────────────────────────────────────────────────────────

export async function getHbarBalance(
  client: Client,
  accountId: AccountId | string,
): Promise<Hbar> {
  const balance = await new AccountBalanceQuery()
    .setAccountId(typeof accountId === 'string' ? AccountId.fromString(accountId) : accountId)
    .execute(client)
  return balance.hbars
}
