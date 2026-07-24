CONTRACT-VERSION: 3

# PPREV API Contract

> This file is the single source of truth between Recep (backend) and Akif (frontend).
> `lib/mockApi.ts` and `lib/realApi.ts` conform to it exactly.
>
> **Versioning rule:** any breaking change bumps the `CONTRACT-VERSION` marker above by 1, adds
> `BREAKING` to the commit message, and is communicated to the other side. The
> `// CONTRACT-VERSION: N` comment on the first line of `lib/mockApi.ts` must match that number.

---

## 0. General rules

- All requests and responses are `application/json`.
- Successful response: `200`, following the endpoint schemas below.
- Error responses **always** use this envelope:

```json
{ "error": "Human-readable explanation", "code": "STABIL_ERROR_CODE" }
```

- UI logic reads **only the `code` field**. The `error` text may change; the `code` never does.
- Some responses carry extra presentation-only fields alongside `code` (e.g. `hederaStatus`).
  These are meant for display, not for driving logic.
- No response **ever** contains: a raw World nullifier, a World proof, selfie/identity data,
  document bytes, a document salt, any private key, or a raw Hedera SDK object.

### HTTP status code mapping

| Status | Meaning |
|---|---|
| `200` | Success |
| `400` | Invalid input (Zod validation, missing field) |
| `401` | Missing or invalid identity/session (`SELLER_SESSION_*`, admin secret) |
| `403` | Not authorized (`NOT_LANDLORD`) |
| `404` | Record not found (`PROPERTY_NOT_FOUND`) |
| `409` | State conflict (`ALREADY_TOKENIZED`, `LOCK_NOT_EXPIRED`) |
| `422` | Business-rule rejection (`KYC_DENIED`, `ATTESTATION_INVALID`, `OWNERSHIP_PENDING`) |
| `500` | Unexpected server error (leaks no details) |

---

## 1. Stable error codes

This list is closed. Adding a new code bumps the contract version.

```text
# Session / seller
SELLER_SESSION_REQUIRED
SELLER_SESSION_EXPIRED

# Document upload
TOO_MANY_FILES
FILE_TOO_LARGE
UNSUPPORTED_FILE_TYPE

# Property / ownership
PROPERTY_NOT_FOUND
OWNERSHIP_PENDING
OWNERSHIP_REJECTED
ATTESTATION_INVALID
ATTESTATION_EXPIRED
ALREADY_TOKENIZED

# Hedera / transfer
TOKEN_NOT_ASSOCIATED
KYC_DENIED

# World
WORLD_PROOF_INVALID
WORLD_PROOF_REPLAY

# ENS
ENS_CONFIG_INCOMPLETE

# Rental (RENTAL)
RENTAL_NOT_APPROVED
RENTAL_NOT_ENGAGED
LOCK_EXPIRED
LOCK_NOT_EXPIRED
INSUFFICIENT_DEPOSIT
NOT_LANDLORD

# General
INVALID_INPUT
UNAUTHORIZED
INTERNAL_ERROR
```

---

## 2. HCS event catalogue (shared — these exact strings)

The audit timeline reads these names. **If a name changes, Akif's timeline renders an empty box.**

**SALE:**

```text
SELLER_ONBOARDED
PROPERTY_SUBMITTED
OWNERSHIP_APPROVED
OWNERSHIP_REJECTED
PROPERTY_TOKEN_CREATED
BUYER_ELIGIBILITY_CONFIRMED
KYC_GRANTED
TOKEN_TRANSFERRED
```

**RENTAL:**

```text
RENTAL_LISTED
RENTAL_APPLICATION
RENTAL_ENGAGED
RENTAL_SETTLED
RENTAL_EXPIRED
```

The envelope of every HCS message:

```json
{
  "schemaVersion": 1,
  "eventType": "PROPERTY_SUBMITTED",
  "propertyId": "PROP-002",
  "timestamp": "2026-07-24T10:15:00.000Z",
  "payload": {}
}
```

`payload` **never** contains PII, nullifiers, proofs, document bytes, or salts.

---

## 3. Property state machine

