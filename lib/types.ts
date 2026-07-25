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

/** A document retained after upload. `bytes` is private; it is never returned over the API. */
export type StoredFile = {
  name: string
  type: AllowedFileType
  sizeBytes: number
  bytes: Buffer
}

/** The ownership attestation signed by the verifier with Ed25519. */
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
  /**
   * The seller session that submitted this property.
   *
   * Sessions were unbound: any Selfie Check produced a token that could read any property.
   * That mattered because `rejectionReason` is the reviewer's free text — the one field
   * deliberately reduced to a hash before HCS, precisely because free text is where personal
   * data ends up ("the deed lists a date of birth…"). It also let any session holder
   * re-submit against an existing propertyId and overwrite it.
   *
   * Absent on seeded properties, which have no submitter and are readable by design.
   */
  ownerSessionToken?: string
  /** Salted Merkle root of the documents (hex). This is the only thing that goes on-chain. */
  documentRoot?: string
  documentCount: number
  /** Private: document bytes and salts. Server memory only. */
  files: StoredFile[]
  commitments: DocumentCommitment[]
  attestation?: OwnershipAttestation
  tokenId?: string
}

/**
 * Opaque session issued after Selfie Check.
 * The token is NOT the World nullifier — it is randomBytes(32). The nullifier is never
 * stored anywhere; replay protection is handled by a separate set of HMAC digests.
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
  /** Requested deposit (HBAR). */
  reqDeposit: number
  /**
   * Monthly rent the landlord advertises, in HBAR.
   *
   * The tenant's income threshold is derived from THIS, not from a figure the applicant
   * supplies. Taking it from the application let an applicant set their own bar, which is
   * an eligibility check in appearance only.
   */
  monthlyRent: number
  /** Deposit actually locked (HBAR). Undefined until ENGAGED. */
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

/** Transaction record kept so we can build a HashScan link. */
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

/** docs/API.md §2 — Akif's timeline reads these names; do not change them. */
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
