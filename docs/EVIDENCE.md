# PPREV — Live On-Chain Evidence

Every link in this file points to a real, permanent on-chain record — **Hedera testnet**
transactions, plus the accounts, token and topic they belong to, plus three **Sepolia**
transactions for the ENS records. None of it is a mock, a simulation, or a screenshot.

**Network:** Hedera testnet · **Explorer:** [HashScan](https://hashscan.io/testnet)

---

## Infrastructure

| What | ID | Link |
|---|---|---|
| Operator / treasury | `0.0.9695718` | [HashScan](https://hashscan.io/testnet/account/0.0.9695718) |
| HCS audit topic | `0.0.9734777` | [HashScan](https://hashscan.io/testnet/topic/0.0.9734777) |
| buyer1 (KYC-granted buyer / tenant) | `0.0.9734741` | [HashScan](https://hashscan.io/testnet/account/0.0.9734741) |
| buyer2 (secondary buyer) | `0.0.9734742` | [HashScan](https://hashscan.io/testnet/account/0.0.9734742) |
| nokyc (associated ✅ / KYC ⛔) | `0.0.9734743` | [HashScan](https://hashscan.io/testnet/account/0.0.9734743) |

---

## Three golden moments — HTS tokenization and compliance

Produced with `npm run golden`, which `assert`s each of these claims in code and exits
non-zero if one fails. It does not re-check the rows below: every run mints a **brand new**
token and drives the three moments against that one, so the ids here are the artefacts of
the run that produced them — permanent on Mirror, but never revisited by a later run.
Running it also rewrites `SEED_TOKEN_ID`, which is why [`RUNBOOK.md`](RUNBOOK.md) says
never to run it before a demo.

| # | Moment | Evidence | Link |
|---|---|---|---|
| — | HTS property token (PROP-001) | fungible, `decimals=0`, supply `1000`, KYC + freeze keys, 2% fractional fee (min 1) | [`0.0.9734808`](https://hashscan.io/testnet/token/0.0.9734808) |
| 1 | **Primary transfer** | operator → buyer1, 100 shares, **no fee charged** (treasury is exempt) | [tx](https://hashscan.io/testnet/transaction/0.0.9695718@1784926059.544457087) |
| 2 | **Secondary transfer + 2% fee** | buyer1 → buyer2, 100 sent → **fee of 2**, recipient received **98** | [tx](https://hashscan.io/testnet/transaction/0.0.9695718@1784926061.146533751) |
| 3 | **KYC rejection — at the network level** | operator → nokyc, `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` | [tx](https://hashscan.io/testnet/transaction/0.0.9695718@1784926062.064623870) · [raw](https://testnet.mirrornode.hedera.com/api/v1/transactions/0.0.9695718-1784926062-064623870) |

### Why moment 3 matters

The nokyc account **is associated** with the token but **has not been granted KYC**. That
distinction is deliberate:

- Without association the error would have been `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT` — i.e.
  "this account never opted into the token at all". That is not the point we are making.
- Associated but no KYC → `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` — i.e. "the account accepted
  the token, but **cannot receive a transfer without identity verification**".

The rejection does not come from application code; it comes from **the Hedera network
itself**. Take the application layer out of the picture entirely and the rule still holds.

Moment 3 is linked by transaction id rather than by account, because a transfer that fails
moves nothing and is therefore indexed only under the account that paid for it — the
operator — never under the recipient. The nokyc account page shows only its own creation.
The `raw` link is the Mirror Node record: `"result": "ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN"`
with an empty `token_transfers` array, and a fee charged to `0.0.9695718` for a transfer
that never happened. The precondition is separately readable on the same public API —
[nokyc's relationship to the token](https://testnet.mirrornode.hedera.com/api/v1/accounts/0.0.9734743/tokens?token.id=0.0.9734808)
returns `"kyc_status": "REVOKED"` with `"balance": 0`.

### Why the 2% fee only appears on the secondary transfer

The fee collector is the treasury (operator) account, and on Hedera a fee collector is exempt
from fees on its own transfers. That makes the primary sale (treasury → buyer) free of charge;
the fee is only assessed when shares change hands on the **secondary market**. In the protocol
this represents the rental-income distribution mechanism.

---

## The verifier gate — tampering cannot mint

`npm run tamper` takes a genuinely signed ownership attestation, changes exactly one field,
and confirms tokenization stays locked. Every case is checked in code; the script exits
non-zero if any tampered attestation is accepted.

| Tampered field | Result |
|---|---|
| `propertyId` swapped to another property | ⛔ `ATTESTATION_INVALID` |
| `documentRoot` replaced (different documents) | ⛔ `ATTESTATION_INVALID` |
| `sellerAccountId` redirected to another account | ⛔ `ATTESTATION_INVALID` |
| `expiresAt` extended without re-signing | ⛔ `ATTESTATION_INVALID` |
| `signature` replaced with a forgery | ⛔ `ATTESTATION_INVALID` |
| Genuinely expired (signature still valid) | ⛔ `ATTESTATION_EXPIRED` |

The last row is the interesting one: the signature is authentic, so this isolates the
freshness check from the integrity check. An approval that is cryptographically perfect but
stale is still refused.

## The full sale flow over HTTP

`npm run e2e:sale` drives the same endpoints the frontend calls, against a running server.
It prints its own assertion count on completion, including the privacy checks (no nullifier, no salt, no document bytes in any
response).

| Step | Assertion |
|---|---|
| `POST /api/onboard` | opaque 64-hex session; response carries no nullifier |
| `POST /api/attest` without a session | ⛔ `SELLER_SESSION_REQUIRED` |
| `POST /api/attest` with a session | `PENDING_REVIEW` + 64-hex Merkle root; no salt or bytes returned |
| `POST /api/tokenize` while pending | ⛔ `OWNERSHIP_PENDING` |
| `GET /api/verifier/pending` without the secret | ⛔ `UNAUTHORIZED` |
| `POST /api/verifier/decision` | `APPROVED` + Ed25519 attestation |
| `POST /api/tokenize` with a tampered attestation | ⛔ `ATTESTATION_INVALID` |
| `POST /api/tokenize` with the genuine attestation | ✅ real token minted |
| `POST /api/tokenize` a second time | ⛔ `ALREADY_TOKENIZED` |

A property tokenized through the live HTTP flow: [`0.0.9734945`](https://hashscan.io/testnet/token/0.0.9734945)

---

## ENS — live protocol config discovery (Sepolia)

`pprevlisbon.eth` is registered on the ENSv2 alpha and resolves to our config wallet.
Per-property config lives in text records under subname nodes — written **programmatically**
(one multicall per property, `npm run ens:write`), never through a UI. Resolution works
from plain viem via the v2 UniversalResolver, so anyone can verify with a script.

| Name | Mode | Records written (tx) |
|---|---|---|
| `prop-001.pprevlisbon.eth` | SALE (seed token) | [tx](https://sepolia.etherscan.io/tx/0x2a550dc0c790cf4584e6cd874ce1cdf24a1fd1305532d109909b70a22440d87b) |
| `prop-002.pprevlisbon.eth` | SALE (live flow) | [tx](https://sepolia.etherscan.io/tx/0xd2dba9110f2834a059327c8f6c1496a6ff5a1fa389976a5f7851dbf7dca6d50c) |
| `prop-003.pprevlisbon.eth` | RENTAL (escrow, no token by design) | [tx](https://sepolia.etherscan.io/tx/0xd87377a6b2805373800985c576af5cbcd2a3a7ab0164d841c6d9cb86394f2d0f) |

No subname registration transactions exist — v2 resolution walks up to the resolver
covering the longest suffix, so the subname nodes resolve through the parent's resolver.
`/api/ens-read` validates a **different required field set per mode** and falls back to
env values (reported honestly as `source: "env-fallback"`) if the alpha deployment or the
RPC is unreachable.

## Mirror Node audit timeline

`GET /api/audit` serves the event timeline **from Mirror Node**, not from server memory —
every entry is independently verifiable:
[topic messages on Mirror](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.9734777/messages)

The topic has no submit key, so that raw feed is what anyone may write to it; the reader
keeps only messages whose `payer_account_id` is the operator `0.0.9695718` and drops the
rest, which is a filter you can apply yourself to get the same list. Note also that 39
early `PROPERTY_SUBMITTED` messages (sequence 2 to 189) carry a `city` field. Payloads
have not carried it since; a permanent log keeps the mistake too.

## Rental escrow (real HBAR, both settlement paths)

`npm run e2e:rental` — asserts against consensus-node balances (it prints its own count):

| Path | Evidence | Link |
|---|---|---|
| Escrow lock | 5 ℏ left the tenant | [tx](https://hashscan.io/testnet/transaction/0.0.9695718@1784929036.599075124) |
| **Settle** | full 5 ℏ refunded to the tenant, zero slash | [tx](https://hashscan.io/testnet/transaction/0.0.9695718@1784929042.955511233) |
| **Expire** | tenant received **+5.50000000 ℏ** — deposit plus a 10% penalty | [tx](https://hashscan.io/testnet/transaction/0.0.9695718@1784929067.575545918) |

The expiry payout is one transfer, not two. On the ledger it is a single −5.5 ℏ line
against `0.0.9695718` (plus the network fee) matched by +5.5 ℏ to the tenant, because in
this demo landlord, escrow and operator are all the same account — the split into
`refunded: 5` and `slashed: 0.5` at `slashRateBps: 1000` exists in the `RENTAL_EXPIRED`
message on the audit topic, not as separate on-chain movements. What the chain proves here
is that the tenant received 10% more than they locked; who lost that 10% is a role
assignment this demo collapses onto one account.

Early expire is refused (`LOCK_NOT_EXPIRED`), late settle is refused (`LOCK_EXPIRED`),
and expire itself is **permissionless** — an escrow only the counterparty can open is not
an escrow. All five rental events (`RENTAL_LISTED/APPLICATION/ENGAGED/SETTLED/EXPIRED`)
are asserted present on-chain via Mirror.

---

## Reproducing this

```bash
npm install
cp .env.example .env.local     # fill in OPERATOR_ID + OPERATOR_KEY
npm run accounts:create        # creates buyer1 / buyer2 / nokyc
npm run bootstrap              # opens the HCS audit topic
npm run golden                 # runs and verifies the three golden moments
```

`npm run golden` does more than submit transactions — it `assert`s every claim in code. If the
fee is not 2, if the recipient did not receive 98, or if the nokyc transfer succeeds, the
script fails and exits. It mints its own token on the way, so a reproduction yields new
ids that satisfy the same assertions rather than reproducing the ids above; those stay
readable on Mirror regardless.