```text
DRAFT → PENDING_REVIEW → APPROVED  → TOKENIZED
                       ↘ REJECTED
```

- `tokenize` only runs in the `APPROVED` state and only with a valid signature.
- A second tokenization is blocked (`ALREADY_TOKENIZED`).
- Renting is only possible for a **purely `APPROVED`** property (one that has not been
  tokenized yet). A `TOKENIZED` property hitting `rental/list` → `RENTAL_NOT_APPROVED`.

## 4. Rental state machine

```text
LISTED → APPLIED → ENGAGED → SETTLED
                           ↘ EXPIRED
```

`SETTLED` and `EXPIRED` are both terminal (for demo simplicity).

---

# Endpoints

## `POST /api/onboard` — Seller/Landlord selfie gate

Verifies the World **Selfie Check** proof server-side and issues an opaque seller session.

**Request**

```json
{
  "proof": { "...": "IDKit success payload (forwarded as-is)" },
  "action": "onboard-seller"
}
```

**Response 200**

```json
{
  "onboarded": true,
  "sellerSessionToken": "a1b2c3... (opaque, 64 hex)",
  "expiresAt": "2026-07-24T10:45:00.000Z"
}
```

> `sellerSessionToken` is **not** a World nullifier — it is `randomBytes(32)`. The UI never
> displays it, never writes it to `localStorage` or the console; it lives only in short-lived
> memory state.

**Errors:** `WORLD_PROOF_INVALID` (422), `WORLD_PROOF_REPLAY` (422), `INVALID_INPUT` (400)

**HCS:** `SELLER_ONBOARDED`

---

## `POST /api/attest` — Property document submission

**Request**

```json
{
  "sellerSessionToken": "...",
  "propertyId": "PROP-002",
  "displayName": "Alfama 2+1",
  "city": "Lisbon",
  "sellerAccountId": "0.0.123456",
  "tokenSymbol": "ALFM",
  "files": [{ "name": "title-deed.pdf", "type": "application/pdf", "dataBase64": "JVBERi0..." }]
}
```

Limits: at most **3** files, **5 MB** per file (measured after base64 decoding), allowed
types: `application/pdf`, `image/png`, `image/jpeg`.

**Response 200**

```json
{
  "propertyId": "PROP-002",
  "state": "PENDING_REVIEW",
  "documentRoot": "9f2c...",
  "documentCount": 2,
  "hcs": { "topicId": "0.0.111", "sequenceNumber": 7 }
}
```

> `documentRoot` is a salted, domain-separated Merkle root. The salt and the document bytes
> stay private on the server; they appear neither in the response nor on HCS.

**Errors:** `SELLER_SESSION_REQUIRED` (401), `SELLER_SESSION_EXPIRED` (401),
`TOO_MANY_FILES` (400), `FILE_TOO_LARGE` (400), `UNSUPPORTED_FILE_TYPE` (400),
`INVALID_INPUT` (400)

**HCS:** `PROPERTY_SUBMITTED` — payload: `{ documentRoot, documentCount, city }`

---

## `GET /api/verifier/pending` — Review queue

**Header:** `x-demo-admin-secret: <DEMO_ADMIN_SECRET>`

**Response 200**

```json
{
  "pending": [
    {
      "propertyId": "PROP-002",
      "displayName": "Alfama 2+1",
      "city": "Lisbon",
      "sellerAccountId": "0.0.123456",
      "submittedAt": "2026-07-24T10:15:00.000Z",
      "documentRoot": "9f2c...",
      "files": [{ "name": "title-deed.pdf", "type": "application/pdf", "sizeBytes": 214233 }]
    }
  ]
}
```

> Metadata only — document contents never travel over the API.

**Errors:** `UNAUTHORIZED` (401)

---

## `POST /api/verifier/decision` — Human decision + Ed25519 attestation

**Header:** `x-demo-admin-secret: <DEMO_ADMIN_SECRET>`

**Request**

```json
{ "propertyId": "PROP-002", "decision": "APPROVED", "reason": null }
```

`decision`: `"APPROVED" | "REJECTED"`. When `REJECTED`, `reason` is required.

