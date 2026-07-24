import { AccountBalanceQuery, AccountId, Client, Hbar, PrivateKey } from '@hashgraph/sdk'

/**
 * Hedera testnet client and key parsing.
 *
 * SINGLE PARSE POINT: every private key goes through `parseKey()`. The demo accounts use
 * mixed algorithms (the operator is ECDSA secp256k1, the accounts the script generates are
 * ED25519), so we use `fromStringDer` — it reads the OID from the DER header and picks the
 * right curve itself. Hard-coding `fromStringECDSA`/`fromStringED25519` would produce an
 * invalid signature that surfaces as `INVALID_SIGNATURE`, which is expensive to diagnose.
 */

export type HederaNetwork = 'testnet' | 'previewnet' | 'mainnet'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    throw new Error(`Missing environment variable: ${name} (check your .env.local file)`)
  }
  return value.trim()
}

export function parseKey(raw: string): PrivateKey {
  const text = raw.trim()
  try {
    return PrivateKey.fromStringDer(text)
  } catch {
    // The portal sometimes hands out raw hex with a 0x prefix; if it isn't DER, assume a raw ECDSA key.
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
 * Reads a demo account from the environment. If the `create-accounts` script has not been run,
 * this fails with a clear message — otherwise the problem only shows up much later as
 * `INVALID_ACCOUNT_ID`.
 */
export function getDemoAccount(name: 'BUYER1' | 'BUYER2' | 'NOKYC'): HederaAccount {
  const id = process.env[`${name}_ID`]
  const key = process.env[`${name}_KEY`]
  if (!id || !key) {
    throw new Error(
      `The ${name} account is not configured. Run \`npm run accounts:create\` first.`,
    )
  }
  return { accountId: AccountId.fromString(id.trim()), privateKey: parseKey(key) }
}

const CLIENT_KEY = Symbol.for('pprev.hedera.client.v1')
type GlobalWithClient = typeof globalThis & { [CLIENT_KEY]?: Client }

/**
 * Shared client. It lives on `globalThis` because Next.js re-evaluates the module on hot
 * reload; opening a fresh Client every time would leak gRPC connections.
 */
export function getClient(): Client {
  const g = globalThis as GlobalWithClient
  if (!g[CLIENT_KEY]) {
    const operator = getOperator()
    const client = Client.forName(getNetwork())
    client.setOperator(operator.accountId, operator.privateKey)
    // Don't let a request hang forever when the network is flaky.
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
 * For scripts: uses the client and closes it no matter what.
 * Without the close, the Node process never exits because of the open gRPC connection.
 */
export async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  try {
    return await fn(getClient())
  } finally {
    closeClient()
  }
}

// ─── HashScan links ──────────────────────────────────────────────────────────

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
