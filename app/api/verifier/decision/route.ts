import { ApiError } from '@/lib/errors'
import { handler, jsonResponse, parseBody, requireAdminSecret } from '@/lib/api'
import { submitEventSafe } from '@/lib/hedera/topic'
import { requireProperty } from '@/lib/property'
import { verifierDecisionSchema } from '@/lib/schemas'
import { putProperty } from '@/lib/store'
import { HCS_EVENTS } from '@/lib/types'
import { signOwnershipAttestation } from '@/lib/verifier/attestation'

/**
 * The human decision point — and the moment trust becomes cryptographic.
 *
 * On approval the verifier's Ed25519 key signs a statement binding the property, the
 * seller's account and the document root together. `/api/tokenize` will not mint anything
 * without that signature, so this endpoint is the only path from "documents submitted" to
 * "asset on chain".
 *
 * A decision is only accepted for a property that is actually awaiting review. Re-deciding
 * an already-approved property would silently mint a second attestation with a fresh expiry,
 * quietly extending its lifetime past the freshness window.
 */
export const POST = handler(async (request) => {
  requireAdminSecret(request)

  const body = await parseBody(request, verifierDecisionSchema)
  const property = requireProperty(body.propertyId)

  if (property.state !== 'PENDING_REVIEW') {
    throw new ApiError(
      'OWNERSHIP_PENDING',
      `Only a property awaiting review can be decided; this one is ${property.state}.`,
    )
  }

  const decidedAt = new Date().toISOString()

  if (body.decision === 'REJECTED') {
    const reason = body.reason!.trim()
    putProperty({
      ...property,
      state: 'REJECTED',
      decidedAt,
      rejectionReason: reason,
      attestation: undefined,
    })

    await submitEventSafe(HCS_EVENTS.OWNERSHIP_REJECTED, property.propertyId, {
      decidedAt,
      // The reason is operational text written by the reviewer, never personal data.
      reason,
    })

    return jsonResponse({ propertyId: property.propertyId, state: 'REJECTED', reason })
  }

  const attestation = signOwnershipAttestation(property)

  putProperty({
    ...property,
    state: 'APPROVED',
    decidedAt,
    rejectionReason: undefined,
    attestation,
  })

  await submitEventSafe(HCS_EVENTS.OWNERSHIP_APPROVED, property.propertyId, {
    documentRoot: attestation.documentRoot,
    issuedAt: attestation.issuedAt,
    expiresAt: attestation.expiresAt,
    verifierPublicKey: attestation.verifierPublicKey,
  })

  return jsonResponse({ propertyId: property.propertyId, state: 'APPROVED', attestation })
})
