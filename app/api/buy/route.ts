import { handler, jsonResponse, parseBody } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { demoAccountFor, getDemoAccount, getOperator } from '@/lib/hedera/client'
import { associateToken, transferShares } from '@/lib/hedera/token'
import { submitEventSafe } from '@/lib/hedera/topic'
import { requireProperty } from '@/lib/property'
import { buySchema } from '@/lib/schemas'
import { HCS_EVENTS } from '@/lib/types'
import { withLock } from '@/lib/lock'

/**
 * Share transfer — and the two compliance scenes that carry the demo.
 *
 * Three modes, each proving a different point:
 *
 *   primary   operator → buyer      a normal sale. The treasury is exempt from its own
 *                                   fee, so nothing is deducted here. Saying this out loud
 *                                   matters: an unexplained missing fee reads as a bug.
 *   secondary buyer1 → buyer2       the 2% fractional fee is assessed on-chain. 100 sent,
 *                                   98 received, 2 to the collector.
 *   nokyc     operator → nokyc      rejected by the NETWORK, not by this code.
 *
 * The token id always comes from the property record rather than the request, so a caller
 * cannot point a transfer at a token we never minted.
 */
export const POST = handler(async (request) => {
  const body = await parseBody(request, buySchema)

  // Serialized per property and mode: a double-clicked buy would send the shares twice, and
  // because each mode has a fixed sender, the two transfers race on the same balance — the
  // second either overdraws or lands after the fee scene has already been narrated, leaving
  // holdings that no longer match what the demo just claimed on screen.
  return withLock(`buy:${body.propertyId}:${body.mode}`, async () => {
    const property = requireProperty(body.propertyId)

    if (!property.tokenId) {
      throw new ApiError(
        'PROPERTY_NOT_FOUND',
        'This property has no token yet — it must be tokenized first.',
      )
    }

    const { from, to } = resolveParties(body.mode, body.buyerAccountId)

    // Just-in-time repair. Tokenize prepares demo accounts in the background, but that
    // takes several Hedera round trips and someone clicking straight through would arrive
    // here first — landing on TOKEN_NOT_ASSOCIATED_TO_ACCOUNT, which for the no-KYC scene
    // tells exactly the wrong story. Association is idempotent and only attempted for
    // accounts we hold keys for; KYC is never granted here, so the gate stays intact.
    const recipient = demoAccountFor(to)
    if (recipient) {
      await associateToken(property.tokenId, recipient)
    }

    const result = await transferShares({
      tokenId: property.tokenId,
      from,
      to,
      amount: body.amount,
    })

    // Only successful transfers are recorded. A rejected transfer throws before this point,
    // which is deliberate: the audit trail should not imply a transfer that never happened.
    await submitEventSafe(HCS_EVENTS.TOKEN_TRANSFERRED, property.propertyId, {
      tokenId: property.tokenId,
      amount: body.amount,
      from: from.accountId.toString(),
      to,
      mode: body.mode,
      transactionId: result.transactionId,
      assessedFeeTotal: result.assessedCustomFees.reduce((sum, fee) => sum + fee.amount, 0),
    })

    return jsonResponse({
      transferred: true,
      tokenId: property.tokenId,
      amount: body.amount,
      from: from.accountId.toString(),
      to,
      mode: body.mode,
      transactionId: result.transactionId,
      assessedCustomFees: result.assessedCustomFees,
      hashscanUrl: result.hashscanUrl,
    })
  })
})

/**
 * Picks the sender and receiver for each mode.
 *
 * `secondary` and `nokyc` use fixed demo accounts because they are scripted scenes, not
 * open-ended transfers: the fee scene needs a holder who is not the treasury, and the
 * rejection scene needs an account that is associated but deliberately un-KYC'd.
 */
function resolveParties(
  mode: 'primary' | 'secondary' | 'nokyc',
  buyerAccountId: string | undefined,
): { from: ReturnType<typeof getOperator>; to: string } {
  switch (mode) {
    case 'primary': {
      if (!buyerAccountId) {
        throw new ApiError('INVALID_INPUT', 'buyerAccountId is required for a primary transfer.')
      }
      return { from: getOperator(), to: buyerAccountId }
    }
    case 'secondary': {
      // buyer1 already holds shares from the primary transfer, so it can be the seller here.
      return { from: getDemoAccount('BUYER1'), to: getDemoAccount('BUYER2').accountId.toString() }
    }
    case 'nokyc': {
      return { from: getOperator(), to: getDemoAccount('NOKYC').accountId.toString() }
    }
  }
}