**Response 200 (APPROVED)**

```json
{
  "propertyId": "PROP-002",
  "state": "APPROVED",
  "attestation": {
    "propertyId": "PROP-002",
    "sellerAccountId": "0.0.123456",
    "documentRoot": "9f2c...",
    "decision": "APPROVED",
    "issuedAt": "2026-07-24T10:20:00.000Z",
    "expiresAt": "2026-07-24T11:20:00.000Z",
    "signature": "base64...",
    "verifierPublicKey": "302a300506032b6570032100..."
  }
}
```

The signed payload (line breaks are `\n`, fixed field order):

```text
PPREV_OWNERSHIP_V1
propertyId=<...>
sellerAccountId=<...>
documentRoot=<...>
decision=APPROVED
issuedAt=<ISO8601>
expiresAt=<ISO8601>
```

**Response 200 (REJECTED)**

```json
{ "propertyId": "PROP-002", "state": "REJECTED", "reason": "Document is not legible" }
```

**Errors:** `UNAUTHORIZED` (401), `PROPERTY_NOT_FOUND` (404), `INVALID_INPUT` (400)

**HCS:** `OWNERSHIP_APPROVED` / `OWNERSHIP_REJECTED`

---

## `POST /api/tokenize` — HTS token creation (security gate)

**Request**

```json
{ "propertyId": "PROP-002", "attestation": { "...": "the object returned by the decision endpoint" } }
```

Gate order: state is `APPROVED` → verify signature → `propertyId`/`sellerAccountId`/
`documentRoot` match the store → `expiresAt` has not passed → create the token.

**Response 200**

```json
{
  "propertyId": "PROP-002",
  "state": "TOKENIZED",
  "tokenId": "0.0.222333",
  "totalSupply": 1000,
  "decimals": 0,
  "fractionalFeeBps": 200,
  "hashscanUrl": "https://hashscan.io/testnet/token/0.0.222333"
}
```

**Errors:** `PROPERTY_NOT_FOUND` (404), `OWNERSHIP_PENDING` (422),
`OWNERSHIP_REJECTED` (422), `ATTESTATION_INVALID` (422), `ATTESTATION_EXPIRED` (422),
`ALREADY_TOKENIZED` (409 — also returns the existing `tokenId`)

**HCS:** `PROPERTY_TOKEN_CREATED`

---

## `POST /api/rp-signature` — World RP context

Produces the signed RP context that the IDKit widget requires.
Any `action` outside the whitelist is rejected.

**Request**

```json
{ "action": "verify-buyer", "signal": "PROP-002:0.0.654321" }
```

Allowed `action` values: `onboard-seller`, `verify-buyer`, `verify-tenant`.

**Response 200**

```json
{
  "appId": "app_50e89a...",
  "rpId": "rp_a8ab42...",
  "action": "verify-buyer",
  "environment": "staging",
  "signal": "PROP-002:0.0.654321",
  "rpContext": {
    "sig": "0x...",
    "nonce": "0x...",
    "created_at": 1784927773,
    "expires_at": 1784928073
  }
}
```

> This is **World ID 4.0**. The app now has three identifiers — `app_id`, `rp_id` and a
> `signing_key` — and the signing key never leaves the server. `rpContext` is valid for
> 300 seconds, so a captured context cannot be reused indefinitely.
>
> Pass `appId`, `action`, `environment` and `rpContext` straight into IDKit.

**Errors:** `INVALID_INPUT` (400 — unknown action), `INTERNAL_ERROR` (500 — World not configured)

---

## `POST /api/kyc` — Buyer Identity → Hedera KYC grant

**Request**

```json
{
  "propertyId": "PROP-002",
  "buyerAccountId": "0.0.654321",
  "proof": { "...": "IDKit Identity Check payload" },
  "action": "verify-buyer"
}
```

Flow: verify proof → replay check against the HMAC digest of the nullifier → read the
property's real `tokenId` → `associate` → `grantKyc`.

**Response 200**

