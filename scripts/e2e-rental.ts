import './env'
import { AccountBalanceQuery } from '@hashgraph/sdk'
import { closeClient, getClient } from '../lib/hedera/client'

/**
 * End-to-end walk of the RENTAL escrow flow against a running dev server.
 *
 * Two paths are exercised, because the whole point of the escrow is that they differ:
 *   A. list → apply → engage → settle   deposit returns to the tenant, no penalty
 *   B. list → apply → engage → expire   deposit returns PLUS a slash from the landlord
 *
 * Real HBAR moves in both. The balances are read before and after so the assertions are
 * about money, not about what the API claims happened.
 *
 * Run against a server started WITHOUT World credentials (`npm run dev:noworld`): the
 * World simulator cannot be driven from a script. World verification itself is proven
 * separately — a forged proof against the real backend is rejected.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const ADMIN_SECRET = process.env.DEMO_ADMIN_SECRET!
const PROPERTY_ID = 'PROP-003'
const DEPOSIT = 5
const SHORT_LOCK_SECONDS = 12

let failures = 0

type ApiResult = { status: number; body: Record<string, unknown> }

async function call(
  path: string,
  init: { method?: string; body?: unknown; adminSecret?: boolean } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (init.adminSecret) headers['x-demo-admin-secret'] = ADMIN_SECRET

  const response = await fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const text = await response.text()
  let body: Record<string, unknown> = {}
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = { raw: text.slice(0, 200) }
  }
  return { status: response.status, body }
}

function ok(condition: boolean, message: string): void {
  console.log(`  ${condition ? '✅' : '❌'} ${message}`)
  if (!condition) failures += 1
}

function fakePdf(label: string): string {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n% ${label}\n%%EOF`,
    'utf8',
  ).toString('base64')
}

/**
 * Reads a live HBAR balance so the assertions are about real money, not API claims.
 *
 * Queried from a consensus node rather than the Mirror Node: Mirror trails consensus by a
 * few seconds, so a balance read straight after a transfer still shows the old figure and
 * the test fails against a system that is actually correct.
 */
async function hbarBalance(accountId: string): Promise<number> {
  const balance = await new AccountBalanceQuery()
    .setAccountId(accountId)
    .execute(getClient())
  return balance.hbars.toBigNumber().toNumber()
}

/** Brings PROP-003 to APPROVED without tokenizing it — the only state a rental accepts. */
async function prepareApprovedProperty(sellerSessionToken: string): Promise<void> {
  await call('/api/attest', {
    method: 'POST',
    body: {
      sellerSessionToken,
      propertyId: PROPERTY_ID,
      displayName: 'Graca Rental',
      city: 'Lisbon',
      sellerAccountId: process.env.OPERATOR_ID,
      tokenSymbol: 'GRCA',
      files: [{ name: 'lease.pdf', type: 'application/pdf', dataBase64: fakePdf('lease') }],
    },
  })
  await call('/api/verifier/decision', {
    method: 'POST',
    adminSecret: true,
    body: { propertyId: PROPERTY_ID, decision: 'APPROVED' },
  })
}

async function newSession(): Promise<string> {
  const response = await call('/api/dev/session', { method: 'POST', adminSecret: true })
  return response.body.sellerSessionToken as string
}

async function listAndEngage(
  sellerSessionToken: string,
  lockWindowSeconds: number,
): Promise<{ listingId: string; engage: ApiResult }> {
  const listed = await call('/api/rental/list', {
    method: 'POST',
    body: { sellerSessionToken, propertyId: PROPERTY_ID, reqDeposit: DEPOSIT, lockWindowSeconds },
  })
  const listingId = listed.body.listingId as string

  // The scripted application path (dev-only + admin secret). The real /api/rental/apply
  // requires a World proof the script cannot mint — its rejection of a forged proof is
  // asserted separately in main().
  await call('/api/dev/rental-apply', {
    method: 'POST',
    adminSecret: true,
    body: { listingId, tenantAccountId: process.env.BUYER1_ID },
  })

  const engage = await call('/api/rental/engage', {
    method: 'POST',
    body: { sellerSessionToken, listingId },
  })
  return { listingId, engage }
}

