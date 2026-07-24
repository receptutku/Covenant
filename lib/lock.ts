/**
 * Per-key serialization for state-changing chain operations.
 *
 * The bug this exists for is not theoretical — it was reproduced: two concurrent POSTs to
 * `/api/tokenize` for the same property both read state `APPROVED`, both pass the guard,
 * and both mint, producing two real tokens on-chain for one property. A judge
 * double-clicking a button is enough. The same shape in `/api/rental/engage` would lock
 * the tenant's deposit twice, moving real HBAR.
 *
 * The fix is serialization, not rejection: the second caller waits, then re-runs the
 * handler, at which point the state guards that were already there do their job — the
 * property is now TOKENIZED so it gets `ALREADY_TOKENIZED`; the listing is now ENGAGED so
 * it gets `RENTAL_NOT_ENGAGED`. Correct idempotency falls out of existing checks once
 * they stop racing.
 *
 * Read-only endpoints are deliberately not locked: they cannot corrupt anything, and
 * serializing them would only add latency.
 */

const LOCKS_KEY = Symbol.for('pprev.locks.v1')
type GlobalWithLocks = typeof globalThis & { [LOCKS_KEY]?: Map<string, Promise<unknown>> }

function locks(): Map<string, Promise<unknown>> {
  const g = globalThis as GlobalWithLocks
  if (!g[LOCKS_KEY]) g[LOCKS_KEY] = new Map()
  return g[LOCKS_KEY]
}

/** Runs `fn` such that no other call with the same `key` runs concurrently. */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const map = locks()
  const previous = map.get(key) ?? Promise.resolve()

  // The predecessor's failure must not cancel the chain, or one failed request would
  // deadlock the key for the rest of the process's life.
  const run = previous.catch(() => undefined).then(fn)

  // What we publish as the tail is the swallowed variant, so later waiters never see a
  // rejection from someone else's work. Keeping a reference lets us clean up only if no
  // newer caller has taken over the key.
  const tail = run.catch(() => undefined)
  map.set(key, tail)

  try {
    return await run
  } finally {
    if (map.get(key) === tail) map.delete(key)
  }
}
