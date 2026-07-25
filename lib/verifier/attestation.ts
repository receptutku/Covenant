import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { ApiError } from '../errors'
import type { OwnershipAttestation, Property } from '../types'

/**
 * Minimal verifier — the cryptographic binding for a human-reviewed ownership approval.
 *
 * When a human reviews the documents and approves them, that decision is signed with
 * Ed25519. Tokenization unlocks ONLY on a valid signature. This closes the "anyone who
 * claims to own a property can mint tokens" scenario: without a signature, no asset
 * reaches the chain.
 *
 * MVP LIMITATION (deliberate, stated plainly in the README and to the judges): this layer
 * proves the INTEGRITY and the TIMESTAMP of the document; it does not prove that the
 * document came from the land registry. That provenance layer requires TLSNotary/zkTLS and
 * is on the roadmap. The verifier is also a single person here; in production this expands
 * to a multi-notary threshold signature.
 */

const DOMAIN = 'PPREV_OWNERSHIP_V1'

/**
 * An attestation as received from a client: the right fields, none of the guarantees.
 * Every value is a plain string until the signature says otherwise.
 */
export type AttestationCandidate = {
  propertyId: string
  sellerAccountId: string
  documentRoot: string
  decision: string
  issuedAt: string
  expiresAt: string
  signature: string
  verifierPublicKey: string
}

/**
 * The canonical text that gets signed.
 *
 * The field order and the line breaks are FIXED. Because the verifying side regenerates
 * this text and compares it, even a single whitespace difference invalidates the
 * signature — and that is exactly the intent: which property, which seller and which
 * document set an attestation belongs to is baked into the signature itself, so none of
 * it can be swapped out afterwards.
 */
export function canonicalPayload(fields: {
  propertyId: string
  sellerAccountId: string
  documentRoot: string
  decision: 'APPROVED'
  issuedAt: string
  expiresAt: string
}): string {
  return [
    DOMAIN,
    `propertyId=${fields.propertyId}`,
    `sellerAccountId=${fields.sellerAccountId}`,
    `documentRoot=${fields.documentRoot}`,
    `decision=${fields.decision}`,
    `issuedAt=${fields.issuedAt}`,
    `expiresAt=${fields.expiresAt}`,
  ].join('\n')
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value?.trim()) throw new Error(`Missing environment variable: ${name}`)
  return value.trim()
}

function verifierPrivateKey() {
  return createPrivateKey({
    key: Buffer.from(requireEnv('VERIFIER_PRIVATE_KEY'), 'hex'),
    format: 'der',
    type: 'pkcs8',
  })
}

function verifierPublicKey() {
  return createPublicKey({
    key: Buffer.from(requireEnv('VERIFIER_PUBLIC_KEY'), 'hex'),
    format: 'der',
    type: 'spki',
  })
}

export function verifierPublicKeyHex(): string {
  return requireEnv('VERIFIER_PUBLIC_KEY')
}

export function attestationTtlSeconds(): number {
  return Number(process.env.ATTESTATION_TTL_SECONDS ?? 3600)
}

/**
 * Signs the approval decision.
 *
 * `expiresAt` is not arbitrary: the longer an attestation lives, the greater the chance
 * that the property's status has changed since it was signed (see the freshness window Δ
 * in docs/MODELS.md). A short TTL bounds the "it was approved, but time has passed since"
 * risk.
 */
export function signOwnershipAttestation(property: Property): OwnershipAttestation {
  if (!property.documentRoot) {
    throw new ApiError(
      'ATTESTATION_INVALID',
      'The property has no document root; documents must be submitted first.',
    )
  }

  const issuedAt = new Date()
  const expiresAt = new Date(issuedAt.getTime() + attestationTtlSeconds() * 1000)

  const fields = {
    propertyId: property.propertyId,
    sellerAccountId: property.sellerAccountId,
    documentRoot: property.documentRoot,
    decision: 'APPROVED' as const,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  }

  // For Ed25519, sign() takes no hash algorithm — passing null is mandatory.
  const signature = sign(null, Buffer.from(canonicalPayload(fields), 'utf8'), verifierPrivateKey())

  return {
    ...fields,
    signature: signature.toString('base64'),
    verifierPublicKey: verifierPublicKeyHex(),
  }
}

/**
 * The tokenization gate.
 *
 * The order matters: first the mathematical validity of the signature, then that the
 * attestation describes the SAME thing as the property in the store, and only then the
 * expiry check.
 *
 * The second step is the critical one — a signature can be perfectly valid and still
 * belong to a different property's attestation. Without comparing the fields against the
 * store, an attacker could take the signature from an approved property and use it to
 * tokenize an unapproved one.
 */
export function assertAttestationValid(
  // Takes an UNVERIFIED candidate, not a typed `OwnershipAttestation`. That is the whole
  // point of the function: it is handed whatever arrived over the wire. Declaring the
  // parameter as the verified type would force callers to assert a guarantee this
  // function exists to establish, and would push shape-checking upstream into Zod — where
  // a tampered attestation gets rejected as malformed input instead of as a forgery.
  attestation: AttestationCandidate,
  property: Property,
): void {
  const payload = canonicalPayload({
    propertyId: attestation.propertyId,
    sellerAccountId: attestation.sellerAccountId,
    documentRoot: attestation.documentRoot,
    decision: 'APPROVED',
    issuedAt: attestation.issuedAt,
    expiresAt: attestation.expiresAt,
  })

  let signatureOk = false
  try {
    signatureOk = verify(
      null,
      Buffer.from(payload, 'utf8'),
      verifierPublicKey(),
      Buffer.from(attestation.signature, 'base64'),
    )
  } catch {
    signatureOk = false
  }

  if (!signatureOk) {
    throw new ApiError(
      'ATTESTATION_INVALID',
      'Invalid attestation signature — the contents were modified after signing.',
    )
  }

  if (attestation.decision !== 'APPROVED') {
    throw new ApiError('ATTESTATION_INVALID', 'The attestation does not carry an approval decision.')
  }

  const mismatch =
    attestation.propertyId !== property.propertyId ||
    attestation.sellerAccountId !== property.sellerAccountId ||
    attestation.documentRoot !== property.documentRoot

  if (mismatch) {
    throw new ApiError(
      'ATTESTATION_INVALID',
      'This attestation does not belong to this property — propertyId, seller or document root does not match.',
    )
  }

  if (Date.parse(attestation.expiresAt) <= Date.now()) {
    throw new ApiError(
      'ATTESTATION_EXPIRED',
      'The attestation has expired; the property must be re-verified.',
    )
  }
}
