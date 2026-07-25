import { assertDevelopmentOnly, handler, jsonResponse, requireAdminSecret } from '@/lib/api'
import { clearReplayDigests } from '@/lib/store'

/**
 * Forgets which World proofs have already been used. Development only, admin-gated.
 *
 * The problem this solves is not a bug — it is replay protection working correctly, and
 * being inconvenient because of it. A World nullifier is derived from (identity, app,
 * action), so it is the SAME value every time a given person repeats a given check. The
 * first Selfie Check of a rehearsal succeeds; the second is refused as
 * `WORLD_PROOF_REPLAY`, at step one, before anything else can be shown.
 *
 * `/api/reset` also clears these, but it wipes the seeded properties and sessions with
 * them — so recovering from a blocked rehearsal cost a full reseed. This clears only the
 * digests, leaving the demo state intact.
 *
 * What it does NOT do: weaken verification. Proofs are still verified against World on
 * every attempt, and each one can still only be used once after this call. It only forgets
 * history — which on a shared demo identity is the difference between rehearsing twice and
 * rehearsing once.
 */
export const POST = handler(async (request) => {
  assertDevelopmentOnly()
  requireAdminSecret(request)

  const cleared = clearReplayDigests()
  console.warn(`[dev] Cleared ${cleared} World replay digest(s) — proofs may be presented again.`)

  return jsonResponse({
    cleared,
    warning: 'Previously used World proofs will be accepted again. Development only.',
  })
})
