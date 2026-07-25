// CONTRACT-VERSION: 5
//
// PPREV — Mock API layer.
// A client-side simulation that mirrors docs/API.md exactly. As Recep's real
// endpoints go live, this gets swapped for `lib/realApi.ts` in Phase A6 — the
// interface stays identical.
//
// After every pull, compare the CONTRACT-VERSION number at the top of
// docs/API.md against the first line of this file; if they differ, update this
// file first.
//
// Privacy rule (docs/API.md §0): a raw World nullifier/proof, selfie/identity
// data, document bytes, salts, or private keys are never stored or logged here.

import { ApiRequestError } from "./api-types";
import type {
  PprevApiClient,
  PropertyState,
  RentalState,
  AuditEvent,
  Attestation,
  OnboardSellerInput,
  OnboardSellerResult,
  SubmitPropertyInput,
  SubmitPropertyResult,
  ListPendingVerificationsResult,
  DecideVerificationInput,
  DecideVerificationResult,
  TokenizeInput,
  TokenizeResult,
  RpSignatureInput,
  RpSignatureResult,
  VerifyBuyerInput,
  VerifyBuyerResult,
  BuyInput,
  BuyResult,
  ReadEnsInput,
  ReadEnsResult,
  ReadAuditResult,
  PropertyStatusResult,
  HealthResult,
  SeedResult,
  ResetResult,
  RentalListInput,
  RentalListResult,
  RentalApplyInput,
  RentalApplyResult,
  RentalEngageInput,
  RentalEngageResult,
  RentalSettleInput,
  RentalSettleResult,
  RentalExpireInput,
  RentalExpireResult,
} from "./api-types";

// ── Fake constants (shaped like real Hedera IDs; they don't need to exist on testnet) ──
const MOCK_TOPIC_ID = "0.0.111111";
const MOCK_OPERATOR = "0.0.100100"; // treasury / escrow / verifier-signed operations
const MOCK_BUYER1 = "0.0.200200";
const MOCK_BUYER2 = "0.0.300300";
const MOCK_NOKYC_ACCOUNT = "0.0.400400";
const MOCK_VERIFIER_PUBLIC_KEY =
  "302a300506032b6570032100" + "aa11bb22cc33dd44ee55ff6600112233445566778899aabbccddeeff0011";
const ATTESTATION_TTL_MS = 60 * 60 * 1000; // 1 hour, matches .env.example ATTESTATION_TTL_SECONDS
const SESSION_TTL_MS = 30 * 60 * 1000;
const FRACTIONAL_FEE_BPS = 200; // 2%
const RENTAL_SLASH_BPS = 1000; // 10%

