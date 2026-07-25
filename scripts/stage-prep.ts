import './env'

/**
 * One command to run before going on stage. Answers three problems observed in rehearsal:
 *
 *   1. Test properties accumulate in the verifier queue. A judge should see one card to
 *      review, not a pile of `PROP-TUNNEL-1`-style debris from someone's curl session.
 *   2. Shares drift out of position. The fee scene drains buyer1 and the primary sale
 *      drains the treasury; both refill from buyer2, but only when seed runs.
 *   3. The first request of the day is slow — a cold Hedera client, an unresolved ENS
 *      name and an unqueried Mirror. Measured: first seed 67s, subsequent seeds 8s. Paying
 *      that on stage looks like a hang.
 *
 * Everything here is idempotent and safe to run repeatedly. It does spend testnet
 * resources (a few share transfers), so it is a pre-stage step, not something to loop.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const ADMIN_SECRET = process.env.DEMO_ADMIN_SECRET

type Json = Record<string, unknown>

async function call(path: string, method = 'GET', body?: unknown): Promise<Json> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(ADMIN_SECRET ? { 'x-demo-admin-secret': ADMIN_SECRET } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  try {
    return text ? (JSON.parse(text) as Json) : {}
  } catch {
    return { raw: text.slice(0, 200) }
  }
}

function step(label: string) {
  process.stdout.write(`▶ ${label}… `)
}

async function main() {
  console.log(`Stage preparation — ${BASE}\n`)

  if (!ADMIN_SECRET) {
    console.error('❌ DEMO_ADMIN_SECRET is not set. seed and reset both require it.')
    process.exit(1)
  }

  // 1. Clear the stage. This also drops seller sessions and, importantly, the World replay
  // digests — so the same identity can verify again on the next run.
  step('clearing test state')
  const reset = await call('/api/reset', 'POST')
  console.log(reset.reset === true ? 'done' : `FAILED (${reset.code ?? 'unknown'})`)

  // 2. Rebuild what the scenes need, and rebalance shares back into position.
  step('seeding + rebalancing (first run is slow, this is the warm-up)')
  const started = Date.now()
  const seed = await call('/api/seed', 'POST')
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  if (seed.seeded !== true) {
    console.log(`FAILED (${seed.code ?? 'unknown'}) — ${seed.error ?? ''}`)
    process.exit(1)
  }
  const rebalanced = seed.rebalanced as { toBuyer1: number; toTreasury: number } | undefined
  console.log(
    `done in ${seconds}s — buyer1 +${rebalanced?.toBuyer1 ?? 0}, treasury +${rebalanced?.toTreasury ?? 0}`,
  )

  // 3. Warm the paths whose first call is slow, so the demo never pays for a cold start.
  step('warming ENS resolution')
  const ens = await call('/api/ens-read', 'POST', { propertyId: 'PROP-002' })
  console.log(ens.source ? `done (source: ${ens.source})` : `FAILED (${ens.code ?? 'unknown'})`)

  step('warming Mirror timeline')
  const audit = await call('/api/audit?propertyId=PROP-001')
  console.log(`done (${audit.eventCount ?? 0} events)`)

  step('warming World RP signing')
  const rp = await call('/api/rp-signature', 'POST', { action: 'verify-buyer' })
  console.log(rp.rpContext ? 'done' : `FAILED (${rp.code ?? 'unknown'})`)

  // 4. Confirm the stage is actually clean.
  step('checking the verifier queue is empty')
  const pending = await call('/api/verifier/pending')
  const queue = (pending.pending as unknown[] | undefined) ?? []
  console.log(queue.length === 0 ? 'empty' : `⚠️  ${queue.length} left over`)

  console.log('\n' + '═'.repeat(52))
  console.log('Stage is prepared. Now run `npm run preflight` — it must end with')
  console.log('"All green. Go." before you present.')
  if (queue.length > 0) {
    console.log('\n⚠️  The review queue is not empty. A judge will see those cards.')
  }
}

main().catch((error) => {
  console.error('\n❌ Stage preparation failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
