// PPREV — Real API client (fetch-based).
// Unused until Phase A6 — `lib/apiClient.ts` points at the mock until then.
// As Recep finishes each endpoint, we uncomment the corresponding line in
// `lib/apiClient.ts` and switch it over one at a time (see SENKRON_PROGRAM.md
// — A6 is the highest-risk phase).
//
// If NEXT_PUBLIC_API_BASE_URL is empty, requests go to the same origin (this
// Next.js app's own /api routes). If Recep exposes a separate tunnel/deployment
// URL, fill that variable in .env.local.

import { ApiRequestError } from "./api-types";
import type {
  PprevApiClient,
  ApiErrorCode,
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

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiRequestError("INTERNAL_ERROR", "Could not reach the server.", 500);
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // body may be empty (e.g. some 204s) — leave body as null
  }

  if (!res.ok) {
    const b = (body ?? {}) as { error?: string; code?: ApiErrorCode; hederaStatus?: string };
    throw new ApiRequestError(
      b.code ?? "INTERNAL_ERROR",
      b.error ?? `Request failed (${res.status})`,
      res.status,
      b.hederaStatus,
    );
  }

  return body as T;
}

function post<T>(path: string, payload: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(payload), headers: extraHeaders });
}

function get<T>(path: string, extraHeaders?: Record<string, string>): Promise<T> {
  return request<T>(path, { method: "GET", headers: extraHeaders });
}

// The verifier panel's admin secret is supplied by the user only (memory state),
// never written to code or env. VerifierView must call this before hitting the
// verifier endpoints.
let demoAdminSecret = "";
export function setDemoAdminSecret(secret: string) {
  demoAdminSecret = secret;
}

export const realApi: PprevApiClient = {
  onboardSeller: (input: OnboardSellerInput) => post<OnboardSellerResult>("/api/onboard", input),

  submitProperty: (input: SubmitPropertyInput) => post<SubmitPropertyResult>("/api/attest", input),

  listPendingVerifications: () =>
    get<ListPendingVerificationsResult>("/api/verifier/pending", {
      "x-demo-admin-secret": demoAdminSecret,
    }),

  decideVerification: (input: DecideVerificationInput) =>
    post<DecideVerificationResult>("/api/verifier/decision", input, {
      "x-demo-admin-secret": demoAdminSecret,
    }),

  tokenize: (input: TokenizeInput) => post<TokenizeResult>("/api/tokenize", input),

  getRpSignature: (input: RpSignatureInput) => post<RpSignatureResult>("/api/rp-signature", input),

  verifyBuyerAndGrantKyc: (input: VerifyBuyerInput) => post<VerifyBuyerResult>("/api/kyc", input),

  buy: (input: BuyInput) => post<BuyResult>("/api/buy", input),

  readEns: (input: ReadEnsInput) => post<ReadEnsResult>("/api/ens-read", input),

  readAudit: (propertyId: string) =>
    get<ReadAuditResult>(`/api/audit?propertyId=${encodeURIComponent(propertyId)}`),

  seed: () => post<SeedResult>("/api/seed", {}),

  reset: () => post<ResetResult>("/api/reset", {}),

  rentalList: (input: RentalListInput) => post<RentalListResult>("/api/rental/list", input),

  rentalApply: (input: RentalApplyInput) => post<RentalApplyResult>("/api/rental/apply", input),

  rentalEngage: (input: RentalEngageInput) => post<RentalEngageResult>("/api/rental/engage", input),

  rentalSettle: (input: RentalSettleInput) => post<RentalSettleResult>("/api/rental/settle", input),

  rentalExpire: (input: RentalExpireInput) => post<RentalExpireResult>("/api/rental/expire", input),
};
