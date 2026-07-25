# World Identity Check — Feedback

**Project:** PPREV — Privacy-Preserving Real Estate Verification
**Actions:** `verify-buyer`, `verify-tenant` · **Environment:** staging · **App:** `app_50e89a92…`

---

## Why we use Identity Check

Identity Check answers the only question our protocol needs answered about a counterparty,
and refuses to answer any of the others.

A property transaction has a real eligibility question — is this buyer allowed to hold this
asset, is this tenant plausible for this rent — and the industry's answer is to collect a
passport scan, a payslip and a proof of address, then store all three forever. That is a
data breach waiting for a date. What the transaction actually needs is a decision, not a
dossier.

So we ask for exactly two predicates:

- **Buyer** (`verify-buyer`): age and jurisdiction eligibility. On success we grant Hedera
  KYC on the property token, which is the moment the identity signal becomes a
  network-enforced permission — after that, Hedera itself refuses transfers to
  unverified accounts, not our code.
- **Tenant** (`verify-tenant`): age eligibility plus an income threshold (`income ≥ 3 ×
  rent`). The landlord learns the threshold holds. Not the salary, not the employer.

We never receive a name, a date of birth, or a document image, and we could not produce one
if subpoenaed. That is the design working, not a limitation.

### Why two actions and not one

`verify-buyer` and `verify-tenant` perform the same kind of check, and merging them is the
obvious simplification. It would have been a bug.

A nullifier is derived from (identity, app, action), so sharing an action means one person
can only ever complete one of the two flows — someone who verified as a buyer could never
apply as a tenant, because their nullifier is already spent. Separate actions give each
decision its own namespace. See the developer notes below; this deserves to be stated more
loudly in the docs than it currently is.

---

## User feedback

Written by the person operating the buyer flow. The tenant flow (`verify-tenant`) shares the
same widget and the same `identityCheck` preset and differs only in its predicate, so the
observations below apply to both; the measured runs are all `verify-buyer`, since that is
the action whose success writes to the ledger.

### Measured runs

| Run | Flow | Device / browser | Time to complete | Outcome | Notes |
|---|---|---|---|---|---|
| 1 | buyer | MacBook Air · Chrome | 23 s | Success | Ended in a Hedera KYC grant visible on HashScan |
| 2 | buyer | MacBook Air · Chrome | 25 s | Success | Repeat after clearing recorded proofs |
| 3 | buyer | MacBook Air · Chrome | 24 s | Success | Second account, same identity and action |

Measured from clicking the verify button to the app showing `KYC_GRANTED`.

Worth comparing against the Selfie Check runs (23 / 18 / 16 s), which got faster as the
operator learned the flow. These did not: 23 / 25 / 24 s, flat across three attempts. The
widget interaction is identical, so the difference is what happens after approval — this
flow ends in a `TokenGrantKycTransaction` reaching consensus on Hedera, and that cost does
not fall with practice. Roughly seven seconds of the elapsed time is chain settlement
rather than identity verification, which is the honest way to read these numbers.

### User observations

**1. The check that grants an on-chain permission looks exactly like the one that does not.**
Approving this sheet causes a `TokenGrantKycTransaction` on Hedera — a real, permanent state
change on a public ledger, and there is no revoke path in our build. The World sheet for it
is visually identical to the seller's liveness check, which grants nothing. As the person
clicking, nothing signals that one of these two is consequential. Suggestion: let the
requesting app supply a short consequence line rendered inside the sheet, so "this will grant
you a transfer permission on Hedera" appears at the moment of consent rather than in our own
UI copy beside it.

**2. "App will see your: Verification level" is accurate but undersells the design.**
The whole reason we chose Identity Check is that the app learns a *predicate result* and
nothing else — no name, no date of birth, no document image. The sheet's one-line summary is
correct but generic enough that a user cannot tell this apart from an app that collects
everything. Suggestion: render the requested attributes explicitly — *minimum age: 18* —
since that is exactly the string that makes the privacy claim legible.

**3. There is no visible difference between the two actions, and there needs to be.**
We deliberately use `verify-buyer` and `verify-tenant` as separate actions so one person can
do both. The two sheets are indistinguishable, and the only way to confirm we were not
accidentally reusing one action was to read the server logs. A user completing both in one
session cannot tell they did two different things — and if we had got the wiring wrong, the
symptom would have been a `WORLD_PROOF_REPLAY` on a flow the user had never run before.

