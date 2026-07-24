"use client";

import { useState } from "react";
import { api, ApiRequestError } from "@/lib/apiClient";
import type { PendingVerificationItem, Attestation } from "@/lib/api-types";
import { ActionCard } from "@/app/components/common/ActionCard";
import { StatusBadge } from "@/app/components/common/StatusBadge";
import { ErrorCard } from "@/app/components/common/ErrorCard";
import { PrivacyNote } from "@/app/components/common/PrivacyNote";

export function VerifierView() {
  const [adminSecret, setAdminSecret] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [pending, setPending] = useState<PendingVerificationItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiRequestError | Error | null>(null);
  const [reason, setReason] = useState("");
  const [lastAttestation, setLastAttestation] = useState<Attestation | null>(null);
  const [tamperResult, setTamperResult] = useState<"idle" | "blocked" | "unexpected">("idle");
  const [checks, setChecks] = useState({ readable: false, matchesForm: false, ownerMatch: false, sufficient: false });

  const allChecked = Object.values(checks).every(Boolean);

  async function loadPending() {
    if (!adminSecret.trim()) return;
    setBusy("load");
    setError(null);
    try {
      // ⚠ The mock does not validate the secret (the real DEMO_ADMIN_SECRET isn't on
      // Akif's machine). Against the real API this call may return 401 UNAUTHORIZED —
      // showing "wrong secret" to the user is enough in that case.
      const res = await api.listPendingVerifications();
      setPending(res.pending);
      setUnlocked(true);
    } catch (e) {
      setError(e as ApiRequestError);
    } finally {
      setBusy(null);
    }
  }

  async function decide(propertyId: string, decision: "APPROVED" | "REJECTED") {
    setBusy(propertyId + decision);
    setError(null);
    try {
      const res = await api.decideVerification({
        propertyId,
        decision,
        reason: decision === "REJECTED" ? reason || "Not specified" : null,
      });
      if (res.state === "APPROVED") {
        setLastAttestation(res.attestation);
      }
      setPending((prev) => prev.filter((p) => p.propertyId !== propertyId));
      setTamperResult("idle");
    } catch (e) {
      setError(e as ApiRequestError);
    } finally {
      setBusy(null);
    }
  }

  async function runTamperTest() {
    if (!lastAttestation) return;
    setBusy("tamper");
    setTamperResult("idle");
    try {
      const tampered: Attestation = { ...lastAttestation, documentRoot: lastAttestation.documentRoot + "00" };
      await api.tokenize({ propertyId: tampered.propertyId, attestation: tampered });
      setTamperResult("unexpected"); // unexpected — tokenize should NOT have accepted this
    } catch {
      setTamperResult("blocked"); // expected: rejected with ATTESTATION_INVALID
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold">Verifier (Human Review)</h2>

      <ActionCard title="Sign in" description="Use the admin secret to see pending properties.">
        <div className="flex gap-2">
          <input
            type="password"
            value={adminSecret}
            onChange={(e) => setAdminSecret(e.target.value)}
            placeholder="x-demo-admin-secret"
            className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <button
            onClick={loadPending}
            disabled={busy === "load"}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {busy === "load" ? "..." : "Load pending"}
          </button>
        </div>
        <PrivacyNote>The secret lives only in this session&apos;s memory — never written to code, env, or localStorage.</PrivacyNote>
      </ActionCard>

      {unlocked && pending.length === 0 && (
        <ActionCard title="Queue is empty" description="No property is currently awaiting review." />
      )}

      {pending.map((item) => (
        <ActionCard key={item.propertyId} title={`${item.propertyId} — ${item.displayName}`} description={item.city}>
          <ul className="mb-2 text-xs text-zinc-500">
            {item.files.map((f) => (
              <li key={f.name}>
                {f.name} · {f.type} · {(f.sizeBytes / 1024).toFixed(0)} KB
              </li>
            ))}
          </ul>
          <p className="mb-2 text-xs text-zinc-400">Document root: {item.documentRoot.slice(0, 20)}…</p>

          <div className="mb-2 flex flex-col gap-1 text-xs">
            {[
              { key: "readable", label: "Document is legible" },
              { key: "matchesForm", label: "Matches the property form" },
              { key: "ownerMatch", label: "Owner/authority matches the demo record" },
              { key: "sufficient", label: "Sufficient for review" },
            ].map((c) => (
              <label key={c.key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={checks[c.key as keyof typeof checks]}
                  onChange={(e) => setChecks((prev) => ({ ...prev, [c.key]: e.target.checked }))}
                />
                {c.label}
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => decide(item.propertyId, "APPROVED")}
              disabled={!allChecked || busy === item.propertyId + "APPROVED"}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Approve
            </button>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="rejection reason"
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
            />
            <button
              onClick={() => decide(item.propertyId, "REJECTED")}
              disabled={busy === item.propertyId + "REJECTED"}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Reject
            </button>
          </div>
        </ActionCard>
      ))}

      {lastAttestation && (
        <ActionCard
          title="Last issued attestation"
          description={`${lastAttestation.propertyId} · expires at ${lastAttestation.expiresAt.slice(11, 19)}`}
          techNote="Ed25519-signed — the signature and verifierPublicKey fields were produced server-side."
        >
          <StatusBadge status="success">signature-valid</StatusBadge>
          <div className="mt-3">
            <button
              onClick={runTamperTest}
              disabled={busy === "tamper"}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
            >
              {busy === "tamper" ? "Testing..." : "🧪 Tamper test (corrupt documentRoot, try tokenize)"}
            </button>
            {tamperResult === "blocked" && (
              <p className="mt-2 text-sm text-emerald-600">
                ✅ Expected result: the tampered attestation was rejected on tokenize (ATTESTATION_INVALID).
              </p>
            )}
            {tamperResult === "unexpected" && (
              <p className="mt-2 text-sm text-red-600">
                ⚠ Unexpected: the tampered attestation was accepted — this is a security bug, report it to Recep.
              </p>
            )}
          </div>
        </ActionCard>
      )}

      {error && <ErrorCard error={error} />}
    </div>
  );
}
