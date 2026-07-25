# World Selfie Check — Feedback

**Project:** PPREV — Privacy-Preserving Real Estate Verification
**Action:** `onboard-seller` · **Environment:** staging · **App:** `app_50e89a92…`

---

## Why we use Selfie Check

Selfie Check is the first gate in the protocol: before anyone can list a property, they
must prove they are a live human.

The abuse it prevents is specific. A listing platform's cheapest attack is volume — one
actor creating dozens of plausible listings to farm deposits, harvest applicant data, or
crowd out real inventory. Nothing downstream stops that: our document verifier reviews one
property at a time and cannot tell that forty submissions came from one person, and the
Hedera layer only cares about token rules.

What we deliberately do **not** claim: Selfie Check does not prove ownership. It proves a
human is present. Ownership is established separately, by a reviewer signing an
attestation. Conflating the two would be the obvious mistake here, and the UI says so
explicitly on the seller screen.

Selfie Check fits because it is the lightest credential that answers the only question we
have at that moment — *is there a person here?* — without asking the seller for identity
documents they have no reason to hand a marketplace.

---

## User feedback

Written by the person who clicked the button, not the person who wrote the handler.
Environment: MacBook Air, staging, World Simulator. One real World App attempt on a
physical phone is described below because its failure turned out to be the most
instructive thing that happened all day.

### Measured runs

| Run | Device / browser | Time to complete | Outcome | Notes |
|---|---|---|---|---|
| 1 | MacBook Air · Chrome | 23 s | Success | Simulator already open in a second tab |
| 2 | MacBook Air · Chrome | 18 s | Success | Same identity, after clearing recorded proof digests |
| 3 | MacBook Air · Chrome | 16 s | Success | Fastest run; no hesitation left in the flow |

A fourth attempt sits between runs 1 and 2 and is worth recording: we forgot to clear the
recorded digests first and it was refused immediately with `WORLD_PROOF_REPLAY`. That is
replay protection working exactly as designed, and it is also the failure described in
observation 5 — which we hit again while measuring, having already written it up.

Measured from clicking the verify button to the app showing an active session.

### User observations

**1. The simulator link opens in the same tab, and that silently destroys the flow.**
IDKit renders a "Testing in staging? Use the simulator" link under the QR code. Clicking it
normally navigates the current tab away from the app. The verification then succeeds in the
simulator — it says *Verified* — but there is no longer a page waiting for the result, so
coming back shows the original un-verified screen with no error and no explanation. It reads
exactly like a broken app. The fix is to open that link in a new tab, which nothing tells
you. Suggestion: give that link `target="_blank"`, or warn next to it that the tab must stay
open while the widget waits for the result.

**2. Being asked to choose "v3 or v4" mid-flow was the one moment of real doubt.**
The simulator asks which protocol version to verify with. As the person clicking, there is
no way to know — the app requested v4 only, but the widget doesn't say so, and picking wrong
produces a failure that looks identical to every other failure. Suggestion: have the
simulator read the request's `allow_legacy_proofs` and either preselect the right version or
grey out the impossible one.

**3. "Verified" in the simulator does not mean verified in the app, and only one of those
two screens tells you so.** During one run the simulator showed a green *Verified*, while the
app sat unchanged. From the user's side these are the same event; the simulator is
confidently reporting success for something the application never received. A note — *the
proof has been issued; your application must still collect it* — would have saved us from
chasing the wrong bug.

**4. A real World App on a real phone fails against a staging app, and the error does not
say why.** We scanned the QR with the World App on a physical phone, approved it there, and
the app returned `WORLD_PROOF_INVALID` — the identical error a deliberately forged proof
gets. The cause is that the environment is a property of the *app registration*, not of the
request: a staging app can only be used with the simulator. Nothing in the QR screen, the
phone, or the error distinguishes "wrong environment" from "fake proof". This is the single
observation we would most like acted on; it is written up as developer note 6 in the
Identity Check document as well, because we hit it from both flows.

**5. The second rehearsal of the day fails at step one, and the message doesn't explain it.**
Repeating the same check as the same identity produces the same nullifier, so replay
protection rejects it — correctly. But from the user's chair, an identical set of clicks that
worked ten minutes ago now fails immediately, and neither the widget nor our own first
version of the error said "you have already done this". We ended up building a button that
clears recorded proofs between rehearsals and putting it on screen next to the demo helpers.

**6. The privacy framing is legible without explanation.** The World sheet lists what the app
will see — one line, *Verification level* — before anything is approved. Reading a permission
prompt and finding it genuinely short is unusual enough to note.

### Failure and cancellation paths

Closing the World sheet without approving leaves the app on its original screen with the
button still available; nothing is written and retrying works. That is the correct behaviour
but it is silent — the user gets no acknowledgement that the cancellation was registered,
which during testing was indistinguishable from observation 1 above (the tab-navigation
case), and we misdiagnosed one as the other.

The environment-mismatch failure (observation 4) surfaces as our own `WORLD_PROOF_INVALID`
card. Our app's message is accurate but not actionable — it says World could not verify the
proof, which is true and useless, because the user cannot tell whether they did something
wrong or the app is misconfigured. We left it as-is rather than guessing at a cause we cannot
distinguish, which is itself the argument for World exposing that distinction.

---

## Developer feedback

Written from integrating Selfie Check into a Next.js backend over one hackathon day.

### 1. The documentation trail still points at an API that no longer exists

This cost the most time by far. Searching for World ID integration surfaces the v2 model:
an `app_id`, an API key, and a `POST` to `developer.worldcoin.org/api/v2/verify/{app_id}`
with a `Bearer` token. We implemented exactly that, and it is wrong for World ID 4.0.

