# PPREV

**Privacy-Preserving Real Estate Verification** · ETHGlobal Lisbon 2026

A protocol for renting and selling real estate in which no transaction can move forward until
property ownership has been verified and counterparty eligibility has been proven — and in
which identity, verification, and compliance decisions are written on-chain without leaking
personal data. One core, two modes: **sale** (fractional shares) and **rental** (escrowed
deposit).

> 🚧 Hackathon in progress. This README is split into two halves — to avoid conflicts, each of
> us writes only in our own half.

---

<!-- ═══════════ TOP HALF — AKIF ═══════════ -->
<!-- pitch · screenshots · how it works · track table -->

## Pitch

_(Akif — A9)_

## Screenshots

_(Akif — A9)_

## How it works

_(Akif — A9)_

## Track table

_(Akif — A9)_

<!-- ═══════════ END OF TOP HALF ═══════════ -->

---

<!-- ═══════════ BOTTOM HALF — RECEP ═══════════ -->
<!-- architecture · No Solidity · setup · verifier boundary · public/private table · ENS · evidence · AI usage -->

## Architecture

_(Recep — R8)_

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

Detailed setup and demo seeding steps will be written in R8.

## The minimal verifier boundary

_(Recep — R8)_

## Public / private data table

_(Recep — R8)_

## ENS config discovery

_(Recep — R8)_

## Evidence

Live on-chain evidence: [`docs/EVIDENCE.md`](docs/EVIDENCE.md)

## AI Usage

_(Recep — R8)_

<!-- ═══════════ END OF BOTTOM HALF ═══════════ -->

---

## Documents

| File | Contents | Owner |
|---|---|---|
| [`docs/API.md`](docs/API.md) | API contract — the single source of truth | Recep |
| `docs/EVIDENCE.md` | Live on-chain evidence links | Recep |
| `docs/SUBMISSION.md` | ETHGlobal submission text | Akif |
| `docs/FEEDBACK_selfie.md` | World Selfie Check feedback | Akif (user) + Recep (developer) |
| `docs/FEEDBACK_identity.md` | World Identity Check feedback | Akif (user) + Recep (developer) |

## Directory ownership

To keep parallel development conflict-free:

- **Recep:** `app/api/**`, `lib/hedera/**`, `lib/world/**`, `lib/verifier/**`, `lib/crypto/**`, `lib/store.ts`, `lib/ens/**`, `scripts/**`
- **Akif:** `app/components/**`, `app/views/**`, `app/globals.css`, `lib/mockApi.ts`, `lib/realApi.ts`
- **Shared (announce before touching):** `app/page.tsx`, `docs/API.md`, `README.md`, `package*.json`, `.env.example`

## No Solidity

Every on-chain operation runs through the native Hedera SDK — HTS (tokens), HCS (audit),
Mirror Node (public verification). The repository contains no `.sol` files and no EVM deploy
step.
