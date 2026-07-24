// PPREV — Active frontend API client. All UI components import from here.
//
// FAZ A1-A5: mock. In FAZ A6, as Recep's endpoints go live, we update this file
// (see ROADMAP.md / SENKRON_PROGRAM.md). The mock file is never deleted — it's
// the fallback if a real endpoint breaks right before the demo.

import { mockApi } from "./mockApi";
// import { realApi } from "./realApi"; // open in FAZ A6

export const api = mockApi;

export type { PprevApiClient } from "./api-types";
export { ApiRequestError } from "./api-types";
