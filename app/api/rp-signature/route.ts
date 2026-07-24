import { handler, jsonResponse, parseBody } from '@/lib/api'
import { rpSignatureSchema } from '@/lib/schemas'
import { createRpContext } from '@/lib/world/verify'

/**
 * Mints the RP context IDKit needs before it will produce a proof.
 *
 * This endpoint exists because the signing key must never reach the browser. The client
 * asks for a context, we sign one bound to a specific action and a short validity window,
 * and the key stays on the server.
 *
 * The action is whitelisted by the Zod schema, so this cannot be turned into a general
 * signing oracle for arbitrary actions belonging to our app.
 */
export const POST = handler(async (request) => {
  const body = await parseBody(request, rpSignatureSchema)
  const context = createRpContext(body.action)

  return jsonResponse({
    appId: context.appId,
    rpId: context.rpId,
    action: context.action,
    environment: context.environment,
    signal: body.signal ?? null,
    rpContext: context.rpContext,
  })
})
