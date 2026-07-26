"use client";

import { useEffect, useState } from "react";
import { api, ApiRequestError } from "@/lib/apiClient";
import { devClearReplay, devGrantKyc, setDemoAdminSecret } from "@/lib/realApi";
import type { ReadEnsResult, BuyResult, VerifyBuyerResult, SeedResult } from "@/lib/api-types";
import { WorldVerifyButton } from "@/app/components/WorldVerifyButton";
import { ActionCard } from "@/app/components/common/ActionCard";
import { StatusBadge } from "@/app/components/common/StatusBadge";
import { ErrorCard } from "@/app/components/common/ErrorCard";
import { PrivacyNote } from "@/app/components/common/PrivacyNote";
import { EvidenceLink } from "@/app/components/common/EvidenceLink";
import { StepIndicator } from "@/app/components/common/StepIndicator";

const STEPS = ["ENS", "Association", "Identity/KYC", "Buy", "Evidence"];

// Purely decorative — mirrors STEPS/step for the hero flow illustration. No new
// state, same values the StepIndicator already consumes.
const FLOW_LABELS = ["ENS", "Association", "Identity", "Buy", "Evidence"];

const FLOW_ICONS = [
  // ENS — a globe
  <svg key="ens" viewBox="0 0 16 16" className="h-[13px] w-[13px] fill-none stroke-current stroke-[1.4]">
    <circle cx="8" cy="8" r="5.3" />
    <path d="M2.9 8h10.2M8 2.7c1.5 1.4 2.3 3.3 2.3 5.3S9.5 12.9 8 14.3c-1.5-1.4-2.3-3.3-2.3-5.3S6.5 4.1 8 2.7Z" />
  </svg>,
  // Association — a link
  <svg key="assoc" viewBox="0 0 16 16" className="h-[13px] w-[13px] fill-none stroke-current stroke-[1.4]">
    <path d="M6.7 9.3a2.7 2.7 0 0 0 3.9.1l1.6-1.6a2.7 2.7 0 0 0-3.9-3.9L7.4 4.8" />
    <path d="M9.3 6.7a2.7 2.7 0 0 0-3.9-.1L3.8 8.2a2.7 2.7 0 0 0 3.9 3.9l.9-.9" />
  </svg>,
  // Identity/KYC — a face
  <svg key="id" viewBox="0 0 16 16" className="h-[13px] w-[13px] fill-none stroke-current stroke-[1.4]">
    <circle cx="8" cy="6.4" r="2.3" />
    <path d="M3.6 13c.7-2.3 2.4-3.4 4.4-3.4s3.7 1.1 4.4 3.4" />
  </svg>,
  // Buy — a coin
  <svg key="buy" viewBox="0 0 16 16" className="h-[13px] w-[13px] fill-none stroke-current stroke-[1.4]">
    <circle cx="8" cy="8" r="5.3" />
    <path d="M8 5.4v5.2M6.3 6.4c0-.8.8-1.4 1.7-1.4s1.7.5 1.7 1.2c0 1.6-3.4.9-3.4 2.5 0 .7.8 1.2 1.7 1.2s1.7-.5 1.7-1.3" />
  </svg>,
  // Evidence — a document
  <svg key="ev" viewBox="0 0 16 16" className="h-[13px] w-[13px] fill-none stroke-current stroke-[1.4]">
    <path d="M4.5 2h5L13 4.5V14a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5V2.5A.5.5 0 0 1 4.5 2Z" />
    <path d="M9.3 2v2.6H12" />
    <path d="M5.6 8h4.8M5.6 10.4h4.8" />
  </svg>,
];

// Account ids are fetched from GET /api/health on mount, never hard-coded: the
// ids differ per environment and per .env, and an invented id fails as
// TOKEN_NOT_ASSOCIATED, which reads like a backend bug when the account simply
// does not exist. The fields stay editable only as a mid-event escape hatch.
const EMPTY_ACCOUNTS: Record<string, string> = { buyer1: "", buyer2: "", nokyc: "" };

