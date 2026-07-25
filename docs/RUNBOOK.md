# PPREV — Demo Runbook

The crisis card. Read once before the first rehearsal; keep open during the demo.

---

## Before going on stage (5 minutes)

```bash
npm run preflight        # must end with "All green. Go."
npm run dev              # server on :3000
curl -s -X POST localhost:3000/api/seed   # restores PROP-001 + tops buyer1 up
```

If preflight reports a failure, its message names the fix. The three usual ones:

| Preflight says | Fix |
|---|---|
| `token drift` on prop-001 | `npm run ens:write` (golden re-minted the seed token) |
| `buyer1 shares low` | `POST /api/seed` |
| `no mode record` on any prop | ENSv2 alpha reset state → `npm run ens:write` |

---

## Read this before the second rehearsal

**The same person cannot pass the same World check twice.** A nullifier is derived from
(identity, app, action), so it is identical every time — that is what makes replay
protection work, and it means rehearsal #2 is refused at step one with
`WORLD_PROOF_REPLAY`, before anything else can be shown.

Between rehearsals that reuse the same World identity:

```bash
curl -s -X POST localhost:3000/api/dev/clear-replay -H "x-demo-admin-secret: <secret>"
```

Clears only the proof history. Seeded properties, sessions and on-chain state are
untouched, so no reseed is needed. `/api/reset` also clears it, but takes the demo state
with it.

This is not a weakened check: proofs are still verified against World every time, and each
one is still single-use after the call. It only forgets that this identity was seen before.

---

## Mid-demo failures, ranked by likelihood

### 1. Server restarted / state gone

Measured, not estimated — this drill was actually run:

| What | Reality |
|---|---|
| Server back up | **~2 seconds** |
| Audit timeline | **Survives fully** (88 events still there) — it is read from Mirror, not memory |
| On-chain tokens, escrows, ENS records | Survive — nothing on-chain is affected |
| Property store | **Emptied.** `/api/health` shows `seededProperties: 0` |

**Seeded scenes do NOT work immediately after a restart.** Both `PROP-001` and `PROP-002`
return `PROPERTY_NOT_FOUND` until the store is repopulated. Recovery:

```bash
npm run dev
curl -s -X POST localhost:3000/api/seed     # ~9s — restores PROP-001
```

After that, the seeded scenes (secondary fee, KYC rejection) work again.

The live property (`PROP-002`) is **not** restored by seed — its token still exists
on-chain, but the server no longer knows about it, so `/api/buy` refuses it. Redo the
live flow from the Selfie step and narrate it as a fresh run. That is fine: the flow
takes under a minute, and re-tokenizing now updates the ENS record automatically (see
below), so nothing goes out of sync.

### 2. Mirror timeline looks empty or stale
Mirror trails consensus by a few seconds; a just-written event may not be there yet.
**Say this, don't hide it:** "Mirror is a public replica — it lags consensus by a few
seconds, which is exactly why it's independently verifiable." Refresh once. The
transaction links (HashScan) work immediately even when the timeline lags.

### 3. ENS resolution fails / times out
The API degrades by itself: the response switches to `source: "env-fallback"` and the
UI badge changes. **Say:** "Discovery falls back to pinned config if Sepolia hiccups —
the resolution path is live again as soon as the RPC answers." Nothing to do.

### 4. World simulator won't cooperate
The dev-session endpoint exists for exactly this (dev-only + admin secret):
```bash
curl -s -X POST localhost:3000/api/dev/session -H "x-demo-admin-secret: <secret>"
```
**Be honest on stage:** "The World simulator is unavailable right now — this session was
issued without a proof, which the server logs loudly. The verification path itself is the
one you saw in the rp-signature and rejection tests."

### 4b. A rental was ENGAGED when the server restarted

The deposit is locked on-chain but the listing is gone from memory, so `settle` and
`expire` both answer `PROPERTY_NOT_FOUND` — that escrow cannot be released through the API
again. **Nothing is lost:** escrow, landlord and operator are the same account in this
demo, so the HBAR is already sitting in the operator's balance.

Do not try to recover it live. Start a fresh listing (`rental/list` → `apply` → `engage`)
and carry on; the whole cycle takes under a minute.

> Rebuilding rental state from the HCS trail on startup would fix this properly — every
> `RENTAL_ENGAGED` event carries the listing id, deposit and lock expiry — and it would
> demonstrate that the audit trail is authoritative rather than decorative. Roadmap, not
> hackathon.

### 5. A transfer fails with INSUFFICIENT_TOKEN_BALANCE
buyer1 ran out of shares (each rehearsal moves 100 to buyer2 permanently).
```bash
curl -s -X POST localhost:3000/api/seed
```

### 6. Tunnel died (only relevant while Akif tests remotely)
```bash
cloudflared tunnel --url http://localhost:3000
```
New URL → Akif updates `NEXT_PUBLIC_API_BASE_URL`. On demo day everything is localhost;
no tunnel involved.

---

## Things that look like bugs but are not

| Observation | Reality |
|---|---|
| Primary transfer shows **no fee** | Treasury is fee-exempt. Say it before the judges ask. |
| nokyc rejection shows a long raw string | That's the point — `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` comes from the network, not our code. |
| The rental deposit "returns" to the tenant on settle | Correct: a deposit is the tenant's money, not the landlord's payment. |
| Timeline shows events from earlier rehearsals | HCS is immutable — that IS the feature. Filter by property if it distracts. |
| `source: "env-fallback"` badge on ENS panel | Honest degradation, see #3. |

---

## ENS keeps itself in sync (as of the hardening pass)

Every live run mints a **new** token for `PROP-002`. Previously the ENS record kept
pointing at the previous run's token, so the discovery panel and the transfer disagreed —
a contradiction visible on screen. `/api/tokenize` now publishes the new token id to ENS
in the background and drops the cached config, so the next resolve is already correct.
Verified: a fresh mint moved the record from `0.0.9734945` to `0.0.9736806` within ~20s.

Nothing to do during the demo. If the ENS write fails (Sepolia down), it is logged and
`/api/ens-read` degrades to `env-fallback` on its own.

## Hard rules

- **Never** run `npm run golden` on demo day. It re-mints the seed token, and two things
  go stale at once: the running server keeps the OLD `SEED_TOKEN_ID` in memory (Next reads
  `.env.local` once, at startup, so you must restart), and the prop-001 ENS record still
  points at the previous token until you run `npm run ens:write`. The script prints both
  warnings, but by then you are already mid-incident.
- **Do not demo from a production build.** `/api/seed`, `/api/reset` and `/api/dev/session`
  are development-only by design, so under `npm run build && npm start` the seed control
  and crisis remedies #1, #4 and #5 all answer "This endpoint is disabled in production".
  Use `npm run dev`.
- **Never** send the nokyc account to `/api/kyc`. It is refused now, but the reason
  matters: granting it KYC would end golden scene 1 permanently — there is no revoke.
- **Never** upload documents against `PROP-001` (the API blocks it, but don't try).
- After `demo-final` is tagged: bug fixes only, nothing new.
- The last 90 minutes before submission: one person pushes, the other reviews.
