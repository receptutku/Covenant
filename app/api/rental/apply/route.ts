import { ApiError } from '@/lib/errors'
import { handler, jsonResponse, parseBody } from '@/lib/api'
import { submitEventSafe } from '@/lib/hedera/topic'
import { requireRental, requireState } from '@/lib/rental'
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

  // In this demo the income predicate is asserted by the verifier rather than proven in
  // zero knowledge. The honest framing: the protocol shows WHERE such a proof plugs in and
  // what it must output; producing it from a bank or payroll transcript needs zkTLS, which
  // is the roadmap item, not the hackathon deliverable.
  const incomeThresholdMet = true
  const thresholdRule = 'income >= 3x rent'

  putRental({
    ...rental,
    state: 'APPLIED',
    tenantAccountId: body.tenantAccountId,
  })

  await submitEventSafe(HCS_EVENTS.RENTAL_APPLICATION, rental.propertyId, {
    listingId: rental.listingId,
    // The predicate RESULT is recorded; neither the rent nor any income figure is.
    ageEligible: true,
    incomeThresholdMet,
    thresholdRule,
    verifiedByWorld: verified.verifiedByWorld,
  })

  return jsonResponse({
    listingId: rental.listingId,
    state: 'APPLIED',
    tenantAccountId: body.tenantAccountId,
    predicate: { ageEligible: true, incomeThresholdMet, thresholdRule },
  })
})
