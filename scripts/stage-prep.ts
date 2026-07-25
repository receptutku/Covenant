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

let failed = false

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
  if (reset.reset === true) console.log('done')
  else { failed = true; console.log(`FAILED (${reset.code ?? 'unknown'})`) }

  // 1b. Prove the replay store is empty rather than assuming reset emptied it.
  //
  // A rehearsal died at step one on a World proof that had already been spent, and the
  // first question was whether reset clears these at all. It does — `resetStore()` swaps
  // the whole store object — but the honest answer took a code read, and the actual cause
  // was that stage had not been run at all. Both problems go away if this step reports a
  // number: a non-zero count here means reset did NOT clear them, and the count is printed
  // either way so "did stage run?" is never a question again.
  step('confirming the World replay store is empty')
  const replay = await call('/api/dev/clear-replay', 'POST', {})
  const cleared = typeof replay.cleared === 'number' ? replay.cleared : -1
  if (cleared === 0) {
    console.log('empty')
  } else if (cleared > 0) {
    failed = true
    console.log(
      `⚠️  ${cleared} proof digest(s) survived the reset — they are cleared now, but reset ` +
        'is supposed to have done this. Investigate before presenting.',
    )
  } else {
    failed = true
    console.log(`FAILED (${replay.code ?? 'unknown'})`)
  }

  // 2. Rebuild what the scenes need, and rebalance shares back into position.
  step('seeding + rebalancing (first run is slow, this is the warm-up)')
  const started = Date.now()
  const seed = await call('/api/seed', 'POST')
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  if (seed.seeded !== true) {
    console.log(`FAILED (${seed.code ?? 'unknown'}) — ${seed.error ?? ''}`)
    process.exit(1)
  }
  const rebalanced = seed.rebalanced as
    | { buyer1: { reached: number; short: number }; treasury: { reached: number; short: number }; ok: boolean }
    | undefined
  console.log(
    `done in ${seconds}s — buyer1 ${rebalanced?.buyer1.reached ?? '?'}, treasury ${rebalanced?.treasury.reached ?? '?'}` +
      (rebalanced?.ok === false ? '  ⚠️  SHORT' : ''),
  )
  if (rebalanced?.ok === false) {
    failed = true
    console.log(
      `   buyer1 short ${rebalanced.buyer1.short}, treasury short ${rebalanced.treasury.short}` +
        ' — buyer2 is the only reservoir and may be exhausted.',
    )
  }

  // 3. Warm the paths whose first call is slow, so the demo never pays for a cold start.
  step('warming ENS resolution')
  const ens = await call('/api/ens-read', 'POST', { propertyId: 'PROP-002' })
  if (ens.source) console.log(`done (source: ${ens.source})`)
  else { failed = true; console.log(`FAILED (${ens.code ?? 'unknown'})`) }

  step('warming Mirror timeline')
  const audit = await call('/api/audit?propertyId=PROP-001')
  console.log(`done (${audit.eventCount ?? 0} events)`)

  step('warming World RP signing')
  const rp = await call('/api/rp-signature', 'POST', { action: 'verify-buyer' })
  if (rp.rpContext) console.log('done')
  else { failed = true; console.log(`FAILED (${rp.code ?? 'unknown'})`) }

  // 4. Confirm the stage is actually clean.
  step('checking the verifier queue is empty')
  const pending = await call('/api/verifier/pending')
  const queue = (pending.pending as unknown[] | undefined) ?? []
  if (queue.length === 0) console.log('empty')
  else { failed = true; console.log(`⚠️  ${queue.length} left over`) }

  console.log('\n' + '═'.repeat(52))
  if (failed) {
    // Printing a success banner over a failed step is how a broken stage reaches the
    // projector. Every step above marks `failed`, and nothing here overrides it.
    console.error('❌ Stage preparation did NOT complete. Fix the FAILED steps above.')
    process.exit(1)
  }
  console.log('Stage is prepared. Now run `npm run preflight` — it must end with')
  console.log('"All green. Go." before you present.')
}

main().catch((error) => {
  console.error('\n❌ Stage preparation failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
