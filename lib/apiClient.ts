// PPREV — Active frontend API client. All UI components import from here.
//
// Phase A6: all 17 endpoints are live per Recep (2026-07-25), including
// ens-read (real Sepolia resolution) and the 5 rental/* endpoints (real HBAR
// escrow). `lib/mockApi.ts` is kept in the repo untouched as a fallback — if
// any single endpoint breaks right before the demo, swap that one method back
// to `mockApi.xxx` without reverting everything else.
//
// Requires NEXT_PUBLIC_API_BASE_URL to point at Recep's tunnel (see .env.local).

import { realApi } from "./realApi";
import type { PprevApiClient } from "./api-types";

export const api: PprevApiClient = realApi;

export type { PprevApiClient } from "./api-types";
export { ApiRequestError } from "./api-types";
