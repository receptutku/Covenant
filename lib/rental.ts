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
 * Every rejection carries the same code, because the code list is closed — which leaves
 * the message as the only thing that can tell these situations apart, and they call for
 * opposite responses. LISTED and APPLIED are waiting on something, so naming what is
 * missing is actionable. SETTLED and EXPIRED are terminal: the escrow is already emptied
 * and there is no path forward at all, so telling someone the listing "requires it to be
 * ENGAGED" reads as an instruction to go find a tenant for a tenancy that has ended.
 */
export function requireState(rental: Rental, expected: RentalState): void {
  if (rental.state === expected) return

  if (rental.state === 'SETTLED' || rental.state === 'EXPIRED') {
    throw new ApiError(
      'RENTAL_NOT_ENGAGED',
      `This listing is already ${rental.state}: the escrow was released and it is finished. No further action is possible on it.`,
    )
  }

  const detail =
    rental.state === 'LISTED'
      ? 'no tenant has applied to it yet'
      : rental.state === 'APPLIED'
        ? 'a tenant has applied but the deposit has not been locked yet'
        : 'its deposit is still locked in escrow'

  throw new ApiError(
    'RENTAL_NOT_ENGAGED',
    `This listing is ${rental.state}: ${detail}. This action requires it to be ${expected}.`,
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
 * HONEST LIMITATION — this check cannot currently fail, and pretending otherwise would be
 * worse than saying so. Every listing is created with `landlordAccountId` set to the
 * single operator account, and this compares against that same account, so the comparison
 * is always true. It is structurally correct for a world with multiple landlords, but
 * today it enforces nothing.
 *
 * The reason it cannot be fixed by editing this function: a seller session is an opaque
 * token that proves *a live human completed Selfie Check*, not *which Hedera account they
 * control*. Nothing in the system binds a session to an account. Real authorization needs
 * that binding — the account signing a nonce that is folded into the World action context
 * — which is the same account-binding gap acknowledged for buyer KYC. It is on the
 * roadmap, not in this build.
 *
 * What genuinely gates the rental flow today: a valid Selfie session is required to list,
 * engage, or settle, so an anonymous caller cannot drive the escrow.
 */
export function assertIsLandlord(rental: Rental): void {
  if (rental.landlordAccountId !== landlordAccount().accountId.toString()) {
    throw new ApiError('NOT_LANDLORD', 'Only the landlord of this listing may perform this action.')
  }
}

/** One HBAR is 100,000,000 tinybars — the smallest unit Hedera will accept. */
const TINYBARS_PER_HBAR = 100_000_000

/**
 * Rounds an HBAR amount down to a whole number of tinybars.
 *
 * Without this the SDK throws `Hbar in tinybars contains decimals` and the request dies as
 * an unhandled 500. It is not hypothetical: a 0.3 ℏ deposit gives a 0.03 ℏ slash, and
 * `0.3 + 0.03` is `0.32999999999999996` in binary floating point. The demo uses 5 ℏ, where
 * the arithmetic happens to be exact, so this only surfaces once someone types a value
 * like 0.3 or 1.1 into the deposit field.
 *
 * Rounding DOWN is deliberate: the escrow must never try to pay out more than it holds.
 */
export function toTinybarPrecision(amount: number): number {
  return Math.floor(amount * TINYBARS_PER_HBAR) / TINYBARS_PER_HBAR
}

export function slashAmount(deposit: number): number {
  return toTinybarPrecision((deposit * SLASH_RATE_BPS) / 10_000)
}
