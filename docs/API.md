CONTRACT-VERSION: 4

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
- **Every `POST` endpoint** can return `INVALID_INPUT` (400): the body is parsed by Zod and a
  malformed one never reaches the handler. The message names the offending field paths
  (`files.0.type`) but never their values. The per-endpoint error lists below do not repeat it.

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

## `GET /api/health` — Liveness and public identifiers

No body, no auth, no chain calls — cheap enough to poll every few seconds.

**Response 200**

```json
{
  "ok": true,
  "time": "2026-07-24T10:15:00.000Z",
  "world": "configured",
  "ens": "pprevlisbon.eth",
  "auditTopicId": "0.0.111",
  "seededProperties": 2,
  "demoAccounts": {
    "buyer1": "0.0.654321",
    "buyer2": "0.0.654322",
    "nokyc": "0.0.654323",
    "operator": "0.0.1001"
  }
}
```

`world` is `"configured"` or `"dev-fallback"`. `ens`, `auditTopicId` and every entry of
`demoAccounts` is `null` when the corresponding environment variable is unset.

> **Read the demo account ids from here — do not hard-code them.** This is not a style
> preference: the frontend once carried invented account ids left over from the mock, and
> every transfer against them failed with `TOKEN_NOT_ASSOCIATED`, which looked like a backend
> bug when the accounts simply did not exist. The ids differ per environment and per
> `.env`; fetching them removes that whole class of drift.
>
> These are account ids only — public by nature, readable on HashScan by anyone. No key,
> secret or session material is exposed here.
>
> Role mapping: `buyer1` is the KYC-verified buyer and the tenant in the rental flow,
> `buyer2` is the secondary-market counterparty, `nokyc` is associated with every property
> token but deliberately never granted KYC (**never send it to `/api/kyc`** — see that
> endpoint), and `operator` is the treasury, seller, landlord and escrow holder.

**Errors:** none — this endpoint does not fail while the process is alive.

---

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
>
> `hcs` is `null` when the topic write failed. The submission itself still succeeded — the
> HCS write is fire-and-forget so that a Hedera hiccup cannot lose an accepted property. Treat
> a null as "not yet on the timeline", not as an error.

Beyond the declared limits, `UNSUPPORTED_FILE_TYPE` also fires when a file's actual magic
bytes disagree with its declared `type` (a `.exe` labelled `application/pdf`), or when
`dataBase64` decodes to nothing.

**Errors:** `SELLER_SESSION_REQUIRED` (401), `SELLER_SESSION_EXPIRED` (401),
`TOO_MANY_FILES` (400), `FILE_TOO_LARGE` (400), `UNSUPPORTED_FILE_TYPE` (400),
`ALREADY_TOKENIZED` (409 — also returns the existing `tokenId`), `INVALID_INPUT` (400)

> `ALREADY_TOKENIZED` here means a resubmission against a property that already has a token
> on-chain. It is refused rather than allowed to reset the property to `PENDING_REVIEW`,
> because the token would keep existing while the store claimed the property was unreviewed —
> and the seeded `PROP-001` is exactly such a property.

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

**Errors:** `UNAUTHORIZED` (401), `PROPERTY_NOT_FOUND` (404), `OWNERSHIP_PENDING` (422),
`INVALID_INPUT` (400)

> `OWNERSHIP_PENDING` here reads backwards until you know why: it is thrown when the property
> is **not** in `PENDING_REVIEW`, i.e. it has already been decided. Re-deciding an approved
> property would mint a second attestation with a fresh expiry, quietly extending the
> freshness window past what the reviewer actually signed off on. The message names the
> current state.

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
`ALREADY_TOKENIZED` (409 — also returns the existing `tokenId`), `INVALID_INPUT` (400)

