import { handler, jsonResponse } from '@/lib/api'
import { isWorldConfigured } from '@/lib/world/verify'
import { listDroppedEvents, listProperties } from '@/lib/store'

/**
 * Liveness plus the public identifiers the frontend would otherwise have to hard-code.
 *
 * The demo account ids are published here for the same reason the protocol config lives in
 * ENS rather than in source: a hard-coded identifier is a lie waiting to happen. The
 * frontend carried invented account ids left over from the mock, which produced
 * TOKEN_NOT_ASSOCIATED failures that looked like a backend bug — the accounts in the
 * request simply did not exist. Fetching them removes that whole class of drift.
 *
 * These are ACCOUNT IDS ONLY. They are public by nature: anyone can read their balances on
 * HashScan. No key, secret, or session material is exposed here.
 *
 * Deliberately cheap: no chain calls, no Mirror reads. This may be polled every few
 * seconds and must never be why the server feels slow. Deep verification is
 * `npm run preflight`, run by a human before going on stage.
 *
 * Wrapped in `handler()` like every other route. It was the one exception, on the reasoning
 * that reading env vars cannot throw — but `listProperties()` and `listDroppedEvents()` both
 * reach into the store, and the store has thrown before (a hot-reloaded process kept an
 * older store object and a newly added field was undefined). An unwrapped throw here skips
 * the error envelope entirely and hits Next's error page, and this is the endpoint the buyer
 * screen calls on mount to learn the demo account ids — so its failure mode is every
 * subsequent call looking like a backend bug.
 */
export const GET = handler(async () =>
  jsonResponse({
    ok: true,
    time: new Date().toISOString(),
    world: isWorldConfigured() ? 'configured' : 'dev-fallback',
    ens: process.env.ENS_PARENT_NAME?.trim() || null,
    auditTopicId: process.env.AUDIT_TOPIC_ID?.trim() || null,
    seededProperties: listProperties().length,
    // Audit events the on-chain payload guard refused. Non-zero means a payload carried a
    // key that looks like personal data, so the event was dropped rather than published —
    // leaving a hole in the trail that nothing else announces. preflight fails on this.
    droppedAuditEvents: listDroppedEvents(),
    demoAccounts: {
      // The KYC-verified buyer, and the tenant in the rental flow.
      buyer1: process.env.BUYER1_ID?.trim() || null,
      // The secondary-market counterparty — the fee scene needs a holder who is not the
      // treasury, since the treasury is exempt from its own fee.
      buyer2: process.env.BUYER2_ID?.trim() || null,
      // Associated with every property token but never granted KYC. This is the account
      // the network refuses, and that refusal is the point — do not send it to /api/kyc.
      nokyc: process.env.NOKYC_ID?.trim() || null,
      // Treasury, seller, landlord and escrow holder in the demo's role mapping.
      operator: process.env.OPERATOR_ID?.trim() || null,
    },
  }),
)
