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
  toTinybarPrecision,
  tenantAccount,
} from '@/lib/rental'
import { rentalExpireSchema } from '@/lib/schemas'
import { putRental } from '@/lib/store'
import { HCS_EVENTS } from '@/lib/types'
import { withLock } from '@/lib/lock'

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

  // Serialized per listing, and this endpoint needs it most: it is permissionless, so
  // anyone can fire it and nothing upstream throttles the caller. Concurrent calls would
  // both see ENGAGED and both pay out deposit + slash, taking the landlord's penalty twice.
  // Queued, the second call finds EXPIRED and is rejected. The key is shared with
  // engage/settle so an expire cannot interleave with a settle on the same escrow.
  return withLock(`rental:${body.listingId}`, async () => {
    const rental = requireRental(body.listingId)
    requireState(rental, 'ENGAGED')
    assertLockLapsed(rental)

    const tenant = rental.tenantAccountId ?? tenantAccount().accountId.toString()
    const deposit = rental.deposit ?? rental.reqDeposit
    const slashed = slashAmount(deposit)

    // The state change rides with the transfer rather than following it: `onSubmitted`
    // fires the instant the transaction is irreversibly submitted. A receipt timeout after
    // that leaves the listing EXPIRED, so a retry of this permissionless endpoint is
    // rejected with RENTAL_NOT_ENGAGED instead of paying the tenant a second time.
    const markExpired = (settleTxId: string) =>
      putRental({ ...rental, state: 'EXPIRED', slashed, settleTxId })

    const payout = await transferHbar({
      from: escrowAccount(),
      to: tenant,
      // Re-rounded after the addition: two individually valid amounts can still sum to a
      // value the SDK rejects (0.3 + 0.03 → 0.32999999999999996).
      amount: toTinybarPrecision(deposit + slashed),
      memo: `PPREV escrow expiry ${rental.listingId}`,
      propertyId: rental.propertyId,
      context: 'escrow-release',
      onSubmitted: markExpired,
      // Consensus rejected it outright, so nothing moved and the listing is genuinely still
      // engaged. Only a definitive rejection restores it — never a timeout.
      onDefinitiveFailure: () => putRental(rental),
    })

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
})