export function BuyerView() {
  const [propertyId, setPropertyId] = useState("PROP-001");
  const [buyerKey, setBuyerKey] = useState<"buyer1" | "buyer2" | "nokyc">("buyer1");
  const [mode, setMode] = useState<"primary" | "secondary" | "nokyc">("primary");
  const [amount, setAmount] = useState(100);
  const [accounts, setAccounts] = useState(EMPTY_ACCOUNTS);
  const buyerAccountId = accounts[buyerKey];

  useEffect(() => {
    api
      .health()
      .then((h) =>
        setAccounts({
          buyer1: h.demoAccounts.buyer1 ?? "",
          buyer2: h.demoAccounts.buyer2 ?? "",
          nokyc: h.demoAccounts.nokyc ?? "",
        }),
      )
      .catch(() => {
        /* leave the fields empty — the inline warning below explains the state */
      });
  }, []);

  const [ens, setEns] = useState<ReadEnsResult | null>(null);
  const [kyc, setKyc] = useState<VerifyBuyerResult | null>(null);
  const [buyResult, setBuyResult] = useState<BuyResult | null>(null);
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null);
  const [adminSecret, setAdminSecret] = useState("");
  const [clearedCount, setClearedCount] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiRequestError | Error | null>(null);

  // An account id is what the Association step produces, so index 1 is current until one
  // exists — /api/health fills it, and while it is empty the KYC and Buy calls have no
  // account to name. Jumping straight to 2 pointed the audience at Identity/KYC in exactly
  // the state where the button under it is disabled.
  const step = !ens ? 0 : !buyerAccountId ? 1 : !kyc ? 2 : !buyResult ? 3 : 4;

  async function handleSeed() {
    setBusy("seed");
    setError(null);
    setSeedResult(null);
    try {
      // /api/seed is admin-guarded too. Without this the button 401s unless the
      // verifier panel happens to have been unlocked first — an invisible
      // ordering dependency between two unrelated columns.
      //
      // Only when a secret was actually typed. Writing an empty string here revoked the
      // one the verifier panel had already been given, so seed failed AND the verifier's
      // next Approve failed, in another column, with nothing on screen connecting the two.
      const secret = adminSecret.trim();
      if (secret) setDemoAdminSecret(secret);
      const res = await api.seed();
      setSeedResult(res);
    } catch (e) {
      setError(e as ApiRequestError);
    } finally {
      setBusy(null);
    }
  }

  async function handleClearReplay() {
    setBusy("replay");
    setError(null);
    setClearedCount(null);
    try {
      const res = await devClearReplay(adminSecret);
      setClearedCount(res.cleared);
    } catch (e) {
      setError(e as ApiRequestError);
    } finally {
      setBusy(null);
    }
  }

  async function loadEns() {
    setBusy("ens");
    setError(null);
    try {
      const res = await api.readEns({ propertyId });
      setEns(res);
    } catch (e) {
      setError(e as ApiRequestError);
    } finally {
      setBusy(null);
    }
  }

  async function handleBuyerProof(proof: Record<string, unknown>) {
    setBusy("kyc");
    setError(null);
    try {
      const res = await api.verifyBuyerAndGrantKyc({
        propertyId,
        buyerAccountId,
        proof,
        action: "verify-buyer",
      });
      setKyc(res);
    } catch (e) {
      setError(e as ApiRequestError);
    } finally {
      setBusy(null);
    }
  }

  async function doDevKyc() {
    setBusy("kyc");
    setError(null);
    try {
      const res = await devGrantKyc(adminSecret, { propertyId, buyerAccountId });
      setKyc(res);
    } catch (e) {
      setError(e as ApiRequestError);
    } finally {
      setBusy(null);
    }
  }

  async function doBuy() {
    setBusy("buy");
    setError(null);
    setBuyResult(null);
    try {
      const res = await api.buy({
        propertyId,
        mode,
        buyerAccountId,
        amount,
      });
      setBuyResult(res);
    } catch (e) {
      setError(e as ApiRequestError);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="buyer-view flex flex-col gap-5">
      <div className="seller-hero">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-[34px] font-semibold leading-[1.02] tracking-[-0.02em]">
              Buyer <span className="seller-hero-accent">flow</span>
            </h2>
            <p className="mt-2 max-w-[46ch] text-[13px] leading-relaxed text-[var(--muted)]">
              Resolve the property from ENS, prove KYC-eligible identity, then settle a transfer on
              Hedera.
            </p>
            <div className="seller-live-badge" aria-hidden="true">
              <span className="seller-live-dot" />
              Protocol live · Hedera testnet
            </div>
          </div>
          <StepIndicator steps={STEPS} activeIndex={step} />
        </div>

        <div className="seller-flow" aria-hidden="true">
          {FLOW_LABELS.map((label, i) => (
            <div key={label} className="contents">
              <div className={`seller-flow-node ${i < step ? "is-done" : i === step ? "is-active" : ""}`}>
                <span className="seller-flow-dot">
                  {i === step && <span className="seller-flow-glow" />}
                  <span className="seller-flow-dot-inner">{i < step ? "✓" : FLOW_ICONS[i]}</span>
                </span>
                <span className="seller-flow-label">{label}</span>
              </div>
              {i < FLOW_LABELS.length - 1 && (
                <span className={`seller-flow-line ${i < step ? "is-done" : ""}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="seller-workspace">
      <div className="buyer-helper-card">
      <ActionCard
        title="Demo helpers"
        description="Seed PROP-001 (the KYC-denied and secondary-fee golden scenes run on top of it)."
        techNote="Development only — returns 404 in production. Re-seed before the secondary scene: each run permanently moves shares from buyer1 to buyer2."
      >
        <button
          onClick={handleSeed}
          disabled={busy === "seed" || !adminSecret.trim()}
          className="btn btn-secondary btn-sm"
        >
          {busy === "seed" ? "Seeding..." : "Seed PROP-001"}
        </button>
        {seedResult && (
          <p className="mt-2 text-xs text-[var(--success)]">
            Seeded {seedResult.properties.join(", ")} · token {seedResult.tokenId} · {seedResult.elapsedMs}ms
            {!seedResult.rebalanced.ok && (
              <span className="block text-[var(--warning)]">
                Share reservoir exhausted — the secondary scene will fail. Run `npm run stage` before presenting.
              </span>
            )}
          </p>
        )}

        {/*
          Between rehearsals this is the difference between rehearsing twice and
          rehearsing once: a World nullifier is derived from (identity, app,
          action), so the second Selfie Check of the day is refused as
          WORLD_PROOF_REPLAY at step one, before anything can be shown.
        */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
          <input
            type="password"
            value={adminSecret}
            onChange={(e) => setAdminSecret(e.target.value)}
            placeholder="admin secret"
            className="field"
          />
          <button
            onClick={handleClearReplay}
            disabled={busy === "replay" || !adminSecret}
            className="btn btn-secondary btn-sm"
          >
            {busy === "replay" ? "Clearing..." : "Clear World replay guard"}
          </button>
          {clearedCount !== null && (
            <span className="text-xs text-[var(--success)]">{clearedCount} proof digest(s) forgotten.</span>
          )}
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Run this between rehearsals. It forgets used World proofs only — seeded properties, sessions and chain
          state survive.
        </p>
      </ActionCard>
      </div>

      <div className={`seller-step ${step > 0 ? "is-complete" : "is-active"}`}>
      <ActionCard
        title="0. Pick a property"
        description="Golden scenes run on PROP-001; type any live property id."
        techNote="Discovery is live and settlement is checked. The client resolves each property's config from ENS on demand, and before any share moves /api/buy refuses the transfer if ENS names a token this protocol did not create. ENS is the check, not yet the source of the token id."
        active={step === 0}
      >
        <div className="flex flex-wrap items-center gap-2">
          {/*
            Free text rather than a fixed list: the set of live properties changes
            every rehearsal, and a stale option silently sends the demo at a
            property the server has never heard of.
          */}
          <input
            value={propertyId}
            onChange={(e) => {
              setPropertyId(e.target.value.trim().toUpperCase());
              setEns(null);
              setKyc(null);
              setBuyResult(null);
            }}
            placeholder="PROP-001"
            className="field w-36 font-mono"
          />
          <button
            onClick={loadEns}
            disabled={busy === "ens"}
            className="btn btn-primary"
          >
            {busy === "ens" ? "Reading..." : ens ? "Re-read live ENS config" : "Read live ENS config"}
          </button>
        </div>

        {ens && (
          <div className="evidence-panel mt-4 rounded-2xl p-4 text-xs">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge status="info">{ens.name}</StatusBadge>
              <StatusBadge status="success">Source: {ens.source === "ens" ? "ENS Sepolia · live" : "env-fallback"}</StatusBadge>
              <StatusBadge status={ens.mode === "SALE" ? "idle" : "pending"}>{ens.mode}</StatusBadge>
            </div>
            <table className="w-full text-left text-[12px]">
              <tbody>
                {Object.entries(ens.records).map(([k, v]) => (
                  <tr key={k} className="border-t border-[var(--border)]">
                    <td className="py-2 pr-3 font-mono text-[var(--faint)]">{k}</td>
                    <td className="py-2 font-mono break-all text-[var(--foreground)]">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/*
              The resolve time, not "live": tokenizing republishes the token id to ENS in the
              background, and a read taken while that Sepolia write is still confirming returns
              the previous run's id — which is how the discovery panel ended up contradicting
              the transfer on the adjacent screen. The timestamp is the honest part of the
              answer, since a re-read may legitimately be served from the server's 60s cache
              and carry the same one.
            */}
            <p className="mt-2 text-[var(--muted)]">
              Resolved at {new Date(ens.resolvedAt).toLocaleTimeString()}. Tokenizing republishes the token id in
              the background, so a read taken while that write is confirming still shows the previous run&apos;s id —
              re-read to pick up the new one. Reads are cached for up to 60s: an unchanged timestamp means the same
              resolution was served again, not that the value was re-confirmed.
            </p>
          </div>
        )}
      </ActionCard>
      </div>

      <div className={`seller-step ${step > 1 ? "is-complete" : step === 1 ? "is-active" : "is-upcoming"}`}>
      <ActionCard
        title="1-2. Pick an account + Association"
        description="buyer1/buyer2 are KYC'd test accounts; nokyc is deliberately un-KYC'd."
        disabledReason={!ens ? "Read the ENS config first." : undefined}
        active={step === 1}
      >
        <div className="flex flex-wrap gap-2">
          {(["buyer1", "buyer2", "nokyc"] as const).map((k) => (
            <label
              key={k}
              className={`cursor-pointer rounded-full border px-3 py-2 text-sm font-semibold transition-all ${
                buyerKey === k
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                  : "border-[var(--border-strong)] bg-[var(--surface-sunken)] text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <input type="radio" className="hidden" checked={buyerKey === k} onChange={() => setBuyerKey(k)} disabled={!ens} />
              {k}
            </label>
          ))}
        </div>

        <label className="mt-3 block text-xs text-[var(--muted)]">
          Hedera account for {buyerKey}
          <input
            value={buyerAccountId}
            onChange={(e) => setAccounts((prev) => ({ ...prev, [buyerKey]: e.target.value }))}
            placeholder="0.0.xxxxxx"
            className="field mt-1 block w-full font-mono"
          />
        </label>
        {!buyerAccountId && (
          <p className="mt-1 text-xs text-amber-600">
            /api/health returned no id for {buyerKey}. Check the backend&apos;s .env, or paste the id above.
          </p>
        )}

        <p className="mt-2 text-xs text-[var(--muted)]">
          Being associated does not grant a right to buy — only KYC does.
        </p>
      </ActionCard>
      </div>

      <div className={`seller-step ${step > 2 ? "is-complete" : step === 2 ? "is-active" : "is-upcoming"}`}>
      <ActionCard
        title="3. Identity Check → KYC"
        description="World Identity confirms a unique human over 18; a TokenGrantKycTransaction fires server-side."
        disabledReason={!ens ? "Read the ENS config first." : buyerKey === "nokyc" ? "nokyc is deliberately never granted KYC (golden scene)." : undefined}
        active={step === 2}
      >
        {buyerKey !== "nokyc" && (
          <div className="flex flex-wrap items-center gap-2">
            <WorldVerifyButton
              action="verify-buyer"
              signal={`${propertyId}:${buyerAccountId}`}
              label={busy === "kyc" ? "Verifying..." : "Grant KYC via Identity Check"}
              disabled={!ens || !buyerAccountId || busy === "kyc"}
              onProof={handleBuyerProof}
            />
            <button
              onClick={doDevKyc}
              disabled={!ens || !adminSecret || !buyerAccountId || busy === "kyc"}
              title="Requires the admin secret entered in Demo helpers above."
              className="rounded-lg border border-dashed border-[var(--warning-border)] bg-[var(--warning-soft)] px-3 py-2 text-xs font-semibold text-[var(--warning)] disabled:opacity-50"
            >
              Dev: grant without World proof
            </button>
          </div>
        )}
        {kyc && (
          <div className="mt-2 flex flex-col gap-1">
            <StatusBadge status="success">KYC_GRANTED</StatusBadge>
            <EvidenceLink href={kyc.hashscanUrl} label="View on HashScan" />
          </div>
        )}
        <PrivacyNote>Only age≥18 is requested; no name, address, nationality, or document image is collected, and the raw proof is never stored.</PrivacyNote>
      </ActionCard>
      </div>

      <div className={`seller-step ${step > 3 ? "is-complete" : step === 3 ? "is-active" : "is-upcoming"}`}>
      <ActionCard
        title="4. Buy"
        description="primary: fresh property (treasury exemption, no fee) · secondary: buyer1→buyer2 (2% fee above 50 shares — below that the 1-share floor dominates) · nokyc: deliberate rejection"
        active={step === 3}
      >
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px_auto]">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            className="field w-full"
          >
            <option value="primary">primary (operator → buyer)</option>
            <option value="secondary">secondary (buyer1 → buyer2, 2% fee at 100 shares)</option>
            <option value="nokyc">nokyc (operator → nokyc — expect REJECTION)</option>
          </select>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            min={1}
            max={1000}
            className="field w-full"
          />
          <button
            onClick={doBuy}
            // An empty field is Number("") === 0 and junk is NaN; both are rejected by the
            // server as INVALID_INPUT. A disabled button says so before the round trip.
            disabled={busy === "buy" || !Number.isInteger(amount) || amount < 1 || amount > 1000}
            className="btn btn-primary"
          >
            {busy === "buy" ? "Processing..." : "Buy / attempt"}
          </button>
        </div>

        {buyResult && (
          <div className="evidence-panel mt-5 overflow-hidden rounded-2xl border-[var(--success-border)]">
            <div className="border-b border-[var(--success-border)] bg-[var(--success-soft)] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--success)]">
              Transfer settled on Hedera
            </div>

            <div className="p-5">
              <p className="break-all font-mono text-[13px] leading-relaxed text-[var(--success)]">
                {buyResult.from} <span className="text-[var(--faint)]">→</span> {buyResult.to}
              </p>

              {/*
                Sent and received are shown separately because the 2% fee is
                INCLUSIVE — quoting the sent amount next to the recipient would
                contradict Mirror Node's own transfer list for this transaction.
              */}
              <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
                <div className="metric-tile rounded-xl p-4">
                  <dt className="label-eyebrow text-[var(--muted)]">Sent</dt>
                  <dd className="tabular mt-2 font-mono text-[34px] font-semibold leading-none tracking-[-0.04em]">
                    {buyResult.amount}
                  </dd>
                </div>
                <div className="metric-tile rounded-xl border-[var(--success-border)] bg-[var(--success-soft)] p-4">
                  <dt className="label-eyebrow text-[var(--success)]">Protocol fee</dt>
                  <dd className="tabular mt-2 font-mono text-[34px] font-semibold leading-none tracking-[-0.04em]">
                    {buyResult.assessedCustomFees.reduce((sum, f) => sum + f.amount, 0)}
                  </dd>
                </div>
                <div className="metric-tile rounded-xl p-4">
                  <dt className="label-eyebrow text-[var(--muted)]">Received</dt>
                  <dd className="tabular mt-2 font-mono text-[34px] font-semibold leading-none tracking-[-0.04em]">
                    {buyResult.netAmount}
                  </dd>
                </div>
              </dl>
              {buyResult.assessedCustomFees.length > 0 ? (
                <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
                {/*
                  The chain charges max(1, floor(amount × 2%)) and shares are whole
                  units, so below 50 shares the floor dominates and the effective
                  rate is not 2%. Saying "2%" there would be false on-screen.
                */}
                {buyResult.feeFloorApplied
                  ? `The fee floor applied: 1 share minimum, an effective ${(
                      buyResult.effectiveFeeRate * 100
                    ).toFixed(1)}% at this size, not 2%`
                  : "The 2% fee"}{" "}
                was assessed by Hedera itself and routed to {buyResult.assessedCustomFees[0].collectorAccountId} — the
                app never moves it.
              </p>
              ) : (
                <p className="mt-4 text-xs text-[var(--muted)]">
                  No fee — the treasury is exempt from its own fee schedule.
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
              {/*
                Only `match` is allowed to claim ENS confirmed anything: `unavailable`
                covers the env fallback, which is our own configuration read back to
                us, and `stale` is a legitimate few-second window after a mint.
              */}
              {buyResult.ensCheck === "match" ? (
                <StatusBadge status="success">ENS confirmed the token before the transfer</StatusBadge>
              ) : buyResult.ensCheck === "stale" ? (
                <StatusBadge status="pending">ENS record still names the previous token (republishing)</StatusBadge>
              ) : (
                <StatusBadge status="idle">ENS unavailable — fell back to local config</StatusBadge>
              )}
            </div>

              {buyResult.replayed && (
                <p className="mt-4 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-soft)] p-3 text-xs leading-relaxed text-[var(--warning)]">
                Nothing moved: this repeated the previous request within 30 seconds and was not executed again.
                The transaction below is the earlier one — real, but not new.
              </p>
            )}

              <div className="mt-4">
                <EvidenceLink href={buyResult.hashscanUrl} label="View on HashScan" />
              </div>
            </div>
          </div>
        )}
      </ActionCard>
      </div>

      {error && (
        <ErrorCard
          error={error}
          note={
            // Gated on hederaStatus, not on the code alone: /api/kyc also returns KYC_DENIED
            // from an application-level guard on the reserved nokyc account, and asserting
            // "the network refused this" over a refusal our own code made would be false in
            // the one scene whose entire point is that the network did it.
            error instanceof ApiRequestError && error.code === "KYC_DENIED" && Boolean(error.hederaStatus)
              ? "Golden scene: the compliance gate runs at the network level — a transfer to an unverified wallet is rejected by the protocol."
              : undefined
          }
        />
      )}
      </div>
    </div>
  );
}
