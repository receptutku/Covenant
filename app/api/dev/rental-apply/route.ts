import { assertDevelopmentOnly, handler, jsonResponse, parseBody, requireAdminSecret } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { submitEventSafe } from '@/lib/hedera/topic'
import { requireRental } from '@/lib/rental'
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

  await submitEventSafe(HCS_EVENTS.RENTAL_APPLICATION, rental.propertyId, {
    listingId: rental.listingId,
    ageEligible: true,
    thresholdMet: true,
    thresholdRule: 'income >= 3x rent',
    verifiedByWorld: false,
  })

  return jsonResponse({
    listingId: rental.listingId,
    state: 'APPLIED',
    tenantAccountId: body.tenantAccountId,
    warning: 'Development application — no World verification was performed.',
  })
})
