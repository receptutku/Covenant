import { handler, jsonResponse, parseBody } from '@/lib/api'
import { submitEventSafe } from '@/lib/hedera/topic'
import { commitDocuments, decodeFiles } from '@/lib/property'
import { attestSchema } from '@/lib/schemas'
import { getProperty, putProperty } from '@/lib/store'
import { HCS_EVENTS, type Property } from '@/lib/types'
import { requireSellerSession } from '@/lib/world/session'

/**
 * Seller submits a property and its supporting documents for review.
 *
 * The privacy-critical step: document bytes and their salts stay in server memory. What
 * reaches the chain is a single Merkle root plus a count — enough to prove later that a
 * specific document was part of this submission and has not been altered, without ever
 * publishing the documents themselves.
 *
 * Requires a valid Selfie session, so an anonymous caller cannot flood the review queue.
 */
export const POST = handler(async (request) => {
  const body = await parseBody(request, attestSchema)
  requireSellerSession(body.sellerSessionToken)

  const files = decodeFiles(body.files)
  const { root, commitments } = commitDocuments(body.propertyId, files)

  const now = new Date().toISOString()
  const existing = getProperty(body.propertyId)

  const property: Property = {
    propertyId: body.propertyId,
    displayName: body.displayName,
    city: body.city,
    sellerAccountId: body.sellerAccountId,
    tokenSymbol: body.tokenSymbol,
    state: 'PENDING_REVIEW',
    createdAt: existing?.createdAt ?? now,
    submittedAt: now,
    documentRoot: root,
    documentCount: files.length,
    files,
    commitments,
    // A resubmission invalidates any earlier decision: the documents changed, so the
    // previous attestation no longer describes this property.
    attestation: undefined,
    rejectionReason: undefined,
    decidedAt: undefined,
    tokenId: existing?.tokenId,
  }

  putProperty(property)

  const event = await submitEventSafe(HCS_EVENTS.PROPERTY_SUBMITTED, property.propertyId, {
    documentRoot: root,
    documentCount: files.length,
    city: property.city,
  })

  return jsonResponse({
    propertyId: property.propertyId,
    state: property.state,
    documentRoot: root,
    documentCount: files.length,
    hcs: event ? { topicId: event.topicId, sequenceNumber: event.sequenceNumber } : null,
  })
})
