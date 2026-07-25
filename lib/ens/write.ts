import { createPublicClient, createWalletClient, http, namehash } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { RECORD_KEYS, RESOLVER_ABI, UNIVERSAL_RESOLVER } from './constants'

/**
 * Publishes a freshly minted token id to the property's ENS record.
 *
 * Why this has to happen automatically: every live run mints a NEW token for the same
 * property, so a record written once goes stale the moment the flow is rehearsed again.
 * That produced a genuinely embarrassing failure mode — the discovery panel resolving one
 * token id from ENS while the transfer underneath used another. A judge reading both
 * screens would see the protocol contradict itself.
 *
 * Fire-and-forget by design. Tokenization has already succeeded and is final on Hedera by
 * the time this runs; a Sepolia hiccup must never turn a successful mint into a failed
 * API response. Failures are logged, and `/api/ens-read` degrades to `env-fallback`
 * independently.
 */

/** Cache invalidation hook — set by lib/ens/read.ts to avoid a circular import. */
let invalidate: ((name: string) => void) | null = null
export function setEnsCacheInvalidator(fn: (name: string) => void): void {
  invalidate = fn
}

/**
 * Names with a publish in flight.
 *
 * A Sepolia write takes ~15-30s to confirm, and the demo opens the discovery panel within
 * seconds of tokenizing. Without this, that read resolves the PREVIOUS token and caches it
 * for a full minute — long enough to outlive the segment, showing a token id the transfer
 * on the adjacent screen contradicts. While a publish is pending, reads bypass the cache
 * so the moment the new value lands it is visible.
 */
const PENDING_KEY = Symbol.for('pprev.ens.pending.v1')
type GlobalWithPending = typeof globalThis & { [PENDING_KEY]?: Set<string> }

function pending(): Set<string> {
  const g = globalThis as GlobalWithPending
  if (!g[PENDING_KEY]) g[PENDING_KEY] = new Set()
  return g[PENDING_KEY]
}

export function isPublishPending(name: string): boolean {
  return pending().has(name)
}

function isConfigured(): boolean {
  return Boolean(process.env.ENS_PRIVATE_KEY?.trim() && process.env.ENS_PARENT_NAME?.trim())
}

export async function publishTokenId(propertyId: string, tokenId: string): Promise<void> {
  if (!isConfigured()) {
    console.warn('[ens] Not configured — skipping token id publication.')
    return
  }

  const parent = process.env.ENS_PARENT_NAME!.trim()
  const name = `${propertyId.toLowerCase()}.${parent}`

  pending().add(name)
  // Drop the stale entry now, not only on success: a read arriving during the write must
  // not be served the previous token from cache.
  invalidate?.(name)

  try {
    await writeTokenId(name, tokenId)
  } finally {
    pending().delete(name)
    invalidate?.(name)
  }
}

async function writeTokenId(name: string, tokenId: string): Promise<void> {
  const account = privateKeyToAccount(process.env.ENS_PRIVATE_KEY as `0x${string}`)
  const transport = http(process.env.SEPOLIA_RPC_URL, { timeout: 20_000 })
  const publicClient = createPublicClient({ chain: sepolia, transport })
  const walletClient = createWalletClient({ account, chain: sepolia, transport })

  // Resolved at call time rather than hard-coded: the v2 alpha redeploys periodically and
  // a stale resolver address would fail silently.
  const resolver = await publicClient.getEnsResolver({
    name: process.env.ENS_PARENT_NAME!.trim(),
    universalResolverAddress: UNIVERSAL_RESOLVER,
  })

  const hash = await walletClient.writeContract({
    address: resolver,
    abi: RESOLVER_ABI,
    functionName: 'setText',
    args: [namehash(name), RECORD_KEYS.propertyTokenId, tokenId],
  })

  await publicClient.waitForTransactionReceipt({ hash })
  // Drop the cached config so the next read reflects the new token immediately rather
  // than serving the previous id for up to a minute.
  invalidate?.(name)

  console.log(`[ens] ${name} → ${RECORD_KEYS.propertyTokenId}=${tokenId} (${hash})`)
}

/**
 * Non-blocking wrapper for use inside request handlers.
 *
 * Deliberately not awaited by the caller: the ENS write takes a Sepolia block, and making
 * a successful tokenization wait on it would add ~15s of latency and a second way for the
 * request to fail.
 */
export function publishTokenIdInBackground(propertyId: string, tokenId: string): void {
  void publishTokenId(propertyId, tokenId).catch((error) => {
    console.error(
      `[ens] Failed to publish token id for ${propertyId}:`,
      error instanceof Error ? error.message : error,
    )
  })
}
