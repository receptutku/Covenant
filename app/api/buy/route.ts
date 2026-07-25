import { handler, jsonResponse, parseBody } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { demoAccountFor, getDemoAccount, getOperator } from '@/lib/hedera/client'
import { FRACTIONAL_FEE_BPS, associateToken, transferShares } from '@/lib/hedera/token'
import { submitEventSafe } from '@/lib/hedera/topic'
import { requireProperty } from '@/lib/property'
import { buySchema } from '@/lib/schemas'
import { HCS_EVENTS } from '@/lib/types'
import { withLock } from '@/lib/lock'
import { withReplaySuppression } from '@/lib/idempotency'
import { checkEnsTokenId } from '@/lib/ens/consistency'

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
    // Serializing is not enough here, unlike everywhere else. A share transfer has no state
    // to conflict with — a second identical one is simply a second transfer, and it
    // succeeds. buyer1 holds exactly the 100 shares the secondary scene consumes, so a
    // double click does not fail; it silently leaves the NEXT run to die with
    // INSUFFICIENT_TOKEN_BALANCE, mid-narration, recoverable only by `npm run stage`.
    const { value, replayed } = await withReplaySuppression(
      `buy:${body.propertyId}:${body.mode}:${body.amount}`,
      30_000,
      async () => doTransfer(body),
    )

    // Said out loud rather than hidden: the response must not claim a transfer that did not
    // happen on this request. The transactionId is the FIRST click's, and it is real.
    return jsonResponse(replayed ? { ...value, replayed: true } : value)
  })
})

/**
 * The transfer itself. Split out so the replay window wraps exactly the value-moving part
 * and nothing else.
 */
async function doTransfer(body: {
  propertyId: string
  mode: 'primary' | 'secondary' | 'nokyc'
  buyerAccountId?: string
  amount: number
}) {
  const property = requireProperty(body.propertyId)

  if (!property.tokenId) {
    throw new ApiError(
      'PROPERTY_NOT_FOUND',
      'This property has no token yet — it must be tokenized first.',
    )
  }

  // ENS gets a vote before any share moves.
  //
  // Only one outcome blocks: a record naming a token our operator did not create, which is a
  // record someone repointed. Unreachable does not block — handing a Sepolia outage the power
  // to stop a Hedera transfer is worse than the problem it solves — and neither does a stale
  // record, because /api/tokenize republishes in the background and a buy seconds after a
  // mint legitimately still sees the previous value.
  const ens = await checkEnsTokenId(property.propertyId, property.tokenId)
  if (ens.status === 'mismatch') {
    throw new ApiError(
      'ENS_CONFIG_MISMATCH',
      `The ENS record for this property names token ${ens.ensTokenId}, which this protocol ` +
        'did not create. No shares were moved.',
      { ensTokenId: ens.ensTokenId, expectedTokenId: property.tokenId },
    )
  }
  const ensCheck = ens.status

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

  const feeTotal = result.assessedCustomFees.reduce((sum, fee) => sum + fee.amount, 0)
  const netAmount = body.amount - feeTotal

  // The fee has a `min 1` floor, and with whole-share units that floor dominates below
  // 50 shares: 10 sent charges 1 (10%), and 1 sent charges 1 — the recipient receives
  // NOTHING. Verified on-chain. The demo narrates "a 2% protocol fee", so the response
  // says outright when the effective rate is not 2%, rather than leaving the presenter to
  // explain a number that contradicts them.
  const effectiveFeeRate = body.amount > 0 ? feeTotal / body.amount : 0
  const feeFloorApplied = feeTotal > 0 && effectiveFeeRate > FRACTIONAL_FEE_BPS / 10_000 + 1e-9

  // Only successful transfers are recorded. A rejected transfer throws before this point,
  // which is deliberate: the audit trail should not imply a transfer that never happened.
  //
  // Both figures are recorded because they genuinely differ. The fee is INCLUSIVE: on a
  // secondary transfer of 100 the sender is debited 100, the collector takes 2, and the
  // recipient is credited 98. Publishing only `amount: 100` left the timeline stating a
  // number Mirror's own token-transfer list for that same transaction contradicts —
  // exactly the kind of discrepancy an auditor is supposed to catch, found in our own
  // audit trail.
  await submitEventSafe(HCS_EVENTS.TOKEN_TRANSFERRED, property.propertyId, {
    tokenId: property.tokenId,
    amount: body.amount,
    netAmount,
    from: from.accountId.toString(),
    to,
    mode: body.mode,
    transactionId: result.transactionId,
    assessedFeeTotal: feeTotal,
    ensCheck,
  })

  return {
    transferred: true,
    tokenId: property.tokenId,
    amount: body.amount,
    // What the recipient actually receives. The fee is inclusive, so on a secondary
    // transfer this is 98 of the 100 sent — the number the UI should show next to the
    // balance, since it is the one Mirror will confirm.
    netAmount,
    // True when the `min 1` floor pushed the effective rate above 2% — which happens for
    // any secondary transfer under 50 shares, and takes the whole amount at 1 share. The
    // UI should not say "2% protocol fee" when this is set.
    feeFloorApplied,
    effectiveFeeRate: Number(effectiveFeeRate.toFixed(4)),
    // Whether ENS agreed this is the property's token. `match` is the only value that lets
    // the UI say ENS confirmed anything: `unavailable` covers the env fallback, which is our
    // own configuration read back to us.
    ensCheck,
    from: from.accountId.toString(),
    to,
    mode: body.mode,
    transactionId: result.transactionId,
    assessedCustomFees: result.assessedCustomFees,
    hashscanUrl: result.hashscanUrl,
  }
}

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
