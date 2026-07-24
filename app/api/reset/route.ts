import { assertDevelopmentOnly, handler, jsonResponse } from '@/lib/api'
import { resetStore } from '@/lib/store'

/**
 * Wipes all in-memory demo state.
 *
 * On-chain artefacts (tokens, topics, transactions) are permanent and untouched — this
 * only clears the server's view, so a rehearsal can start from a clean slate without
 * burning new testnet resources.
 */
export const POST = handler(async () => {
  assertDevelopmentOnly()
  resetStore()
  return jsonResponse({ reset: true })
})
