KONTRAT-SÜRÜM: 1

# PPREV API Kontratı

> Bu dosya Recep (backend) ile Akif (frontend) arasındaki tek doğruluk kaynağıdır.
> `lib/mockApi.ts` ve `lib/realApi.ts` bu dosyaya birebir uyar.
>
> **Sürüm kuralı:** Kırıcı bir değişiklikte üstteki `KONTRAT-SÜRÜM` +1 artar, commit mesajına
> `BREAKING` yazılır ve karşı tarafa haber verilir. `lib/mockApi.ts` ilk satırındaki
> `// KONTRAT-SÜRÜM: N` bu numarayla eşleşmelidir.

---

## 0. Genel kurallar

- Tüm istekler ve yanıtlar `application/json`.
- Başarılı yanıt: `200`, aşağıdaki endpoint şemaları.
- Hatalı yanıt **her zaman** şu zarfı kullanır:

```json
{ "error": "İnsan tarafından okunabilir açıklama", "code": "STABIL_ERROR_CODE" }
```

- UI mantığı **yalnız `code` alanına** bakar. `error` metni değişebilir, `code` değişmez.
- Bazı yanıtlar `code` yanında ek vitrin alanları taşır (örn. `hederaStatus`). Bunlar
  ekranda gösterilmek içindir, mantık kurmak için değil.
- Hiçbir yanıt şunları **asla** içermez: raw World nullifier, World proof, selfie/kimlik
  verisi, belge byte'ları, belge salt'ı, herhangi bir private key, ham Hedera SDK nesnesi.

### HTTP durum kodu eşlemesi

| Durum | Anlamı |
|---|---|
| `200` | Başarılı |
| `400` | Geçersiz girdi (Zod doğrulaması, eksik alan) |
| `401` | Kimlik/oturum yok veya geçersiz (`SELLER_SESSION_*`, admin secret) |
| `403` | Yetki yok (`NOT_LANDLORD`) |
| `404` | Kayıt yok (`PROPERTY_NOT_FOUND`) |
| `409` | State çakışması (`ALREADY_TOKENIZED`, `LOCK_NOT_EXPIRED`) |
| `422` | İş kuralı reddi (`KYC_DENIED`, `ATTESTATION_INVALID`, `OWNERSHIP_PENDING`) |
| `500` | Beklenmeyen sunucu hatası (detay sızdırmaz) |

---

## 1. Stabil hata kodları

Bu liste kapalıdır. Yeni kod eklemek kontrat sürümünü artırır.

```text
# Oturum / seller
SELLER_SESSION_REQUIRED
SELLER_SESSION_EXPIRED

# Belge yükleme
TOO_MANY_FILES
FILE_TOO_LARGE
UNSUPPORTED_FILE_TYPE

# Property / sahiplik
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

# Kiralama (RENTAL)
RENTAL_NOT_APPROVED
RENTAL_NOT_ENGAGED
LOCK_EXPIRED
LOCK_NOT_EXPIRED
INSUFFICIENT_DEPOSIT
NOT_LANDLORD

# Genel
INVALID_INPUT
UNAUTHORIZED
INTERNAL_ERROR
```

---

## 2. HCS olay kataloğu (ortak — birebir bu string'ler)

Audit timeline bu isimleri okur. **İsim değişirse Akif'in timeline'ı boş kutu gösterir.**

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

Her HCS mesajının zarfı:

```json
{
  "schemaVersion": 1,
  "eventType": "PROPERTY_SUBMITTED",
  "propertyId": "PROP-002",
  "timestamp": "2026-07-24T10:15:00.000Z",
  "payload": {}
}
```

`payload` **asla** PII, nullifier, proof, belge byte'ı veya salt içermez.

---

## 3. Property state machine

```text
DRAFT → PENDING_REVIEW → APPROVED  → TOKENIZED
                       ↘ REJECTED
```

- `tokenize` yalnız `APPROVED` state'te ve geçerli imzayla çalışır.
- İkinci tokenizasyon engellenir (`ALREADY_TOKENIZED`).
- Kiralama yalnız **saf `APPROVED`** (henüz tokenize edilmemiş) mülkte olur.
  `TOKENIZED` mülk `rental/list`'e gelirse → `RENTAL_NOT_APPROVED`.

## 4. Rental state machine

