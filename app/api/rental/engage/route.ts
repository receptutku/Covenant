import { ApiError } from '@/lib/errors'
import { handler, jsonResponse, parseBody } from '@/lib/api'
import { transferHbar } from '@/lib/hedera/hbar'
import { submitEventSafe } from '@/lib/hedera/topic'
import {
  assertIsLandlord,
  escrowAccount,
  requireRental,
  tenantAccount,
} from '@/lib/rental'
import { rentalEngageSchema } from '@/lib/schemas'
import { putRental } from '@/lib/store'
import { HCS_EVENTS } from '@/lib/types'
import { requireSellerSession } from '@/lib/world/session'

/**
 * Landlord accepts the application and the tenant's deposit is locked in escrow.
 *
 * This is where the rental mode stops being bookkeeping: real HBAR leaves the tenant's
 * account. The lock is a plain `TransferTransaction` — no Solidity, no contract — and both
 * the debit and the later release are permanent, independently verifiable on HashScan.
 *
 * `lockExpiresAt` is stamped here rather than at listing time, because the clock should
 * start when the money moves, not when the advert was posted.
 */
export const POST = handler(async (request) => {
  const body = await parseBody(request, rentalEngageSchema)
  requireSellerSession(body.sellerSessionToken)

  const rental = requireRental(body.listingId)
  assertIsLandlord(rental)

  if (rental.state !== 'APPLIED') {
    throw new ApiError(
      'RENTAL_NOT_ENGAGED',
      `This listing is ${rental.state}; a deposit can only be locked after a tenant applies.`,
    )
  }

  const tenant = tenantAccount()
  const escrow = escrowAccount()

  const transfer = await transferHbar({
    from: tenant,
    to: escrow.accountId,
    amount: rental.reqDeposit,
    memo: `PPREV escrow lock ${rental.listingId}`,
    propertyId: rental.propertyId,
  })

  const lockExpiresAt = new Date(Date.now() + rental.lockWindowSeconds * 1000).toISOString()

  putRental({
    ...rental,
    state: 'ENGAGED',
    deposit: rental.reqDeposit,
    tenantAccountId: rental.tenantAccountId ?? tenant.accountId.toString(),
    lockExpiresAt,
    engageTxId: transfer.transactionId,
  })

  await submitEventSafe(HCS_EVENTS.RENTAL_ENGAGED, rental.propertyId, {
    listingId: rental.listingId,
    deposit: rental.reqDeposit,
    escrowAccountId: escrow.accountId.toString(),
    lockExpiresAt,
    transactionId: transfer.transactionId,
  })

  return jsonResponse({
    listingId: rental.listingId,
    state: 'ENGAGED',
    deposit: rental.reqDeposit,
    escrowAccountId: escrow.accountId.toString(),
    lockExpiresAt,
    transactionId: transfer.transactionId,
    hashscanUrl: transfer.hashscanUrl,
  })
})
