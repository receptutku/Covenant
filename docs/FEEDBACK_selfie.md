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

> **Akif — A7.** Structure below; fill each section from real runs.
> The track asks for at least five concrete observations and three measured runs.
> Write what actually happened, including anything awkward — polished praise is worth
> nothing to the team receiving it.

### Measured runs

| Run | Device / browser | Time to complete | Outcome | Notes |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

Measure from tapping the verify button to the app receiving the result.

### User observations

At least five, each concrete and specific — what the user saw, did, expected, or was
confused by. Not "the flow was smooth".

1.
2.
3.
4.
5.

### Failure and cancellation paths

What the user sees if they cancel mid-flow, deny camera permission, or the check times
out — and whether the app's own message afterwards makes sense.

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