```text
LISTED → APPLIED → ENGAGED → SETTLED
                           ↘ EXPIRED
```

`SETTLED` ve `EXPIRED` ikisi de terminaldir (demo sadeliği).

---

# Endpoint'ler

## `POST /api/onboard` — Seller/Landlord Selfie kapısı

World **Selfie Check** proof'unu sunucuda doğrular, opak bir seller session üretir.

**Request**

```json
{
  "proof": { "...": "IDKit success payload (olduğu gibi iletilir)" },
  "action": "onboard-seller"
}
```

**Response 200**

```json
{
  "onboarded": true,
  "sellerSessionToken": "a1b2c3... (opak, 64 hex)",
  "expiresAt": "2026-07-24T10:45:00.000Z"
}
```

> `sellerSessionToken` World nullifier **değildir** — `randomBytes(32)`. UI bunu ekranda
> göstermez, `localStorage`/console'a yazmaz; yalnız kısa ömürlü memory state'te tutar.

**Hatalar:** `WORLD_PROOF_INVALID` (422), `WORLD_PROOF_REPLAY` (422), `INVALID_INPUT` (400)

**HCS:** `SELLER_ONBOARDED`

---

## `POST /api/attest` — Mülk belgesi gönderimi

**Request**

```json
{
  "sellerSessionToken": "...",
  "propertyId": "PROP-002",
  "displayName": "Alfama 2+1",
  "city": "Lisbon",
  "sellerAccountId": "0.0.123456",
  "tokenSymbol": "ALFM",
  "files": [{ "name": "tapu.pdf", "type": "application/pdf", "dataBase64": "JVBERi0..." }]
}
```

Limitler: en fazla **3** dosya, dosya başına **5 MB** (base64 decode sonrası ölçülür),
izinli tipler: `application/pdf`, `image/png`, `image/jpeg`.

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

> `documentRoot` = salted, domain-separated Merkle kökü. Salt ve belge byte'ları
> sunucuda private kalır; yanıtta ve HCS'de yer almaz.

**Hatalar:** `SELLER_SESSION_REQUIRED` (401), `SELLER_SESSION_EXPIRED` (401),
`TOO_MANY_FILES` (400), `FILE_TOO_LARGE` (400), `UNSUPPORTED_FILE_TYPE` (400),
`INVALID_INPUT` (400)

**HCS:** `PROPERTY_SUBMITTED` — payload: `{ documentRoot, documentCount, city }`

---

## `GET /api/verifier/pending` — İnceleme kuyruğu

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
      "files": [{ "name": "tapu.pdf", "type": "application/pdf", "sizeBytes": 214233 }]
    }
  ]
}
```

> Yalnız metadata döner — belge içeriği hiçbir zaman API üzerinden gitmez.

**Hatalar:** `UNAUTHORIZED` (401)

---

## `POST /api/verifier/decision` — İnsan kararı + Ed25519 attestation

**Header:** `x-demo-admin-secret: <DEMO_ADMIN_SECRET>`

**Request**

```json
{ "propertyId": "PROP-002", "decision": "APPROVED", "reason": null }
```

`decision`: `"APPROVED" | "REJECTED"`. `REJECTED` ise `reason` zorunlu.

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

İmzalanan payload (satır sonları `\n`, sabit sıra):

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
{ "propertyId": "PROP-002", "state": "REJECTED", "reason": "Belge okunamıyor" }
```

**Hatalar:** `UNAUTHORIZED` (401), `PROPERTY_NOT_FOUND` (404), `INVALID_INPUT` (400)

**HCS:** `OWNERSHIP_APPROVED` / `OWNERSHIP_REJECTED`

---

## `POST /api/tokenize` — HTS token oluşturma (güvenlik kapısı)

**Request**

```json
{ "propertyId": "PROP-002", "attestation": { "...": "decision yanıtındaki nesne" } }
```

Kapı sırası: state `APPROVED` → imza doğrula → `propertyId`/`sellerAccountId`/
`documentRoot` store ile eşleş → `expiresAt` geçmemiş → token oluştur.

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

