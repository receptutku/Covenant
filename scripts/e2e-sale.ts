import './env'

/**
 * End-to-end walk of the SALE flow against a running dev server.
 *
 * This exercises the HTTP surface the frontend will actually call — not the library
 * functions underneath — so a mistake in routing, validation, or the error envelope shows
 * up here rather than during integration with Akif.
 *
 * Run `npm run dev` in another terminal first.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const ADMIN_SECRET = process.env.DEMO_ADMIN_SECRET!

/**
 * `--no-reset` runs against a throwaway property and leaves the store untouched.
 *
 * The default run wipes state, which is correct for a clean check but destructive while
 * someone is testing the UI against the same server — it would delete their session and
 * seeded properties mid-flow. The isolated mode exists so the full pipeline can be
 * verified during integration without interrupting anyone.
 */
const NO_RESET = process.argv.includes('--no-reset')
const PROPERTY_ID = NO_RESET ? `PROP-E2E-${Date.now().toString().slice(-6)}` : 'PROP-002'

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

/** A minimal but structurally real PDF, so the upload path is exercised honestly. */
function fakePdf(label: string): string {
  const pdf = `%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n% ${label}\n%%EOF`
  return Buffer.from(pdf, 'utf8').toString('base64')
}

function ok(condition: boolean, message: string): void {
  checks += 1
  if (condition) {
    console.log(`  ✅ ${message}`)
  } else {
    console.log(`  ❌ ${message}`)
    failures += 1
  }
}

let failures = 0
let checks = 0