```json
{
  "eligible": true,
  "kycGranted": true,
  "tokenId": "0.0.222333",
  "buyerAccountId": "0.0.654321",
  "associationTxId": "0.0.1@169...",
  "kycTxId": "0.0.1@169...",
  "hashscanUrl": "https://hashscan.io/testnet/transaction/..."
}
```

**Errors:** `WORLD_PROOF_INVALID` (422), `WORLD_PROOF_REPLAY` (422),
`PROPERTY_NOT_FOUND` (404), `INVALID_INPUT` (400)

**HCS:** `BUYER_ELIGIBILITY_CONFIRMED`, then `KYC_GRANTED`

---

## `POST /api/buy` — Share transfer

**Request**

```json
{
  "propertyId": "PROP-002",
  "mode": "primary",
  "buyerAccountId": "0.0.654321",
  "amount": 100
}
```

`mode`: `"primary"` (operator → buyer) | `"secondary"` (buyer1 → buyer2) | `"nokyc"` (operator → nokyc, must be rejected).

**Response 200**

```json
{
  "transferred": true,
  "tokenId": "0.0.222333",
  "amount": 100,
  "from": "0.0.1001",
  "to": "0.0.654321",
  "mode": "primary",
  "transactionId": "0.0.1@169...",
  "assessedCustomFees": [
    { "amount": 2, "tokenId": "0.0.222333", "collectorAccountId": "0.0.1001" }
  ],
  "hashscanUrl": "https://hashscan.io/testnet/transaction/..."
}
```

On a primary transfer `assessedCustomFees` is empty (treasury exemption). On a secondary
transfer it is `amount: 2`.

`buyerAccountId` is required for `primary` only. In `secondary` and `nokyc` the parties are
fixed demo accounts, because those are scripted scenes: the fee scene needs a holder who is
not the treasury, and the rejection scene needs an account that is associated but
deliberately un-KYC'd.

> Run `POST /api/seed` before the secondary scene. Each run permanently moves shares from
> buyer1 to buyer2, so seed tops buyer1 back up; without it the second rehearsal fails with
> an insufficient-balance error.

**Response 422 (nokyc — THE GOLDEN MOMENT)**

```json
{
  "error": "Hedera rejected the transfer: the receiving account has no KYC grant for this token.",
  "code": "KYC_DENIED",
  "hederaStatus": "ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN"
}
```

> `code` is stable (UI logic depends on it). `hederaStatus` is for display — it is shown
> prominently on screen and carries the "Hedera rejected this at the network level" narrative.

**Errors:** `PROPERTY_NOT_FOUND` (404), `KYC_DENIED` (422),
`TOKEN_NOT_ASSOCIATED` (422), `INVALID_INPUT` (400)

**HCS:** `TOKEN_TRANSFERRED` (only on a successful transfer)

---

## `POST /api/ens-read` — Live ENS config resolution

**Request**

```json
{ "propertyId": "PROP-002" }
```

The server normalizes the name `prop-002.<ENS_PARENT_NAME>` and resolves it on Sepolia.

**Response 200 (SALE)**

```json
{
  "name": "prop-002.pprevlisbon.eth",
  "mode": "SALE",
  "source": "ens",
  "network": "testnet",
  "resolvedAt": "2026-07-24T10:30:00.000Z",
  "records": {
    "com.pprev.mode": "SALE",
    "com.pprev.hedera.network": "testnet",
    "com.pprev.hedera.propertyTokenId": "0.0.222333",
    "com.pprev.hedera.auditTopicId": "0.0.111",
    "com.pprev.hedera.revenueTreasury": "0.0.1001",
    "com.pprev.policy.hash": "0xabc...",
    "com.pprev.policy.version": "1",
    "com.pprev.verifier.publicKey": "302a3005...",
    "com.pprev.property.id": "PROP-002"
  }
}
```

**Response 200 (RENTAL)** — same envelope, different field set:
`com.pprev.rental.escrowAccount` and `com.pprev.rental.reqDeposit` are present;
`propertyTokenId` and `revenueTreasury` are **absent**.

### Required records (by mode)

