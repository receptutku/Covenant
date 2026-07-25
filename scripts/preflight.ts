import './env'
import { readFile, readdir } from 'node:fs/promises'
import { signRequest } from '@worldcoin/idkit-server'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { getDemoAccount, getHbarBalance, getOperator, withClient } from '../lib/hedera/client'
import { RECORD_KEYS, UNIVERSAL_RESOLVER } from '../lib/ens/constants'

/**
 * Pre-stage health check. Run this before every rehearsal and right before the demo.
 *
 * Every check here maps to a way the demo has actually failed (or nearly failed) during
 * development — none of it is hypothetical:
 *   - the nokyc account must be associated-but-not-KYC'd, or scene 3 tells the wrong story;
 *   - buyer1 must hold shares, or the secondary-fee scene dies with an insufficient balance;
 *   - the prop-001 ENS record must match SEED_TOKEN_ID, or discovery contradicts the chain
 *     (this drifts every time `npm run golden` re-mints the seed token);
 *   - Mirror and Sepolia must answer, or the timeline / discovery panels sit empty.
 *
 * Read-only: balance queries and Mirror/ENS reads are free. Nothing here spends HBAR or gas.
 */

let failures = 0
let warnings = 0

function pass(label: string, detail = '') {
  console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`)
}
function warn(label: string, detail: string) {
  warnings += 1
  console.log(`  ⚠️  ${label} — ${detail}`)
}
function fail(label: string, detail: string) {
  failures += 1
  console.log(`  ❌ ${label} — ${detail}`)
}

async function checkEnv() {
  console.log('\n▶ Environment')
  const required = [
    'OPERATOR_ID',
    'OPERATOR_KEY',
    'BUYER1_ID',
    'BUYER2_ID',
    'NOKYC_ID',
    'AUDIT_TOPIC_ID',
    'SEED_TOKEN_ID',
    'VERIFIER_PRIVATE_KEY',
    'VERIFIER_PUBLIC_KEY',
    'NULLIFIER_HMAC_SECRET',
    'DEMO_ADMIN_SECRET',
    'NEXT_PUBLIC_WORLD_APP_ID',
    'WORLD_RP_ID',
    'WORLD_SIGNING_KEY',
    'ENS_PARENT_NAME',
    'SEPOLIA_RPC_URL',
  ]
  const missing = required.filter((name) => !process.env[name]?.trim())
  if (missing.length === 0) pass('all required variables set')
  else fail('missing variables', missing.join(', '))
}

/**
 * The server itself, and whether the demo state is actually loaded.
 *
 * This was missing, which made the whole command misleading: preflight verified the
 * chain, ENS and World and reported "All green. Go." with the server not running at all —
 * or running with an empty store after a restart, where both pre-seeded scenes answer
 * PROPERTY_NOT_FOUND. Everything it checked was fine; the demo was still dead.
 */
async function checkServer() {
  console.log('\n▶ Server')
  const base = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

  let health: {
    ok?: boolean
    world?: string
    seededProperties?: number
    demoAccounts?: Record<string, string | null>
    droppedAuditEvents?: string[]
  }
  try {
    const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5_000) })
    if (!response.ok) {
      fail('server responded', `HTTP ${response.status} from ${base} — is \`npm run dev\` running?`)
      return
    }
    health = await response.json()
  } catch {
    fail('server unreachable', `${base} did not answer — start it with \`npm run dev\``)
    return
  }

  pass('server reachable', base)

  if (health.world === 'configured') pass('World configured on the server')
  else warn('World in dev-fallback', 'proofs are accepted without verification')

  // A restart empties the store. Everything on-chain survives, but both seeded scenes
  // answer PROPERTY_NOT_FOUND until /api/seed runs.
  const seeded = health.seededProperties ?? 0
  if (seeded >= 2) pass('demo state loaded', `${seeded} properties in the store`)
  else fail('store is empty or partial', `${seeded} properties — run POST /api/seed`)

  // A dropped event means the trail has a hole in it and the timeline will be missing a
  // step. It has happened twice, both times found by accident; this is what turns it into
  // something the pre-stage check tells you about.
  const dropped = health.droppedAuditEvents ?? []
  if (dropped.length === 0) pass('no audit events dropped by the payload guard')
  else fail(`${dropped.length} audit event(s) dropped`, dropped[0])

  const missing = Object.entries(health.demoAccounts ?? {})
    .filter(([, value]) => !value)
    .map(([name]) => name)
  if (missing.length === 0) pass('demo account ids published for the frontend')
  else fail('demo accounts unpublished', `${missing.join(', ')} — the UI cannot resolve them`)
}

