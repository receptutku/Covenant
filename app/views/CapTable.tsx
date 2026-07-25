"use client";

import { useState } from "react";
import { api } from "@/lib/apiClient";
import { ActionCard } from "@/app/components/common/ActionCard";
import { StatusBadge } from "@/app/components/common/StatusBadge";
import { EvidenceLink } from "@/app/components/common/EvidenceLink";

/**
 * Who holds the shares, read straight from Hedera's public Mirror Node.
 *
 * This component deliberately does NOT call our own API. Every other panel could
 * in principle be showing whatever the server chose to say; this one asks Hedera
 * directly from the browser, so "we are not the source of this claim" is
 * literally true of the network request, not just of the wording.
 */

const MIRROR_BASE = "https://testnet.mirrornode.hedera.com/api/v1";

type Balance = { account: string; balance: number; decimals: number };

export function CapTable() {
  const [tokenId, setTokenId] = useState("");
  const [propertyId, setPropertyId] = useState("PROP-001");
  const [balances, setBalances] = useState<Balance[] | null>(null);
  const [resolvedToken, setResolvedToken] = useState<string | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = balances?.reduce((sum, b) => sum + b.balance, 0) ?? 0;

  async function load() {
    setBusy(true);
    setError(null);
    setBalances(null);
    try {
      // Roles come from /api/health so the table can say "treasury" and "nokyc"
      // rather than printing four opaque account ids. The balances themselves
      // never pass through our server.
      let roleMap: Record<string, string> = {};
      try {
        const health = await api.health();
        const d = health.demoAccounts;
        roleMap = Object.fromEntries(
          [
            [d.operator, "treasury"],
            [d.buyer1, "buyer1"],
            [d.buyer2, "buyer2"],
            [d.nokyc, "nokyc — never granted KYC"],
          ].filter(([id]) => Boolean(id)) as [string, string][],
        );
      } catch {
        /* labels are a nicety; the table is readable without them */
      }
      setLabels(roleMap);

      let id = tokenId.trim();
      if (!id) {
        // No token id typed: resolve the one this property is actually using.
        const audit = await api.readAudit(propertyId.trim());
        if (!audit.token?.tokenId) {
          throw new Error(`${propertyId} has no token yet.`);
        }
        id = audit.token.tokenId;
      }
      setResolvedToken(id);

      const res = await fetch(`${MIRROR_BASE}/tokens/${encodeURIComponent(id)}/balances`);
      if (!res.ok) throw new Error(`Mirror Node returned ${res.status} for token ${id}.`);
      const body = (await res.json()) as { balances: Balance[] };
      setBalances([...body.balances].sort((a, b) => b.balance - a.balance));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ActionCard
      title="6. Cap table — who holds the shares"
      description="Fetched from Hedera Mirror Node by the browser. This panel never touches our own API for the numbers."
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
          {busy ? "Reading Mirror Node..." : "Read holders"}
        </button>
      </div>

      {balances && resolvedToken && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="info">token {resolvedToken}</StatusBadge>
            <StatusBadge status="success">{total} of 1000 shares accounted for</StatusBadge>
            <StatusBadge status="info">{balances.length} accounts</StatusBadge>
          </div>

          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
                <th className="py-1">Account</th>
                <th className="py-1">Role</th>
                <th className="py-1 text-right">Shares</th>
                <th className="py-1 text-right">% of supply</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.account} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                  <td className="py-1.5 font-mono text-xs">{b.account}</td>
                  <td className="py-1.5 text-xs text-zinc-500">{labels[b.account] ?? "—"}</td>
                  <td className="py-1.5 text-right font-mono">{b.balance}</td>
                  <td className="py-1.5 text-right font-mono text-zinc-500">
                    {total > 0 ? ((b.balance / total) * 100).toFixed(1) : "0.0"}%
                  </td>
                  <td className="py-1.5 text-right">
                    <EvidenceLink
                      href={`https://hashscan.io/testnet/account/${b.account}`}
                      label="HashScan"
                    />
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

          <p className="text-xs text-zinc-500">
            An account holding zero is still listed — it is associated with the token, which is a different
            state from never having opted in. That distinction is what makes the KYC refusal above meaningful:
            the un-KYC&apos;d account accepted the token and still cannot receive it. For where each balance came
            from, read the transfer events in the audit trail above.
          </p>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </ActionCard>
  );
}
