import { handler, jsonResponse } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { hashscanUrl } from '@/lib/hedera/client'
import { requireProperty } from '@/lib/property'

/**
 * Current server-side view of one property.
 *
 * Exists because the audit trail deliberately cannot answer this. The UI's "refresh
 * status" was reading state out of the HCS timeline, which worked until rejection reasons
 * stopped being published on-chain — a reviewer's free text is the natural place for
 * personal data ("the deed lists a date of birth…"), and a topic message is public and
 * permanent. Only a hash goes on-chain now, so the seller was shown "Reason: not
 * specified" for every rejection.
 *
 * The distinction is worth keeping straight: HCS is the record of what *happened* and is
 * public; this endpoint is the server's *current* view, and it is the only place a seller
 * can read back the words their reviewer wrote.
 *
 * Returns metadata only. Document bytes, salts and commitments never leave the server —
 * `documentCount` and the root are the whole disclosure.
 */
export const GET = handler(async (request) => {
  const propertyId = new URL(request.url).searchParams.get('propertyId')
  if (!propertyId) {
    throw new ApiError('INVALID_INPUT', 'propertyId query parameter is required.')
  }

  const property = requireProperty(propertyId)

  return jsonResponse({
    propertyId: property.propertyId,
    displayName: property.displayName,
    city: property.city,
    sellerAccountId: property.sellerAccountId,
    tokenSymbol: property.tokenSymbol,
    state: property.state,
    createdAt: property.createdAt,
    submittedAt: property.submittedAt ?? null,
    decidedAt: property.decidedAt ?? null,
    // The full text, for the seller who needs to know what to fix. Never on-chain.
    rejectionReason: property.rejectionReason ?? null,
    documentRoot: property.documentRoot ?? null,
    documentCount: property.documentCount,
    // Present once the verifier has approved; this is what /api/tokenize requires.
    attestation: property.attestation ?? null,
    tokenId: property.tokenId ?? null,
    hashscanUrl: property.tokenId ? hashscanUrl('token', property.tokenId) : null,
    files: property.files.map((file) => ({
      name: file.name,
      type: file.type,
      sizeBytes: file.sizeBytes,
    })),
  })
})