**4. The result arrives in the app with no intermediate state, which reads as a hang.**
Between approving in the simulator and `KYC_GRANTED` appearing, the app shows nothing —
because it is polling. On a slower run this is several seconds of a screen that looks stuck.
The widget knows the proof was issued; our page does not, until the poll returns. Exposing an
"issued, awaiting collection" state through the SDK would let apps show something honest
there.

**5. Cancelling costs nothing, and that is worth stating.** Closing the sheet leaves the
account exactly as it was — no partial grant, no half-written state — and retrying works
immediately. Given that success writes to a public ledger, the asymmetry between "cancel is
free" and "approve is permanent" is the thing a user most needs to understand, and currently
neither screen says it.

**6. The environment mismatch described in developer note 6 was first hit here.** A real
World App on a phone produced a proof our staging app rejected with the same error a forged
proof gets. From the buyer's chair the flow simply refuses to work with no route to a cause.

### An error or cancellation path

Closing the World sheet mid-flow: the app stays on the Identity Check card with the button
still enabled, no error is shown, and a second attempt succeeds normally. Nothing is written
on-chain. Correct behaviour, but entirely silent — and during testing we could not
distinguish it from the case where the proof *was* issued and our page had lost the poll,
which produced the identical screen. That ambiguity cost us more debugging time than any
error message did.

Attempting the same action twice as the same identity: our server returns
`WORLD_PROOF_REPLAY`, and the app shows it verbatim. This is the one failure whose message
does make the next step obvious, and only because we added a "clear recorded proofs" control
next to it after being bitten.

### Privacy wording shown to the user

The buyer screen states, before the widget opens: *only age ≥ 18 and jurisdiction are
requested; no name, address, or document image is collected, and the raw proof is never
stored.* The seller screen carries the equivalent line about the session token. Neither the
raw nullifier nor the proof is ever rendered, logged to the console, or written to
`localStorage`; the server keeps only a keyed digest, for replay protection.

---

## Developer feedback

From integrating Identity Check as the gate on an on-chain permission, over one hackathon.

### 1. A proof does not attest to an account, and that gap is where the bodies are buried

This is our most substantive piece of feedback.

Our flow is: verify with World → grant Hedera KYC to a specific account → that account can
now receive transfers. The proof establishes that *a verified person* completed the check.
It does not establish that the person controls the Hedera account we are about to
privilege, because nothing in the payload commits to that account.

The consequence is concrete: a proof observed in transit could, in principle, be presented
alongside a *different* account id, and the grant would land on the wrong account. In our
demo that is harmless — one user, one flow — but the whole point of the integration is that
the identity signal becomes a durable on-chain permission, and a permission granted to an
unbound account is a weaker claim than it looks.

We document this openly rather than paper over it, and the roadmap fix is the account
signing a nonce that is folded into the World action context.

**What would help, in order of usefulness:**
- A first-class way to bind an external identifier (an address, an account id, a chain-scoped
  handle) into the proof, so the verifier can check *this proof was produced for this
  account* rather than merely *some proof exists*.
- Failing that, guidance on the intended pattern. `signal` looks like it is for exactly
  this, and we could not confirm from the docs whether it is bound into the 4.0 proof or
  merely echoed. We ended up not relying on it — see below.
- A worked example of "gate an on-chain action on a World verification", since that is a
  large fraction of what World ID is used for and it is the case where this gap matters most.

### 2. `signal` in 4.0 — is it bound, or is it decoration?

In earlier World ID versions `signal` was the documented mechanism for binding context into
a proof. In 4.0 the RP signature message is
`version || nonce || createdAt || expiresAt || action?` — we verified this against
`@worldcoin/idkit-server`'s own `computeRpSignatureMessage`, and there is no signal field.

Our `/api/rp-signature` endpoint still accepts and echoes a `signal`, because the client
wants to carry context through, but we deliberately do **not** treat it as a security
property, and the verify response gave us nothing to check it against.

If `signal` is no longer part of the signed material, saying so explicitly would stop
people carrying a v3 mental model into a v4 integration and believing they have a binding
they do not have. If it *is* bound somewhere we missed, that would be even more useful to
document — it is the missing half of finding #1.

### 3. The verify response tells you enough to be sure, which is rare

