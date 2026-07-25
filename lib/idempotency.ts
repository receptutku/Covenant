/**
 * Short-lived replay suppression for operations that move value.
 *
 * `withLock` serializes concurrent calls, and for most endpoints that is enough: once two
 * requests stop racing, the state guards that were already there reject the second one —
 * a tokenized property answers `ALREADY_TOKENIZED`, an engaged listing answers
 * `RENTAL_NOT_ENGAGED`. Correct idempotency falls out of existing checks.
 *
 * `/api/buy` is the exception, and it is the one that matters most: a share transfer has no
 * state to conflict with. Nothing about the ledger makes a second identical transfer
 * invalid — it is simply a second transfer. So serializing two clicks produces two real
 * transfers of real shares, in order, both succeeding. buyer1 holds exactly the 100 shares
 * the secondary scene consumes, so the second click does not fail loudly; it quietly leaves
 * the NEXT rehearsal to die with INSUFFICIENT_TOKEN_BALANCE, which needs a full
 * `npm run stage` to recover.
 *
 * The window is deliberately short. This is not a general idempotency layer — those are
 * keyed by a client-supplied request id, which would need the frontend to send one. It is a
 * guard against the specific thing that happens on stage: a presenter under pressure
 * clicking twice, or clicking again because the first click appeared to hang.
 */

const CACHE_KEY = Symbol.for('pprev.idempotency.v1')

type Entry = { at: number; value: unknown }
type GlobalWithCache = typeof globalThis & { [CACHE_KEY]?: Map<string, Entry> }

function cache(): Map<string, Entry> {
  const g = globalThis as GlobalWithCache
  if (!g[CACHE_KEY]) g[CACHE_KEY] = new Map()
  return g[CACHE_KEY]
}

/**
 * Runs `fn`, or returns the result of an identical call made within `windowMs`.
 *
 * Only successful results are remembered. A failure must stay retryable: a transfer that
 * was rejected for a transient reason is exactly the case where the user SHOULD click
 * again, and caching the rejection would turn a recoverable moment into a dead button.
 *
 * `replayed` tells the caller whether it is looking at fresh work or a cached answer, so
 * the response can say so rather than claiming a transfer that did not happen this time.
 */
export async function withReplaySuppression<T>(
  key: string,
  windowMs: number,
  fn: () => Promise<T>,
): Promise<{ value: T; replayed: boolean }> {
  const map = cache()
  const now = Date.now()

  // Swept on every call rather than on a timer: the map only ever holds entries from the
  // last few seconds of activity, and a timer would keep a dev server's event loop alive.
  for (const [existing, entry] of map) {
    if (now - entry.at > windowMs) map.delete(existing)
  }

  const hit = map.get(key)
  if (hit && now - hit.at <= windowMs) {
    return { value: hit.value as T, replayed: true }
  }

  const value = await fn()
  map.set(key, { at: Date.now(), value })
  return { value, replayed: false }
}
