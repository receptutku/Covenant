import type {
  HederaTransactionRecord,
  Property,
  Rental,
  SellerSession,
} from './types'

/**
 * In-process demo store.
 *
 * It lives on `globalThis` because the Next.js dev server re-evaluates modules on hot
 * reload; a module-level Map would reset the demo state on every file save. No SQLite,
 * no native dependencies — zero setup risk in a hackathon environment.
 *
 * Nothing is persisted: if the server restarts, `/api/seed` rebuilds the demo state in seconds.
 */
type Store = {
  properties: Map<string, Property>
  sellerSessions: Map<string, SellerSession>
  /**
   * HMAC digests of World nullifiers — used for replay protection.
   * The raw nullifier is NEVER stored. Key: `HMAC(secret, action + ":" + rawNullifier)`.
   */
  worldReplayDigests: Set<string>
  hederaTransactions: HederaTransactionRecord[]
  rentals: Map<string, Rental>
  /** Used to generate RENT-001, RENT-002 ... */
  rentalCounter: number
}

const GLOBAL_KEY = Symbol.for('pprev.store.v1')

function createStore(): Store {
  return {
    properties: new Map(),
    sellerSessions: new Map(),
    worldReplayDigests: new Set(),
    hederaTransactions: [],
    rentals: new Map(),
    rentalCounter: 0,
  }
}

type GlobalWithStore = typeof globalThis & { [GLOBAL_KEY]?: Store }

export function getStore(): Store {
  const g = globalThis as GlobalWithStore
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = createStore()
    return g[GLOBAL_KEY]
  }

  // Backfill fields added since this store object was created.
  //
  // The store surviving hot reload is the point of putting it on `globalThis` — but it
  // means a running process keeps a store built by an OLDER version of this module. Adding
  // a field and reading it immediately returns `undefined`, and `[...undefined]` throws:
  // `/api/health` started answering 500 the moment `droppedEvents` was introduced, on a
  // server that had been running fine all morning. Restarting hides it, which is exactly
  // why it is worth handling — the next person to add a field will not think of this.
  const store = g[GLOBAL_KEY]
  const fresh = createStore()
  for (const key of Object.keys(fresh) as (keyof Store)[]) {
    if (store[key] === undefined) {
      // Types are checked at the declaration; this is a one-way widening for the copy.
      ;(store as Record<string, unknown>)[key] = fresh[key]
    }
  }
  return store
}

/** For `/api/reset` — wipes all demo state. */
export function resetStore(): void {
  const g = globalThis as GlobalWithStore
  g[GLOBAL_KEY] = createStore()
}

// ─── Property ────────────────────────────────────────────────────────────────

export function getProperty(propertyId: string): Property | undefined {
  return getStore().properties.get(propertyId)
}

export function putProperty(property: Property): void {
  getStore().properties.set(property.propertyId, property)
}

export function listProperties(): Property[] {
  return [...getStore().properties.values()]
}

export function listPendingProperties(): Property[] {
  return listProperties()
    .filter((p) => p.state === 'PENDING_REVIEW')
    .sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''))
}

// ─── Seller session ──────────────────────────────────────────────────────────

export function putSellerSession(session: SellerSession): void {
  getStore().sellerSessions.set(session.token, session)
}

/**
 * Returns the session; if it has expired, drops it from the store and reports `'expired'`.
 * The result has three states so that callers can distinguish `SELLER_SESSION_REQUIRED`
 * from `SELLER_SESSION_EXPIRED`.
 */
export function readSellerSession(
  token: string | undefined,
): { status: 'ok'; session: SellerSession } | { status: 'missing' | 'expired' } {
  if (!token) return { status: 'missing' }
  const store = getStore()
  const session = store.sellerSessions.get(token)
  if (!session) return { status: 'missing' }
  if (Date.parse(session.expiresAt) <= Date.now()) {
    store.sellerSessions.delete(token)
    return { status: 'expired' }
  }
  return { status: 'ok', session }
}

// ─── World replay protection ─────────────────────────────────────────────────

/**
 * Records the digest and returns `true` if it has not been seen before; `false` otherwise.
 * The check and the write happen in one step so two concurrent requests cannot both pass
 * with the same proof.
 */
/**
 * Forgets every recorded proof digest. Development only — see `/api/dev/clear-replay`.
 *
 * A World nullifier is deterministic in (identity, app, action), so the same person
 * repeating the same check always presents the same nullifier. That is exactly what makes
 * replay protection work, and exactly what makes a SECOND rehearsal fail at step one.
 * Clearing the digests is the honest way to rehearse: it does not weaken the check, it
 * just forgets that this identity was already seen.
 */
export function clearReplayDigests(): number {
  const digests = getStore().worldReplayDigests
  const count = digests.size
  digests.clear()
  return count
}

/**
 * Guard-refused audit events, kept OUTSIDE the resettable store.
 *
 * They were inside it, which quietly defeated the whole mechanism: `npm run stage` resets
 * first and runs preflight after, so the counter was cleared before the thing that reads
 * it ever looked. It could only ever report drops caused by the stage run itself — the
 * exact silence this was built to remove, reintroduced by the command written to prevent
 * it.
 *
 * A dropped event is a diagnostic about a bug in our code, not demo state. Clearing the
 * demo has no bearing on whether that bug is still there, so it survives `/api/reset` and
 * lives until the process does.
 */
const DROPPED_KEY = Symbol.for('pprev.dropped.v1')
type GlobalWithDropped = typeof globalThis & { [DROPPED_KEY]?: string[] }

export function recordDroppedEvent(reason: string): void {
  const g = globalThis as GlobalWithDropped
  if (!g[DROPPED_KEY]) g[DROPPED_KEY] = []
  g[DROPPED_KEY].push(reason)
}

/** Guard-refused audit events since the process started. Read by /api/health. */
export function listDroppedEvents(): string[] {
  return [...((globalThis as GlobalWithDropped)[DROPPED_KEY] ?? [])]
}

export function claimReplayDigest(digest: string): boolean {
  const digests = getStore().worldReplayDigests
  if (digests.has(digest)) return false
  digests.add(digest)
  return true
}

// ─── Hedera transaction log ──────────────────────────────────────────────────

export function recordTransaction(record: HederaTransactionRecord): void {
  getStore().hederaTransactions.push(record)
}

export function listTransactions(propertyId?: string): HederaTransactionRecord[] {
  const all = getStore().hederaTransactions
  return propertyId ? all.filter((t) => t.propertyId === propertyId) : all
}

// ─── Rental ──────────────────────────────────────────────────────────────────

export function nextListingId(): string {
  const store = getStore()
  store.rentalCounter += 1
  return `RENT-${String(store.rentalCounter).padStart(3, '0')}`
}

export function getRental(listingId: string): Rental | undefined {
  return getStore().rentals.get(listingId)
}

export function putRental(rental: Rental): void {
  getStore().rentals.set(rental.listingId, rental)
}

export function listRentals(propertyId?: string): Rental[] {
  const all = [...getStore().rentals.values()]
  return propertyId ? all.filter((r) => r.propertyId === propertyId) : all
}