/**
 * Every custom header a route reads must survive the CORS preflight.
 *
 * This is invisible where it is developed and fatal where it is demoed: same-origin
 * requests skip the preflight entirely, so a header missing from the allow-list works
 * perfectly on localhost and is silently stripped through the tunnel — the route then
 * behaves as if the caller never sent it. `x-seller-session` shipped this way and took the
 * seller's entire "Refresh status" step down in the only configuration that matters.
 *
 * The list is discovered from the source rather than hardcoded here, so a header added to a
 * route in future is checked without anyone remembering to update this file.
 */
async function checkCors() {
  console.log('\n▶ CORS (what the tunnel will actually allow)')
  const base = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

  const sources = await readdir('app/api', { recursive: true })
  const used = new Set<string>()
  for (const entry of sources) {
    if (!entry.endsWith('.ts')) continue
    const text = await readFile(`app/api/${entry}`, 'utf8')
    for (const match of text.matchAll(/headers\.get\(['"](x-[a-z-]+)['"]\)/g)) {
      used.add(match[1])
    }
  }
  const lib = await readFile('lib/api.ts', 'utf8')
  for (const match of lib.matchAll(/headers\.get\(['"](x-[a-z-]+)['"]\)/g)) used.add(match[1])

  if (used.size === 0) {
    warn('no custom headers found', 'the scan pattern may have gone stale')
    return
  }

  let allowed: string
  try {
    const response = await fetch(`${base}/api/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://preflight.example.com',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': [...used].join(', '),
      },
      signal: AbortSignal.timeout(5_000),
    })
    allowed = (response.headers.get('access-control-allow-headers') ?? '').toLowerCase()
  } catch {
    fail('preflight request failed', `${base} did not answer an OPTIONS`)
    return
  }

  const blocked = [...used].filter((header) => !allowed.includes(header))
  if (blocked.length === 0) {
    pass('every header the routes read is allowed cross-origin', [...used].join(', '))
  } else {
    fail(
      `${blocked.length} header(s) blocked by CORS`,
      `${blocked.join(', ')} — add them to ALLOWED_REQUEST_HEADERS in proxy.ts. ` +
        'This only breaks through the tunnel, never on localhost.',
    )
  }
}

async function checkHedera() {
  console.log('\n▶ Hedera')
  const operator = getOperator()
  const buyer1 = getDemoAccount('BUYER1')

  await withClient(async (client) => {
    const operatorBalance = (await getHbarBalance(client, operator.accountId))
      .toBigNumber()
      .toNumber()
    if (operatorBalance >= 50) pass('operator balance', `${operatorBalance.toFixed(0)} ℏ`)
    else if (operatorBalance >= 10) warn('operator balance low', `${operatorBalance.toFixed(1)} ℏ`)
    else fail('operator balance', `${operatorBalance.toFixed(1)} ℏ — refill before the demo`)

    // The tenant must cover the ADVERTISED deposit, not an arbitrary floor — and twice
    // over, because engaging a second listing before settling the first locks two
    // deposits at once. A threshold unrelated to the advertised figure passed happily
    // while the demo could not actually afford the deposit ENS was publishing.
    const advertisedDeposit = Number(process.env.FALLBACK_RENTAL_REQ_DEPOSIT ?? 50)
    const buyer1Balance = (await getHbarBalance(client, buyer1.accountId))
      .toBigNumber()
      .toNumber()
    const needed = advertisedDeposit * 2

    if (buyer1Balance >= needed) {
      pass('buyer1 (tenant) balance', `${buyer1Balance.toFixed(0)} ℏ ≥ 2×${advertisedDeposit}`)
    } else if (buyer1Balance >= advertisedDeposit) {
      warn(
        'buyer1 covers only one deposit',
        `${buyer1Balance.toFixed(1)} ℏ vs advertised ${advertisedDeposit} — settle each listing before engaging the next`,
      )
    } else {
      fail(
        'buyer1 cannot cover the advertised deposit',
        `${buyer1Balance.toFixed(1)} ℏ < ${advertisedDeposit} — engage would fail with INSUFFICIENT_DEPOSIT`,
      )
    }
  })
}

async function checkMirrorAndScenePreconditions() {
  console.log('\n▶ Mirror Node + scene preconditions')
  const base = 'https://testnet.mirrornode.hedera.com/api/v1'
  const tokenId = process.env.SEED_TOKEN_ID!.trim()
  const topicId = process.env.AUDIT_TOPIC_ID!.trim()

  try {
    const topic = await fetch(`${base}/topics/${topicId}/messages?limit=1&order=desc`)
    const data = (await topic.json()) as { messages?: { sequence_number: number }[] }
    const last = data.messages?.[0]?.sequence_number
    if (last) pass('audit topic reachable', `${last} messages`)
    else warn('audit topic empty', 'no events yet — run a flow first')
  } catch {
    fail('Mirror Node unreachable', 'the timeline panel will be empty')
  }

  const relationship = async (accountId: string) => {
    const response = await fetch(`${base}/accounts/${accountId}/tokens?token.id=${tokenId}`)
    const data = (await response.json()) as {
      tokens?: { kyc_status: string; balance: number }[]
    }
    return data.tokens?.[0] ?? null
  }

  try {
    // Scene 3's precondition, checked from PUBLIC data: associated, KYC not granted.
    // Mirror vocabulary trap: for a KYC-keyed token, an associated-but-ungranted account
    // reports kyc_status=REVOKED (not "NOT_GRANTED" — that name only exists in the SDK's
    // transfer error). GRANTED would mean scene 3 succeeds; NOT_APPLICABLE would mean the
    // token has no KYC key at all. REVOKED is exactly the state we want.
    const nokyc = await relationship(process.env.NOKYC_ID!.trim())
    if (!nokyc) fail('nokyc association', 'NOT associated — scene 3 would show the wrong error')
    else if (nokyc.kyc_status === 'REVOKED') pass('nokyc: associated, KYC not granted')
    else fail('nokyc kyc_status', `${nokyc.kyc_status} — scene 3 would tell the wrong story`)

    // The secondary-fee scene needs buyer1 to actually hold shares.
    const buyer1 = await relationship(process.env.BUYER1_ID!.trim())
    if (!buyer1) fail('buyer1 association', 'not associated with the seed token')
    else if (buyer1.balance >= 100) pass('buyer1 shares', `${buyer1.balance}`)
    else warn('buyer1 shares low', `${buyer1.balance} — POST /api/seed tops it back up`)

    // Seed replenishes buyer1 by recycling from buyer2 and falling back to the treasury.
    // Report the total float across both, because that pool is what actually bounds how
    // many more rehearsals are possible — the treasury alone once looked healthy while
    // draining 98 per run.
    const buyer2 = await relationship(process.env.BUYER2_ID!.trim())
    const treasury = await relationship(process.env.OPERATOR_ID!.trim())
    const float = (buyer2?.balance ?? 0) + (treasury?.balance ?? 0)
    if (float >= 200) {
      pass('share float for reseeding', `${float} (buyer2 ${buyer2?.balance ?? 0} + treasury ${treasury?.balance ?? 0})`)
    } else {
      fail('share float exhausted', `${float} left — /api/seed will start failing`)
    }
  } catch {
    warn('scene preconditions unverified', 'Mirror did not answer; re-run in a minute')
  }
}

async function checkEns() {
  console.log('\n▶ ENS (Sepolia)')
  const parent = process.env.ENS_PARENT_NAME!.trim()
  const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL, { timeout: 8_000 }),
  })

  try {
    for (const sub of ['prop-001', 'prop-002', 'prop-003']) {
      const name = `${sub}.${parent}`
      const mode = await client.getEnsText({
        name,
        key: RECORD_KEYS.mode,
        universalResolverAddress: UNIVERSAL_RESOLVER,
      })
      if (!mode) {
        fail(`${name}`, 'no mode record — alpha state reset? re-run npm run ens:write')
        continue
      }

      if (sub === 'prop-001') {
        const ensToken = await client.getEnsText({
          name,
          key: RECORD_KEYS.propertyTokenId,
          universalResolverAddress: UNIVERSAL_RESOLVER,
        })
        const envToken = process.env.SEED_TOKEN_ID!.trim()
        if (ensToken === envToken) pass(`${name}`, `mode=${mode}, token matches env`)
        else fail(`${name} token drift`, `ENS=${ensToken} env=${envToken} — run npm run ens:write`)
      } else {
        pass(`${name}`, `mode=${mode}`)
      }
    }
  } catch (error) {
    warn('ENS resolution failed', 'the API will fall back to env values (source: env-fallback)')
  }
}

async function checkWorld() {
  console.log('\n▶ World ID')
  try {
    const signature = signRequest({
      signingKeyHex: process.env.WORLD_SIGNING_KEY!.trim(),
      action: 'verify-buyer',
      ttl: 300,
    })
    if (signature.sig?.startsWith('0x')) pass('RP signature mints locally')
    else fail('RP signature malformed', JSON.stringify(signature).slice(0, 60))
  } catch (error) {
    fail('RP signing failed', error instanceof Error ? error.message : String(error))
  }
}

async function main() {
  console.log('PPREV pre-stage preflight')
  console.log('═'.repeat(50))

  await checkEnv()
  await checkServer()
  await checkCors()
  await checkHedera()
  await checkMirrorAndScenePreconditions()
  await checkEns()
  await checkWorld()

  console.log('\n' + '═'.repeat(50))
  if (failures > 0) {
    console.error(`❌ ${failures} failure(s), ${warnings} warning(s) — NOT stage-ready.`)
    process.exit(1)
  }
  console.log(
    warnings > 0
      ? `⚠️  Green with ${warnings} warning(s) — read them before going on stage.`
      : '✅ All green. Go.',
  )
}

main().catch((error) => {
  console.error('\n❌ Preflight crashed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