**Hatalar:** `PROPERTY_NOT_FOUND` (404), `OWNERSHIP_PENDING` (422),
`OWNERSHIP_REJECTED` (422), `ATTESTATION_INVALID` (422), `ATTESTATION_EXPIRED` (422),
`ALREADY_TOKENIZED` (409 — mevcut `tokenId`'yi de döner)

**HCS:** `PROPERTY_TOKEN_CREATED`

---

## `POST /api/rp-signature` — World RP context

IDKit widget'ının ihtiyaç duyduğu imzalı RP context'ini üretir.
`action` whitelist dışıysa reddedilir.

**Request**

```json
{ "action": "verify-buyer", "signal": "PROP-002:0.0.654321" }
```

İzinli `action` değerleri: `onboard-seller`, `verify-buyer`, `verify-tenant`.

**Response 200**

```json
{ "appId": "app_staging_...", "action": "verify-buyer", "signal": "...", "signature": "..." }
```

**Hatalar:** `INVALID_INPUT` (400)

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

Akış: proof doğrula → nullifier HMAC digest ile replay kontrolü → property'nin gerçek
`tokenId`'sini oku → `associate` → `grantKyc`.

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

**Hatalar:** `WORLD_PROOF_INVALID` (422), `WORLD_PROOF_REPLAY` (422),
`PROPERTY_NOT_FOUND` (404), `INVALID_INPUT` (400)

**HCS:** `BUYER_ELIGIBILITY_CONFIRMED`, ardından `KYC_GRANTED`

---

## `POST /api/buy` — Hisse transferi

**Request**

```json
{
  "propertyId": "PROP-002",
  "mode": "primary",
  "buyerAccountId": "0.0.654321",
  "amount": 100
}
```

`mode`: `"primary"` (operator → buyer) | `"secondary"` (buyer1 → buyer2) | `"nokyc"` (operator → nokyc, reddedilmeli).

**Response 200**

```json
{
  "transferred": true,
  "tokenId": "0.0.222333",
  "amount": 100,
  "from": "0.0.1001",
  "to": "0.0.654321",
  "transactionId": "0.0.1@169...",
  "assessedCustomFees": [
    { "amount": 2, "tokenId": "0.0.222333", "collectorAccountId": "0.0.1001" }
  ],
  "hashscanUrl": "https://hashscan.io/testnet/transaction/..."
}
```

Primary transfer'da `assessedCustomFees` boştur (treasury muafiyeti). Secondary'de `amount: 2`.

**Response 422 (nokyc — ALTIN SAHNE)**

```json
{
  "error": "Hedera rejected the transfer: the receiving account has no KYC grant for this token.",
  "code": "KYC_DENIED",
  "hederaStatus": "ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN"
}
```

> `code` stabildir (UI mantığı buna bakar). `hederaStatus` vitrindir — ekranda büyük
> gösterilir, "Hedera ağ seviyesinde reddetti" anlatısını taşır.

**Hatalar:** `PROPERTY_NOT_FOUND` (404), `KYC_DENIED` (422),
`TOKEN_NOT_ASSOCIATED` (422), `INVALID_INPUT` (400)

**HCS:** `TOKEN_TRANSFERRED` (yalnız başarılı transferde)

---

## `POST /api/ens-read` — ENS canlı config çözümü

**Request**

```json
{ "propertyId": "PROP-002" }
```

Sunucu `prop-002.<ENS_PARENT_NAME>` adını normalize edip Sepolia'dan çözer.

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

**Response 200 (RENTAL)** — aynı zarf, farklı alan seti:
`com.pprev.rental.escrowAccount` ve `com.pprev.rental.reqDeposit` vardır;
`propertyTokenId` ve `revenueTreasury` **yoktur**.

### Zorunlu alanlar (mode'a göre)

| Ortak (6) | SALE ek (2) | RENTAL ek (2) |
|---|---|---|
| `hedera.network` | `hedera.propertyTokenId` | `rental.escrowAccount` |
| `policy.hash` | `hedera.revenueTreasury` | `rental.reqDeposit` |
| `policy.version` | | |
| `verifier.publicKey` | | |
| `hedera.auditTopicId` | | |
| `property.id` | | |

İlgili sete göre eksik alan varsa → `ENS_CONFIG_INCOMPLETE` (422).

**Fallback:** ENS çözümü hata verir/timeout olursa yanıt `"source": "env-fallback"`
döner ve sunucu konsoluna `ENS config unavailable → env fallback` basılır.
Yanıt 60 saniye in-memory cache'lenir.

**Hatalar:** `ENS_CONFIG_INCOMPLETE` (422), `INVALID_INPUT` (400)

---

## `GET /api/audit?propertyId=PROP-002` — Mirror Node timeline

HCS mesajlarını Mirror Node'dan okur, base64 çözer, kronolojik döner.

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

Mirror gecikmesi normaldir; olay henüz görünmüyorsa liste kısa döner (hata değil).

---

## `POST /api/seed` — Demo state kurulumu (yalnız development)

`PROP-001`'i `TOKENIZED` state'te, geçerli `tokenId` ile store'a yazar; `buyer1`'e KYC
verir, `nokyc` hesabını token'a **associate eder ama KYC vermez** (altın sahne için şart).

**Response 200**

```json
{ "seeded": true, "properties": ["PROP-001"], "tokenId": "0.0.222111", "elapsedMs": 2400 }
```

## `POST /api/reset` — Store'u temizler (yalnız development)

```json
{ "reset": true }
```

Her ikisi de production'da `404` döner.

---

# Kiralama (RENTAL) endpoint'leri

## `POST /api/rental/list` — İlan

**Request**

```json
{
  "sellerSessionToken": "...",
  "propertyId": "PROP-003",
  "reqDeposit": 50,
  "lockWindowSeconds": 600
}
```

`reqDeposit` HBAR cinsinden. Landlord kapısı = Selfie session (satıcı onboarding'iyle aynı).

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

**Hatalar:** `SELLER_SESSION_REQUIRED` (401), `SELLER_SESSION_EXPIRED` (401),
`PROPERTY_NOT_FOUND` (404), `RENTAL_NOT_APPROVED` (422 — mülk `APPROVED` değil ya da
zaten `TOKENIZED`)

**HCS:** `RENTAL_LISTED`

---

## `POST /api/rental/apply` — Kiracı başvurusu

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

> `verify-tenant`, buyer action'ından **ayrıdır** — nullifier havuzu izole olsun ve aynı
> test kullanıcısı hem satış hem kiralama akışını gösterebilsin diye.

Predicate: yaş uygunluğu (World) + gelir eşiği (`income ≥ 3 × rent`, tam tutar ifşa edilmez).

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

**Hatalar:** `WORLD_PROOF_INVALID` (422), `WORLD_PROOF_REPLAY` (422),
`PROPERTY_NOT_FOUND` (404), `INVALID_INPUT` (400)

**HCS:** `RENTAL_APPLICATION` — payload yalnız predicate sonucunu taşır, tutar taşımaz.

---

## `POST /api/rental/engage` — Depozito kilidi (gerçek HBAR)

Landlord başvuruyu kabul eder; tenant'ın HBAR depozitosu escrow'a transfer edilir.

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

**Hatalar:** `NOT_LANDLORD` (403), `INSUFFICIENT_DEPOSIT` (422),
`RENTAL_NOT_ENGAGED` (422 — state `APPLIED` değil)

**HCS:** `RENTAL_ENGAGED`

---

## `POST /api/rental/settle` — Temiz iade

Yalnız landlord, yalnız `ENGAGED`, yalnız `now ≤ lockExpiresAt`.
Depozito **tenant'a geri** döner (kira depozitosu iadesi — landlord'a ödeme değil).

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

**Hatalar:** `NOT_LANDLORD` (403), `RENTAL_NOT_ENGAGED` (422), `LOCK_EXPIRED` (422)

**HCS:** `RENTAL_SETTLED`

---

## `POST /api/rental/expire` — Süre dolumu (iade + slash)

`now > lockExpiresAt` ve state `ENGAGED` ise **herkes** çağırabilir (permissionless).
Depozito tenant'a iade edilir **ve** landlord teminatından sabit oran kesilir.
`settle`'dan farkı budur: temiz iade değil, iade + landlord cezası.

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

**Hatalar:** `RENTAL_NOT_ENGAGED` (422), `LOCK_NOT_EXPIRED` (409 — süre dolmadan denendi)

**HCS:** `RENTAL_EXPIRED`

---

# Frontend metod adı ↔ path eşlemesi

`lib/mockApi.ts` ve `lib/realApi.ts` aynı interface'i uygular:

| Metod | Path |
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
