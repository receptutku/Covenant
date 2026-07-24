import type {
  HederaTransactionRecord,
  Property,
  Rental,
  SellerSession,
} from './types'

/**
 * Süreç-içi demo store'u.
 *
 * `globalThis` üzerinde tutulur çünkü Next.js dev sunucusu hot reload'da modülleri
 * yeniden değerlendirir; modül seviyesinde bir Map tutsaydık her kaydetmede demo state
 * sıfırlanırdı. SQLite/native bağımlılık yok — hackathon ortamında kurulum riski sıfır.
 *
 * Kalıcılık yok: sunucu yeniden başlarsa `/api/seed` demo state'i birkaç saniyede kurar.
 */
type Store = {
  properties: Map<string, Property>
  sellerSessions: Map<string, SellerSession>
  /**
   * World nullifier'larının HMAC digest'leri — replay kontrolü için.
   * Ham nullifier ASLA saklanmaz. Anahtar: `HMAC(secret, action + ":" + rawNullifier)`.
   */
  worldReplayDigests: Set<string>
  hederaTransactions: HederaTransactionRecord[]
  rentals: Map<string, Rental>
  /** RENT-001, RENT-002 ... üretmek için. */
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
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = createStore()
  return g[GLOBAL_KEY]
}

/** `/api/reset` için — tüm demo state'i temizler. */
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
 * Oturumu döndürür; süresi dolmuşsa store'dan siler ve `'expired'` bildirir.
 * Çağıran taraf `SELLER_SESSION_REQUIRED` ile `SELLER_SESSION_EXPIRED` arasında
 * ayrım yapabilsin diye üç durumlu sonuç veriyoruz.
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

// ─── World replay koruması ───────────────────────────────────────────────────

/**
 * Digest daha önce görülmediyse kaydeder ve `true` döner; görülmüşse `false`.
 * Kontrol ve kayıt tek adımda yapılır ki iki eşzamanlı istek aynı proof'u geçiremesin.
 */
export function claimReplayDigest(digest: string): boolean {
  const digests = getStore().worldReplayDigests
  if (digests.has(digest)) return false
  digests.add(digest)
  return true
}

// ─── Hedera işlem kaydı ──────────────────────────────────────────────────────

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