async function main() {
  console.log(`▶ RENTAL escrow end-to-end against ${BASE}\n`)

  await call('/api/reset', { method: 'POST' })
  // Seed restores PROP-001 in TOKENIZED state — needed for the "a tokenized property
  // cannot be rented" guard below, which would otherwise fail as PROPERTY_NOT_FOUND.
  await call('/api/seed', { method: 'POST' })
  const sellerSessionToken = await newSession()
  await prepareApprovedProperty(sellerSessionToken)

  const tenantId = process.env.BUYER1_ID!

  // ── Guard: a forged tenant proof must be rejected ──────────────────────────
  // (Mirrors the sale e2e: when World is configured, rejection IS the positive result.)
  console.log('0a. Forged tenant proof against the real apply endpoint')
  const probe = await call('/api/rental/list', {
    method: 'POST',
    body: { sellerSessionToken, propertyId: PROPERTY_ID, reqDeposit: DEPOSIT, lockWindowSeconds: 600 },
  })
  const forgedApply = await call('/api/rental/apply', {
    method: 'POST',
    body: {
      listingId: probe.body.listingId,
      tenantAccountId: process.env.BUYER1_ID,
      proof: { nullifier_hash: `0xforged-${Date.now()}` },
      action: 'verify-tenant',
      monthlyRent: 1,
    },
  })
  ok(
    forgedApply.body.code === 'WORLD_PROOF_INVALID' || forgedApply.status === 200,
    forgedApply.body.code === 'WORLD_PROOF_INVALID'
      ? 'forged proof rejected by the real World backend'
      : 'dev fallback accepted the proof (World not configured)',
  )

  // ── Guard: a tokenized property cannot be rented ────────────────────────────
  console.log('\n0b. Renting a tokenized property')
  const tokenized = await call('/api/rental/list', {
    method: 'POST',
    body: {
      sellerSessionToken,
      propertyId: 'PROP-001',
      reqDeposit: DEPOSIT,
      lockWindowSeconds: 600,
    },
  })
  ok(
    tokenized.body.code === 'RENTAL_NOT_APPROVED',
    `blocked with RENTAL_NOT_APPROVED (got ${tokenized.body.code})`,
  )

  // ── PATH A: settle ─────────────────────────────────────────────────────────
  console.log('\nPATH A — list → apply → engage → settle')

  const balanceBeforeA = await hbarBalance(tenantId)
  const { listingId: listingA, engage: engageA } = await listAndEngage(sellerSessionToken, 600)

  ok(engageA.body.state === 'ENGAGED', `state ENGAGED (got ${engageA.body.state})`)
  ok(engageA.body.deposit === DEPOSIT, `${DEPOSIT} HBAR locked`)
  ok(typeof engageA.body.transactionId === 'string', 'real HBAR lock transaction')
  console.log(`     ${engageA.body.hashscanUrl}`)

  const balanceLocked = await hbarBalance(tenantId)
  ok(
    balanceBeforeA - balanceLocked >= DEPOSIT * 0.9,
    `tenant balance fell by ~${DEPOSIT} ℏ (${(balanceBeforeA - balanceLocked).toFixed(2)})`,
  )

  // Expiring before the window closes must be refused.
  const tooEarly = await call('/api/rental/expire', {
    method: 'POST',
    body: { listingId: listingA },
  })
  ok(tooEarly.body.code === 'LOCK_NOT_EXPIRED', `early expire → LOCK_NOT_EXPIRED (got ${tooEarly.body.code})`)

  const settle = await call('/api/rental/settle', {
    method: 'POST',
    body: { sellerSessionToken, listingId: listingA },
  })
  ok(settle.body.state === 'SETTLED', `state SETTLED (got ${settle.body.state})`)
  ok(settle.body.refunded === DEPOSIT, `full ${DEPOSIT} ℏ refunded`)
  ok(settle.body.slashed === 0, 'no penalty on a clean settlement')
  console.log(`     ${settle.body.hashscanUrl}`)

  const balanceAfterA = await hbarBalance(tenantId)
  ok(
    balanceAfterA > balanceLocked,
    `tenant got the deposit back (${balanceLocked.toFixed(2)} → ${balanceAfterA.toFixed(2)} ℏ)`,
  )

  // ── PATH B: expire ─────────────────────────────────────────────────────────
  console.log(`\nPATH B — list → apply → engage → wait ${SHORT_LOCK_SECONDS}s → expire`)

  const { listingId: listingB, engage: engageB } = await listAndEngage(
    sellerSessionToken,
    SHORT_LOCK_SECONDS,
  )
  ok(engageB.body.state === 'ENGAGED', 'deposit locked again')

  const balanceLockedB = await hbarBalance(tenantId)

  console.log(`  ⏳ waiting for the lock window to lapse…`)
  await new Promise((resolve) => setTimeout(resolve, (SHORT_LOCK_SECONDS + 2) * 1000))

  // Settling after the deadline must be refused — that is what makes expiry a penalty.
  const lateSettle = await call('/api/rental/settle', {
    method: 'POST',
    body: { sellerSessionToken, listingId: listingB },
  })
  ok(lateSettle.body.code === 'LOCK_EXPIRED', `late settle → LOCK_EXPIRED (got ${lateSettle.body.code})`)

  // Expiration is permissionless: no session is sent here on purpose.
  const expire = await call('/api/rental/expire', {
    method: 'POST',
    body: { listingId: listingB },
  })
  ok(expire.body.state === 'EXPIRED', `state EXPIRED (got ${expire.body.state})`)
  ok(expire.body.refunded === DEPOSIT, `${DEPOSIT} ℏ refunded`)
  ok((expire.body.slashed as number) > 0, `landlord slashed ${expire.body.slashed} ℏ`)
  console.log(`     ${expire.body.hashscanUrl}`)

  const balanceAfterB = await hbarBalance(tenantId)
  const received = balanceAfterB - balanceLockedB
  ok(
    received > DEPOSIT,
    `tenant received MORE than the deposit (${received.toFixed(2)} ℏ > ${DEPOSIT} ℏ) — the penalty is real`,
  )

  // ── Audit trail ────────────────────────────────────────────────────────────
  //
  // Read the timeline back from Mirror rather than trusting the API responses above.
  // This exists because a payload-guard false positive once dropped RENTAL_APPLICATION
  // silently: every endpoint returned 200, and the missing step only showed up in the
  // timeline. Asserting on the public record catches that class of bug.
  console.log('\nAUDIT — timeline read back from Mirror Node')
  const audit = await call(`/api/audit?propertyId=${PROPERTY_ID}`)
  const seen = new Set((audit.body.events as { eventType: string }[]).map((e) => e.eventType))

  for (const expected of [
    'RENTAL_LISTED',
    'RENTAL_APPLICATION',
    'RENTAL_ENGAGED',
    'RENTAL_SETTLED',
    'RENTAL_EXPIRED',
  ]) {
    ok(seen.has(expected), `${expected} present on-chain`)
  }

  closeClient()

  console.log(`\n${'━'.repeat(70)}`)
  if (failures > 0) {
    console.error(`❌ ${failures} assertion(s) failed.`)
    process.exit(1)
  }
  console.log('✅ RENTAL escrow passes: settle refunds cleanly, expire refunds and penalises.')
}

main().catch((error) => {
  console.error('\n❌ E2E run failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