| Shared (6) | SALE extras (2) | RENTAL extras (2) |
|---|---|---|
| `hedera.network` | `hedera.propertyTokenId` | `rental.escrowAccount` |
| `policy.hash` | `hedera.revenueTreasury` | `rental.reqDeposit` |
| `policy.version` | | |
| `verifier.publicKey` | | |
| `hedera.auditTopicId` | | |
| `property.id` | | |

If any record in the relevant set is missing → `ENS_CONFIG_INCOMPLETE` (422).

**Fallback:** if ENS resolution errors or times out, the response comes back with
`"source": "env-fallback"` and the server console logs `ENS config unavailable → env fallback`.
Responses are cached in memory for 60 seconds.

**Errors:** `ENS_CONFIG_INCOMPLETE` (422), `INVALID_INPUT` (400)

---

## `GET /api/audit?propertyId=PROP-002` — Mirror Node timeline

Reads the HCS messages from Mirror Node, base64-decodes them, and returns them chronologically.

**Response 200**

```json
{
  "propertyId": "PROP-002",
  "topicId": "0.0.111",
  "source": "mirror-node",
  "events": [
    {
      "eventType": "PROPERTY_SUBMITTED",
      "timestamp": "2026-07-24T10:15:00.000Z",
      "sequenceNumber": 7,
      "payload": { "documentRoot": "9f2c...", "documentCount": 2 },
      "explorerUrl": "https://hashscan.io/testnet/topic/0.0.111"
    }
  ],
  "links": {
    "topic": "https://hashscan.io/testnet/topic/0.0.111",
    "token": "https://hashscan.io/testnet/token/0.0.222333"
  }
}
```

Mirror Node lag is expected; if an event has not surfaced yet the list simply comes back
shorter (this is not an error).

---

## `POST /api/seed` — Demo state setup (development only)

Writes `PROP-001` into the store in the `TOKENIZED` state with a valid `tokenId`, grants KYC
to `buyer1`, and **associates the `nokyc` account with the token but does not grant it KYC**
(essential for the golden moment).

**Response 200**

```json
{ "seeded": true, "properties": ["PROP-001"], "tokenId": "0.0.222111", "elapsedMs": 2400 }
```

## `POST /api/reset` — Clears the store (development only)

```json
{ "reset": true }
```

Both endpoints return `404` in production.

---

# Rental (RENTAL) endpoints

## `POST /api/rental/list` — Create a listing

**Request**

```json
{
  "sellerSessionToken": "...",
  "propertyId": "PROP-003",
  "reqDeposit": 50,
  "lockWindowSeconds": 600
}
```

`reqDeposit` is denominated in HBAR. The landlord gate is the Selfie session (identical to
seller onboarding).

**Response 200**

```json
{
  "listingId": "RENT-001",
  "propertyId": "PROP-003",
  "state": "LISTED",
  "reqDeposit": 50,
  "lockWindowSeconds": 600
}
```

**Errors:** `SELLER_SESSION_REQUIRED` (401), `SELLER_SESSION_EXPIRED` (401),
`PROPERTY_NOT_FOUND` (404), `RENTAL_NOT_APPROVED` (422 — the property is not `APPROVED`, or
it is already `TOKENIZED`)

**HCS:** `RENTAL_LISTED`

---

## `POST /api/rental/apply` — Tenant application

**Request**

```json
{
  "listingId": "RENT-001",
  "tenantAccountId": "0.0.654321",
  "proof": { "...": "IDKit Identity payload" },
  "action": "verify-tenant",
  "monthlyRent": 15
}
```

> `verify-tenant` is **separate** from the buyer action — so that the nullifier pool stays
> isolated and the same test user can demonstrate both the sale and the rental flow.

Predicate: age eligibility (World) plus an income threshold (`income ≥ 3 × rent`, without
revealing the exact amount).

**Response 200**

```json
{
  "listingId": "RENT-001",
  "state": "APPLIED",
  "tenantAccountId": "0.0.654321",
  "predicate": {
    "ageEligible": true,
    "incomeThresholdMet": true,
    "thresholdRule": "income >= 3x rent"
  }
}
```

