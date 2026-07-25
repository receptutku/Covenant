import { handler, jsonResponse, parseBody } from '@/lib/api'
import { submitEventSafe } from '@/lib/hedera/topic'
import { assertRentable, requireProperty } from '@/lib/property'
import { escrowAccount, landlordAccount } from '@/lib/rental'
import { rentalListSchema } from '@/lib/schemas'
import { nextListingId, putRental } from '@/lib/store'
import { HCS_EVENTS, type Rental } from '@/lib/types'
import { requireSellerSession } from '@/lib/world/session'

/**
 * Landlord lists an approved property for rent.
 *
 * The gate is the same Selfie session that guards seller onboarding — deliberately so.
 * One human-liveness check serves both modes, which is the concrete form of the claim that
 * the protocol is domain-agnostic: the roles differ, the infrastructure does not.
 *
 * The property must carry a valid ownership attestation and must NOT be tokenized. A
 * property is either for sale or for rent; allowing both would create two conflicting
 * claims on the same asset.
 */
export const POST = handler(async (request) => {
  const body = await parseBody(request, rentalListSchema)
  requireSellerSession(body.sellerSessionToken)

  const property = requireProperty(body.propertyId)
  assertRentable(property)

  const listingId = nextListingId()
  const rental: Rental = {
    listingId,
    propertyId: property.propertyId,
    landlordAccountId: landlordAccount().accountId.toString(),
    reqDeposit: body.reqDeposit,
    monthlyRent: body.monthlyRent,
    lockWindowSeconds: body.lockWindowSeconds,
    state: 'LISTED',
    createdAt: new Date().toISOString(),
    escrowAccountId: escrowAccount().accountId.toString(),
  }
  putRental(rental)

  await submitEventSafe(HCS_EVENTS.RENTAL_LISTED, property.propertyId, {
    listingId,
    reqDeposit: body.reqDeposit,
    monthlyRent: body.monthlyRent,
    lockWindowSeconds: body.lockWindowSeconds,
    escrowAccountId: rental.escrowAccountId,
  })

  return jsonResponse({
    listingId,
    propertyId: property.propertyId,
    state: rental.state,
    reqDeposit: rental.reqDeposit,
    monthlyRent: rental.monthlyRent,
    lockWindowSeconds: rental.lockWindowSeconds,
    escrowAccountId: rental.escrowAccountId,
  })
})
