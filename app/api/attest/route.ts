import { handler, jsonResponse, parseBody } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { submitEventSafe } from '@/lib/hedera/topic'
import { commitDocuments, decodeFiles } from '@/lib/property'
import { attestSchema } from '@/lib/schemas'
import { getProperty, putProperty } from '@/lib/store'
import { HCS_EVENTS, type Property } from '@/lib/types'
import { requireSellerSession } from '@/lib/world/session'
import { withLock } from '@/lib/lock'

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
  const session = requireSellerSession(body.sellerSessionToken)

  // Shares a key namespace with /api/tokenize, which is the point. Tokenize reads the
  // property, spends seconds minting, then writes back its snapshot — so a resubmission
  // landing in that gap either had its documents erased, or left the store in
  // PENDING_REVIEW with no tokenId while a real token existed on Hedera. From there
  // approve → tokenize runs again and mints a SECOND token: the same double-mint the lock
  // was added to prevent, reached through a different door.
  return withLock(`property:${body.propertyId}`, async () => {
  const existing = getProperty(body.propertyId)

  // A tokenized property is final. Without this guard a resubmission would flip it back
  // to PENDING_REVIEW while its token keeps existing on-chain — and since the seeded
  // PROP-001 is exactly such a property, one stray upload against its id would kill the
  // secondary-fee and KYC-rejection scenes mid-demo.
  if (existing?.state === 'TOKENIZED') {
    throw new ApiError(
      'ALREADY_TOKENIZED',
      'This property is already tokenized; its document set can no longer be replaced.',
      { tokenId: existing.tokenId },
    )
  }

  // A property belongs to the session that submitted it.
  //
  // Without this, any Selfie Check produced a token that could overwrite ANY property
  // someone else had submitted, by re-submitting against its id.
  //
  // Two limits worth stating rather than leaving to be discovered:
  //
  //   - Seeded properties (PROP-001, PROP-003) carry no owner, so this guard skips them
  //     entirely. PROP-003 in particular is APPROVED and deliberately untokenized so the
  //     rental flow can list it, and the TOKENIZED guard above does not cover it either —
  //     it has no token. A stray upload against that id still kills the rental scene, and
  //     the only thing standing in the way is the hard rule in docs/RUNBOOK.md. `npm run
  //     seed` rewrites both.
  //   - A session is a browser tab, not a person. Reloading the page or verifying a second
  //     time mints a new token, so the same human is refused here — the guard cannot tell
  //     them from a stranger, because nothing durable identifies either. The escape is a new
  //     property id, and the runbook says so.
  if (existing?.ownerSessionToken && existing.ownerSessionToken !== session.token) {
    throw new ApiError(
      'SELLER_SESSION_REQUIRED',
      'This property was submitted by a different session and cannot be replaced from this one.',
    )
  }

  const files = decodeFiles(body.files)
  const { root, commitments } = commitDocuments(body.propertyId, files)

  const now = new Date().toISOString()

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
    ownerSessionToken: session.token,
    // A resubmission invalidates any earlier decision: the documents changed, so the
    // previous attestation no longer describes this property.
    attestation: undefined,
    rejectionReason: undefined,
    decidedAt: undefined,
    tokenId: existing?.tokenId,
  }

  putProperty(property)

  // `city` is deliberately NOT published. It is free text the seller types, and the payload
  // guard inspects key names rather than values — so nothing would have stopped
  // "Lisbon — owner Ana R., born 1984" from being written to a public topic permanently.
  // The audit trail needs to record that documents were submitted and what they commit to;
  // where the property is is display metadata the API already serves.
  const event = await submitEventSafe(HCS_EVENTS.PROPERTY_SUBMITTED, property.propertyId, {
    documentRoot: root,
    documentCount: files.length,
  })

  return jsonResponse({
    propertyId: property.propertyId,
    state: property.state,
    documentRoot: root,
    documentCount: files.length,
    hcs: event ? { topicId: event.topicId, sequenceNumber: event.sequenceNumber } : null,
  })
  })
})
