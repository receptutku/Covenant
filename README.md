# PPREV

**Privacy-Preserving Real Estate Verification** · ETHGlobal Lisbon 2026

A protocol for renting and selling real estate in which no transaction can move forward until
property ownership has been verified and counterparty eligibility has been proven — and in
which identity, verification, and compliance decisions are written on-chain without leaking
personal data. One core, two modes: **sale** (fractional shares) and **rental** (escrowed
deposit).

> 🚧 Hackathon in progress. This README is split into two halves — to avoid conflicts, each of
> us writes only in our own half.

---

<!-- ═══════════ TOP HALF — AKIF ═══════════ -->
<!-- pitch · screenshots · how it works · track table -->

## Pitch

_(Akif — A9)_

## Screenshots

_(Akif — A9)_

## How it works

_(Akif — A9)_

## Track table

_(Akif — A9)_

<!-- ═══════════ END OF TOP HALF ═══════════ -->

---

<!-- ═══════════ BOTTOM HALF — RECEP ═══════════ -->
<!-- architecture · No Solidity · setup · verifier boundary · public/private table · ENS · evidence · AI usage -->

## Architecture

One core, two transaction modes. Every integration does one natural job — nothing is
glued on for a prize category:

| Layer | Technology | Role |
|---|---|---|
| Humanity / identity | **World ID 4.0** (Selfie + Identity Check) | Seller/landlord abuse prevention; buyer/tenant eligibility — ZK-based, no personal data disclosed |
| Asset & settlement | **Hedera HTS** | Fractional property token (1000 shares, `decimals=0`), KYC-gated transfers, 2% fractional fee |
| Escrow (rental) | **Hedera HBAR transfers** | Deposit lock, clean-refund settlement, permissionless expiry with a 10% landlord slash |
| Audit trail | **Hedera HCS** | Immutable event log carrying zero PII — enforced at runtime by a payload guard |
| Public verification | **Hedera Mirror Node** | The timeline the UI shows is read back from public data, not from our own store |
| Ownership trust | **Minimal verifier** (Ed25519) | Human review → signed attestation; tokenization is impossible without it |
| Discovery | **ENS** (Sepolia, v2 + UniversalResolver) | Per-property protocol config resolved live — no token id, topic id or verifier key is hard-coded |

Both modes share the same three phases — **Register → Apply/Engage → Settle** — and the
same verifier/World/ENS infrastructure. Only the predicate and the settlement differ:
a sale ends in a KYC-gated share transfer; a rental ends in an escrow release (with or
without a penalty). That is the concrete form of the claim that the protocol is
domain-agnostic.

The strongest single moment: a transfer to an account **without a KYC grant** fails with
`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` — issued by the **Hedera network itself**, not by our
application code. Take this server offline and the rule still holds.

## No Solidity

Zero. No `.sol` files, no hardhat/foundry/ethers, no EVM deploy step — verify with
`find . -name "*.sol" -not -path "./node_modules/*"`. Every on-chain operation is a
native Hedera SDK transaction (`TokenCreateTransaction`, `TokenGrantKycTransaction`,
`TransferTransaction`, `TopicCreateTransaction`, `TopicMessageSubmitTransaction`).
`viem`/`ensjs` appear only to read and write ENS records on Sepolia.

## Setup

```bash
npm install
cp .env.example .env.local     # fill in OPERATOR_ID / OPERATOR_KEY + World credentials
npm run smoke                  # operator alive, key parses, balance sufficient
npm run accounts:create        # generates buyer1 / buyer2 / nokyc into .env.local
npm run bootstrap              # opens the HCS audit topic
npm run golden                 # mints the seed token + verifies the three golden moments
npm run ens:write              # publishes per-property config to ENS (Sepolia)
npm run preflight              # one-shot stage-readiness check (read-only, free)
npm run dev                    # http://localhost:3000
```

