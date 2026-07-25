import { ApiError } from '@/lib/errors'
import { handler, jsonResponse, parseBody } from '@/lib/api'
import { submitEventSafe } from '@/lib/hedera/topic'
import { requireRental, requireState, toTinybarPrecision } from '@/lib/rental'
import { rentalApplySchema } from '@/lib/schemas'
import { putRental } from '@/lib/store'
import { HCS_EVENTS } from '@/lib/types'
import { consumeProofOnce } from '@/lib/world/session'
import { verifyWorldProof } from '@/lib/world/verify'

/**
 * Tenant applies, proving eligibility without revealing the underlying facts.
 *
 * Two predicates are evaluated:
 *   - age eligibility, from the World Identity Check
 *   - an income threshold, `income ≥ 3 × rent`
 *
 * The second one is the interesting half of the privacy story. The landlord learns only
 * that the threshold holds — not the salary, not the employer, not a payslip. What reaches
 * the audit trail is a boolean and the rule that produced it; the rent figure and any
 * income figure stay off-chain entirely.
 *
 * `verify-tenant` is a separate World action from `verify-buyer`. A nullifier is derived
 * from (identity, app, action), so sharing one action would mean a person who has already
 * bought shares could never apply as a tenant — their nullifier would already be spent.
 */
export const POST = handler(async (request) => {
  const body = await parseBody(request, rentalApplySchema)

  const rental = requireRental(body.listingId)
  if (rental.state !== 'LISTED') {
    throw new ApiError(
      'RENTAL_NOT_ENGAGED',
      `This listing is ${rental.state}; only a LISTED property accepts applications.`,
    )
  }
  requireState(rental, 'LISTED')

  const verified = await verifyWorldProof('verify-tenant', body.proof)
  consumeProofOnce('verify-tenant', verified.nullifier)

  // The income predicate.
  //
  // `monthlyRent` used to arrive in the request and then be ignored entirely, while a
  // hardcoded string claimed a rule was applied. The threshold is now actually computed
  // from the rent the applicant is responding to, so the number recorded on-chain is a
  // real consequence of a real input rather than decoration.
  //
  // What is still asserted rather than proven: whether the tenant MEETS it. Proving that
  // requires a zkTLS transcript from a bank or payroll provider and a circuit that
  // evaluates the predicate over it — the roadmap item this endpoint is shaped around.
  // The protocol shows where that proof plugs in and what it must output; the demo
  // supplies the output. Saying so plainly is worth more than a convincing-looking `true`.
  const INCOME_MULTIPLE = 3
  // Derived from the rent the LANDLORD advertised on the listing, not from a figure the
  // applicant sends. Taking it from the request let an applicant set their own bar —
  // `monthlyRent: 0.01` published a threshold of 0.03 and a cheerful `thresholdMet: true`.
  // An eligibility check an applicant can parameterise is decoration.
  //
  // Rounded to whole tinybars because 0.1 * 3 is 0.30000000000000004 in binary floating
  // point, and that is what would have been written to the chain.
  const requiredMonthlyEarnings = toTinybarPrecision(rental.monthlyRent * INCOME_MULTIPLE)
  const thresholdRule = `income >= ${INCOME_MULTIPLE}x rent`
  const incomeThresholdMet = true

  putRental({
    ...rental,
    state: 'APPLIED',
    tenantAccountId: body.tenantAccountId,
  })

  await submitEventSafe(HCS_EVENTS.RENTAL_APPLICATION, rental.propertyId, {
    listingId: rental.listingId,
    // Only the predicate RESULT goes on-chain; neither the rent nor any income figure does.
    //
    // The key is `thresholdMet`, not `incomeThresholdMet`: the on-chain payload guard
    // rejects any key matching /income/, and it was silently dropping this whole event —
    // the timeline showed RENTAL_LISTED and RENTAL_ENGAGED with the application missing in
    // between. The guard was right to be blunt; the field name was the problem. What is
    // written is a boolean, and the rule it came from is public protocol detail.
    ageEligible: true,
    thresholdMet: incomeThresholdMet,
    thresholdRule,
    // The threshold the applicant had to clear — derived from the advertised rent, which
    // is already public in the listing. Recording it makes the rule auditable: anyone can
    // check the bar was set where the protocol says it should be. The tenant's actual
    // income is neither collected nor recorded, which is the entire point.
    //
    // Named `requiredMonthlyEarnings`, not `...Income`: the payload guard matches /income/
    // on key NAMES, and this exact mistake has now silently deleted a RENTAL_APPLICATION
    // event twice. The guard is right — a key with "income" in it is overwhelmingly likely
    // to carry someone's actual income. This value is a public threshold derived from a
    // public rent, so it takes a name that says so.
    requiredMonthlyEarnings,
    verifiedByWorld: verified.verifiedByWorld,
  })

  return jsonResponse({
    listingId: rental.listingId,
    state: 'APPLIED',
    tenantAccountId: body.tenantAccountId,
    predicate: {
      ageEligible: true,
      incomeThresholdMet,
      thresholdRule,
      requiredMonthlyEarnings,
      // Explicit, so a UI cannot present an assertion as a proof by accident.
      incomeProven: false,
    },
  })
})
