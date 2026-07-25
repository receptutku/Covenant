# PPREV — Demo Runbook

The crisis card. Read once before the first rehearsal; keep open during the demo.

---

## Before going on stage (5 minutes)

Export the admin secret once, into the shell you will be using under pressure. Every
recovery command below assumes it is set — reaching for `.env.local` mid-incident is how
a two-minute fix becomes a five-minute one.

```bash
export SECRET=$(grep '^DEMO_ADMIN_SECRET=' .env.local | cut -d= -f2)

npm run dev              # server on :3000
npm run stage            # clear, seed, rebalance shares, warm every slow path
npm run preflight        # must end with "All green. Go."
```

`npm run stage` exists because three separate things go wrong between rehearsals and they
all have the same fix:

- **Test properties pile up in the verifier queue.** A judge should see one card to review,
  not debris from a curl session. `stage` resets first, so the queue starts empty.
- **Shares drift out of position.** The fee scene drains buyer1; the primary sale drains the
  treasury. Both refill from buyer2, but only when seed runs. Measured mid-rehearsal:
  treasury down to 16 of 1000, which surfaces as `INSUFFICIENT_TOKEN_BALANCE` on the buy
  step — the worst possible moment to discover it.
- **The first request of the day is slow.** Cold Hedera client, unresolved ENS name,
  unqueried Mirror: first seed took **67s**, every later one **8s**. `stage` pays that cost
  before anyone is watching.

`preflight` runs after, not before: it checks the server is up and the store is populated,
so running it first just reports what `stage` was about to fix.

If preflight reports a failure, its message names the fix. The three usual ones:

| Preflight says | Fix |
|---|---|
| `token drift` on prop-001 | `npm run ens:write` (golden re-minted the seed token) |
| `buyer1 shares low` | `npm run stage` |
| `no mode record` on any prop | ENSv2 alpha reset state → `npm run ens:write` |

---

## Read this before the second rehearsal

**The same person cannot pass the same World check twice.** A nullifier is derived from
(identity, app, action), so it is identical every time — that is what makes replay
protection work, and it means rehearsal #2 is refused at step one with
`WORLD_PROOF_REPLAY`, before anything else can be shown.

Between rehearsals that reuse the same World identity:

```bash
curl -s -X POST localhost:3000/api/dev/clear-replay -H "x-demo-admin-secret: $SECRET"
```

Clears only the proof history. Seeded properties, sessions and on-chain state are
untouched, so no reseed is needed. `/api/reset` also clears it, but takes the demo state
with it.

This is not a weakened check: proofs are still verified against World every time, and each
one is still single-use after the call. It only forgets that this identity was seen before.

### ⚠️ clear-replay alone does NOT get you back in

This is the wall directly behind the one above, and it was found by walking the flow rather
than by reading the code.

Every Selfie Check mints a **new random session token**, and a property belongs to the
session that submitted it. So after any second Selfie Check — a reload, an expiry, the
"Reset session" button, or simply rehearsal #2 — resubmitting the **same property id** is
refused:

```
401 SELLER_SESSION_REQUIRED
This property was submitted by a different session and cannot be replaced from this one.
```

The screen makes this worse than it is: the green "Session active" badge is telling the
truth (the new session is fine) while the red card refuses you, and the reflex — verify
again — mints a third session and changes nothing.

**Between runs, do one of these:**

```bash
npm run stage      # clears everything and reseeds. The default choice.
```

or **use a new property id** — PROP-002 → PROP-004 → PROP-005. The field is free text.

⚠️ If you do take a new id, **leave the Buyer column's property field on PROP-001 or PROP-002**
when you read ENS. Only prop-001/002/003 have published records; any other name answers
`ENS_CONFIG_INCOMPLETE` (422), because a name with no `com.pprev.mode` record cannot be
validated and the env fallback only covers a *total* resolution failure, not an empty one.
Verified: `POST /api/ens-read {"propertyId":"PROP-060"}` → 422. The buy path is unaffected —
it treats an unresolvable record as *unavailable*, which never blocks.

