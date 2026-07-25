"use client";

import { useState } from "react";
import { api } from "@/lib/apiClient";
import { ActionCard } from "@/app/components/common/ActionCard";
import { StatusBadge } from "@/app/components/common/StatusBadge";
import { EvidenceLink } from "@/app/components/common/EvidenceLink";

/**
 * Who holds the shares, read straight from Hedera's public Mirror Node.
 *
 * This component deliberately does NOT ask our own API for any number. Every
 * other panel could in principle be showing whatever the server chose to say;
 * this one queries Hedera from the browser, so "we are not the source of this
 * claim" is true of the network request itself, not just of the wording.
 *
 * The headline is the invariant, not the table: the balances sum to exactly the
 * total supply, and the token has no supply key, so no one — including us — can
 * mint another share. A cap table that merely lists holders is decoration; one
 * that shows a conserved total is evidence.
 */

const MIRROR_BASE = "https://testnet.mirrornode.hedera.com/api/v1";
const TOTAL_SUPPLY = 1000;

type Balance = { account: string; balance: number };
type Row = Balance & { role: string | null; kycStatus: string | null };

export function CapTable() {
  const [tokenId, setTokenId] = useState("");
  const [propertyId, setPropertyId] = useState("PROP-001");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [resolvedToken, setResolvedToken] = useState<string | null>(null);
  const [readAt, setReadAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = rows?.reduce((sum, r) => sum + r.balance, 0) ?? 0;
  const conserved = rows !== null && total === TOTAL_SUPPLY;

  async function load() {
    setBusy(true);
    setError(null);
    try {
      // Roles come from /api/health so the table can say "treasury" instead of
      // printing four opaque ids. Hard-coding these once cost us an hour of
      // failures against accounts that did not exist.
      let roles: Record<string, string> = {};
      try {
        const health = await api.health();
        const d = health.demoAccounts;
        roles = Object.fromEntries(
          [
            [d.operator, "treasury"],
            [d.buyer1, "buyer1"],
            [d.buyer2, "buyer2"],
            [d.nokyc, "nokyc"],
          ].filter(([id]) => Boolean(id)) as [string, string][],
        );
      } catch {
        /* labels are a nicety; the table is readable without them */
      }

      let id = tokenId.trim();
      if (!id) {
        const audit = await api.readAudit(propertyId.trim());
        if (!audit.token?.tokenId) throw new Error(`${propertyId} has no token yet.`);
        id = audit.token.tokenId;
      }
      setResolvedToken(id);

      const res = await fetch(`${MIRROR_BASE}/tokens/${encodeURIComponent(id)}/balances`);
      if (!res.ok) throw new Error(`Mirror Node returned ${res.status} for token ${id}.`);
      const body = (await res.json()) as { balances: Balance[] };

      // KYC status is per account-token relationship, so it needs a second call
      // each. Four accounts, issued in parallel — the compliance story is the
      // point of the table and it should not be a separate click.
      const withKyc: Row[] = await Promise.all(
        body.balances.map(async (b) => {
          let kycStatus: string | null = null;
          try {
            const r = await fetch(
              `${MIRROR_BASE}/accounts/${encodeURIComponent(b.account)}/tokens?token.id=${encodeURIComponent(id)}`,
            );
            if (r.ok) {
              const j = (await r.json()) as { tokens: { kyc_status?: string }[] };
              kycStatus = j.tokens?.[0]?.kyc_status ?? null;
            }
          } catch {
            /* leave unknown rather than guess */
          }
          return { ...b, role: roles[b.account] ?? null, kycStatus };
        }),
      );

      setRows(withKyc.sort((a, b) => b.balance - a.balance));
      setReadAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError((e as Error).message);
      setRows(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ActionCard
      title="6. Cap table — who holds the shares"
      description="Fetched from Hedera Mirror Node by the browser. None of these numbers pass through our own API."
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-zinc-500">
          Property
          <input
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value.trim().toUpperCase())}
            placeholder="PROP-001"
            className="mt-1 block w-32 rounded-md border border-zinc-300 px-2 py-1 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
        </label>
        <span className="pb-1 text-xs text-zinc-400">or</span>
        <label className="text-xs text-zinc-500">
          Token id directly
          <input
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value.trim())}
            placeholder="0.0.…"
            className="mt-1 block w-36 rounded-md border border-zinc-300 px-2 py-1 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
        </label>
        <button
          onClick={load}
          disabled={busy}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {busy ? "Reading Mirror Node..." : rows ? "Refresh" : "Read holders"}
        </button>
        {readAt && <span className="pb-1 text-xs text-zinc-400">as of {readAt}</span>}
      </div>

      {rows && resolvedToken && (
        <div className="mt-4 flex flex-col gap-3">
          {/* The invariant, stated before the detail. */}
          <div
            className={`rounded-lg border p-3 ${
              conserved
                ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950"
                : "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950"
            }`}
          >
            <p className="font-mono text-lg font-semibold">
              Σ {total} / {TOTAL_SUPPLY} shares {conserved ? "✓" : "—"}
            </p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              {conserved
                ? "Every share is accounted for. The token has no supply key, so this total can never grow — not by us either."
                : "Balances do not currently sum to the total supply. Mirror Node may still be catching up; refresh in a few seconds."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="info">token {resolvedToken}</StatusBadge>
            <StatusBadge status="info">{rows.length} accounts</StatusBadge>
          </div>

          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
                <th className="py-1">Account</th>
                <th className="py-1">Role</th>
                <th className="py-1">KYC</th>
                <th className="py-1 text-right">Shares</th>
                <th className="py-1 text-right">%</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.account} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                  <td className="py-1.5 font-mono text-xs">{r.account}</td>
                  <td className="py-1.5 text-xs text-zinc-500">{r.role ?? "—"}</td>
                  <td className="py-1.5">
                    {r.kycStatus === "GRANTED" ? (
                      <StatusBadge status="success">GRANTED</StatusBadge>
                    ) : r.kycStatus ? (
                      <StatusBadge status="error">{r.kycStatus}</StatusBadge>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right font-mono">{r.balance}</td>
                  <td className="py-1.5 text-right font-mono text-zinc-500">
                    {((r.balance / TOTAL_SUPPLY) * 100).toFixed(1)}%
                  </td>
                  <td className="py-1.5 text-right">
                    <EvidenceLink href={`https://hashscan.io/testnet/account/${r.account}`} label="HashScan" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap gap-4">
            <EvidenceLink
              href={`${MIRROR_BASE}/tokens/${resolvedToken}/balances`}
              label="Raw Mirror Node balances"
            />
            <EvidenceLink
              href={`https://hashscan.io/testnet/token/${resolvedToken}`}
              label="Token on HashScan"
            />
          </div>

          <div className="flex flex-col gap-1 text-xs text-zinc-500">
            <p>
              Reading the table: the treasury is exempt from the token&apos;s own fee, so a primary sale moves
              shares without one. On a secondary sale the 2% is inclusive — the sender is debited the full
              amount and the recipient receives the remainder, which is why a purchase of 100 shows up here as
              98.
            </p>
            <p>
              An account holding zero is still listed: it is associated with the token, which is a different
              state from never having opted in. That is what makes the KYC column meaningful — the account
              accepted the token and still cannot receive it.
            </p>
            <p>
              Mirror Node trails consensus by a few seconds. A refresh immediately after a purchase can show
              the previous figures; the timestamp above says when this snapshot was taken.
            </p>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </ActionCard>
  );
}
