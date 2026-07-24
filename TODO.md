# TODO

Task board. Each person writes only under their own heading — don't delete the other's lines, just check items off or append. If a merge conflict happens here, keep both sides; extra lines are harmless.

## Recep
- [x] R0 — scaffold + contract v1
- [x] R1 — Hedera core (HTS/HCS + 3 golden scenes in scripts)
- [x] R2/R3 — verifier gate + property state machine (contract v2, English)
- [x] R4/R5 — /api/buy + World ID 4.0 verification (contract v3, BREAKING)
- [x] R6.5 — rental escrow mode (HBAR lock, settle, expire)
- [ ] Endpoints confirmed bindable so far: onboard · attest · verifier/pending · verifier/decision · tokenize · rp-signature · buy · seed · reset
- [ ] Still pending: /api/kyc, /api/ens-read, /api/audit, /api/rental/* live wiring confirmation

## Akif
- [x] A1 — mock API layer + shared types (lib/mockApi.ts, lib/realApi.ts, lib/api-types.ts, lib/apiClient.ts)
- [x] A2 — UI shell (Seller/Verifier/Buyer views + common components)
- [x] A3 — Seller UI (Selfie → upload → review → tokenize)
- [x] A4 — Verifier panel (admin secret, checklist, approve/reject, tamper test)
- [x] A5 — Buyer UI + both golden scenes (KYC-denied, secondary fee)
- [x] Full mock flow tested end-to-end in the browser — works
- [ ] A6 — bind ready endpoints to lib/realApi.ts (onboard, attest, verifier/pending, verifier/decision, tokenize, rp-signature, buy, seed, reset)
- [ ] A5.5 — RENTAL UI (conditional: only after SALE flow is fully polished)
- [ ] A7 — real World IDKit widget + FEEDBACK_selfie.md / FEEDBACK_identity.md
- [ ] A8 — ENS/Mirror evidence UI
- [ ] A9 — README, QA pass, submission docs