Never reuse a property id after a second Selfie Check. Note that a fresh id has no ENS
record, so the discovery panel falls back to env values and names the previous token; the
buy still works (the ENS check treats a fallback as *unavailable*, which never blocks), but
do not narrate that panel as live ENS on a made-up id.

### ⚠️ Do not touch "Reset session"

The small grey button next to the session badge is client-only — it destroys the browser's
copy and leaves the server's session alive, which is the opposite of useful. After clicking
it the **entire Seller column is disabled** except the World verify button, and that button
answers `WORLD_PROOF_REPLAY`. You cannot even switch to a new property id, because that
field is disabled without a session.

Recovery is admin-only: Buyer column → admin secret → **Clear World replay guard** → verify
again. If the tab was never reloaded, everything else survives — `/api/tokenize` needs no
session at all, so an attestation still in memory will still mint.

---

## Mid-demo failures, ranked by likelihood

### 1. Server restarted / state gone

Measured, not estimated — this drill was actually run:

| What | Reality |
|---|---|
| Server back up | **~2 seconds** |
| Audit timeline | **Survives fully** — it is read from Mirror, not memory |
| On-chain tokens, escrows, ENS records | Survive — nothing on-chain is affected |
| Property store | **Emptied.** `/api/health` shows `seededProperties: 0` |

**Seeded scenes do NOT work immediately after a restart.** Both `PROP-001` and `PROP-002`
return `PROPERTY_NOT_FOUND` until the store is repopulated. Recovery:

```bash
npm run dev
curl -s -X POST localhost:3000/api/seed -H "x-demo-admin-secret: $SECRET"   # ~10s
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
curl -s -X POST localhost:3000/api/dev/session -H "x-demo-admin-secret: $SECRET"
```
**Be honest on stage:** "The World simulator is unavailable right now — this session was
issued without a proof, which the server logs loudly. The verification path itself is the
one you saw in the rp-signature and rejection tests."

### 4b. A rental was ENGAGED when the server restarted

The deposit is locked on-chain but the listing is gone from memory. `expire` answers
`PROPERTY_NOT_FOUND`; `settle` answers `SELLER_SESSION_REQUIRED` first, because it validates
the session before it looks the listing up — the sessions died with the store too. Either way
that escrow cannot be released through the API again. **Nothing is lost:** escrow, landlord and operator are the same account in this
demo, so the HBAR is already sitting in the operator's balance.

Do not try to recover it live. Start a fresh listing (`rental/list` → `apply` → `engage`)
and carry on; the whole cycle takes under a minute.

> Rebuilding rental state from the HCS trail on startup would fix this properly — every
> `RENTAL_ENGAGED` event carries the listing id, deposit and lock expiry — and it would
> demonstrate that the audit trail is authoritative rather than decorative. Roadmap, not
> hackathon.

### 5. A transfer fails with INSUFFICIENT_TOKEN_BALANCE

Someone ran out of shares. Which someone depends on the scene, and both drain into buyer2:

- **Secondary (fee) scene** — buyer1 is empty. Each run moves 100 to buyer2.
- **Primary sale** — the treasury is empty. Each sale moves shares out and only the 2% fee
  comes back. Observed at 16 of 1000 after a day of rehearsals.

One fix for both:

```bash
npm run stage    # or: curl -s -X POST localhost:3000/api/seed -H "x-demo-admin-secret: $SECRET"
```

Nothing is ever lost — supply is fixed at 1000 and seed moves the same shares back into
position from buyer2, which is where they all accumulate.

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
| Timeline shows events from earlier rehearsals | HCS is append-only — that IS the feature. Filter by property if it distracts. |
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

## Presenter rules found by walking the flow

None of these are bugs to fix on demo day. They are the shapes where the honest user and a
hostile one look identical to the code, so the code refuses both.