async function main() {
  console.log(`▶ SALE end-to-end against ${BASE}`)
  console.log(
    NO_RESET
      ? `  isolated mode — property ${PROPERTY_ID}, existing state untouched\n`
      : `  property ${PROPERTY_ID}, store will be reset\n`,
  )

  // Start from a clean store so repeated runs are deterministic — unless we were asked to
  // leave whatever is there alone.
  if (!NO_RESET) await call('/api/reset', { method: 'POST', adminSecret: true })

  // ── 1. Seller session ──────────────────────────────────────────────────────
  //
  // Two branches, both asserting the RIGHT thing for the server's configuration:
  //  - With World configured, a forged proof MUST be rejected — that rejection is the
  //    positive result here (this exact case regressed once: the test used to expect a
  //    forged proof to pass, which was only true before credentials existed).
  //  - The session for the rest of the flow comes from the dev endpoint, which is the
  //    sanctioned scripted path (dev-only + admin secret; the real IDKit widget cannot
  //    be driven from a script).
  console.log('1. Seller session')
  const forged = await call('/api/onboard', {
    method: 'POST',
    body: { proof: { nullifier_hash: `0xtest-${Date.now()}` }, action: 'onboard-seller' },
  })
  const worldConfigured = forged.body.code === 'WORLD_PROOF_INVALID'
  ok(
    worldConfigured || forged.status === 200,
    worldConfigured
      ? 'forged proof rejected by the real World backend'
      : 'dev fallback accepted the proof (World not configured)',
  )

  const session = await call('/api/dev/session', { method: 'POST', adminSecret: true })
  const sellerSessionToken = session.body.sellerSessionToken as string
  ok(typeof sellerSessionToken === 'string' && sellerSessionToken.length === 64, 'opaque 64-hex session token')
  ok(!JSON.stringify(session.body).includes('nullifier'), 'response leaks no nullifier')

  // ── 2. Attest without a session must fail ──────────────────────────────────
  console.log('\n2. POST /api/attest without a session')
  const noSession = await call('/api/attest', {
    method: 'POST',
    body: {
      propertyId: PROPERTY_ID,
      displayName: 'Alfama 2+1',
      city: 'Lisbon',
      sellerAccountId: process.env.OPERATOR_ID,
      tokenSymbol: 'ALFM',
      files: [{ name: 'deed.pdf', type: 'application/pdf', dataBase64: fakePdf('deed') }],
    },
  })
  ok(noSession.body.code === 'SELLER_SESSION_REQUIRED', `blocked with SELLER_SESSION_REQUIRED (got ${noSession.body.code})`)

  // ── 3. Document submission ─────────────────────────────────────────────────
  console.log('\n3. POST /api/attest with a valid session')
  const attest = await call('/api/attest', {
    method: 'POST',
    body: {
      sellerSessionToken,
      propertyId: PROPERTY_ID,
      displayName: 'Alfama 2+1',
      city: 'Lisbon',
      sellerAccountId: process.env.OPERATOR_ID,
      tokenSymbol: 'ALFM',
      files: [
        { name: 'deed.pdf', type: 'application/pdf', dataBase64: fakePdf('deed') },
        { name: 'tax.pdf', type: 'application/pdf', dataBase64: fakePdf('tax') },
      ],
    },
  })
  ok(attest.status === 200, `status 200 (got ${attest.status}) ${attest.body.code ?? ''}`)
  ok(attest.body.state === 'PENDING_REVIEW', 'state is PENDING_REVIEW')
  ok(/^[0-9a-f]{64}$/.test(String(attest.body.documentRoot)), 'documentRoot is a 64-hex Merkle root')
  ok(!JSON.stringify(attest.body).includes('salt'), 'response leaks no salt')
  ok(!JSON.stringify(attest.body).includes('dataBase64'), 'response leaks no document bytes')

  // ── 4. Tokenizing before approval must fail ────────────────────────────────
  console.log('\n4. POST /api/tokenize while still pending')
  const early = await call('/api/tokenize', {
    method: 'POST',
    body: {
      propertyId: PROPERTY_ID,
      attestation: {
        propertyId: PROPERTY_ID,
        sellerAccountId: process.env.OPERATOR_ID,
        documentRoot: attest.body.documentRoot,
        decision: 'APPROVED',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        signature: Buffer.alloc(64, 1).toString('base64'),
        verifierPublicKey: process.env.VERIFIER_PUBLIC_KEY,
      },
    },
  })
  ok(early.body.code === 'OWNERSHIP_PENDING', `blocked with OWNERSHIP_PENDING (got ${early.body.code})`)

  // ── 5. Verifier queue ──────────────────────────────────────────────────────
  console.log('\n5. GET /api/verifier/pending')
  const unauth = await call('/api/verifier/pending')
  ok(unauth.body.code === 'UNAUTHORIZED', `no secret → UNAUTHORIZED (got ${unauth.body.code})`)

  const pending = await call('/api/verifier/pending', { adminSecret: true })
  const queue = pending.body.pending as Record<string, unknown>[]
  // In isolated mode other properties may legitimately be awaiting review, so assert that
  // OURS is queued rather than that it is the only one.
  const queued = queue?.some((entry) => entry.propertyId === PROPERTY_ID)
  ok(
    NO_RESET ? Boolean(queued) : queue?.length === 1,
    NO_RESET
      ? `${PROPERTY_ID} is in the review queue (queue size ${queue?.length})`
      : `queue holds 1 property (got ${queue?.length})`,
  )
  ok(!JSON.stringify(pending.body).includes('dataBase64'), 'queue exposes metadata only')

  // ── 6. Approval produces a signed attestation ──────────────────────────────
  console.log('\n6. POST /api/verifier/decision APPROVED')
  const decision = await call('/api/verifier/decision', {
    method: 'POST',
    adminSecret: true,
    body: { propertyId: PROPERTY_ID, decision: 'APPROVED' },
  })
  ok(decision.status === 200, `status 200 (got ${decision.status}) ${decision.body.code ?? ''}`)
  ok(decision.body.state === 'APPROVED', 'state is APPROVED')
  const attestation = decision.body.attestation as Record<string, unknown>
  ok(typeof attestation?.signature === 'string', 'attestation carries an Ed25519 signature')

  // ── 7. Tampered attestation must not mint ──────────────────────────────────
  console.log('\n7. POST /api/tokenize with a tampered attestation')
  const tampered = await call('/api/tokenize', {
    method: 'POST',
    body: {
      propertyId: PROPERTY_ID,
      attestation: { ...attestation, documentRoot: 'b'.repeat(64) },
    },
  })
  ok(tampered.body.code === 'ATTESTATION_INVALID', `blocked with ATTESTATION_INVALID (got ${tampered.body.code})`)

  // ── 8. Genuine tokenization ────────────────────────────────────────────────
  console.log('\n8. POST /api/tokenize with the genuine attestation')
  const tokenize = await call('/api/tokenize', {
    method: 'POST',
    body: { propertyId: PROPERTY_ID, attestation },
  })
  ok(tokenize.status === 200, `status 200 (got ${tokenize.status}) ${tokenize.body.code ?? ''}`)
  ok(/^0\.0\.\d+$/.test(String(tokenize.body.tokenId)), `real tokenId minted: ${tokenize.body.tokenId}`)
  ok(tokenize.body.totalSupply === 1000, 'supply is 1000')
  console.log(`     ${tokenize.body.hashscanUrl}`)

  // ── 9. Double tokenization is refused ──────────────────────────────────────
  console.log('\n9. POST /api/tokenize a second time')
  const again = await call('/api/tokenize', {
    method: 'POST',
    body: { propertyId: PROPERTY_ID, attestation },
  })
  ok(again.body.code === 'ALREADY_TOKENIZED', `blocked with ALREADY_TOKENIZED (got ${again.body.code})`)

  console.log(`\n${'━'.repeat(70)}`)
  if (failures > 0) {
    console.error(`❌ ${failures} assertion(s) failed.`)
    process.exit(1)
  }
  console.log(`✅ SALE flow passes end-to-end over HTTP. (${checks}/${checks} checks)`)
}

main().catch((error) => {
  console.error('\n❌ E2E run failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
