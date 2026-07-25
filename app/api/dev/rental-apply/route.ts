import { assertDevelopmentOnly, handler, jsonResponse, parseBody, requireAdminSecret } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { submitEventSafe } from '@/lib/hedera/topic'
import { requireRental, toTinybarPrecision } from '@/lib/rental'
import { putRental } from '@/lib/store'
import { HCS_EVENTS } from '@/lib/types'
import { z } from 'zod'
import { accountIdSchema } from '@/lib/schemas'

/**
 * Marks a rental application as made, without a World proof. Development only.
 *
 * Same reasoning as `/api/dev/session`: scripted end-to-end tests cannot drive the IDKit
 * widget, and a bypass branch inside the real `/api/rental/apply` handler would be a
 * skip-authentication path living inside the authentication path. Keeping it in a
 * separate file means the real handler has no bypass at all.
 *
 * The audit event is still emitted — with `verifiedByWorld: false`, which is the honest
 * record of what happened here.
 */
const schema = z.object({
  listingId: z.string().min(1),
  tenantAccountId: accountIdSchema,
  // Mirrors the real endpoint so both paths compute and record the same threshold. A dev
  // bypass that emits a DIFFERENT audit payload tests something the demo never runs.

})

export const POST = handler(async (request) => {
  assertDevelopmentOnly()
  requireAdminSecret(request)

  const body = await parseBody(request, schema)
  const rental = requireRental(body.listingId)

  if (rental.state !== 'LISTED') {
    throw new ApiError(
      'RENTAL_NOT_ENGAGED',
      `This listing is ${rental.state}; only a LISTED property accepts applications.`,
    )
  }

  console.warn('[dev] Rental application recorded WITHOUT a World proof (development endpoint).')

  putRental({ ...rental, state: 'APPLIED', tenantAccountId: body.tenantAccountId })

  // Same derivation as the real endpoint: from the LISTING's advertised rent, never from
  // the request. A bypass that computes a different number tests something the demo never
  // runs.
  const INCOME_MULTIPLE = 3
  const requiredMonthlyEarnings = toTinybarPrecision(rental.monthlyRent * INCOME_MULTIPLE)

  await submitEventSafe(HCS_EVENTS.RENTAL_APPLICATION, rental.propertyId, {
    listingId: rental.listingId,
    ageEligible: true,
    thresholdMet: true,
    thresholdRule: `income >= ${INCOME_MULTIPLE}x rent`,
    requiredMonthlyEarnings,
    verifiedByWorld: false,
  })

  return jsonResponse({
    listingId: rental.listingId,
    state: 'APPLIED',
    tenantAccountId: body.tenantAccountId,
    warning: 'Development application — no World verification was performed.',
  })
})
