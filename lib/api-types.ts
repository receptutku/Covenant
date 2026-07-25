// PPREV — Shared API types (mock and real implementations both use these).
// Source of truth: docs/API.md — CONTRACT-VERSION: 5
// Keep this in sync with the version number at the top of docs/API.md.

export type PropertyState =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "TOKENIZED";

export type RentalState = "LISTED" | "APPLIED" | "ENGAGED" | "SETTLED" | "EXPIRED";

export type EnsMode = "SALE" | "RENTAL";

export type AllowedFileType = "application/pdf" | "image/png" | "image/jpeg";

/** docs/API.md §1 — closed list; adding a new code bumps the contract version. */
export type ApiErrorCode =
  | "SELLER_SESSION_REQUIRED"
  | "SELLER_SESSION_EXPIRED"
  | "TOO_MANY_FILES"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FILE_TYPE"
  | "PROPERTY_NOT_FOUND"
  | "OWNERSHIP_PENDING"
  | "OWNERSHIP_REJECTED"
  | "ATTESTATION_INVALID"
  | "ATTESTATION_EXPIRED"
  | "ALREADY_TOKENIZED"
  | "TOKEN_NOT_ASSOCIATED"
  | "KYC_DENIED"
  | "WORLD_PROOF_INVALID"
  | "WORLD_PROOF_REPLAY"
  | "ENS_CONFIG_INCOMPLETE"
  | "RENTAL_NOT_APPROVED"
  | "RENTAL_NOT_ENGAGED"
  | "LOCK_EXPIRED"
  | "LOCK_NOT_EXPIRED"
  | "INSUFFICIENT_DEPOSIT"
  | "NOT_LANDLORD"
  | "INVALID_INPUT"
  | "UNAUTHORIZED"
  | "INTERNAL_ERROR";

/**
 * Every error response is wrapped in this shape (docs/API.md §0).
 * UI logic only ever reads `code`; `hederaStatus` is display-only (KYC_DENIED golden scene).
 */
export class ApiRequestError extends Error {
  code: ApiErrorCode;
  status: number;
  hederaStatus?: string;

  constructor(code: ApiErrorCode, message: string, status = 400, hederaStatus?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.status = status;
    this.hederaStatus = hederaStatus;
  }
}

export interface AuditEvent {
  eventType: string;
  timestamp: string;
  sequenceNumber: number;
  payload: Record<string, unknown>;
  explorerUrl: string;
}

export interface Attestation {
  propertyId: string;
  sellerAccountId: string;
  documentRoot: string;
  decision: "APPROVED";
  issuedAt: string;
  expiresAt: string;
  signature: string;
  verifierPublicKey: string;
}

export interface UploadedFileInput {
  name: string;
  type: AllowedFileType;
  dataBase64: string;
}

export interface FileMeta {
  name: string;
  type: string;
  sizeBytes: number;
}

// ── onboardSeller ──────────────────────────────────────────────────────────
export interface OnboardSellerInput {
  proof: unknown;
  action: "onboard-seller";
}
export interface OnboardSellerResult {
  onboarded: true;
  sellerSessionToken: string;
  expiresAt: string;
}

// ── submitProperty (attest) ─────────────────────────────────────────────────
export interface SubmitPropertyInput {
  sellerSessionToken: string;
  propertyId: string;
  displayName: string;
  city: string;
  sellerAccountId: string;
  tokenSymbol: string;
  files: UploadedFileInput[];
}
export interface SubmitPropertyResult {
  propertyId: string;
  state: "PENDING_REVIEW";
  documentRoot: string;
  documentCount: number;
  hcs: { topicId: string; sequenceNumber: number };
}

// ── getProperty (GET /api/property?propertyId=…) ─────────────────────────────
/**
 * The server's CURRENT view of one property — what "Refresh status" should call.
 * Requires `x-seller-session`.
 *
 * Do not derive state from the HCS timeline: that is the record of what happened, it is
 * public, and scanning it for an event name answers a question about the topic rather than
 * about this property. `rejectionReason` exists ONLY here — only a hash of it goes on-chain,
 * because a reviewer's free text is the natural place for personal data.
 */
export interface PropertyStatusResult {
  propertyId: string;
  displayName: string;
  city: string;
  sellerAccountId: string;
  tokenSymbol: string;
  state: PropertyState;
  createdAt: string;
  submittedAt: string | null;
  decidedAt: string | null;
  /** The reviewer's full text. Never published on-chain. */
  rejectionReason: string | null;
  documentRoot: string | null;
  documentCount: number;
  /**
   * Whether an approval exists — never the approval itself. That signature is the only
   * credential `/api/tokenize` demands; the seller's UI already holds it from the decision
   * response.
   */
  hasAttestation: boolean;
  attestationExpiresAt: string | null;
  tokenId: string | null;
  hashscanUrl: string | null;
  files: FileMeta[];
}

