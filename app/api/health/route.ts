import { jsonResponse } from '@/lib/api'
import { isWorldConfigured } from '@/lib/world/verify'
import { listProperties } from '@/lib/store'

/**
 * Liveness for the frontend's "backend up" indicator.
 *
 * Deliberately cheap: no chain calls, no Mirror reads — this may be polled every few
 * seconds and must never become a reason the server feels slow. Deep verification is
 * `npm run preflight`'s job, run by a human before going on stage.
 */
export const GET = () =>
  jsonResponse({
    ok: true,
    time: new Date().toISOString(),
    world: isWorldConfigured() ? 'configured' : 'dev-fallback',
    ens: process.env.ENS_PARENT_NAME?.trim() || null,
    auditTopicId: process.env.AUDIT_TOPIC_ID?.trim() || null,
    seededProperties: listProperties().length,
  })
