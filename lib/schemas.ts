import { z } from 'zod'
import { ALLOWED_FILE_TYPES, MAX_FILES } from './types'

/**
 * Zod schemas for every P0 endpoint input.
 *
 * The limits live here rather than inside the handlers: what an endpoint accepts must be
 * readable in one place, otherwise the code and `docs/API.md` drift apart silently.
 */

/** Hedera account ID: shard.realm.num */
export const accountIdSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, 'Hedera account ID must be in shard.realm.num format')

export const propertyIdSchema = z
  .string()
  .min(3)
  .max(40)
  // The character set is narrow because this becomes an ENS subname (`prop-002.pprevlisbon.eth`).
  .regex(/^[A-Za-z0-9-]+$/, 'propertyId may only contain letters, digits and hyphens')

export const worldActionSchema = z.enum(['onboard-seller', 'verify-buyer', 'verify-tenant'])

/**
 * The World proof is accepted as a free-form object and is never persisted anywhere until
 * it has been VERIFIED. We deliberately do not pin its shape here, because the fields shift
 * between IDKit versions; verification happens in `lib/world/verify.ts` by asking World's
 * own API.
 */
export const worldProofSchema = z.record(z.string(), z.unknown())

export const uploadedFileSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(ALLOWED_FILE_TYPES),
  dataBase64: z.string().min(1),
})

// ─── Endpoint schemas ────────────────────────────────────────────────────────

export const onboardSchema = z.object({
  proof: worldProofSchema,
  action: z.literal('onboard-seller').default('onboard-seller'),
})

export const attestSchema = z.object({
  sellerSessionToken: z.string().min(1).optional(),
  propertyId: propertyIdSchema,
  displayName: z.string().min(1).max(120),
  city: z.string().min(1).max(80),
  sellerAccountId: accountIdSchema,
  tokenSymbol: z.string().min(1).max(32),
  // We enforce the cap here too, so a 50-file request is rejected before any base64 decoding.
  files: z.array(uploadedFileSchema).min(1).max(MAX_FILES),
})

export const verifierDecisionSchema = z
  .object({
    propertyId: propertyIdSchema,
    decision: z.enum(['APPROVED', 'REJECTED']),
    reason: z.string().max(500).nullish(),
  })
  .refine((value) => value.decision !== 'REJECTED' || !!value.reason?.trim(), {
    message: 'A REJECTED decision requires a reason',
    path: ['reason'],
  })

export const attestationSchema = z.object({
  propertyId: propertyIdSchema,
  sellerAccountId: accountIdSchema,
  documentRoot: z.string().regex(/^[0-9a-f]{64}$/, 'documentRoot must be 64 hex characters'),
  decision: z.literal('APPROVED'),
  issuedAt: z.string(),
  expiresAt: z.string(),
  signature: z.string().min(1),
  verifierPublicKey: z.string().min(1),
})

export const tokenizeSchema = z.object({
  propertyId: propertyIdSchema,
  attestation: attestationSchema,
})

export const rpSignatureSchema = z.object({
  action: worldActionSchema,
  signal: z.string().max(200).optional(),
})

export const kycSchema = z.object({
  propertyId: propertyIdSchema,
  buyerAccountId: accountIdSchema,
  proof: worldProofSchema,
  action: z.literal('verify-buyer').default('verify-buyer'),
})

export const buySchema = z.object({
  propertyId: propertyIdSchema,
  mode: z.enum(['primary', 'secondary', 'nokyc']),
  buyerAccountId: accountIdSchema.optional(),
  amount: z.number().int().positive().max(1000).default(100),
})

export const ensReadSchema = z.object({
  propertyId: propertyIdSchema,
})

// ─── Rentals ─────────────────────────────────────────────────────────────────

export const rentalListSchema = z.object({
  sellerSessionToken: z.string().min(1).optional(),
  propertyId: propertyIdSchema,
  reqDeposit: z.number().positive().max(10_000),
  // The 10s floor exists so the demo can show the expiration scene live; it needs a short window.
  lockWindowSeconds: z.number().int().min(10).max(86_400),
})

export const rentalApplySchema = z.object({
  listingId: z.string().min(1),
  tenantAccountId: accountIdSchema,
  proof: worldProofSchema,
  action: z.literal('verify-tenant').default('verify-tenant'),
  monthlyRent: z.number().positive().max(10_000),
})

export const rentalEngageSchema = z.object({
  sellerSessionToken: z.string().min(1).optional(),
  listingId: z.string().min(1),
})

export const rentalSettleSchema = rentalEngageSchema

/** Expiration is permissionless — once the window has elapsed anyone can trigger it, no session required. */
export const rentalExpireSchema = z.object({
  listingId: z.string().min(1),
})
