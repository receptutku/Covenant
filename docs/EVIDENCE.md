# PPREV — Live On-Chain Evidence

Every link in this file points to a real, permanent **Hedera testnet** transaction.
None of it is a mock, a simulation, or a screenshot.

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

Produced with `npm run golden`, which re-verifies every claim programmatically on each run.

| # | Moment | Evidence | Link |
|---|---|---|---|
| — | HTS property token (PROP-001) | fungible, `decimals=0`, supply `1000`, KYC + freeze keys, 2% fractional fee (min 1) | [`0.0.9734808`](https://hashscan.io/testnet/token/0.0.9734808) |
| 1 | **Primary transfer** | operator → buyer1, 100 shares, **no fee charged** (treasury is exempt) | [tx](https://hashscan.io/testnet/transaction/0.0.9695718@1784926059.544457087) |
| 2 | **Secondary transfer + 2% fee** | buyer1 → buyer2, 100 sent → **fee of 2**, recipient received **98** | [tx](https://hashscan.io/testnet/transaction/0.0.9695718@1784926061.146533751) |
| 3 | **KYC rejection — at the network level** | operator → nokyc, `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` | [nokyc account](https://hashscan.io/testnet/account/0.0.9734743) |

### Why moment 3 matters

The nokyc account **is associated** with the token but **has not been granted KYC**. That
distinction is deliberate:

- Without association the error would have been `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT` — i.e.
  "this account never opted into the token at all". That is not the point we are making.
- Associated but no KYC → `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` — i.e. "the account accepted
  the token, but **cannot receive a transfer without identity verification**".

The rejection does not come from application code; it comes from **the Hedera network
itself**. Take the application layer out of the picture entirely and the rule still holds.

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
20 assertions, including the privacy ones (no nullifier, no salt, no document bytes in any
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

## Pending evidence

The following will be added to this table as the corresponding phases land:

- [ ] Live ENS config resolution — Sepolia (R6)
- [ ] Mirror Node audit timeline (R6)
- [ ] Rental escrow HBAR lock (R6.5)
- [ ] Rental settlement — clean refund (R6.5)
- [ ] Rental expiration — refund + landlord slash (R6.5)

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
script fails and exits.
