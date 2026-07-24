import { ApiError } from './errors'
import { getDemoAccount, getOperator } from './hedera/client'
import { getRental } from './store'
import type { Rental, RentalState } from './types'

/**
 * Rental-mode rules shared by the escrow endpoints.
 *
 * The demo maps the three roles onto accounts that already exist:
 *   landlord = operator (also the seller and the token treasury)
 *   tenant   = buyer1
 *   escrow   = operator
 *
 * Holding the escrow in the landlord's own account sounds wrong, and in production it
 * would be: it means the landlord could walk away with the deposit. The demo accepts this
 * because what it needs to prove is that the deposit genuinely moves on-chain and comes
 * back under two different settlement paths. Making the escrow non-custodial requires
 * either a scheduled transaction with a threshold key or a smart contract, and the latter
 * is off the table by design (no Solidity). This is stated plainly in the README.
 */

/** Fraction of the deposit the landlord forfeits when the lock window lapses. */
export const SLASH_RATE_BPS = 1000 // 10%

export function landlordAccount() {
  return getOperator()
}

export function tenantAccount() {
  return getDemoAccount('BUYER1')
}

export function escrowAccount() {
  return getOperator()
}

export function requireRental(listingId: string): Rental {
  const rental = getRental(listingId)
  if (!rental) {
    throw new ApiError('PROPERTY_NOT_FOUND', `No rental listing found with id "${listingId}".`)
  }
  return rental
}

/**
 * Guards a state transition and reports the specific reason it failed.
 *
 * Each rejection carries its own stable code because the UI shows a different next step
 * for each: a listing that was never engaged needs a tenant, an expired lock needs the
 * expire path, and a still-running lock needs the settle path.
 */
export function requireState(rental: Rental, expected: RentalState): void {
  if (rental.state === expected) return

  throw new ApiError(
    'RENTAL_NOT_ENGAGED',
    `This listing is ${rental.state}; the action requires it to be ${expected}.`,
  )
}

/**
 * Settlement is only valid inside the lock window.
 *
 * Past the deadline the landlord loses the right to a clean settlement — that is exactly
 * what makes the expiration path a penalty rather than an alternative route.
 */
export function assertLockActive(rental: Rental): void {
  if (!rental.lockExpiresAt) {
    throw new ApiError('RENTAL_NOT_ENGAGED', 'This listing has no active lock.')
  }
  if (Date.parse(rental.lockExpiresAt) <= Date.now()) {
    throw new ApiError(
      'LOCK_EXPIRED',
      'The lock window has closed; settle is no longer available. Use expire instead.',
    )
  }
}

/** Expiration is permissionless, but only once the window has genuinely lapsed. */
export function assertLockLapsed(rental: Rental): void {
  if (!rental.lockExpiresAt) {
    throw new ApiError('RENTAL_NOT_ENGAGED', 'This listing has no active lock.')
  }
  const remainingMs = Date.parse(rental.lockExpiresAt) - Date.now()
  if (remainingMs > 0) {
    throw new ApiError(
      'LOCK_NOT_EXPIRED',
      `The lock window is still open for ${Math.ceil(remainingMs / 1000)} more second(s).`,
    )
  }
}

/**
 * Only the landlord may list, engage, or settle.
 *
 * In this demo the landlord is authenticated by the same Selfie session used for seller
 * onboarding — one gate serving both modes, which is why World Selfie Check contributes to
 * the rental flow as well as the sale flow.
 */
export function assertIsLandlord(rental: Rental): void {
  if (rental.landlordAccountId !== landlordAccount().accountId.toString()) {
    throw new ApiError('NOT_LANDLORD', 'Only the landlord of this listing may perform this action.')
  }
}

export function slashAmount(deposit: number): number {
  return Number(((deposit * SLASH_RATE_BPS) / 10_000).toFixed(8))
}