The current model is a **three-value** one — `app_id`, `rp_id`, `signing_key` — with
verification at `POST developer.world.org/api/v4/verify/{rp_id}` and **no auth header**,
because authenticity comes from the RP signature rather than a bearer credential. The
domain also moved from `developer.worldcoin.org` to `developer.world.org`.

We only found this by reading `docs.world.org/llms.txt` and following it to the 4.0
migration page. Every generic search result, and every LLM answer, gave us the v2 shape.

**Suggestion:** make the version explicit at the top of any page that shows a verify call,
and have the v2 endpoint return a machine-readable "this app is on 4.0, use /v4/verify"
error rather than a generic failure. A 400 that names the fix would have saved us an hour.

### 2. `signRequest` is the piece nobody tells you about

The RP signature spec is precise and good — version byte, nonce, big-endian timestamps,
optional action hash, EIP-191 prefix, Keccak-256 (with an explicit warning not to use
SHA3-256, which we appreciated). But implementing it by hand is a lot of surface for
something that has an official implementation.

`@worldcoin/idkit-server` exports `signRequest({ signingKeyHex, action, ttl })` and does
all of it. We found the package only after starting a hand-rolled version.

**Suggestion:** put `@worldcoin/idkit-server` and a two-line `signRequest` example at the
top of the RP signatures page, before the byte-level spec. The spec is what you need to
verify or port; the package is what you need to ship.

### 3. Nullifier determinism makes rehearsal impossible, and nothing warns you

This is the observation we would most like acted on.

A nullifier is derived from (identity, app, action), so the same person repeating the same
check produces the same value every time. That is exactly right — it is what makes replay
protection work — but the consequence for a demo is severe: **the first rehearsal
succeeds and the second is refused**, at step one, with the same person and the same
phone. If your replay store is persistent, you cannot rehearse at all without an admin
tool to clear it.

We built a development endpoint that forgets recorded digests, and documented it as the
between-rehearsals step. Every team building a demo will hit this, most of them the night
before presenting.

**Suggestions, in order of preference:**
- A staging-only affordance to reset a test identity's nullifiers for a given action.
- Failing that, a prominent note on the verification page: *"the same identity repeating
  the same action returns the same nullifier — your replay check will reject the second
  attempt. Plan for this in staging."*
- The verify response could include a hint when a proof is valid but the nullifier has
  been seen — though that state lives in our store, not yours, so the note is the
  realistic fix.

### 3b. One-time nullifiers make *re-authentication* impossible, not just rehearsal

Observation 3 frames determinism as a rehearsal problem. Running the flow properly showed it
is a product one, and the distinction is worth separating.

A seller completes Selfie Check, and the session exists only in the browser. Reload the page —
a slip, a crash, a phone that locked — and the session is gone. They verify again, produce the
same nullifier, and are refused with `WORLD_PROOF_REPLAY`. There is no way forward. We have an
admin endpoint that forgets recorded proofs, but a real user does not, and should not.

Working out why led somewhere more useful than "add a cookie". We had conflated two different
things under one guard:

- **`verify-buyer` and `verify-tenant` are registrations.** One human, one KYC grant. Spending
  the nullifier is exactly right.
- **`onboard-seller` is an authentication.** The same human is supposed to come back. Spending
  the nullifier turns a login into a one-time account creation, by construction and silently.

And the nullifier is the right primitive for the second case too — just used the other way
round. It is a stable per-identity value, so recognising it should *re-issue* a session for
that identity rather than refuse. Replay of a captured proof is a separate concern and one the
protocol already handles: `signRequest` signs a nonce and a validity window, so a proof lifted
from one context cannot be replayed into another regardless of what we do with nullifiers.

**Suggestion:** say this on the actions page. The guidance we could find treats a nullifier as
something you spend, which reads as the only correct handling. A sentence distinguishing
"one action per one-time entitlement" from "one action per recurring login" — and noting that
proof-level replay is already covered by the signed nonce and window — would have saved us from
shipping an authentication path that locks a user out on a page reload.

### 4. Verification failures are diagnosable, which is genuinely better than most

`POST /v4/verify/{rp_id}` returned `400` with `code: "validation_error"` and
`detail: "At least one response item is required"` when we sent a deliberately malformed
proof. That is a specific, actionable message and it is much better than the opaque
booleans other identity providers return. It let us confirm our rejection path was wired
correctly without a real device.

We log that detail server-side and deliberately do **not** forward it to the client, since
it can echo proof internals back to the caller. Documenting that expectation — "this
detail is for your logs, not your users" — would be a useful line in the reference.

### 5. Separating actions per flow is the right design and could be stated louder

We use three actions: `onboard-seller` (this check), `verify-buyer`, and `verify-tenant`.
The last two do the same kind of verification, and it is tempting to share one action
between them.

Sharing would have been a bug: because the nullifier is per action, one person who had
already verified as a buyer could never apply as a tenant — their nullifier would already
be spent. Separate actions give each flow its own namespace.

We worked this out from the nullifier definition rather than from guidance.

**Suggestion:** state the rule directly on the actions page — *"use one action per
decision you want to be independently repeatable; a shared action means a person can only
ever do one of those flows"*. It is the single most consequential design decision when
laying out actions, and it is currently left as an inference.

### What worked well

- The staging environment and simulator let us build and test the entire server-side
  verification path before any real credential was involved.
- The RP context has a bounded validity window, so a captured context cannot be replayed
  indefinitely. We did not have to design that ourselves.
- The proof carries no personal data, so our "we never store identifiers" claim required
  no negotiation with the SDK — the shape of the data made the privacy property natural
  rather than something we had to enforce after the fact.