Before any rehearsal or the demo itself: `npm run preflight` must end with
**"All green. Go."** — it verifies every scene precondition from public data (including
the deliberately-unKYC'd account and ENS↔chain consistency). Crisis procedures live in
[`docs/RUNBOOK.md`](docs/RUNBOOK.md).

Then seed before any rehearsal — it registers PROP-001 (sale showcase) and PROP-003
(rental), tops buyer1 back up by recycling shares from buyer2 rather than draining the
treasury, and re-associates nokyc **without** granting it KYC. It also re-prepares every
other tokenized property, so a token minted during a live run is demo-ready too.

```bash
curl -s -X POST localhost:3000/api/seed -H "x-demo-admin-secret: $DEMO_ADMIN_SECRET"
```

Seed and reset require the admin secret: a `POST` with no custom header is a CORS simple
request, so without it any page on any machine that can reach this server could wipe the
demo mid-run.

Test suite (all against real testnet, all assert in code):

```bash
npm run tamper        # doctored attestations blocked (6 cases)
npm run merkle        # commitment scheme property tests (no network needed)
npm run e2e:sale      # full sale flow over HTTP, real token minted
npm run e2e:rental    # escrow lock/settle/expire, balances read from a consensus node
```

## The minimal verifier boundary

Stated plainly, because it is the most important honest sentence in this project:
**this MVP proves the integrity and the timestamp of a document; it does not prove the
document came from the land registry.**

What the verifier gate does enforce — a human reviews the documents, and approval is an
Ed25519 signature over a fixed canonical payload binding `{propertyId, seller, document
root, expiry}` together. `/api/tokenize` refuses anything else: change one character of
an attestation and the mint never happens (`npm run tamper` demonstrates all six ways).

What it deliberately does not do — document **provenance**. That layer requires
TLSNotary/zkTLS against the registry's web service plus a ZK circuit proving predicates
over the transcript; the architecture reserves its place and it is the core post-hackathon
work. The verifier is also a single human here; production expands this to a multi-notary
threshold signature.

## Public / private data table

| Data | Where it lives | Ever on-chain / in a response? |
|---|---|---|
| Document bytes | Server memory only | **Never** |
| Document salts | Server memory only | **Never** |
| Merkle root + document count | HCS | Yes — that is the point |
| Raw World nullifier | Nowhere (HMAC digest only) | **Never** |
| World proof | Verified server-side, then dropped | **Never** |
| Buyer/tenant name, DOB, income figure | Never collected | **Never** |
| Eligibility predicate *result* (booleans) | HCS | Yes |
| Seller session token | `randomBytes(32)`, 30 min TTL (`SELLER_SESSION_TTL_MINUTES`) | Returned once; unrelated to World data |
| Token ids, tx ids, account ids | HCS / Mirror / ENS | Yes — public by design |
| All private keys & secrets | Server env only | **Never** (frontend machine gets a URL, not keys) |

The HCS layer enforces this at runtime: `assertNoSensitiveKeys()` rejects any payload key
matching nullifier/proof/salt/income/etc. before it can reach the chain. It has already
caught one real mistake during development — which is exactly why it exists.

## ENS config discovery

No token id, topic id or verifier key is hard-coded in this application's source. Each
property has a subname whose text records carry its protocol config, and the buyer flow
resolves them live from Sepolia before it will show you anything:

```
prop-002.pprevlisbon.eth          (values are illustrative — the token id
  com.pprev.mode                     SALE          changes on every mint, see below)
  com.pprev.hedera.propertyTokenId   0.0.97xxxxx
  com.pprev.hedera.auditTopicId      0.0.9734777
  com.pprev.verifier.publicKey       302a3005...
  com.pprev.policy.hash / .version   0x0597... / 1
```

**What this is and is not.** Discovery is genuinely live: `/api/ens-read` resolves these
records on every request, `/api/tokenize` publishes each newly minted token id back to
ENS, and a client learns which token a property uses by asking Sepolia rather than by
trusting us. What it is *not*, in this build, is the settlement path — transfers read the
token from the server's own record, not from ENS. Making ENS authoritative for settlement
is the honest next step; claiming it already is would be an overstatement, and the code is
right there to check.

Rental properties carry a different field set (`com.pprev.rental.escrowAccount`,
`.reqDeposit` — and no token, deliberately); clients branch on `com.pprev.mode`.
`/api/ens-read` validates a different required-field set per mode.

Implementation notes worth knowing:

- Records are written **programmatically** (`npm run ens:write`) — one multicall per
  property, no UI involved. The name lives on the **ENSv2 alpha**; the v2
  UniversalResolver makes it readable from plain viem, and the parent's permissioned
  resolver accepts writes for subname nodes directly, so **no subname registration
  transactions exist at all**.
- Because the alpha deployment may reset state, resolution degrades honestly: on RPC or
  deployment failure the response switches to `source: "env-fallback"` instead of taking
  the demo down — and says so, rather than pretending it resolved.

## Evidence

Every claim above links to a permanent, independently verifiable artefact — real testnet
transactions, not screenshots: [`docs/EVIDENCE.md`](docs/EVIDENCE.md)

## AI Usage

Backend, chain integrations, and test harnesses were built by Recep pair-programming with
Claude (Anthropic) in Claude Code; the frontend was built by Akif with AI assistance.
Everything the AI produced was executed and verified against real networks before being
committed — the test suite above asserts every headline claim in code, and several bugs
the AI's own tests caught (a silently dropped HCS event, a missing route the frontend was
already calling, a workspace-root misconfiguration serving the wrong project) are
documented in the commit history rather than smoothed over.

<!-- ═══════════ END OF BOTTOM HALF ═══════════ -->

---

## Documents

| File | Contents | Owner |
|---|---|---|
| [`docs/API.md`](docs/API.md) | API contract — the single source of truth | Recep |
| `docs/EVIDENCE.md` | Live on-chain evidence links | Recep |
| `docs/SUBMISSION.md` | ETHGlobal submission text | Akif |
| `docs/FEEDBACK_selfie.md` | World Selfie Check feedback | Akif (user) + Recep (developer) |
| `docs/FEEDBACK_identity.md` | World Identity Check feedback | Akif (user) + Recep (developer) |

## Directory ownership

To keep parallel development conflict-free:

- **Recep:** `app/api/**`, `lib/hedera/**`, `lib/world/**`, `lib/verifier/**`, `lib/crypto/**`, `lib/store.ts`, `lib/ens/**`, `scripts/**`
- **Akif:** `app/components/**`, `app/views/**`, `app/globals.css`, `lib/mockApi.ts`, `lib/realApi.ts`
- **Shared (announce before touching):** `app/page.tsx`, `docs/API.md`, `README.md`, `package*.json`, `.env.example`

## No Solidity

Every on-chain operation runs through the native Hedera SDK — HTS (tokens), HCS (audit),
Mirror Node (public verification). The repository contains no `.sol` files and no EVM deploy
step.
