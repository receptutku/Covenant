import { handler, jsonResponse } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { hashscanUrl } from '@/lib/hedera/client'
import { requireProperty } from '@/lib/property'
import { requireSellerSession } from '@/lib/world/session'

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
  const url = new URL(request.url)
  const propertyId = url.searchParams.get('propertyId')
  if (!propertyId) {
    throw new ApiError('INVALID_INPUT', 'propertyId query parameter is required.')
  }

  // Requires a seller session. The first version of this endpoint had none, which was a
  // serious mistake: it returned the signed attestation, and that attestation is the ONLY
  // credential /api/tokenize demands. Anyone who could reach the server could have read
  // one and minted someone else's token.
  //
  // The attestation is no longer returned here at all — a mint credential has no business
  // in a status endpoint, and the UI already receives it from /api/verifier/decision.
  // The session gates the reviewer's free text, which is the other thing worth protecting.
  //
  // Honest limitation: a session is bound to the properties it submitted (see below), but not
  // to a Hedera account. Completing Selfie Check makes you a verified unique human who owns
  // what you submit; nothing ties that to the account id you later name. Closing it properly
  // needs the account to sign into the World action context — the same account-binding gap
  // documented for buyer KYC.
  // Header only. The query-string fallback put a live credential into URLs, browser history
  // and the tunnel's access log, and nothing used it — the client sends the header.
  const session = requireSellerSession(request.headers.get('x-seller-session') ?? undefined)

  const property = requireProperty(propertyId)

  // Bound to the session that submitted it. Sessions are otherwise interchangeable, so any
  // Selfie Check could read any property — and propertyIds are `PROP-NNN`, trivially
  // enumerable. What that exposed is `rejectionReason`: the reviewer's full free text, which
  // is the one field deliberately reduced to a hash before it reaches HCS, precisely because
  // free text is where personal data ends up. Seeded properties carry no owner and stay
  // readable; they contain nothing a seller wrote.
  if (property.ownerSessionToken && property.ownerSessionToken !== session.token) {
    throw new ApiError(
      'SELLER_SESSION_REQUIRED',
      'This property belongs to a different session.',
    )
  }

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
    // Whether an approval exists — NOT the approval itself. The attestation is a mint
    // credential; handing it out from a status endpoint would let any reader tokenize the
    // property. The seller's UI already holds it from the decision response.
    hasAttestation: Boolean(property.attestation),
    attestationExpiresAt: property.attestation?.expiresAt ?? null,
    tokenId: property.tokenId ?? null,
    hashscanUrl: property.tokenId ? hashscanUrl('token', property.tokenId) : null,
    files: property.files.map((file) => ({
      name: file.name,
      type: file.type,
      sizeBytes: file.sizeBytes,
    })),
  })
})
