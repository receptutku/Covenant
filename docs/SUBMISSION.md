# PPREV — ETHGlobal Lisbon 2026 submission

Text for the submission form. Each section maps to a field; paste as-is.

---

## Short description (one line)

Fractional real-estate trading where no token exists without a verified property and no
share moves to an unverified wallet — enforced by Hedera and World ID, not by our server.

---

## Full description

Fractional real-estate platforms ask you to trust two things you cannot check: that the
property is real and belongs to the person selling it, and that the counterparties are
allowed to be there. The industry's answer is a company that has verified everyone and
promises it did, plus a database of passport scans waiting for a breach.

PPREV replaces both promises with checks that survive us.

**A property cannot be tokenized until a human reviewer signs an attestation** over its
documents — Ed25519, binding `{propertyId, seller, documentRoot, expiry}` into one payload.
`/api/tokenize` accepts nothing else. Alter one character and the mint never happens; our
test suite demonstrates all six ways of trying (`npm run tamper`). The documents themselves
never leave the server: only a Merkle root and a file count are published.

**A share cannot reach an unverified wallet.** Buyers pass World ID's Identity Check, which
asserts age and jurisdiction while disclosing neither. On success the server grants Hedera
KYC on the property token — and from that moment the rule is enforced by the network. A
transfer to an account without a grant fails with `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`,
returned by Hedera's consensus nodes. Take our server offline and the rule still holds.
That is the difference between a compliance feature and a compliance property.

**Nobody hands over a passport for any of it.** We receive predicate results, never the
facts behind them. We could not produce a buyer's name or date of birth under compulsion,
because we never received one. Three separate World actions (`onboard-seller`,
`verify-buyer`, `verify-tenant`) keep the nullifier namespaces independent, so one person
can be a seller, a buyer and a tenant — sharing an action would have silently made that
impossible.

**The configuration isn't ours to lie about.** Each property has an ENS subname on Sepolia
whose text records carry its protocol config: token id, audit topic, verifier public key,
policy hash and version. The buyer flow resolves them live before it renders anything. A
client learns which token a property uses by asking ENS, not by trusting our API.

One core, two modes. A sale settles as a KYC-gated share transfer with a 2% fractional fee
assessed by the token's own immutable fee schedule; a rental settles as an HBAR escrow
release, with permissionless expiry so a landlord cannot strand a deposit by going quiet.
Both run the same Register → Apply/Engage → Settle phases over the same verifier, World and
ENS infrastructure. That is the concrete form of the claim that the protocol is
domain-agnostic rather than a real-estate app with integrations bolted on.

**What we deliberately do not claim.** This MVP proves a document's integrity and its
timestamp. It does not prove the document came from the land registry. That layer needs
zkTLS against the registry's service plus a circuit proving predicates over the transcript;
the architecture reserves its place and it is the core post-hackathon work. The verifier is
also a single human here — production expands it to a threshold signature across multiple
notaries. Saying so is cheaper than being caught not saying it.

---

## How it's made

No Solidity. Zero `.sol` files, no EVM deploy step — verify with
`find . -name "*.sol" -not -path "./node_modules/*"`. Every on-chain operation is a native
Hedera SDK transaction.

**Hedera.** HTS mints one fungible token per property (1000 shares, `decimals=0`) with a
KYC key and a 2% fractional fee whose schedule is immutable. HCS carries an append-only
audit topic. Mirror Node is the read path — the timeline the UI shows is read back from
public data rather than from our own store, and the reader filters on `payer_account_id` so
a stranger cannot inject a well-formed event into the trail.

**World ID 4.0.** The three-value model (`app_id`, `rp_id`, signing key). The server mints
an RP context with `signRequest` and a 300-second window; IDKit produces a v4 proof; the
server re-verifies it against `developer.world.org/api/v4/verify/{rp_id}` before anything
happens. The client's `success: true` is never trusted. Only a keyed HMAC digest of the
nullifier is retained, for replay protection — the raw value is never stored, logged or
returned.

**ENS.** Per-property subnames on the ENSv2 alpha, written programmatically in one multicall
per property. The v2 UniversalResolver makes them readable from plain viem, and the parent's
permissioned resolver accepts writes for subname nodes — so there are no subname
registration transactions at all. `/api/tokenize` publishes each newly minted token id back
to ENS and drops the cache entry as it writes, so a fresh token resolves immediately.
Resolution degrades to a marked `env-fallback` on RPC failure instead of taking the demo
down.

**Frontend.** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4. The three
roles render as three columns because they are three parties with three different amounts
of trust, and the demo's argument is easier to see than to narrate. Every client call goes
through one typed interface (`PprevApiClient`) with a mock implementation kept alongside the
real one, so a single endpoint can be swapped back without reverting anything else.

**Hacky bits worth admitting.** The seller's attestation reaches the tokenize call through
page-level React state, because in this single-page demo the verifier and the seller are two
components rather than two people; a real deployment needs an endpoint for it. The demo
account ids are read from `/api/health` at runtime after hard-coded ones cost us an hour of
failures against accounts that did not exist. And two development-only routes exist behind
an admin secret — one issues a seller session without a World proof, one clears recorded
proof digests between rehearsals — because World nullifiers are deterministic and the second
rehearsal of the day is otherwise refused at step one.

---

## Prize tracks

### Hedera

Three things a judge can check in under a minute:

1. **The refusal is the network's, not ours.** Buy with the deliberately un-KYC'd account:
   `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`, straight from consensus.
2. **The fee is the token's, not ours.** A secondary transfer of 100 debits 100, credits 98,
   and routes 2 to the collector — assessed against an immutable fee schedule. HashScan's
   own transfer list for the transaction confirms the split. Below 50 shares the 1-share
   floor dominates and the effective rate exceeds 2%; the UI says so rather than repeating
   "2%".
3. **The audit trail is public and independently readable.** HCS topic, Mirror Node, links
   in `docs/EVIDENCE.md`.

Honest caveats, both checkable: the topic has an admin key and no submit key, so it is
append-only rather than immutable and anyone may publish to it — the defence is the
read-side filter. And 39 early messages permanently contain a `city` field from before the
payload guard was tightened. We left them and documented them; a log that shows our own
mistake is the honest form of the claim.

### World

World ID is the gate on two different decisions, with different consequences, and we treat
them differently. Selfie Check answers *is a person here* before a listing can exist.
Identity Check answers *is this person eligible* before an on-chain permission is granted —
and that grant is permanent, because there is no revoke endpoint.

Three separate actions keep the nullifier namespaces independent. That is not a detail: a
shared action would mean someone who verified as a buyer could never apply as a tenant,
because the nullifier is spent. We derived that rule from the nullifier definition rather
than from guidance, and said so in the feedback.

Both feedback documents are written from real runs, by the person who clicked the buttons
and the person who wrote the handlers, and include the things that went badly — a
same-tab navigation that silently destroys the flow, a v3/v4 prompt the user cannot answer,
and an environment mismatch that returns the identical error a forged proof gets.

### ENS

Not a naming veneer. Each property's subname carries the protocol configuration the client
needs, resolved live before the buyer flow renders, written programmatically on the v2
alpha. Rental properties carry a different field set and clients branch on
`com.pprev.mode`.

Stated precisely, because the distinction matters: ENS is **checked** at settlement, not yet
**authoritative** for it. `/api/buy` resolves the property's `propertyTokenId` before any share
moves and refuses the transfer outright — `ENS_CONFIG_MISMATCH`, nothing moved — if the record
names a token this protocol did not create. So deleting or repointing a record is not
cosmetic: it can stop a sale. What ENS does not yet do is *supply* the token id; that still
comes from the server's own record, with ENS as the check on it. Making ENS the source rather
than the check is the honest next step.

The rule is deliberately asymmetric, and the asymmetry is the interesting part. A record that
is merely behind does not block: `/api/tokenize` republishes in the background, so a buy
seconds after a mint legitimately still sees the previous token, and refusing there would kill
a real sale rather than an attack. Neither does an unreachable resolver — handing a Sepolia
outage the power to stop a Hedera transfer is worse than the substitution it would prevent.
Only a record naming a token whose treasury is not ours blocks, because that is the only case
that is someone else's doing. `npm run test:ens-guard` drives all four outcomes against the
live records.

---

## Demo notes

Environment is staging, so verification runs against the World Simulator — a staging app
registration cannot be used with the real World App, which is a property of the registration
rather than of the request. This is written up as feedback rather than hidden.

Run `npm run preflight` before presenting; it verifies every scene precondition from public
data and exits non-zero on failure.
