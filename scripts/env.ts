import { config } from 'dotenv'

/**
 * Environment loader for scripts.
 *
 * Next.js loads `.env.local` on its own, but scripts run through `tsx` do not.
 * Import this module at the VERY TOP of every script — it has to run before any other
 * import, otherwise `lib/hedera/client.ts` sees an empty environment.
 */
config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })
