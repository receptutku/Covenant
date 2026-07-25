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

// Account ids are fetched from GET /api/health on mount, never hard-coded: the
// ids differ per environment and per .env, and an invented id fails as
// TOKEN_NOT_ASSOCIATED, which reads like a backend bug when the account simply
// does not exist. The fields stay editable only as a mid-event escape hatch.
const EMPTY_ACCOUNTS: Record<string, string> = { buyer1: "", buyer2: "", nokyc: "" };

export function BuyerView() {
  const [propertyId, setPropertyId] = useState("PROP-002");
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

  const step = !ens ? 0 : !kyc ? 2 : !buyResult ? 3 : 4;

  async function handleSeed() {
    setBusy("seed");
    setError(null);
    setSeedResult(null);
    try {
      // /api/seed is admin-guarded too. Without this the button 401s unless the
      // verifier panel happens to have been unlocked first — an invisible
      // ordering dependency between two unrelated columns.
      setDemoAdminSecret(adminSecret.trim());
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Buyer</h2>
        <StepIndicator steps={STEPS} activeIndex={step} />
      </div>

      <ActionCard
        title="Demo helpers"
        description="Seed PROP-001 (the KYC-denied and secondary-fee golden scenes run on top of it)."
        techNote="Development only — returns 404 in production. Re-seed before the secondary scene: each run permanently moves shares from buyer1 to buyer2."
      >
        <button
          onClick={handleSeed}
          disabled={busy === "seed"}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          {busy === "seed" ? "Seeding..." : "Seed PROP-001"}
        </button>
        {seedResult && (
          <p className="mt-2 text-xs text-emerald-600">
            Seeded {seedResult.properties.join(", ")} · token {seedResult.tokenId} · {seedResult.elapsedMs}ms
            {!seedResult.rebalanced.ok && (
              <span className="block text-amber-600">
                Share reservoir exhausted — the secondary scene will fail. Tell Recep before rehearsing.
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
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <input
            type="password"
            value={adminSecret}
            onChange={(e) => setAdminSecret(e.target.value)}
            placeholder="admin secret"
            className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <button
            onClick={handleClearReplay}
            disabled={busy === "replay" || !adminSecret}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700"
          >
            {busy === "replay" ? "Clearing..." : "Clear World replay guard"}
          </button>
          {clearedCount !== null && (
            <span className="text-xs text-emerald-600">{clearedCount} proof digest(s) forgotten.</span>
          )}
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Run this between rehearsals. It forgets used World proofs only — seeded properties, sessions and chain
          state survive.
        </p>
      </ActionCard>

      <ActionCard title="0. Pick a property" description="The live flow is PROP-002; golden scenes run on PROP-001.">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={propertyId}
            onChange={(e) => {
              setPropertyId(e.target.value);
              setEns(null);
              setKyc(null);
              setBuyResult(null);
            }}
            className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="PROP-002">PROP-002 (live)</option>
            <option value="PROP-001">PROP-001 (seed — golden scenes)</option>
          </select>
          <button
            onClick={loadEns}
            disabled={busy === "ens"}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {busy === "ens" ? "Reading..." : "Read live ENS config"}
          </button>
        </div>

        {ens && (
          <div className="mt-3 rounded-md border border-zinc-200 p-2 text-xs dark:border-zinc-800">
            <div className="mb-1 flex items-center gap-2">
              <StatusBadge status="info">{ens.name}</StatusBadge>
              <StatusBadge status="success">Source: {ens.source === "ens" ? "ENS Sepolia · live" : "env-fallback"}</StatusBadge>
              <StatusBadge status={ens.mode === "SALE" ? "idle" : "pending"}>{ens.mode}</StatusBadge>
            </div>
            <table className="w-full text-left">
              <tbody>
                {Object.entries(ens.records).map(([k, v]) => (
                  <tr key={k} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1 pr-2 font-mono text-zinc-400">{k}</td>
                    <td className="py-1 font-mono break-all">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ActionCard>

      <ActionCard
        title="1-2. Pick an account + Association"
        description="buyer1/buyer2 are KYC'd test accounts; nokyc is deliberately un-KYC'd."
        disabledReason={!ens ? "Read the ENS config first." : undefined}
      >
        <div className="flex flex-wrap gap-2">
          {(["buyer1", "buyer2", "nokyc"] as const).map((k) => (
            <label
              key={k}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${
                buyerKey === k ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black" : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              <input type="radio" className="hidden" checked={buyerKey === k} onChange={() => setBuyerKey(k)} disabled={!ens} />
              {k}
            </label>
          ))}
        </div>

        <label className="mt-3 block text-xs text-zinc-500">
          Hedera account for {buyerKey}
          <input
            value={buyerAccountId}
            onChange={(e) => setAccounts((prev) => ({ ...prev, [buyerKey]: e.target.value }))}
            placeholder="0.0.xxxxxx"
            className="mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
        </label>
        {!buyerAccountId && (
          <p className="mt-1 text-xs text-amber-600">
            /api/health returned no id for {buyerKey}. Check the backend&apos;s .env, or paste the id above.
          </p>
        )}

        <p className="mt-2 text-xs text-zinc-500">
          Being associated does not grant a right to buy — only KYC does.
        </p>
      </ActionCard>

      <ActionCard
        title="3. Identity Check → KYC"
        description="World Identity confirms 18+/jurisdiction; a TokenGrantKycTransaction fires server-side."
        disabledReason={!ens ? "Read the ENS config first." : buyerKey === "nokyc" ? "nokyc is deliberately never granted KYC (golden scene)." : undefined}
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
              className="rounded-md border border-dashed border-amber-400 px-3 py-1.5 text-xs text-amber-700 disabled:opacity-50 dark:text-amber-400"
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
        <PrivacyNote>Only age≥18 and jurisdiction are requested; no name, address, or document image is collected, and the raw proof is never stored.</PrivacyNote>
      </ActionCard>

      <ActionCard
        title="4. Buy"
        description="primary: fresh property (treasury exemption, no fee) · secondary: buyer1→buyer2 (2% fee) · nokyc: deliberate rejection"
      >
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="primary">primary (operator → buyer)</option>
            <option value="secondary">secondary (buyer1 → buyer2, 2% fee)</option>
            <option value="nokyc">nokyc (operator → nokyc — expect REJECTION)</option>
          </select>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <button
            onClick={doBuy}
            disabled={busy === "buy"}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {busy === "buy" ? "Processing..." : "Buy / attempt"}
          </button>
        </div>

        {buyResult && (
          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm dark:border-emerald-900 dark:bg-emerald-950">
            <p className="font-medium text-emerald-700 dark:text-emerald-300">
              ✅ Transfer complete: {buyResult.from} → {buyResult.to}
            </p>
            {/*
              Sent and received are shown separately because the 2% fee is
              INCLUSIVE — quoting the sent amount next to the recipient would
              contradict Mirror Node's own transfer list for this transaction.
            */}
            <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-white/60 p-2 dark:bg-black/20">
                <dt className="text-[10px] uppercase tracking-wide text-emerald-700/70">Sent</dt>
                <dd className="font-mono text-base font-semibold">{buyResult.amount}</dd>
              </div>
              <div className="rounded-md bg-white/60 p-2 dark:bg-black/20">
                <dt className="text-[10px] uppercase tracking-wide text-emerald-700/70">Protocol fee</dt>
                <dd className="font-mono text-base font-semibold">
                  {buyResult.assessedCustomFees.reduce((sum, f) => sum + f.amount, 0)}
                </dd>
              </div>
              <div className="rounded-md bg-white/60 p-2 dark:bg-black/20">
                <dt className="text-[10px] uppercase tracking-wide text-emerald-700/70">Received</dt>
                <dd className="font-mono text-base font-semibold">{buyResult.netAmount}</dd>
              </div>
            </dl>
            {buyResult.assessedCustomFees.length > 0 ? (
              <p className="mt-2 text-xs text-emerald-600">
                {/*
                  The chain charges max(1, floor(amount × 2%)) and shares are whole
                  units, so below 50 shares the floor dominates and the effective
                  rate is not 2%. Saying "2%" there would be false on-screen.
                */}
                {buyResult.feeFloorApplied
                  ? `Fee floor applied: 1 share minimum, an effective ${(buyResult.effectiveFeeRate * 100).toFixed(
                      1,
                    )}% on this size.`
                  : "The 2% fee"}{" "}
                was assessed by Hedera itself and routed to {buyResult.assessedCustomFees[0].collectorAccountId} — the
                app never moves it.
              </p>
            ) : (
              <p className="mt-2 text-xs text-emerald-600">No fee (treasury exemption — expected behavior).</p>
            )}
            <EvidenceLink href={buyResult.hashscanUrl} label="View on HashScan" />
          </div>
        )}
      </ActionCard>

      {error && (
        <ErrorCard
          error={error}
          note={
            error instanceof ApiRequestError && error.code === "KYC_DENIED"
              ? "Golden scene: the compliance gate runs at the network level — a transfer to an unverified wallet is rejected by the protocol."
              : undefined
          }
        />
      )}
    </div>
  );
}
