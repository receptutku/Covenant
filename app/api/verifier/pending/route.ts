import { handler, jsonResponse, requireAdminSecret } from '@/lib/api'
import { listPendingProperties } from '@/lib/store'

/**
 * The minimal verifier's review queue.
 *
 * There is no separate queue table or database: "pending" is simply the set of properties
 * in `PENDING_REVIEW`. Deriving the queue from state rather than maintaining a parallel
 * list removes a whole class of drift bugs — a property can never be in the queue and
 * approved at the same time.
 *
 * Only metadata is returned. Document bytes never travel over the API, not even to the
 * verifier: in this demo the reviewer inspects the originals out of band. That keeps the
 * "documents never leave the server" claim literally true.
 */
export const GET = handler(async (request) => {
  requireAdminSecret(request)

  const pending = listPendingProperties().map((property) => ({
    propertyId: property.propertyId,
    displayName: property.displayName,
    city: property.city,
    sellerAccountId: property.sellerAccountId,
    submittedAt: property.submittedAt,
    documentRoot: property.documentRoot,
    files: property.files.map((file) => ({
      name: file.name,
      type: file.type,
      sizeBytes: file.sizeBytes,
    })),
  }))

  return jsonResponse({ pending })
})