**Errors:** `WORLD_PROOF_INVALID` (422), `WORLD_PROOF_REPLAY` (422),
`PROPERTY_NOT_FOUND` (404), `INVALID_INPUT` (400)

**HCS:** `RENTAL_APPLICATION` — the payload carries only the predicate result, never the amount.

---

## `POST /api/rental/engage` — Deposit lock (real HBAR)

The landlord accepts the application; the tenant's HBAR deposit is transferred into escrow.

**Request**

```json
{ "sellerSessionToken": "...", "listingId": "RENT-001" }
```

**Response 200**

```json
{
  "listingId": "RENT-001",
  "state": "ENGAGED",
  "deposit": 50,
  "escrowAccountId": "0.0.1001",
  "lockExpiresAt": "2026-07-24T10:40:00.000Z",
  "transactionId": "0.0.1@169...",
  "hashscanUrl": "https://hashscan.io/testnet/transaction/..."
}
```

**Errors:** `NOT_LANDLORD` (403), `INSUFFICIENT_DEPOSIT` (422),
`RENTAL_NOT_ENGAGED` (422 — state is not `APPLIED`)

**HCS:** `RENTAL_ENGAGED`

---

## `POST /api/rental/settle` — Clean refund

Landlord only, `ENGAGED` state only, and only while `now ≤ lockExpiresAt`.
The deposit goes **back to the tenant** (this is a rental deposit return, not a payout to the
landlord).

**Request**

```json
{ "sellerSessionToken": "...", "listingId": "RENT-001" }
```

**Response 200**

```json
{
  "listingId": "RENT-001",
  "state": "SETTLED",
  "refunded": 50,
  "to": "0.0.654321",
  "slashed": 0,
  "transactionId": "0.0.1@169...",
  "hashscanUrl": "https://hashscan.io/testnet/transaction/..."
}
```

**Errors:** `NOT_LANDLORD` (403), `RENTAL_NOT_ENGAGED` (422), `LOCK_EXPIRED` (422)

**HCS:** `RENTAL_SETTLED`

---

## `POST /api/rental/expire` — Lock expiry (refund + slash)

Once `now > lockExpiresAt` and the state is `ENGAGED`, **anyone** may call this
(permissionless). The deposit is refunded to the tenant **and** a fixed percentage is slashed
from the landlord's collateral. That is what separates it from `settle`: not a clean refund,
but a refund plus a landlord penalty.

**Request**

```json
{ "listingId": "RENT-001" }
```

**Response 200**

```json
{
  "listingId": "RENT-001",
  "state": "EXPIRED",
  "refunded": 50,
  "to": "0.0.654321",
  "slashed": 5,
  "slashRateBps": 1000,
  "transactionId": "0.0.1@169...",
  "hashscanUrl": "https://hashscan.io/testnet/transaction/..."
}
```

**Errors:** `RENTAL_NOT_ENGAGED` (422), `LOCK_NOT_EXPIRED` (409 — called before the lock expired)

**HCS:** `RENTAL_EXPIRED`

---

# Frontend method name ↔ path mapping

`lib/mockApi.ts` and `lib/realApi.ts` implement the same interface:

| Method | Path |
|---|---|
| `onboardSeller` | `POST /api/onboard` |
| `submitProperty` | `POST /api/attest` |
| `listPendingVerifications` | `GET /api/verifier/pending` |
| `decideVerification` | `POST /api/verifier/decision` |
| `tokenize` | `POST /api/tokenize` |
| `getRpSignature` | `POST /api/rp-signature` |
| `verifyBuyerAndGrantKyc` | `POST /api/kyc` |
| `buy` | `POST /api/buy` |
| `readEns` | `POST /api/ens-read` |
| `readAudit` | `GET /api/audit` |
| `seed` | `POST /api/seed` |
| `reset` | `POST /api/reset` |
| `rentalList` | `POST /api/rental/list` |
| `rentalApply` | `POST /api/rental/apply` |
| `rentalEngage` | `POST /api/rental/engage` |
| `rentalSettle` | `POST /api/rental/settle` |
| `rentalExpire` | `POST /api/rental/expire` |