| Rule | Why | If it happens anyway |
|---|---|---|
| **Never upload against PROP-001 or PROP-003.** | Both are seeded. PROP-001 carries the fee and no-KYC scenes; PROP-003 is `APPROVED` and deliberately untokenized so the rental flow can list it. Neither has an owning session, so the ownership guard does **not** protect them. | Re-seed with the curl in "Before going on stage" — there is no `npm run seed`. |
| **Run Identity Check exactly once, on buyer1.** | The `verify-buyer` nullifier is per identity+action; the account id is not part of it. Switching to buyer2 and verifying again is `WORLD_PROOF_REPLAY`, with no explanation on screen. | Harmless — seed already granted KYC to both buyers. Or use the dev grant. |
| **Type the admin secret in the Verifier column, and do it last.** | It is one module-global value shared with the Buyer column's Seed button. A typo there silently breaks the Verifier's next Approve, in a different column, with nothing linking them. | Re-type it in the Verifier column and click **Load pending** again. |
| **Click "Load pending" after the seller submits, not before.** | The queue never refreshes itself. Clicking early shows "Queue is empty" forever, which looks like a failure and is not. | Click it again. |
| **After tokenizing the live property, set the buyer's property field back to PROP-001** before the fee and rejection scenes. | A freshly minted token has its associations, KYC grants and buyer1 float prepared in the background. Too early, the fee scene answers `INSUFFICIENT_TOKEN_BALANCE` — and the rejection scene can answer `KYC_DENIED` for the *wrong reason*, which makes the UI narrate the network-level story over a race. | Wait ~15s and retry, or switch back to PROP-001. |
| **If a judge says "now do it for the other buyer", change the amount by 1 too.** | The 30-second suppression key is `(property, mode, amount)` and does **not** include the buyer account. Switching only the radio inside that window returns the FIRST buyer's transaction with "Nothing moved" — which mis-explains it, because you did not repeat, you changed the recipient. | Change the amount, or wait 30 seconds. |
| **If a judge says "do it again", change the amount by 1.** | An identical `(property, mode, amount)` within 30 seconds is suppressed and returns the first transaction with "Nothing moved". Correct and honest, but it reads as a failure. | Change the amount, or wait 30 seconds. |
| **Reject is not gated by the review checklist.** Approve requires all four boxes; Reject does not, and the reason box sits between them. | A mis-click writes REJECTED and publishes it to HCS permanently. | The seller clicks **Submit documents** again (the files are still in state) → verifier clicks **Load pending** → Approve. ~15 seconds. Only works if the seller has not re-verified in between. |
| **If the ENS panel returns `ENS_CONFIG_INCOMPLETE`, press the button again.** | A *partial* resolution — some records answered, some timed out — is non-empty, so the env fallback does not fire. Failures are never cached, so a retry usually succeeds. | If it keeps failing, skip it: Buy is not gated on ENS and both buyers are already KYC'd. |
| **Rental: if `settle` or `expire` returns 500, do NOT retry.** | The terminal state is written when the transaction is submitted, not when the receipt arrives — deliberately, so a timeout cannot pay the escrow twice. The money moved. | Check HashScan. The retry will correctly answer `RENTAL_NOT_ENGAGED`. |

### If you want to demonstrate the ENS refusal live

`ENS_CONFIG_MISMATCH` only fires when the record names a **real, existing HTS token whose
treasury is not our operator**. Garbage, a made-up id or a deleted record all resolve to
*unavailable*, which never blocks — so a judge who deletes a record and expects a refusal
will see the sale go through, and be right to ask why.

To show it: have a real testnet token id from another treasury ready, point
`com.pprev.hedera.propertyTokenId` at it, then wait out **both** caches — ENS resolution is
cached 60s, and a repeat buy with the same `(property, mode, amount)` inside 30s never reaches
the check at all. Change the amount to be sure.

Expect the button to sit for up to ~20 s in that scene: a bad record costs an ENS resolution
plus up to three Mirror attempts, all inside the lock.

---

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