function delay(ms = 350) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomHex(bytes: number) {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fakeTxId() {
  return `${MOCK_OPERATOR}@${Math.floor(Date.now() / 1000)}.${Math.floor(Math.random() * 999999999)}`;
}

function hashscanTx(txId: string) {
  return `https://hashscan.io/testnet/transaction/${encodeURIComponent(txId)}`;
}

function hashscanToken(tokenId: string) {
  return `https://hashscan.io/testnet/token/${tokenId}`;
}

function hashscanTopic(topicId: string) {
  return `https://hashscan.io/testnet/topic/${topicId}`;
}

/** Not a real document hash — mock-only, cosmetic "root" for the UI. */
function fakeDocumentRoot(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  const hex = (h >>> 0).toString(16).padStart(8, "0");
  return `0x${hex}${randomHex(12)}`;
}

// ── In-memory store (module scope; resets on full page reload — fine for a mock) ──

interface PropertyRecord {
  propertyId: string;
  displayName: string;
  city: string;
  sellerAccountId: string;
  tokenSymbol: string;
  state: PropertyState;
  documentRoot?: string;
  documentCount?: number;
  submittedAt?: string;
  files?: { name: string; type: string; sizeBytes: number }[];
  attestation?: Attestation;
  rejectReason?: string;
  tokenId?: string;
  events: AuditEvent[];
  ensMode: "SALE" | "RENTAL";
}

interface RentalRecord {
  listingId: string;
  propertyId: string;
  state: RentalState;
  reqDeposit: number;
  lockWindowSeconds: number;
  monthlyRent: number;
  landlordSessionToken: string;
  tenantAccountId?: string;
  lockExpiresAt?: number; // epoch ms
}

interface SessionRecord {
  token: string;
  expiresAt: number; // epoch ms
}

interface Store {
  properties: Map<string, PropertyRecord>;
  rentals: Map<string, RentalRecord>;
  sessions: Map<string, SessionRecord>;
  usedNullifiers: Set<string>;
  sequence: number;
  rentalCounter: number;
  adminSecret: string;
}

function freshStore(): Store {
  return {
    properties: new Map(),
    rentals: new Map(),
    sessions: new Map(),
    usedNullifiers: new Set(),
    sequence: 0,
    rentalCounter: 0,
    adminSecret: "",
  };
}

// Next dev fast-refresh can reset module state; hang it off globalThis so demo
// state survives component edits (only a full page reload clears it).
const g = globalThis as unknown as { __pprevMockStore?: Store };
const store = g.__pprevMockStore ?? (g.__pprevMockStore = freshStore());

function nextSequence(): number {
  store.sequence += 1;
  return store.sequence;
}

function pushEvent(property: PropertyRecord, eventType: string, payload: Record<string, unknown> = {}) {
  const seq = nextSequence();
  const now = new Date().toISOString();
  property.events.push({
    eventType,
    timestamp: now,
    // The real envelope carries both. `consensusTimestamp` is what a timeline must sort by;
    // omitting it from the mock is how a UI ends up sorting by the wrong field and only
    // finding out against a live topic, where the two genuinely differ.
    consensusTimestamp: now,
    propertyId: property.propertyId,
    sequenceNumber: seq,
    payload,
    explorerUrl: hashscanTopic(MOCK_TOPIC_ID),
  });
}

function getOrCreateProperty(propertyId: string, ensMode: "SALE" | "RENTAL" = "SALE"): PropertyRecord {
  let p = store.properties.get(propertyId);
  if (!p) {
    p = {
      propertyId,
      displayName: propertyId,
      city: "",
      sellerAccountId: "",
      tokenSymbol: "",
      state: "DRAFT",
      events: [],
      ensMode,
    };
    store.properties.set(propertyId, p);
  }
  return p;
}

function validSession(token: string | undefined): SessionRecord {
  if (!token) throw new ApiRequestError("SELLER_SESSION_REQUIRED", "Missing session token.", 401);
  const session = store.sessions.get(token);
  if (!session) throw new ApiRequestError("SELLER_SESSION_REQUIRED", "Session not found.", 401);
  if (session.expiresAt < Date.now()) {
    throw new ApiRequestError("SELLER_SESSION_EXPIRED", "Session expired — verify with Selfie again.", 401);
  }
  return session;
}

/**
 * The verifier panel's shared secret (`x-demo-admin-secret` on the real endpoints).
 *
 * The mock has nothing to compare against — there is no server env here — so any non-empty
 * value passes and an unset one is UNAUTHORIZED. That is the case worth reproducing:
 * `realApi` sends the header with an empty string until the operator types the secret in, so
 * a mock with no gate at all lets the review queue be built against a 200 the real server
 * will never return.
 */
function requireAdminSecret() {
  if (!store.adminSecret) {
    throw new ApiRequestError("UNAUTHORIZED", "Missing or invalid admin secret.", 401);
  }
}

/**
 * Mirrors `setDemoAdminSecret` in lib/realApi.ts, which is the one VerifierView calls. A
 * demo-day swap of a verifier method back to the mock has to call this one too, or the queue
 * answers UNAUTHORIZED for the rest of the demo with nothing on screen to explain why.
 */
export function setMockDemoAdminSecret(secret: string) {
  store.adminSecret = secret.trim();
}

function checkNullifierReplay(proof: unknown, action: string) {
  // Mock proof shape: { success: true, nullifier_hash?: string }. Never log the real proof.
  const p = proof as { success?: boolean; nullifier_hash?: string } | undefined;
  if (!p || p.success !== true) {
    throw new ApiRequestError("WORLD_PROOF_INVALID", "World proof could not be verified.", 422);
  }
  const nullifier = p.nullifier_hash ?? randomHex(16);
  const key = `${action}:${nullifier}`;
  if (store.usedNullifiers.has(key)) {
    throw new ApiRequestError("WORLD_PROOF_REPLAY", "This identity proof has already been used.", 422);
  }
  store.usedNullifiers.add(key);
}

// ── Implementation ───────────────────────────────────────────────────────

async function onboardSeller(input: OnboardSellerInput): Promise<OnboardSellerResult> {
  await delay();
  checkNullifierReplay(input.proof, input.action);
  const token = randomHex(32);
  const expiresAt = Date.now() + SESSION_TTL_MS;
  store.sessions.set(token, { token, expiresAt });
  return {
    onboarded: true,
    sellerSessionToken: token,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

async function submitProperty(input: SubmitPropertyInput): Promise<SubmitPropertyResult> {
  await delay(600);
  validSession(input.sellerSessionToken);

  if (input.files.length === 0 || input.files.length > 3) {
    throw new ApiRequestError("TOO_MANY_FILES", "You can upload at most 3 documents.", 400);
  }
  const allowed = new Set(["application/pdf", "image/png", "image/jpeg"]);
  for (const f of input.files) {
    if (!allowed.has(f.type)) {
      throw new ApiRequestError("UNSUPPORTED_FILE_TYPE", `Unsupported file type: ${f.type}`, 400);
    }
    const approxBytes = Math.floor((f.dataBase64.length * 3) / 4);
    if (approxBytes > 5 * 1024 * 1024) {
      throw new ApiRequestError("FILE_TOO_LARGE", `${f.name} exceeds the 5MB limit.`, 400);
    }
  }

  const property = getOrCreateProperty(input.propertyId, "SALE");
  property.displayName = input.displayName;
  property.city = input.city;
  property.sellerAccountId = input.sellerAccountId;
  property.tokenSymbol = input.tokenSymbol;
  property.state = "PENDING_REVIEW";
  property.documentRoot = fakeDocumentRoot(input.propertyId + input.files.map((f) => f.name).join(""));
  property.documentCount = input.files.length;
  property.submittedAt = new Date().toISOString();
  property.files = input.files.map((f) => ({
    name: f.name,
    type: f.type,
    sizeBytes: Math.floor((f.dataBase64.length * 3) / 4),
  }));

  // No SELLER_ONBOARDED here. The real server publishes it under `propertyId: "SELLER"`,
  // so it never appears in a property's timeline — a mock that adds it teaches the UI to
  // expect a first event that will not be there.
  const seq = nextSequence();
  property.events.push({
    eventType: "PROPERTY_SUBMITTED",
    timestamp: property.submittedAt,
    consensusTimestamp: property.submittedAt,
    propertyId: property.propertyId,
    sequenceNumber: seq,
    // No `city`. It is free text on a public permanent topic, and the real server strips it.
    payload: { documentRoot: property.documentRoot, documentCount: property.documentCount },
    explorerUrl: hashscanTopic(MOCK_TOPIC_ID),
  });

  return {
    propertyId: property.propertyId,
    state: "PENDING_REVIEW",
    documentRoot: property.documentRoot,
    documentCount: property.documentCount,
    hcs: { topicId: MOCK_TOPIC_ID, sequenceNumber: seq },
  };
}

async function listPendingVerifications(): Promise<ListPendingVerificationsResult> {
  await delay(300);
  requireAdminSecret();
  const pending = Array.from(store.properties.values())
    .filter((p) => p.state === "PENDING_REVIEW")
    .map((p) => ({
      propertyId: p.propertyId,
      displayName: p.displayName,
      city: p.city,
      sellerAccountId: p.sellerAccountId,
      submittedAt: p.submittedAt!,
      documentRoot: p.documentRoot!,
      files: p.files ?? [],
    }));
  return { pending };
}

async function decideVerification(input: DecideVerificationInput): Promise<DecideVerificationResult> {
  await delay(500);
  const property = store.properties.get(input.propertyId);
  if (!property) throw new ApiRequestError("PROPERTY_NOT_FOUND", "Property not found.", 404);

  // Deciding an already-decided property signs a second attestation with a fresh expiry,
  // which quietly extends the first one past the freshness window tokenize relies on.
  if (property.state !== "PENDING_REVIEW") {
    throw new ApiRequestError(
      "OWNERSHIP_PENDING",
      `Only a property awaiting review can be decided; this one is ${property.state}.`,
      422,
    );
  }

  if (input.decision === "REJECTED") {
    const reason = input.reason ?? "Not specified";
    property.state = "REJECTED";
    property.rejectReason = reason;
    pushEvent(property, "OWNERSHIP_REJECTED", { reason });
    return { propertyId: property.propertyId, state: "REJECTED", reason };
  }

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + ATTESTATION_TTL_MS);
  const attestation: Attestation = {
    propertyId: property.propertyId,
    sellerAccountId: property.sellerAccountId,
    documentRoot: property.documentRoot!,
    decision: "APPROVED",
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    signature: `mock-ed25519-${randomHex(32)}`,
    verifierPublicKey: MOCK_VERIFIER_PUBLIC_KEY,
  };
  property.state = "APPROVED";
  property.attestation = attestation;
  pushEvent(property, "OWNERSHIP_APPROVED", {});

  return { propertyId: property.propertyId, state: "APPROVED", attestation };
}

async function tokenize(input: TokenizeInput): Promise<TokenizeResult> {
  await delay(800);
  const property = store.properties.get(input.propertyId);
  if (!property) throw new ApiRequestError("PROPERTY_NOT_FOUND", "Property not found.", 404);

  if (property.state === "TOKENIZED") {
    throw new ApiRequestError(
      "ALREADY_TOKENIZED",
      `This property is already tokenized: ${property.tokenId}`,
      409,
    );
  }
  if (property.state === "REJECTED") {
    throw new ApiRequestError("OWNERSHIP_REJECTED", "This property was rejected by the verifier.", 422);
  }
  if (property.state !== "APPROVED" || !property.attestation) {
    throw new ApiRequestError("OWNERSHIP_PENDING", "This property has not been approved yet.", 422);
  }

  const a = property.attestation;
  const incoming = input.attestation;
  const tamperMatch =
    a.propertyId === incoming.propertyId &&
    a.sellerAccountId === incoming.sellerAccountId &&
    a.documentRoot === incoming.documentRoot &&
    a.issuedAt === incoming.issuedAt &&
    a.signature === incoming.signature;
  if (!tamperMatch) {
    throw new ApiRequestError("ATTESTATION_INVALID", "Signature check failed — the attestation was tampered with.", 422);
  }
  if (new Date(a.expiresAt).getTime() < Date.now()) {
    throw new ApiRequestError("ATTESTATION_EXPIRED", "Attestation expired — ask the verifier to re-approve.", 422);
  }

  const tokenId = `0.0.${500000 + Math.floor(Math.random() * 90000)}`;
  property.state = "TOKENIZED";
  property.tokenId = tokenId;
  pushEvent(property, "PROPERTY_TOKEN_CREATED", { tokenId });

  return {
    propertyId: property.propertyId,
    state: "TOKENIZED",
    tokenId,
    totalSupply: 1000,
    decimals: 0,
    fractionalFeeBps: FRACTIONAL_FEE_BPS,
    hashscanUrl: hashscanToken(tokenId),
  };
}

async function getRpSignature(input: RpSignatureInput): Promise<RpSignatureResult> {
  await delay(200);
  const allowed = new Set(["onboard-seller", "verify-buyer", "verify-tenant"]);
  if (!allowed.has(input.action)) {
    throw new ApiRequestError("INVALID_INPUT", `Unknown action: ${input.action}`, 400);
  }
  const now = Math.floor(Date.now() / 1000);
  return {
    appId: "app_mock00000000000000000000000000",
    rpId: "rp_mock0000000000000000",
    action: input.action,
    environment: "staging",
    signal: input.signal ?? null,
    rpContext: {
      sig: `0x${randomHex(32)}`,
      nonce: `0x${randomHex(16)}`,
      created_at: now,
      expires_at: now + 300,
    },
  };
}

async function verifyBuyerAndGrantKyc(input: VerifyBuyerInput): Promise<VerifyBuyerResult> {
  await delay(700);
  checkNullifierReplay(input.proof, input.action);
  const property = store.properties.get(input.propertyId);
  if (!property || !property.tokenId) {
    throw new ApiRequestError("PROPERTY_NOT_FOUND", "This property has not been tokenized yet.", 404);
  }
  pushEvent(property, "BUYER_ELIGIBILITY_CONFIRMED", { buyerAccountId: input.buyerAccountId });
  pushEvent(property, "KYC_GRANTED", { buyerAccountId: input.buyerAccountId });

  return {
    eligible: true,
    kycGranted: true,
    tokenId: property.tokenId,
    buyerAccountId: input.buyerAccountId,
    associationTxId: fakeTxId(),
    kycTxId: fakeTxId(),
    hashscanUrl: hashscanTx(fakeTxId()),
  };
}

async function buy(input: BuyInput): Promise<BuyResult> {
  await delay(900);
  const property = store.properties.get(input.propertyId);
  if (!property || !property.tokenId) {
    throw new ApiRequestError("PROPERTY_NOT_FOUND", "This property has not been tokenized yet.", 404);
  }

  // Only `primary` reads this field — the other two modes move shares between fixed demo
  // accounts — so the empty string an untouched form field sends is only a problem here. The
  // real server coerces `""` to "not provided" and refuses exactly this case.
  if (input.mode === "primary" && !input.buyerAccountId) {
    throw new ApiRequestError("INVALID_INPUT", "buyerAccountId is required for a primary transfer.", 400);
  }

  if (input.mode === "nokyc") {
    // ⚠ GOLDEN MOMENT — `code` is stable (KYC_DENIED); `hederaStatus` is for display.
    throw new ApiRequestError(
      "KYC_DENIED",
      "Hedera rejected the transfer: the receiving account has no KYC grant for this token.",
      422,
      "ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN",
    );
  }

  const isSecondary = input.mode === "secondary";
  const from = isSecondary ? MOCK_BUYER1 : MOCK_OPERATOR;
  const to = isSecondary ? MOCK_BUYER2 : input.buyerAccountId;
  // floor, not round — the chain computes max(1, floor(amount * 2%)), and the two diverge
  // at 75 shares (round gives 2, the chain gives 1), which also flips feeFloorApplied.
  const fee = isSecondary
    ? Math.max(1, Math.floor(input.amount * (FRACTIONAL_FEE_BPS / 10000)))
    : 0;
  const txId = fakeTxId();

  pushEvent(property, "TOKEN_TRANSFERRED", { mode: input.mode, amount: input.amount });

  return {
    transferred: true,
    tokenId: property.tokenId,
    amount: input.amount,
    // Fee is inclusive: the sender is debited `amount`, the recipient credited this.
    netAmount: input.amount - fee,
    // The real fee is `max(1, floor(amount * 2%))`, so below 50 shares the floor dominates
    // and the effective rate is not 2% — at 1 share the recipient gets nothing. The mock
    // reproduces it so the UI is built against the same edge the chain will show.
    effectiveFeeRate: input.amount > 0 ? Number((fee / input.amount).toFixed(4)) : 0,
    feeFloorApplied: fee > 0 && fee / input.amount > FRACTIONAL_FEE_BPS / 10000 + 1e-9,
    from,
    to,
    mode: input.mode,
    transactionId: txId,
    assessedCustomFees: fee > 0 ? [{ amount: fee, tokenId: property.tokenId, collectorAccountId: MOCK_OPERATOR }] : [],
    hashscanUrl: hashscanTx(txId),
  };
}

async function readEns(input: ReadEnsInput): Promise<ReadEnsResult> {
  await delay(450);
  const rental = Array.from(store.rentals.values()).find((r) => r.propertyId === input.propertyId);
  const property = store.properties.get(input.propertyId);
  if (!property && !rental) {
    throw new ApiRequestError("ENS_CONFIG_INCOMPLETE", "No ENS record found for this property.", 422);
  }
  const mode: "SALE" | "RENTAL" = rental ? "RENTAL" : "SALE";
  const common = {
    "com.pprev.mode": mode,
    "com.pprev.hedera.network": "testnet",
    "com.pprev.hedera.auditTopicId": MOCK_TOPIC_ID,
    "com.pprev.policy.hash": `0x${randomHex(16)}`,
    "com.pprev.policy.version": "1",
    "com.pprev.verifier.publicKey": MOCK_VERIFIER_PUBLIC_KEY,
    "com.pprev.property.id": input.propertyId,
  };
  const records =
    mode === "SALE"
      ? {
          ...common,
          "com.pprev.hedera.propertyTokenId": property?.tokenId ?? "0.0.pending",
          "com.pprev.hedera.revenueTreasury": MOCK_OPERATOR,
        }
      : {
          ...common,
          "com.pprev.rental.escrowAccount": MOCK_OPERATOR,
          "com.pprev.rental.reqDeposit": String(rental?.reqDeposit ?? 0),
        };

  return {
    name: `prop-${input.propertyId.split("-")[1] ?? input.propertyId}.pprevlisbon.eth`,
    mode,
    source: "ens",
    network: "testnet",
    resolvedAt: new Date().toISOString(),
    records,
  };
}

async function readAudit(propertyId: string): Promise<ReadAuditResult> {
  await delay(400);
  const property = store.properties.get(propertyId);
  const events = property?.events ?? [];
  return {
    propertyId,
    topicId: MOCK_TOPIC_ID,
    source: "mirror-node",
    events,
    eventCount: events.length,
    token: property?.tokenId
      ? {
          tokenId: property.tokenId,
          name: property.displayName,
          symbol: property.tokenSymbol,
          totalSupply: "1000",
          decimals: 0,
        }
      : null,
    links: {
      topic: hashscanTopic(MOCK_TOPIC_ID),
      // `null`, not absent — the real server always sends the key.
      token: property?.tokenId ? hashscanToken(property.tokenId) : null,
      // The "curl it yourself" link. It carries the whole verifiability claim, so a mock
      // that omits it lets a UI ship without ever showing it.
      mirrorTopic: `https://testnet.mirrornode.hedera.com/api/v1/topics/${MOCK_TOPIC_ID}/messages`,
    },
  };
}

async function health(): Promise<HealthResult> {
  await delay(80);
  return {
    ok: true,
    time: new Date().toISOString(),
    world: "dev-fallback",
    ens: "pprevlisbon.eth",
    auditTopicId: MOCK_TOPIC_ID,
    seededProperties: store.properties.size,
    droppedAuditEvents: [],
    demoAccounts: {
      buyer1: MOCK_BUYER1,
      buyer2: MOCK_BUYER2,
      nokyc: MOCK_NOKYC_ACCOUNT,
      operator: MOCK_OPERATOR,
    },
  };
}

async function seed(): Promise<SeedResult> {
  const start = Date.now();
  await delay(400);
  const tokenId = "0.0.222111";
  const property: PropertyRecord = {
    propertyId: "PROP-001",
    displayName: "Baixa seed flat (demo)",
    city: "Lisbon",
    sellerAccountId: MOCK_OPERATOR,
    tokenSymbol: "PPRV1",
    state: "TOKENIZED",
    documentRoot: fakeDocumentRoot("PROP-001-seed"),
    documentCount: 2,
    submittedAt: new Date(start - 60000).toISOString(),
    files: [
      { name: "title-deed.pdf", type: "application/pdf", sizeBytes: 214233 },
      { name: "occupancy-permit.pdf", type: "application/pdf", sizeBytes: 108420 },
    ],
    tokenId,
    events: [],
    ensMode: "SALE",
  };
  store.properties.set("PROP-001", property);
  pushEvent(property, "SELLER_ONBOARDED", {});
  pushEvent(property, "PROPERTY_SUBMITTED", { documentRoot: property.documentRoot, documentCount: 2 });
  pushEvent(property, "OWNERSHIP_APPROVED", {});
  pushEvent(property, "PROPERTY_TOKEN_CREATED", { tokenId });

  // PROP-003 is the property the rental flow lists: APPROVED and deliberately never
  // tokenized, because renting an asset whose shares are already sold would create two claims
  // on it. Seeding it is what removed an unwritten ordering dependency — the rental scene
  // used to work only if someone had run submit + approve by hand first, so after every
  // restart it died with PROPERTY_NOT_FOUND. No attestation, as on the real server: without
  // one tokenize refuses, which is what keeps "never tokenized" true rather than intended.
  const rentalProperty: PropertyRecord = {
    propertyId: "PROP-003",
    displayName: "Graca Rental",
    city: "Lisbon",
    sellerAccountId: MOCK_OPERATOR,
    tokenSymbol: "GRCA",
    state: "APPROVED",
    documentCount: 0,
    submittedAt: new Date(start - 60000).toISOString(),
    files: [],
    events: [],
    ensMode: "SALE",
  };
  store.properties.set("PROP-003", rentalProperty);

  return {
    seeded: true,
    properties: ["PROP-001", "PROP-003"],
    tokenId,
    // The mock has no balances to move, so the targets are always met. The real backend
    // re-reads them and can come back `ok: false` when the reservoir is exhausted — branch
    // on `ok`, do not assume it.
    rebalanced: {
      buyer1: { sent: 0, reached: 100, short: 0 },
      treasury: { sent: 0, reached: 300, short: 0 },
      ok: true,
    },
    preparedTokens: [],
    elapsedMs: Date.now() - start,
  };
}

/**
 * Current server-side view of one property. The seller UI's "Refresh status" reads `state`
 * from here — never by scanning the audit trail for an event name, which asks a question
 * about the topic rather than about this property. `rejectionReason` exists only here: only
 * a hash of the reviewer's text goes on-chain, because free text is where personal data ends
 * up.
 */
async function getProperty(
  propertyId: string,
  sellerSessionToken: string,
): Promise<PropertyStatusResult> {
  await delay(200);
  validSession(sellerSessionToken);
  const property = store.properties.get(propertyId);
  if (!property) throw new ApiRequestError("PROPERTY_NOT_FOUND", "Property not found.", 404);

  return {
    propertyId: property.propertyId,
    displayName: property.displayName,
    city: property.city,
    sellerAccountId: property.sellerAccountId,
    tokenSymbol: property.tokenSymbol,
    state: property.state,
    createdAt: property.submittedAt ?? new Date().toISOString(),
    submittedAt: property.submittedAt ?? null,
    decidedAt: property.state === "PENDING_REVIEW" ? null : (property.submittedAt ?? null),
    rejectionReason: property.rejectReason ?? null,
    documentRoot: property.documentRoot ?? null,
    documentCount: property.documentCount ?? 0,
    // A boolean, never the attestation: that signature is the only credential tokenize
    // demands. The seller UI already holds it from the decision response.
    hasAttestation: Boolean(property.attestation),
    attestationExpiresAt: property.attestation?.expiresAt ?? null,
    tokenId: property.tokenId ?? null,
    hashscanUrl: property.tokenId
      ? `https://hashscan.io/testnet/token/${property.tokenId}`
      : null,
    files: property.files ?? [],
  };
}

async function reset(): Promise<ResetResult> {
  await delay(200);
  const fresh = freshStore();
  store.properties = fresh.properties;
  store.rentals = fresh.rentals;
  store.sessions = fresh.sessions;
  store.usedNullifiers = fresh.usedNullifiers;
  store.sequence = 0;
  store.rentalCounter = 0;
  return { reset: true };
}

// ── RENTAL ───────────────────────────────────────────────────────────────

async function rentalList(input: RentalListInput): Promise<RentalListResult> {
  await delay(500);
  validSession(input.sellerSessionToken);
  const property = store.properties.get(input.propertyId);
  if (!property || property.state !== "APPROVED") {
    throw new ApiRequestError(
      "RENTAL_NOT_APPROVED",
      "This property is not eligible for renting (must be APPROVED and not tokenized).",
      422,
    );
  }
  property.ensMode = "RENTAL";
  store.rentalCounter += 1;
  const listingId = `RENT-${String(store.rentalCounter).padStart(3, "0")}`;
  const rental: RentalRecord = {
    listingId,
    propertyId: input.propertyId,
    state: "LISTED",
    reqDeposit: input.reqDeposit,
    lockWindowSeconds: input.lockWindowSeconds,
    monthlyRent: input.monthlyRent,
    landlordSessionToken: input.sellerSessionToken,
  };
  store.rentals.set(listingId, rental);
  pushEvent(property, "RENTAL_LISTED", { listingId, reqDeposit: input.reqDeposit });

  return {
    listingId,
    propertyId: input.propertyId,
    state: "LISTED",
    reqDeposit: input.reqDeposit,
    lockWindowSeconds: input.lockWindowSeconds,
    monthlyRent: input.monthlyRent,
    escrowAccountId: MOCK_OPERATOR,
  };
}

async function rentalApply(input: RentalApplyInput): Promise<RentalApplyResult> {
  await delay(600);
  const rental = store.rentals.get(input.listingId);
  if (!rental) throw new ApiRequestError("PROPERTY_NOT_FOUND", "Listing not found.", 404);
  // Ahead of the proof, in the real route's order. A nullifier is derived from (identity,
  // action) and is the same value every time one person repeats one check, so spending it on
  // an application the state machine was always going to refuse leaves that tenant unable to
  // apply at all until someone clears the replay store.
  if (rental.state !== "LISTED") {
    throw new ApiRequestError(
      "RENTAL_NOT_ENGAGED",
      `This listing is ${rental.state}; only a LISTED property accepts applications.`,
      422,
    );
  }
  checkNullifierReplay(input.proof, input.action);

  rental.state = "APPLIED";
  rental.tenantAccountId = input.tenantAccountId;
  const property = store.properties.get(rental.propertyId);
  if (property) {
    pushEvent(property, "RENTAL_APPLICATION", {
      listingId: rental.listingId,
      ageEligible: true,
      // `thresholdMet`, not `incomeThresholdMet` — the real payload guard drops any key
      // matching /income/, and it silently deleted this whole event twice.
      thresholdMet: true,
      requiredMonthlyEarnings: rental.monthlyRent * 3,
    });
  }

  return {
    listingId: rental.listingId,
    state: "APPLIED",
    tenantAccountId: input.tenantAccountId,
    predicate: {
      ageEligible: true,
      incomeThresholdMet: true,
      thresholdRule: "income >= 3x rent",
      // Derived from the LISTING's rent, not from anything the applicant sends.
      requiredMonthlyEarnings: rental.monthlyRent * 3,
      // Asserted, never proven — the real backend returns false here too.
      incomeProven: false,
    },
  };
}

async function rentalEngage(input: RentalEngageInput): Promise<RentalEngageResult> {
  await delay(800);
  // The session is checked before anything else, as on the real route. Without it a missing
  // or expired Selfie session arrived as NOT_LANDLORD 403, so the UI's 401 handling — the
  // "re-run the Selfie Check" path — was written against a mock that never produced one.
  validSession(input.sellerSessionToken);
  const rental = store.rentals.get(input.listingId);
  if (!rental) throw new ApiRequestError("PROPERTY_NOT_FOUND", "Listing not found.", 404);
  if (rental.landlordSessionToken !== input.sellerSessionToken) {
    throw new ApiRequestError("NOT_LANDLORD", "You are not the owner of this listing.", 403);
  }
  if (rental.state !== "APPLIED") {
    throw new ApiRequestError("RENTAL_NOT_ENGAGED", "This listing is not awaiting an application decision.", 422);
  }

  rental.state = "ENGAGED";
  rental.lockExpiresAt = Date.now() + rental.lockWindowSeconds * 1000;
  const txId = fakeTxId();
  const property = store.properties.get(rental.propertyId);
  if (property) pushEvent(property, "RENTAL_ENGAGED", { listingId: rental.listingId, deposit: rental.reqDeposit });

  return {
    listingId: rental.listingId,
    state: "ENGAGED",
    deposit: rental.reqDeposit,
    escrowAccountId: MOCK_OPERATOR,
    lockExpiresAt: new Date(rental.lockExpiresAt).toISOString(),
    transactionId: txId,
    hashscanUrl: hashscanTx(txId),
  };
}

async function rentalSettle(input: RentalSettleInput): Promise<RentalSettleResult> {
  await delay(700);
  // Session first, as in rentalEngage: an expired session is 401, never NOT_LANDLORD. The
  // rental flow is where it actually happens — one session has to survive list → apply →
  // engage → the whole lock window → settle.
  validSession(input.sellerSessionToken);
  const rental = store.rentals.get(input.listingId);
  if (!rental) throw new ApiRequestError("PROPERTY_NOT_FOUND", "Listing not found.", 404);
  if (rental.landlordSessionToken !== input.sellerSessionToken) {
    throw new ApiRequestError("NOT_LANDLORD", "You are not the owner of this listing.", 403);
  }
  if (rental.state !== "ENGAGED") {
    throw new ApiRequestError("RENTAL_NOT_ENGAGED", "This listing is not in the ENGAGED state.", 422);
  }
  if (rental.lockExpiresAt && Date.now() > rental.lockExpiresAt) {
    throw new ApiRequestError("LOCK_EXPIRED", "The lock window has passed — call expire instead of settle.", 422);
  }

  rental.state = "SETTLED";
  const txId = fakeTxId();
  const property = store.properties.get(rental.propertyId);
  if (property) pushEvent(property, "RENTAL_SETTLED", { listingId: rental.listingId, refunded: rental.reqDeposit });

  return {
    listingId: rental.listingId,
    state: "SETTLED",
    refunded: rental.reqDeposit,
    to: rental.tenantAccountId ?? MOCK_BUYER1,
    slashed: 0,
    transactionId: txId,
    hashscanUrl: hashscanTx(txId),
  };
}

async function rentalExpire(input: RentalExpireInput): Promise<RentalExpireResult> {
  await delay(700);
  const rental = store.rentals.get(input.listingId);
  if (!rental) throw new ApiRequestError("PROPERTY_NOT_FOUND", "Listing not found.", 404);
  if (rental.state !== "ENGAGED") {
    throw new ApiRequestError("RENTAL_NOT_ENGAGED", "This listing is not in the ENGAGED state.", 422);
  }
  if (!rental.lockExpiresAt || Date.now() <= rental.lockExpiresAt) {
    throw new ApiRequestError("LOCK_NOT_EXPIRED", "The lock window has not passed yet.", 409);
  }

  rental.state = "EXPIRED";
  // Floor to whole tinybars, no minimum. The real rule is 10% exactly, so a 5 ℏ deposit
  // slashes 0.5 — a `Math.max(1, …)` here made the mock disagree with the number
  // docs/API.md works through and with what HashScan shows.
  const slashed =
    Math.floor(rental.reqDeposit * (RENTAL_SLASH_BPS / 10000) * 1e8) / 1e8;
  const txId = fakeTxId();
  const property = store.properties.get(rental.propertyId);
  if (property) {
    pushEvent(property, "RENTAL_EXPIRED", { listingId: rental.listingId, refunded: rental.reqDeposit, slashed });
  }

  return {
    listingId: rental.listingId,
    state: "EXPIRED",
    refunded: rental.reqDeposit,
    to: rental.tenantAccountId ?? MOCK_BUYER1,
    slashed,
    slashRateBps: RENTAL_SLASH_BPS,
    transactionId: txId,
    hashscanUrl: hashscanTx(txId),
  };
}

export const mockApi: PprevApiClient = {
  onboardSeller,
  submitProperty,
  listPendingVerifications,
  decideVerification,
  tokenize,
  getRpSignature,
  verifyBuyerAndGrantKyc,
  buy,
  readEns,
  readAudit,
  getProperty,
  health,
  seed,
  reset,
  rentalList,
  rentalApply,
  rentalEngage,
  rentalSettle,
  rentalExpire,
};

export { ApiRequestError } from "./api-types";

/**
 * ⚠ DEMO-ONLY HELPER — not part of the official contract.
 * docs/API.md only returns the attestation from `decideVerification`; in the real
 * world Verifier and Seller are different people/sessions, so how the Seller gets
 * hold of the approved attestation (a notification? a dedicated GET endpoint?) is
 * something to clarify with Recep. In this single-page demo all three panels live
 * in the same browser, so we just read it back from the store. This may not have
 * an equivalent once we move to the real API in Phase A6 — ask Recep how the
 * seller is supposed to obtain the attestation for tokenize.
 */
export function peekMockAttestation(propertyId: string): Attestation | undefined {
  return store.properties.get(propertyId)?.attestation;
}

export function peekMockPropertyState(propertyId: string): PropertyState | undefined {
  return store.properties.get(propertyId)?.state;
}

export function peekMockRejectReason(propertyId: string): string | undefined {
  return store.properties.get(propertyId)?.rejectReason;
}