> **A tampered attestation returns `ATTESTATION_INVALID` (422), not `INVALID_INPUT`.** The
> Zod schema for `attestation` is deliberately permissive about field CONTENT — every field
> is just a bounded string — so that shape validation cannot preempt signature verification.
> With a strict `documentRoot` pattern and a `decision` literal, a doctored attestation was
> rejected by Zod before the signature was ever checked, and the tamper-test scene produced a
> generic 400 that reads as "you sent a malformed request" instead of "a forgery was blocked".
> Nothing is weakened by this: `assertAttestationValid` verifies the Ed25519 signature over
> the canonical payload, cross-checks `propertyId`/`sellerAccountId`/`documentRoot` against
> the stored property, requires `decision === "APPROVED"`, and enforces expiry. A field of the
> wrong shape cannot survive that.
>
> What still yields `INVALID_INPUT` is a structurally broken body — a missing field, a
> non-string, a `propertyId` outside `[A-Za-z0-9-]{3,40}`.

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
`signal` is optional (max 200 chars); it is echoed back verbatim, and comes back as `null`
when it was omitted. The server does not fold it into `rpContext` — it is a passthrough
convenience so the caller does not have to carry it alongside the response.

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

Flow: property + token lookup → **nokyc guard** → verify proof → replay check against the
HMAC digest of the nullifier → `associate` → `grantKyc`.

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

> `associationTxId` is `null` for any account whose key the server does not hold — i.e.
> anything other than the `buyer1`/`buyer2`/`nokyc` demo accounts. Association must be signed
> by the account being associated, so for a real wallet the holder associates the token
> themselves first; the KYC grant is signed by the token's KYC key and needs nothing from the
> buyer. A `null` here is not a failure: `kycGranted: true` is the outcome that matters.

**Errors:** `WORLD_PROOF_INVALID` (422), `WORLD_PROOF_REPLAY` (422),
`PROPERTY_NOT_FOUND` (404 — unknown property, **or** a property with no token yet),
`KYC_DENIED` (422), `TOKEN_NOT_ASSOCIATED` (422 — also returns `hederaStatus` and `tokenId`),
`INVALID_INPUT` (400)

> `KYC_DENIED` here means the requested `buyerAccountId` is the reserved `nokyc` account. It
> is refused because granting it KYC would destroy the demo's counter-example permanently —
> there is no revoke endpoint, and that account's whole purpose is to be the one that was
> never verified.
>
> **This guard fires BEFORE the World proof is verified, deliberately.** A rejected attempt
> therefore does not burn the user's nullifier: a nullifier is derived from (identity, app,
> action), so consuming it on a request that was going to be refused anyway would lock that
> person out of ever verifying as a buyer. The cost of the ordering is that a `nokyc` request
> tells you nothing about whether the proof was valid — which is fine, because the answer is
> "this account is not eligible" either way.
>
> `TOKEN_NOT_ASSOCIATED` means the grant reached Hedera and the network refused it because
> the account has not associated the token. That is the one failure the account holder can
> fix themselves.

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

`amount` is optional and **defaults to 100**; it must be a positive integer ≤ 1000 (the whole
supply of a property token), otherwise `INVALID_INPUT`.

**Response 200**

