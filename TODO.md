# TODO

> **Status: complete and frozen at the `demo-final` tag.** All 22 endpoints are live and
> bound, both flows run end-to-end in the browser, and the test suites pass (tamper 6/6,
> merkle, idempotency 5/5, ENS guard 4/4, e2e:sale 21/21, e2e:rental 22/22). The one item
> left unchecked below is unchecked on purpose — see A5.5.

Task board. Each person writes only under their own heading — don't delete the other's lines, just check items off or append. If a merge conflict happens here, keep both sides; extra lines are harmless.

## Recep
- [x] R0 — scaffold + contract v1
- [x] R1 — Hedera core (HTS/HCS + 3 golden scenes in scripts)
- [x] R2/R3 — verifier gate + property state machine (contract v2, English)
- [x] R4/R5 — /api/buy + World ID 4.0 verification (contract v3, BREAKING)
- [x] R6.5 — rental escrow mode (HBAR lock, settle, expire)
- [x] R6a/R6b — Mirror audit timeline + ENS config discovery (v2 UniversalResolver)
- [x] R7 — every endpoint bound and confirmed live: onboard · attest · property · verifier/pending · verifier/decision · tokenize · rp-signature · kyc · buy · ens-read · audit · health · seed · reset · rental/{list,apply,engage,settle,expire} · dev/*
- [x] R8 — EVIDENCE, RUNBOOK, README lower half, FEEDBACK_ens
- [x] Hardening — contract v6, ENS checked before every transfer, property↔session binding, replay suppression on buy, escrow state written at submission
- [x] demo-final tagged after three consecutive clean rehearsals

## Akif
- [x] A1 — mock API layer + shared types (lib/mockApi.ts, lib/realApi.ts, lib/api-types.ts, lib/apiClient.ts)
- [x] A2 — UI shell (Seller/Verifier/Buyer views + common components)
- [x] A3 — Seller UI (Selfie → upload → review → tokenize)
- [x] A4 — Verifier panel (admin secret, checklist, approve/reject, tamper test)
- [x] A5 — Buyer UI + both golden scenes (KYC-denied, secondary fee)
- [x] Full mock flow tested end-to-end in the browser — works
- [x] A6 — every endpoint bound through lib/realApi.ts
- [x] A7 — real World IDKit v4 widget, both flows verified against the simulator, FEEDBACK_selfie + FEEDBACK_identity written from measured runs
- [x] A8 — evidence UI: Mirror audit timeline, cap table with the Σ=1000 supply invariant and per-holder KYC status, live ENS panel
- [x] A9 — README top half, screenshots, SUBMISSION.md, QA pass
- [ ] A5.5 — RENTAL UI — **deliberately not built.** The rental flow is complete and tested
      server-side (`npm run e2e:rental`, 22/22, real HBAR locked and released), but it has no
      browser UI. A four-minute slot cannot carry both flows, and a half-built second UI would
      have cost polish on the one being presented. Scripts only, and `docs/SUBMISSION.md` says
      so rather than implying otherwise.
