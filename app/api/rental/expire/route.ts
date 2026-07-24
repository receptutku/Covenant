import { handler, jsonResponse, parseBody } from '@/lib/api'
import { transferHbar } from '@/lib/hedera/hbar'
import { submitEventSafe } from '@/lib/hedera/topic'
import {
  SLASH_RATE_BPS,
  assertLockLapsed,
  escrowAccount,
  requireRental,
  requireState,
  slashAmount,
  tenantAccount,
} from '@/lib/rental'
import { rentalExpireSchema } from '@/lib/schemas'
import { putRental } from '@/lib/store'
import { HCS_EVENTS } from '@/lib/types'

/**
 * The lock window lapsed without a settlement: the tenant is made whole and the landlord
 * pays for it.
 *
 * Two properties make this the sharpest scene in the rental flow:
 *
 * 1. It is PERMISSIONLESS. No session, no landlord signature. A landlord who simply goes
 *    quiet cannot strand the deposit, because anyone — the tenant, a bot, a judge at the
 *    demo table — can trigger the release once the deadline passes. An escrow that only
 *    the counterparty can open is not an escrow.
 *
 * 2. It costs the landlord something. The tenant receives the deposit PLUS a 10% penalty
 *    drawn from the landlord's own balance. Without that asymmetry, letting the window
 *    lapse would be free and the deadline would carry no weight.
 *
 * On-chain this is a single transfer of `deposit + slash` from the escrow account to the
 * tenant, so the penalty is visible in the amount itself rather than asserted in a UI.
 */
export const POST = handler(async (request) => {
  const body = await parseBody(request, rentalExpireSchema)

  const rental = requireRental(body.listingId)
  requireState(rental, 'ENGAGED')
  assertLockLapsed(rental)

  const tenant = rental.tenantAccountId ?? tenantAccount().accountId.toString()
  const deposit = rental.deposit ?? rental.reqDeposit
  const slashed = slashAmount(deposit)

  const payout = await transferHbar({
    from: escrowAccount(),
    to: tenant,
    amount: deposit + slashed,
    memo: `PPREV escrow expiry ${rental.listingId}`,
    propertyId: rental.propertyId,
  })

  putRental({ ...rental, state: 'EXPIRED', slashed, settleTxId: payout.transactionId })

  await submitEventSafe(HCS_EVENTS.RENTAL_EXPIRED, rental.propertyId, {
    listingId: rental.listingId,
    refunded: deposit,
    slashed,
    slashRateBps: SLASH_RATE_BPS,
    transactionId: payout.transactionId,
  })

  return jsonResponse({
    listingId: rental.listingId,
    state: 'EXPIRED',
    refunded: deposit,
    to: tenant,
    slashed,
    slashRateBps: SLASH_RATE_BPS,
    transactionId: payout.transactionId,
    hashscanUrl: payout.hashscanUrl,
  })
})