`POST /api/v4/verify/{rp_id}` returns `success`, `nullifier`, `action` and a per-proof
`results` array. Two things about that are genuinely good and worth keeping:

- **The action comes back.** We check it against the action we expected, because otherwise
  a proof minted for seller onboarding could unlock buyer KYC — a real confusion when one
  app runs three actions. Being able to verify it server-side, rather than trusting our own
  bookkeeping, closed that hole cheaply.
- **Failures are specific.** A deliberately malformed proof produced
  `code: "validation_error"`, `detail: "At least one response item is required"`. That let
  us confirm our rejection path end-to-end with no device involved.

We log the code and deliberately not the detail, since the detail can quote proof internals.
A line in the reference saying "this is for your logs, not your users" would set that
expectation for everyone.

### 4. Nullifier determinism defeats rehearsal, and every demo team will hit it

Same observation as in our Selfie Check feedback, and it bites harder here because the buyer
flow is the one judges watch: the same person repeating the same check produces the same
nullifier, so the second rehearsal is refused by our own replay protection at step one.

We built a development endpoint that forgets recorded digests. Everyone building a demo will
need something equivalent, and most will discover the need the night before presenting.

**Suggestion:** a staging-only way to reset a test identity's nullifiers per action, or
failing that a prominent warning on the verification page.

### 5. Predicates are the right abstraction and the naming could carry more weight

"Prove age ≥ 18" and "prove income ≥ 3 × rent" are the same shape of statement, and having
a system that returns the second without returning the income is precisely what let us build
a rental flow with no salary data anywhere in it.

What we could not tell from the docs is which predicates Identity Check actually supports
today versus which are planned, and how a custom threshold (ours is derived from a
per-listing rent) is meant to be expressed. We ended up structuring the code so the
predicate result plugs in cleanly — and being explicit in our own API that the income half
is asserted rather than proven in this build, because claiming otherwise would be dishonest.

**Suggestion:** a page listing the currently supported predicates, their exact semantics,
and what a custom or parameterised predicate will look like when it lands. That is the
question every application-side integrator has to answer before designing their flow.

### 6. A staging/production mismatch is indistinguishable from a bad proof

We hit this on a real device on demo day. Everything verified through the simulator; the same
flow scanned with a real World App was rejected. The rejection is a generic proof failure —
nothing in the response, and nothing in the logs, points at the environment.

What makes it hard to diagnose from the integrator's side:

- `environment` is a field on the **verify request**, but per the docs it is a property of the
  **app registration** ("Staging apps must use the Worldcoin Simulator, whereas production apps
  will use the World App"). So it looks like a per-call switch and behaves like a fixed
  attribute. We spent our search budget probing the API — `environment: "staging"` and
  `environment: "production"` return byte-identical validation errors for the same `rp_id`,
  so you cannot even determine which environment your own app is registered in by asking.
- `signRequest()` does not cover `environment` in the signed message
  (`version || nonce || createdAt || expiresAt || action?`). The RP signature is
  environment-agnostic, which reads as "this is just a label" — right up until it silently
  decides whether your proof is accepted.
- The default is `production`, while the thing a developer builds against first is the
  simulator, which needs `staging`. So the default is wrong for the first hour of every
  integration and wrong again the first time you test on a real phone.

Two things would have saved us the whole detour:

1. A distinct error code — `environment_mismatch`, or anything other than the same rejection a
   forged proof gets. The verifier knows both facts; it is the only party that does.
2. Surfacing the app's environment somewhere readable — the portal page, or a `GET` on the
   `rp_id`. Right now the only way to find out is to have a proof from each side and see which
   one is accepted.

Smaller note in the same area: the staging domain (`staging-developer.worldcoin.org`) and the
`environment` field are two mechanisms for one distinction, and the docs do not say whether
they are alternatives or whether both must agree. We used the primary domain with
`environment: "staging"` and the simulator worked, so they are evidently independent — but we
established that empirically rather than from the documentation.

### What worked well

- The staging environment let us build and verify the whole server path before touching a
  real credential.
- The proof carries no personal data, so our "we cannot leak what we never received" claim
  needed no defensive engineering — the shape of the data made it true.
- One SDK, one verify endpoint, and the same integration shape across three actions, which
  made adding the tenant flow a configuration change rather than a second integration.
