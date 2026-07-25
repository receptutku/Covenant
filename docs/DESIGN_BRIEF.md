# Design brief — read this first

_You are being asked to redesign the visual layer of a working, frozen application.
Everything in it functions and has passed three clean end-to-end rehearsals against live
Hedera testnet. Nothing here is broken. Do not fix anything._

---

## The one rule that matters

**Visual layer only.** You may change:

- CSS: `app/globals.css`
- `className` strings anywhere
- Markup structure *within* a component's return statement (wrappers, grids, order of
  visual elements)
- Files you create yourself under `app/components/`

You may **not** change, under any circumstances:

- Anything in `lib/` — `apiClient.ts`, `realApi.ts`, `mockApi.ts`, `api-types.ts`
- Any `useState`, `useEffect`, handler function, or `async` call in any view
- Any prop name, component name, or export
- Any user-facing **copy**. Every sentence on screen was written deliberately and several
  are load-bearing claims about what the protocol does. If a string looks wrong to you,
  say so — do not rewrite it.
- The conditional logic that decides *when* something renders

If a visual change seems to require touching state or a handler, stop and ask. There is
almost always a CSS answer.

**Never run git commands.** Tell the user the exact commands and let them run them. This is
a hard rule from the user, established after a sandboxed git call damaged their working
tree.

After every change run both, and do not report success until both are clean:

```
npx tsc --noEmit
npx eslint app lib --quiet
```

---

## What the app is

PPREV — fractional real-estate tokenisation, built for ETHGlobal Lisbon 2026. Two rules
define it: no token exists until a human has verified the property documents, and no share
can reach a wallet that has not proven eligibility. The second rule is enforced by the
Hedera network rather than by application code, and that distinction is the entire pitch.

Read `docs/SUBMISSION.md` for the full argument, and `README.md` for architecture. Do not
read `docs/API.md` — it is the backend contract and irrelevant to design work.

Stack: Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4. Fonts Geist Sans
and Geist Mono, already loaded in `app/layout.tsx` as CSS variables.

---

## The screen

One page, `app/page.tsx`. Three columns above, two full-width panels below.

| Region | File | What it is |
|---|---|---|
| Seller column | `app/views/SellerView.tsx` | Selfie check → upload documents → review status → tokenize |
| Verifier column | `app/views/VerifierView.tsx` | Admin sign-in → review queue → approve/reject → tamper test |
| Buyer column | `app/views/BuyerView.tsx` | ENS read → account → identity/KYC → buy |
| Audit panel | `app/views/AuditTimeline.tsx` | HCS event timeline read from Mirror Node |
| Cap table | `app/views/CapTable.tsx` | Who holds which shares, read from Mirror Node |

Shared pieces in `app/components/common/`: `ActionCard`, `StatusBadge`, `StepIndicator`,
`ErrorCard`, `EvidenceLink`, `PrivacyNote`. `app/components/WorldVerifyButton.tsx` wraps the
World ID widget — restyle the trigger button only, never the widget's own props.

Below `lg` the three columns collapse to tabs. **All three views stay mounted and are hidden
with CSS**; rendering them conditionally destroys in-flight session state. Do not change
that pattern.

---

## The two moments that carry the demo

A judge watches this for three minutes. Two frames decide the outcome, and both live in the
Buyer column:

**The refusal.** Buying with a deliberately un-KYC'd account fails with
`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` — a string produced by Hedera's consensus nodes, not by
this application. `ErrorCard` renders it. When `hederaStatus` is present that string must be
the largest thing on screen; our own error `code` is a footnote.

**The fee.** A secondary transfer of 100 shares debits 100, the network takes 2, and the
recipient receives 98. Those three numbers are shown separately and must stay separate —
collapsing them into one figure would contradict Mirror Node's own record of the same
transaction.

Everything else on the screen is supporting material. If a design decision makes the rest
prettier at the cost of these two, it is the wrong decision.

---

## Where the current design stands

A tokens pass has already been done and is a reasonable floor, not a ceiling:

- `app/globals.css` holds CSS variables (`--surface`, `--border`, `--muted`, `--faint`,
  `--accent`) plus `.btn`, `.btn-primary`, `.btn-secondary`, `.field`, `.panel` component
  classes. Views use these rather than raw Tailwind colours.
- Emoji were replaced with inline SVG. Badges carry a dot as well as a colour so state
  survives a screenshot or a colourblind viewer.
- `body` previously specified Arial, which meant the loaded Geist font was never used. Fixed.

The user's verdict on that pass: **too basic, does not feel professional.** The problem is
the archetype — three columns of stacked white cards dense with text — not the details. A
redesign needs a point of view, not more polish.

Three directions were sketched: **A** forensic terminal (mono, dark, audit-log feel),
**B** editorial fintech (large type, air, one idea per screen), **C** control room (panel
grids, status rail, operator feel). Ask the user which they picked before starting.

---

## Constraints from reality

- **Dark and light must both work.** The user's machine is in dark mode; judges' laptops may
  not be.
- **The screen is projected.** Type below 11px and low-contrast greys disappear.
- **Content length is fixed.** Some cards carry four lines of explanation and you cannot cut
  them. Design for the density that exists, not the density you would prefer.
- **No new dependencies.** No icon packages, no animation libraries, no UI kits. Inline SVG
  and CSS only.
- **Ship-blocking deadline.** The submission is due imminently. A half-finished redesign is
  worse than the current state, so work in complete passes: finish one region entirely
  before starting the next.

---

## Working order that avoids waste

1. Confirm the chosen direction with the user before writing code.
2. `app/globals.css` first — tokens, type scale, control styles. Everything downstream
   inherits it.
3. `app/components/common/*` next — every view is built from these.
4. Then one view at a time, Buyer first, because it holds both golden moments.
5. `app/page.tsx` layout and header last.
6. After each region: `tsc`, `eslint`, and ask the user to look before continuing.

Re-running the rehearsal is the user's job, not yours. Changing the visual layer resets the
team's rehearsal counter, so tell them when you are done rather than assuming they know.
