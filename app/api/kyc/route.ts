import { handler, jsonResponse, parseBody } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { demoAccountFor, hashscanUrl, isReservedNokycAccount } from '@/lib/hedera/client'
import { associateToken, grantKyc } from '@/lib/hedera/token'
import { submitEventSafe } from '@/lib/hedera/topic'
import { requireProperty } from '@/lib/property'
import { kycSchema } from '@/lib/schemas'
import { HCS_EVENTS } from '@/lib/types'
import { consumeProofOnce } from '@/lib/world/session'
import { verifyWorldProof } from '@/lib/world/verify'

/**
 * Buyer eligibility → Hedera KYC grant. This is where an identity signal becomes a
 * network-enforced permission.
 *
 * The chain of consequence is the point of the whole protocol: World attests that the
 * buyer meets the eligibility predicate without revealing who they are; we grant KYC on
 * the property token; and from then on Hedera itself — not our code — decides whether a
 * transfer is allowed. Take this application offline and the rule still holds.
 *
 * What the buyer discloses: that they satisfy the predicate. Not their name, not their
 * date of birth, not a document image. What we retain: a keyed digest for replay
 * protection. The raw nullifier is never stored.
 */
export const POST = handler(async (request) => {
  const body = await parseBody(request, kycSchema)

  const property = requireProperty(body.propertyId)
  if (!property.tokenId) {
    throw new ApiError(
      'PROPERTY_NOT_FOUND',
      'This property has no token yet — it must be tokenized before KYC can be granted.',
    )
  }

  // The nokyc account is the demo's counter-example: associated with the token but never
  // granted KYC, so a transfer to it is refused by the network itself. Granting it KYC
  // would destroy that scene PERMANENTLY — there is no revoke endpoint here, and the
  // account's whole purpose is to be the one that was never verified.
  //
  // This is a demo guard, not a security boundary. The real gap it sits next to: a World
  // proof does not attest to a Hedera account, so nothing binds this grant to the person
  // who verified. Closing that needs account-binding (the account signing a nonce folded
  // into the World action context) and is on the roadmap.
  if (isReservedNokycAccount(body.buyerAccountId)) {
    throw new ApiError(
      'KYC_DENIED',
      'This account is reserved as the unverified counter-example and cannot be granted KYC.',
    )
  }

  const verified = await verifyWorldProof('verify-buyer', body.proof)
  // Burn the nullifier only after verification succeeds, so a forged proof cannot lock a
  // real buyer out of ever verifying.
  consumeProofOnce('verify-buyer', verified.nullifier)

  await submitEventSafe(HCS_EVENTS.BUYER_ELIGIBILITY_CONFIRMED, property.propertyId, {
    tokenId: property.tokenId,
    buyerAccountId: body.buyerAccountId,
    verifiedByWorld: verified.verifiedByWorld,
    // Which World environment actually accepted the proof. Recorded because the boolean
    // alone does not distinguish a simulator proof from a real-device one, and claiming
    // "World verified this" without saying which is a claim a judge cannot check. Absent
    // when nothing verified it.
    worldEnvironment: verified.environment ?? null,
  })

  // Association must be signed by the account being associated, so we can only perform it
  // for the demo accounts whose keys we hold. For any other account the holder associates
  // themselves first; the KYC grant below is signed by the token's KYC key and needs
  // nothing from the buyer.
  const associationTxId = await associateIfPossible(property.tokenId, body.buyerAccountId)

  const kycTxId = await grantKycOrExplain(property.tokenId, body.buyerAccountId)

  await submitEventSafe(HCS_EVENTS.KYC_GRANTED, property.propertyId, {
    tokenId: property.tokenId,
    buyerAccountId: body.buyerAccountId,
    transactionId: kycTxId,
  })

  return jsonResponse({
    eligible: true,
    kycGranted: true,
    tokenId: property.tokenId,
    buyerAccountId: body.buyerAccountId,
    associationTxId,
    kycTxId,
    hashscanUrl: hashscanUrl('transaction', kycTxId),
  })
})

async function associateIfPossible(
  tokenId: string,
  accountId: string,
): Promise<string | null> {
  const account = demoAccountFor(accountId)
  if (!account) return null

  const result = await associateToken(tokenId, account)
  return result.transactionId
}

/**
 * Grants KYC, translating the "not associated" failure into guidance rather than a raw
 * network error — that is the one failure a real buyer can actually fix themselves.
 */
async function grantKycOrExplain(tokenId: string, accountId: string): Promise<string> {
  try {
    return await grantKyc(tokenId, accountId)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('TOKEN_NOT_ASSOCIATED_TO_ACCOUNT')) {
      throw new ApiError(
        'TOKEN_NOT_ASSOCIATED',
        'This account must associate the token before KYC can be granted.',
        { hederaStatus: 'TOKEN_NOT_ASSOCIATED_TO_ACCOUNT', tokenId },
      )
    }
    throw error
  }
}