```json
{
  "transferred": true,
  "tokenId": "0.0.222333",
  "amount": 100,
  "netAmount": 98,
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

On a primary transfer `assessedCustomFees` is empty (treasury exemption) and
`netAmount === amount`. On a secondary transfer the fee is `amount: 2` and `netAmount` is 98.

> **`netAmount` is the number to put in front of the user, not `amount`.** The 2% fractional
> fee is **INCLUSIVE**: on a secondary transfer of 100 the sender is debited 100, the
> collector takes 2, and the recipient is credited **98**. `netAmount` is
> `amount − Σ assessedCustomFees`.
>
> A UI that shows "100 shares transferred" next to the recipient's balance is making a claim
> Mirror Node's own token-transfer list for that same transaction contradicts — which is
> exactly the discrepancy an auditor is supposed to catch, in the audit product. Show
> `amount` as sent and `netAmount` as received; the gap is the fee, and saying so out loud is
> the point of the scene.

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

**Errors:** `PROPERTY_NOT_FOUND` (404 — unknown property, **or** a property with no token
yet), `KYC_DENIED` (422), `TOKEN_NOT_ASSOCIATED` (422), `INVALID_INPUT` (400)

> `INVALID_INPUT` covers three cases here, all 400: a malformed body, `mode: "primary"` sent
> without a `buyerAccountId`, and — with `hederaStatus: "INSUFFICIENT_TOKEN_BALANCE"` — a
> transfer larger than the sender actually holds. The last one is mapped explicitly so a
> repeated rehearsal surfaces "the sender does not hold that many shares" instead of a bare
> 500 that looks like a crash. Run `POST /api/seed` to top buyer1 back up.

**HCS:** `TOKEN_TRANSFERRED` — payload carries both `amount` and `netAmount`, plus
`assessedFeeTotal`. Only successful transfers are recorded.

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

**Fallback:** if ENS resolution errors, times out, or returns no records at all, the response
comes back with `"source": "env-fallback"` and the server console logs
`ENS config unavailable → env fallback`. A live (`"ens"`) response is cached in memory for 60
seconds; a fallback response for only **8** seconds, so the UI stops showing a degraded source
shortly after Sepolia recovers rather than a full minute later.

**Errors:** `ENS_CONFIG_INCOMPLETE` (422), `INVALID_INPUT` (400)

---

## `GET /api/audit?propertyId=PROP-002` — Mirror Node timeline

Reads the HCS messages from Mirror Node, base64-decodes them, and returns them chronologically.

**`propertyId` is optional.** Omit it and the full protocol trail comes back — sale and rental
events interleaved on one record, which is what the "one core, two modes" story needs.

**Response 200**

```json
{
  "propertyId": "PROP-002",
  "topicId": "0.0.111",
  "source": "mirror-node",
  "eventCount": 1,
  "events": [
    {
      "eventType": "PROPERTY_SUBMITTED",
      "timestamp": "2026-07-24T10:15:00.000Z",
      "consensusTimestamp": "1784927773.123456789",
      "sequenceNumber": 7,
      "propertyId": "PROP-002",
      "payload": { "documentRoot": "9f2c...", "documentCount": 2 },
      "explorerUrl": "https://hashscan.io/testnet/topic/0.0.111"
    }
  ],
  "token": {
    "tokenId": "0.0.222333",
    "name": "PPREV Alfama 2+1",
    "symbol": "ALFM",
    "totalSupply": "1000",
    "decimals": "0",
    "treasuryAccountId": "0.0.1001",
    "customFees": {},
    "explorerUrl": "https://hashscan.io/testnet/token/0.0.222333"
  },
  "links": {
    "topic": "https://hashscan.io/testnet/topic/0.0.111",
    "token": "https://hashscan.io/testnet/token/0.0.222333",
    "mirrorTopic": "https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.111/messages"
  }
}
```

Nullable fields, all of them normal states rather than errors:

| Field | `null` when |
|---|---|
| `propertyId` (top level) | the query parameter was omitted |
| `token` | the property has no token, no `propertyId` was given, or Mirror has no record of it |
| `links.token` | the property has no token, or no `propertyId` was given |

Each event carries two timestamps: `timestamp` is what the writer put in the envelope,
`consensusTimestamp` is Hedera's own `seconds.nanos` ordering — the one to sort by and the one
an auditor can look up. `propertyId` on the event lets an unfiltered timeline be grouped
client-side. `links.mirrorTopic` is the raw public endpoint; the whole point is that anyone can
curl it and reach the same list without going through this server.

Mirror Node lag is expected; if an event has not surfaced yet the list simply comes back
shorter (this is not an error). Messages not paid for by the operator account are filtered out
— the topic has no submit key, so anyone can post a well-formed forgery to it.

**Errors:** `INTERNAL_ERROR` (500 — the audit topic is not configured on the server)

---

## `POST /api/seed` — Demo state setup (development only)

Writes **two** properties into the store:

- `PROP-001` — `TOKENIZED` with the real `SEED_TOKEN_ID`, for the pre-baked sale scenes.
- `PROP-003` — `APPROVED` and deliberately never tokenized, the property the rental flow
  lists. Without it the rental scene died with `PROPERTY_NOT_FOUND` after every restart,
  because it silently depended on someone having run attest + approve by hand first.

It also associates `buyer1`, `buyer2` and `nokyc` with the seed token, grants KYC to `buyer1`
and `buyer2`, and **leaves `nokyc` associated but not KYC'd** (essential for the golden
moment). Every step is idempotent, so re-seeding between rehearsals is safe.

**Response 200**

```json
{
  "seeded": true,
  "properties": ["PROP-001", "PROP-003"],
  "tokenId": "0.0.222111",
  "replenished": { "needed": 100, "fromBuyer2": 105, "fromTreasury": 0 },
  "preparedTokens": ["PROP-002"],
  "elapsedMs": 2400
}
```

`replenished` reports how buyer1's shares were restored for the secondary-market scene:
`needed` is the shortfall against the 100 shares that scene consumes, `fromBuyer2` is what was
swept back from buyer2 (the transfer itself pays the 2% fee, so slightly more is moved than is
needed), and `fromTreasury` is the remainder. All three are `0` when buyer1 already holds
enough. `preparedTokens` lists the propertyIds of any OTHER tokenized properties whose token
relationships were repaired — a token minted during a live run starts with no associations at
all, which is how the no-KYC scene once failed with `TOKEN_NOT_ASSOCIATED` on the live
property while working on the seeded one. A property whose repair failed is logged and skipped,
not listed.

**Errors:** `INTERNAL_ERROR` (500 — `SEED_TOKEN_ID` is not configured; run `npm run golden`
once to mint the seed token)

## `POST /api/reset` — Clears the store (development only)

```json
{ "reset": true }
```

Wipes all in-memory state: properties, rentals, sessions and used-proof digests. On-chain
artefacts are permanent and untouched. To clear *only* the proof digests, use
`/api/dev/clear-replay` below — a full reset costs a reseed.

Both endpoints return `404` with `code: "PROPERTY_NOT_FOUND"` in production.

---

# Development-only endpoints (`/api/dev/*`)

**Not part of the demo narrative, and not part of the versioned client interface.** These
exist for scripted tests and for recovering a blocked rehearsal. All three require
`NODE_ENV !== "production"` **and** the `x-demo-admin-secret` header — two independent guards
— and every one of them logs a `[dev]` warning on the server when it runs. In production they
return `404` / `PROPERTY_NOT_FOUND`; with a wrong or missing secret, `401` / `UNAUTHORIZED`.

> Why they are separate routes rather than flags on the real handlers: a bypass branch inside
> `/api/onboard` would mean the production authentication path contains a code path that skips
> authentication. Guarded or not, that is the kind of branch that survives a refactor and
> ships. Keeping them in their own files means the real handlers have no bypass at all.

## `POST /api/dev/session` — Seller session without a World proof

**Header:** `x-demo-admin-secret: <DEMO_ADMIN_SECRET>` · **Request:** empty body

```json
{
  "onboarded": true,
  "sellerSessionToken": "a1b2c3...",
  "expiresAt": "2026-07-24T10:45:00.000Z",
  "warning": "Development session — no World verification was performed."
}
```

Same shape as `/api/onboard` plus a `warning`. Use it for end-to-end tests, which cannot drive
the IDKit widget, and as the fallback if the World simulator is unavailable during the demo —
in which case say so out loud rather than letting the audience believe a verification happened.

## `POST /api/dev/rental-apply` — Rental application without a World proof

**Header:** `x-demo-admin-secret: <DEMO_ADMIN_SECRET>`

```json
{ "listingId": "RENT-001", "tenantAccountId": "0.0.654321" }
```

**Response 200**

```json
{
  "listingId": "RENT-001",
  "state": "APPLIED",
  "tenantAccountId": "0.0.654321",
  "warning": "Development application — no World verification was performed."
}
```

The `RENTAL_APPLICATION` audit event is still written, with `verifiedByWorld: false` — the
honest record of what happened.

**Errors:** `UNAUTHORIZED` (401), `PROPERTY_NOT_FOUND` (404 — unknown `listingId`),
`RENTAL_NOT_ENGAGED` (422 — the listing is not `LISTED`), `INVALID_INPUT` (400)

## `POST /api/dev/clear-replay` — Forget used World proofs

**Header:** `x-demo-admin-secret: <DEMO_ADMIN_SECRET>` · **Request:** empty body

```json
{
  "cleared": 3,
  "warning": "Previously used World proofs will be accepted again. Development only."
}
```

> **Why this exists.** It is not a bug workaround — it is replay protection working correctly
> and being inconvenient because of it. A World nullifier is derived from
> (identity, app, action), so it is the SAME value every time a given person repeats a given
> check. The first Selfie Check of a rehearsal succeeds; the **second is refused as
> `WORLD_PROOF_REPLAY` at step one**, before anything else can be shown. On a shared demo
> identity that is the difference between rehearsing twice and rehearsing once.
>
> It clears **only** the proof digests. Seeded properties, listings and sessions are left
> intact, which is what separates it from `/api/reset`.
>
> It does **not** weaken verification: every proof is still verified against World on every
> attempt, and each one can still only be used once after this call. It forgets history,
> nothing else.

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

# Development-only endpoints

These exist so the flow can be driven without the World simulator, and so a blocked
rehearsal can be recovered. **They are not part of the demo narrative** — nothing shown to
judges should depend on them.

Two independent guards on all three: the process must not be in production
(`NODE_ENV !== 'production'`), and the caller must send `x-demo-admin-secret`. In a
production build they answer `404`, like `/api/seed` and `/api/reset`.

Each one is a separate route rather than a flag on the real endpoint. A bypass branch
living inside an authentication handler is the kind of thing that survives a refactor and
ships; keeping them apart means `/api/onboard` and `/api/rental/apply` contain no bypass at
all.

## `POST /api/dev/session` — Seller session without a World proof

**Header:** `x-demo-admin-secret: <DEMO_ADMIN_SECRET>`

**Response 200** — same shape as `/api/onboard`, plus a `warning` field:

```json
{
  "onboarded": true,
  "sellerSessionToken": "a1b2c3...",
  "expiresAt": "2026-07-24T10:45:00.000Z",
  "warning": "Development session — no World verification was performed."
}
```

Use it when the simulator is unavailable. If it is used during a live demo, say so out
loud — the server logs a warning, and claiming a verification happened when it did not is
the one thing this project cannot afford.

**Errors:** `UNAUTHORIZED` (401), `PROPERTY_NOT_FOUND` (404 — in production)

## `POST /api/dev/rental-apply` — Tenant application without a World proof

**Header:** `x-demo-admin-secret: <DEMO_ADMIN_SECRET>`

**Request**

```json
{ "listingId": "RENT-001", "tenantAccountId": "0.0.654321" }
```

**Response 200** — as `/api/rental/apply`, plus `warning`.

The `RENTAL_APPLICATION` audit event is still emitted, with `verifiedByWorld: false` — the
honest record of what actually happened.

**Errors:** `UNAUTHORIZED` (401), `PROPERTY_NOT_FOUND` (404), `RENTAL_NOT_ENGAGED` (422)

## `POST /api/dev/clear-replay` — Forget used World proofs

**Header:** `x-demo-admin-secret: <DEMO_ADMIN_SECRET>`

**Response 200**

```json
{ "cleared": 3, "warning": "Previously used World proofs will be accepted again. Development only." }
```

> **Run this between rehearsals that reuse the same World identity.** A nullifier is derived
> from (identity, app, action), so the same person repeating the same check presents the
> *same* nullifier every time. That is replay protection working correctly — and it means
> rehearsal #2 is refused with `WORLD_PROOF_REPLAY` at step one, before anything else can
> be shown.
>
> This clears only the proof history. Seeded properties, sessions and on-chain state are
> untouched, so no reseed is needed. `/api/reset` also clears it, but takes the demo state
> with it.
>
> Verification is not weakened: proofs are still checked against World on every attempt,
> and each remains single-use after the call.

**Errors:** `UNAUTHORIZED` (401)

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
| `health` | `GET /api/health` |

Development-only, not part of the interface the demo depends on:

| Method | Path |
|---|---|
| `devSession` | `POST /api/dev/session` |
| `devRentalApply` | `POST /api/dev/rental-apply` |
| `devClearReplay` | `POST /api/dev/clear-replay` |