// ── listPendingVerifications ────────────────────────────────────────────────
export interface PendingVerificationItem {
  propertyId: string;
  displayName: string;
  city: string;
  sellerAccountId: string;
  submittedAt: string;
  documentRoot: string;
  files: FileMeta[];
}
export interface ListPendingVerificationsResult {
  pending: PendingVerificationItem[];
}

// ── decideVerification ──────────────────────────────────────────────────────
export interface DecideVerificationInput {
  propertyId: string;
  decision: "APPROVED" | "REJECTED";
  reason?: string | null;
}
export type DecideVerificationResult =
  | { propertyId: string; state: "APPROVED"; attestation: Attestation }
  | { propertyId: string; state: "REJECTED"; reason: string };

// ── tokenize ─────────────────────────────────────────────────────────────────
export interface TokenizeInput {
  propertyId: string;
  attestation: Attestation;
}
export interface TokenizeResult {
  propertyId: string;
  state: "TOKENIZED";
  tokenId: string;
  totalSupply: number;
  decimals: number;
  fractionalFeeBps: number;
  hashscanUrl: string;
}

// ── getRpSignature (World ID 4.0) ───────────────────────────────────────────
export type WorldAction = "onboard-seller" | "verify-buyer" | "verify-tenant";
export interface RpSignatureInput {
  action: WorldAction;
  signal: string;
}
export interface RpContext {
  sig: string;
  nonce: string;
  created_at: number;
  expires_at: number;
}
export interface RpSignatureResult {
  appId: string;
  rpId: string;
  action: string;
  environment: "staging" | "production";
  signal: string;
  rpContext: RpContext;
}

// ── verifyBuyerAndGrantKyc (kyc) ────────────────────────────────────────────
export interface VerifyBuyerInput {
  propertyId: string;
  buyerAccountId: string;
  proof: unknown;
  action: "verify-buyer";
}
export interface VerifyBuyerResult {
  eligible: true;
  kycGranted: true;
  tokenId: string;
  buyerAccountId: string;
  associationTxId: string;
  kycTxId: string;
  hashscanUrl: string;
}

// ── buy ───────────────────────────────────────────────────────────────────
export type BuyMode = "primary" | "secondary" | "nokyc";
export interface BuyInput {
  propertyId: string;
  mode: BuyMode;
  buyerAccountId: string;
  amount: number;
}
export interface AssessedFee {
  amount: number;
  tokenId: string;
  collectorAccountId: string;
}
export interface BuyResult {
  transferred: true;
  tokenId: string;
  /** Debited from the sender. */
  amount: number;
  /**
   * Credited to the recipient: `amount − Σ assessedCustomFees`. The 2% fractional
   * fee is INCLUSIVE, so a secondary transfer of 100 lands as 98. Show this next
   * to the recipient — quoting `amount` there contradicts Mirror Node's own
   * transfer list for the same transaction.
   */
  netAmount: number;
  /**
   * `feeTotal / amount`, to 4 decimal places. The on-chain fee is
   * `max(1, floor(amount * 2%))` and shares are whole units, so below 50 the floor
   * dominates: 10 shares are charged 10%, and 1 share is charged everything.
   */
  effectiveFeeRate: number;
  /**
   * `true` when the floor pushed the effective rate above 2%.
   * **Do not render the string "2% fee" unless this is `false`.**
   */
  feeFloorApplied: boolean;
  from: string;
  to: string;
  mode: BuyMode;
  transactionId: string;
  assessedCustomFees: AssessedFee[];
  hashscanUrl: string;
}

// ── readEns ──────────────────────────────────────────────────────────────
export interface ReadEnsInput {
  propertyId: string;
}
export interface ReadEnsResult {
  name: string;
  mode: EnsMode;
  source: "ens" | "env-fallback";
  network: string;
  resolvedAt: string;
  records: Record<string, string>;
}

// ── readAudit ────────────────────────────────────────────────────────────
export interface ReadAuditResult {
  propertyId: string;
  topicId: string;
  source: "mirror-node";
  events: AuditEvent[];
  links: Record<string, string>;
}

// ── seed / reset ─────────────────────────────────────────────────────────
export interface SeedResult {
  seeded: true;
  properties: string[];
  tokenId: string;
  /**
   * Where the shares ended up after seed moved them back into position. `reached` is the
   * balance re-read afterwards, not the amount sent — the fee is inclusive, so those differ.
   * When `ok` is `false` the reservoir is exhausted and the secondary scene will fail.
   */
  rebalanced: {
    buyer1: { sent: number; reached: number; short: number };
    treasury: { sent: number; reached: number; short: number };
    ok: boolean;
  };
  /** propertyIds of other tokenized properties whose token relationships were repaired. */
  preparedTokens: string[];
  elapsedMs: number;
}
export interface ResetResult {
  reset: true;
}

