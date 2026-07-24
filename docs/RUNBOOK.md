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

## Mid-demo failures, ranked by likelihood

### 1. Server restarted / state gone
Everything on-chain survives; only server memory is lost.
```bash
npm run dev
curl -s -X POST localhost:3000/api/seed
```
~10 seconds. The seeded scenes (secondary fee, KYC rejection) work immediately.
The live property (PROP-002) restarts from the Selfie step — narrate it as a fresh run.

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

## Hard rules

- **Never** run `npm run golden` on demo day — it re-mints the seed token and desyncs ENS.
- **Never** upload documents against `PROP-001` (the API blocks it, but don't try).
- After `demo-final` is tagged: bug fixes only, nothing new.
- The last 90 minutes before submission: one person pushes, the other reviews.
