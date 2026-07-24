import { assertDevelopmentOnly, handler, jsonResponse, requireAdminSecret } from '@/lib/api'
import { issueSellerSession } from '@/lib/world/session'

/**
 * Issues a seller session without a World proof. Development only.
 *
 * Why this exists as its own endpoint rather than a flag on `/api/onboard`: automated
 * end-to-end tests need a session, and the World simulator cannot be driven from a script.
 * Putting a bypass branch inside the real onboarding handler would mean the production
 * authentication path contains a code path that skips authentication — even if guarded,
 * that is exactly the kind of branch that survives a refactor and ships. Keeping it in a
 * separate file means `/api/onboard` has no bypass at all.
 *
 * Two independent guards: the process must not be in production, and the caller must know
 * the admin secret. It is also the fallback if the World simulator is unavailable during
 * the demo — in which case the honest thing is to say so out loud rather than let the
 * audience believe a verification happened.
 */
export const POST = handler(async (request) => {
  assertDevelopmentOnly()
  requireAdminSecret(request)

  console.warn('[dev] Seller session issued WITHOUT a World proof (development endpoint).')
  const session = issueSellerSession()

  return jsonResponse({
    onboarded: true,
    sellerSessionToken: session.token,
    expiresAt: session.expiresAt,
    warning: 'Development session — no World verification was performed.',
  })
})
