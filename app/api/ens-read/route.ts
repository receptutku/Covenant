import { handler, jsonResponse, parseBody } from '@/lib/api'
import { readEnsConfig } from '@/lib/ens/read'
import { ensReadSchema } from '@/lib/schemas'

/**
 * Live protocol config discovery via ENS.
 *
 * The buyer flow starts here: before showing a token or an escrow account, the UI asks
 * which one — and the answer comes from Sepolia, not from our source code. The `source`
 * field is part of the contract: "ens" means live resolution, "env-fallback" means the
 * alpha deployment or the RPC was unreachable and the server degraded honestly.
 */
export const POST = handler(async (request) => {
  const body = await parseBody(request, ensReadSchema)
  const config = await readEnsConfig(body.propertyId)
  return jsonResponse(config)
})
