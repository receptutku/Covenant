import type { DocumentCommitment } from './crypto/merkle'

/** docs/API.md §3 — DRAFT → PENDING_REVIEW → APPROVED | REJECTED → TOKENIZED */
export type PropertyState =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'TOKENIZED'

/** docs/API.md §4 — LISTED → APPLIED → ENGAGED → SETTLED | EXPIRED */
export type RentalState = 'LISTED' | 'APPLIED' | 'ENGAGED' | 'SETTLED' | 'EXPIRED'

export type TransactionMode = 'SALE' | 'RENTAL'

export const ALLOWED_FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const
export type AllowedFileType = (typeof ALLOWED_FILE_TYPES)[number]

export const MAX_FILES = 3
export const MAX_FILE_BYTES = 5 * 1024 * 1024

/** Yükleme sonrası saklanan belge. `bytes` private; API üzerinden asla dönmez. */
export type StoredFile = {
  name: string
  type: AllowedFileType
  sizeBytes: number
  bytes: Buffer
}

/** Verifier'ın Ed25519 ile imzaladığı sahiplik beyanı. */
export type OwnershipAttestation = {
  propertyId: string
  sellerAccountId: string
  documentRoot: string
  decision: 'APPROVED'
  issuedAt: string
  expiresAt: string
  signature: string
  verifierPublicKey: string
}

export type Property = {
  propertyId: string
  displayName: string
  city: string
  sellerAccountId: string
  tokenSymbol: string
  state: PropertyState
  createdAt: string
  submittedAt?: string
  decidedAt?: string
  rejectionReason?: string
  /** Belgelerin salted Merkle kökü (hex). Zincire yalnız bu çıkar. */
  documentRoot?: string
  documentCount: number
  /** Private: belge byte'ları ve salt'lar. Yalnız sunucu belleğinde. */
  files: StoredFile[]
  commitments: DocumentCommitment[]
  attestation?: OwnershipAttestation
  tokenId?: string
}

/**
 * Selfie Check sonrası üretilen opak oturum.
 * Token World nullifier DEĞİLDİR — randomBytes(32). Nullifier hiçbir yerde saklanmaz;
 * replay kontrolü ayrı bir HMAC digest kümesiyle yapılır.
 */
export type SellerSession = {
  token: string
  createdAt: string
  expiresAt: string
}

export type Rental = {
  listingId: string
  propertyId: string
  landlordAccountId: string
  tenantAccountId?: string
  /** İstenen depozito (HBAR). */
  reqDeposit: number
  /** Fiilen kilitlenen depozito (HBAR). ENGAGED'e kadar undefined. */
  deposit?: number
  lockWindowSeconds: number
  lockExpiresAt?: string
  state: RentalState
  createdAt: string
  escrowAccountId?: string
  engageTxId?: string
  settleTxId?: string
  slashed?: number
}

/** HashScan linki üretmek için tutulan işlem kaydı. */
export type HederaTransactionRecord = {
  transactionId: string
  kind:
    | 'TOKEN_CREATE'
    | 'ASSOCIATE'
    | 'GRANT_KYC'
    | 'TRANSFER'
    | 'HBAR_TRANSFER'
    | 'TOPIC_CREATE'
    | 'TOPIC_MESSAGE'
  propertyId?: string
  at: string
  hashscanUrl: string
}

/** docs/API.md §2 — Akif'in timeline'ı bu isimleri okur; değiştirme. */
export const HCS_EVENTS = {
  SELLER_ONBOARDED: 'SELLER_ONBOARDED',
  PROPERTY_SUBMITTED: 'PROPERTY_SUBMITTED',
  OWNERSHIP_APPROVED: 'OWNERSHIP_APPROVED',
  OWNERSHIP_REJECTED: 'OWNERSHIP_REJECTED',
  PROPERTY_TOKEN_CREATED: 'PROPERTY_TOKEN_CREATED',
  BUYER_ELIGIBILITY_CONFIRMED: 'BUYER_ELIGIBILITY_CONFIRMED',
  KYC_GRANTED: 'KYC_GRANTED',
  TOKEN_TRANSFERRED: 'TOKEN_TRANSFERRED',
  RENTAL_LISTED: 'RENTAL_LISTED',
  RENTAL_APPLICATION: 'RENTAL_APPLICATION',
  RENTAL_ENGAGED: 'RENTAL_ENGAGED',
  RENTAL_SETTLED: 'RENTAL_SETTLED',
  RENTAL_EXPIRED: 'RENTAL_EXPIRED',
} as const

export type HcsEventType = (typeof HCS_EVENTS)[keyof typeof HCS_EVENTS]

export type HcsEnvelope = {
  schemaVersion: 1
  eventType: HcsEventType
  propertyId: string
  timestamp: string
  payload: Record<string, unknown>
}