// ── health ───────────────────────────────────────────────────────────────
/**
 * Public identifiers, no auth, no chain calls. `demoAccounts` is the only
 * trustworthy source for the buyer/nokyc account ids — hard-coding them once
 * cost us an hour of `TOKEN_NOT_ASSOCIATED` failures against accounts that did
 * not exist. Any entry may be `null` if the matching env var is unset.
 */
export interface HealthResult {
  ok: boolean;
  time: string;
  world: "configured" | "dev-fallback";
  ens: string | null;
  auditTopicId: string | null;
  seededProperties: number;
  demoAccounts: {
    buyer1: string | null;
    buyer2: string | null;
    nokyc: string | null;
    operator: string | null;
  };
}

// ── rental ───────────────────────────────────────────────────────────────
export interface RentalListInput {
  sellerSessionToken: string;
  propertyId: string;
  reqDeposit: number;
  lockWindowSeconds: number;
  /**
   * The advertised rent. It belongs to the LISTING, not to the application: an applicant
   * who sends their own rent is setting the bar they are judged against.
   */
  monthlyRent: number;
}
export interface RentalListResult {
  listingId: string;
  propertyId: string;
  state: "LISTED";
  reqDeposit: number;
  lockWindowSeconds: number;
  monthlyRent: number;
  /** Where the deposit moves on engage. Show it at listing time, not only after. */
  escrowAccountId: string;
}

export interface RentalApplyInput {
  listingId: string;
  tenantAccountId: string;
  proof: unknown;
  action: "verify-tenant";
}
export interface RentalApplyResult {
  listingId: string;
  state: "APPLIED";
  tenantAccountId: string;
  predicate: {
    /** Proven by World. */
    ageEligible: boolean;
    /** **Asserted, not proven — see `incomeProven`.** */
    incomeThresholdMet: boolean;
    thresholdRule: string;
    /** `3 x monthlyRent`, derived from the listing. The tenant's income is never collected. */
    requiredMonthlyEarnings: number;
    /**
     * Always `false` in this build. Proving the tenant clears the threshold needs a zkTLS
     * transcript and a circuit over it; the demo supplies the output, not the proof.
     * Rendering `incomeThresholdMet` as a verified fact claims something the backend did
     * not check.
     */
    incomeProven: boolean;
  };
}

export interface RentalEngageInput {
  sellerSessionToken: string;
  listingId: string;
}
export interface RentalEngageResult {
  listingId: string;
  state: "ENGAGED";
  deposit: number;
  escrowAccountId: string;
  lockExpiresAt: string;
  transactionId: string;
  hashscanUrl: string;
}

export interface RentalSettleInput {
  sellerSessionToken: string;
  listingId: string;
}
export interface RentalSettleResult {
  listingId: string;
  state: "SETTLED";
  refunded: number;
  to: string;
  slashed: number;
  transactionId: string;
  hashscanUrl: string;
}

export interface RentalExpireInput {
  listingId: string;
}
export interface RentalExpireResult {
  listingId: string;
  state: "EXPIRED";
  refunded: number;
  to: string;
  slashed: number;
  slashRateBps: number;
  transactionId: string;
  hashscanUrl: string;
}

/**
 * The single interface the frontend consumes. `lib/mockApi.ts` and `lib/realApi.ts`
 * both implement it exactly — switching to real endpoints in Phase A6 is a one-line
 * import change.
 */
export interface PprevApiClient {
  onboardSeller(input: OnboardSellerInput): Promise<OnboardSellerResult>;
  submitProperty(input: SubmitPropertyInput): Promise<SubmitPropertyResult>;
  listPendingVerifications(): Promise<ListPendingVerificationsResult>;
  decideVerification(input: DecideVerificationInput): Promise<DecideVerificationResult>;
  tokenize(input: TokenizeInput): Promise<TokenizeResult>;
  getRpSignature(input: RpSignatureInput): Promise<RpSignatureResult>;
  verifyBuyerAndGrantKyc(input: VerifyBuyerInput): Promise<VerifyBuyerResult>;
  buy(input: BuyInput): Promise<BuyResult>;
  readEns(input: ReadEnsInput): Promise<ReadEnsResult>;
  readAudit(propertyId: string): Promise<ReadAuditResult>;
  /** Current server-side status of one property — what "Refresh status" should call. */
  getProperty(propertyId: string, sellerSessionToken: string): Promise<PropertyStatusResult>;
  health(): Promise<HealthResult>;
  seed(): Promise<SeedResult>;
  reset(): Promise<ResetResult>;
  rentalList(input: RentalListInput): Promise<RentalListResult>;
  rentalApply(input: RentalApplyInput): Promise<RentalApplyResult>;
  rentalEngage(input: RentalEngageInput): Promise<RentalEngageResult>;
  rentalSettle(input: RentalSettleInput): Promise<RentalSettleResult>;
  rentalExpire(input: RentalExpireInput): Promise<RentalExpireResult>;
}
