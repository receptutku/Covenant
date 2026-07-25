# ENS — Feedback

Written from an integration that uses ENS as protocol configuration rather than as a display
name, on the v2 alpha on Sepolia, over roughly two days. Everything below was measured against
the live names; where the evidence is partial, it says so.

## What we use ENS for

Not naming. Each property has a subname whose text records carry the configuration a client
needs to interact with that property, namespaced under `com.pprev` so they cannot collide with
conventional keys:

```
prop-002.pprevlisbon.eth
  com.pprev.mode                     SALE
  com.pprev.hedera.propertyTokenId   0.0.97xxxxx
  com.pprev.hedera.auditTopicId      0.0.9734777
  com.pprev.verifier.publicKey       302a3005...
  com.pprev.policy.hash / .version   0x0597... / 1
```

The client resolves these before the buyer flow renders, so it learns which token a property
uses by asking Sepolia rather than by trusting our API. Tokenizing a property republishes its
token id. Rental properties carry a different field set and clients branch on `com.pprev.mode`.

Since v6 of our own contract, ENS is also consulted before any share transfer: a record naming
a token our protocol did not create refuses the transfer outright. So the records are
load-bearing, not decorative — deleting or repointing one can stop a sale.

---

## Developer feedback

### 1. `setText` works on subnames that were never registered, and nothing says whether that is a guarantee

This is the single most consequential thing we learned, and we still do not know whether we are
allowed to rely on it.

We never registered `prop-001.pprevlisbon.eth`, `prop-002` or `prop-003`. We wrote text records
straight to those nodes through the parent's resolver and they read back correctly — nine
records on `prop-001` as of writing, resolved live through the v2 UniversalResolver.

Evidence, stated at the strength we can actually support:

- Our codebase contains a `setSubnodeRecord` ABI entry that **no code path calls** — verified,
  there is no call site outside the constants file.
- Across **322 outgoing transactions** from the ENS wallet on Sepolia, no explorer-decoded
  method is a subnode or subname operation. 99 of those are undecoded, so this is strong rather
  than absolute.

If this is intended v2 behaviour it is genuinely powerful: it means an application can address
an unbounded namespace at `O(1)` registration cost, which is exactly what we needed — one name,
one wallet, a subname per property, no per-property transaction. We built on it.

**What we could not find:** any statement that this is a guarantee rather than an artefact of
the alpha. That is the whole question for anyone deciding whether to depend on it. A sentence in
the docs either way would have saved us the entire investigation, and would change how much of
a product we would be willing to build on this.

### 2. v2 alpha names are invisible to every tool that reads the v1 registry

We checked the classic registry (`0x0000...2e1e`) for `owner(namehash(name))`, expecting to
prove something about the subname. The result was that **the parent name itself returns the
zero address** — `pprevlisbon.eth`, a name we control and that resolves correctly, does not
exist as far as the v1 registry is concerned.

That is presumably correct and expected for v2. But it means every integrity check, ownership
lookup, indexer and "does this name exist" helper written against the v1 registry silently
reports that a working v2 name does not exist. Not an error — a confident wrong answer, which is
the worse failure mode. We nearly published a false claim on the back of it, and only caught it
because the parent came back zero too.

Worth a prominent note in the v2 docs: *if you are checking a v2 name, do not use the v1
registry; here is what to use instead.*

### 3. The v1 registration path fails in a way that reads as a permissions problem

Before finding the v2 route we tried to register a name the conventional way on Sepolia.
`makeCommitment` reverted, and the controllers we tried were unauthorised. We spent real time
concluding this was our mistake — wrong controller address, wrong parameters, wrong wallet —
before concluding the path itself was not available to us.

The failure gives no signal that you are on a deprecated or unavailable path. An error that said
so, or a docs banner on the v1 registration page, would have redirected us in minutes instead of
an evening.

### 4. There is no way to know whether a write has propagated

We publish a token id to ENS in the background when a property is tokenized, then read it back.
There is no signal that distinguishes "the write has not landed yet" from "the value really is
the old one". We had to build our own: the writer invalidates our cache as it writes, and the
resolver reports when it fell back to environment configuration instead of a real resolution.

That second one turned out to matter more than expected. Our read path falls back to local
configuration when ENS cannot be reached — and the temptation is to treat the fallback as
success, which would mean showing a user "ENS confirmed this" while ENS was never consulted. We
mark it explicitly, and our transfer check treats the fallback as *unavailable* rather than as
agreement. A first-class way to ask "did this answer actually come from ENS?" would make that
distinction harder to get wrong, and we suspect most integrations get it wrong silently.

### 5. Records are strings, so every consumer invents its own schema

`com.pprev.hedera.propertyTokenId` is a convention we made up. Nothing validates it, nothing
declares it, and a second application reading our name would have to be told out of band what
the keys mean and how to parse them. That is fine for one team; it does not compose.

We are not asking for a standard for our own keys. We are noting that "text records as
application config" is clearly a pattern people are using, and there is no ENSIP-shaped way to
publish *what the keys are*. A `com.example.schema` convention pointing at a description would
have been the first thing we reached for.

---

## What worked well

- **The v2 UniversalResolver is what made this viable.** Plain `viem` against one address, no
  bespoke resolver plumbing, no chasing resolver addresses per name. This is the piece that
  turned ENS from an afternoon of yak-shaving into an integration.
- **Namespaced keys are the right primitive for config.** We put eleven values under
  `com.pprev.*` with no collision risk against conventional keys, and a mode field that lets one
  namespace carry two different record schemas.
- **Multicall.** Batching every `setText` for a property into one transaction means one
  signature per property rather than one per record. With eleven records that is the difference
  between a usable write path and an unusable one.
- **Resolution is fast enough to sit in front of a UI.** We resolve before rendering the buyer
  flow, behind a 60-second cache, and it has never been the reason anything felt slow.

## What we would do next

Make ENS the *source* of the token id rather than the check on it. Today the server holds the
value and ENS can veto it; the honest next step is the reverse. We did not do it in the time
available, and the difference between those two is exactly the kind of thing we would rather
state than blur.
