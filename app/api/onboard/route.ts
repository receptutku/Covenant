import { handler, jsonResponse, parseBody } from '@/lib/api'
import { submitEventSafe } from '@/lib/hedera/topic'
import { onboardSchema } from '@/lib/schemas'
import { HCS_EVENTS } from '@/lib/types'
import { consumeProofOnce, issueSellerSession } from '@/lib/world/session'
import { verifyWorldProof } from '@/lib/world/verify'

/**
 * Seller / landlord onboarding gate — World Selfie Check.
 *
 * This is the abuse-prevention door: it establishes that a live human is behind the
 * listing, which is what stops one actor from spraying dozens of fake properties. It
 * deliberately does NOT establish ownership — that comes later, from the verifier's
 * signed attestation. Conflating the two would be the classic mistake here.
 *
 * The response carries only an opaque token and its expiry. No nullifier, no proof, and
 * no World identifier of any kind crosses this boundary.
 */
export const POST = handler(async (request) => {
  const body = await parseBody(request, onboardSchema)

  const verified = await verifyWorldProof('onboard-seller', body.proof)
  // Burn the nullifier only after verification succeeds — otherwise a forged proof could
  // be used to lock a real user out of onboarding.
  consumeProofOnce('onboard-seller', verified.nullifier)

  const session = issueSellerSession()

  // The audit event records that onboarding happened, not who onboarded.
  await submitEventSafe(HCS_EVENTS.SELLER_ONBOARDED, 'SELLER', {
    verifiedByWorld: verified.verifiedByWorld,
    // Which World environment actually accepted the proof. Recorded because the boolean
    // alone does not distinguish a simulator proof from a real-device one, and claiming
    // "World verified this" without saying which is a claim a judge cannot check. Absent
    // when nothing verified it.
    worldEnvironment: verified.environment ?? null,
  })

  return jsonResponse({
    onboarded: true,
    sellerSessionToken: session.token,
    expiresAt: session.expiresAt,
  })
})
