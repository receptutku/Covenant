import { handler, jsonResponse, parseBody } from '@/lib/api'
import { transferHbar } from '@/lib/hedera/hbar'
import { submitEventSafe } from '@/lib/hedera/topic'
import {
  assertIsLandlord,
  assertLockActive,
  escrowAccount,
  requireRental,
  requireState,
  tenantAccount,
} from '@/lib/rental'
import { rentalSettleSchema } from '@/lib/schemas'
import { putRental } from '@/lib/store'
import { HCS_EVENTS } from '@/lib/types'
import { requireSellerSession } from '@/lib/world/session'
import { withLock } from '@/lib/lock'

/**
 * The happy path: the landlord settles inside the lock window and the deposit goes back
 * to the tenant, in full.
 *
 * Worth stating explicitly, because it is a common misreading: a rental deposit is not a
 * payment to the landlord. It is the tenant's money, held against damage, and a tenancy
 * that concludes properly returns it untouched. That is why the HBAR here moves
 * escrow → tenant and the slash is zero.
 *
 * Contrast this with the expiration path, which returns the same deposit PLUS a penalty
 * taken from the landlord. One deposit, two settlement outcomes — the difference between
 * them is what the escrow actually enforces.
 */
export const POST = handler(async (request) => {
  const body = await parseBody(request, rentalSettleSchema)

  // Serialized per listing: concurrent settles would both see ENGAGED and both refund, so
  // the escrow pays out the deposit twice and drains funds belonging to other listings.
  // Queued, the second call finds SETTLED and is rejected. The key is shared with
  // engage/expire, which also stops a settle and an expire from both emptying the escrow.
  return withLock(`rental:${body.listingId}`, async () => {
    requireSellerSession(body.sellerSessionToken)

    const rental = requireRental(body.listingId)
    assertIsLandlord(rental)
    requireState(rental, 'ENGAGED')
    assertLockActive(rental)

    const tenant = rental.tenantAccountId ?? tenantAccount().accountId.toString()
    const deposit = rental.deposit ?? rental.reqDeposit

    const refund = await transferHbar({
      from: escrowAccount(),
      to: tenant,
      amount: deposit,
      memo: `PPREV escrow release ${rental.listingId}`,
      propertyId: rental.propertyId,
    })

    putRental({ ...rental, state: 'SETTLED', slashed: 0, settleTxId: refund.transactionId })

    await submitEventSafe(HCS_EVENTS.RENTAL_SETTLED, rental.propertyId, {
      listingId: rental.listingId,
      refunded: deposit,
      slashed: 0,
      transactionId: refund.transactionId,
    })

    return jsonResponse({
      listingId: rental.listingId,
      state: 'SETTLED',
      refunded: deposit,
      to: tenant,
      slashed: 0,
      transactionId: refund.transactionId,
      hashscanUrl: refund.hashscanUrl,
    })
  })
})
