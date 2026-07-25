"use client";

import { useState } from "react";
import { api, ApiRequestError } from "@/lib/apiClient";
import { setDemoAdminSecret } from "@/lib/realApi";
import type { PendingVerificationItem, Attestation } from "@/lib/api-types";
import { ActionCard } from "@/app/components/common/ActionCard";
import { StatusBadge } from "@/app/components/common/StatusBadge";
import { ErrorCard } from "@/app/components/common/ErrorCard";
import { PrivacyNote } from "@/app/components/common/PrivacyNote";

type ReviewChecks = {
  readable: boolean;
  matchesForm: boolean;
  ownerMatch: boolean;
  sufficient: boolean;
};

const EMPTY_CHECKS: ReviewChecks = {
  readable: false,
  matchesForm: false,
  ownerMatch: false,
  sufficient: false,
};

export function VerifierView({ onApproved }: { onApproved: (propertyId: string, attestation: Attestation) => void }) {
  const [adminSecret, setAdminSecret] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [pending, setPending] = useState<PendingVerificationItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiRequestError | Error | null>(null);
  const [reason, setReason] = useState("");
  const [lastAttestation, setLastAttestation] = useState<Attestation | null>(null);
  const [tamperResult, setTamperResult] = useState<"idle" | "blocked" | "unexpected" | "inconclusive">("idle");
  const [tamperCode, setTamperCode] = useState<string | null>(null);
  // Keyed by propertyId. One shared object meant ticking the four boxes for one property
  // enabled Approve for every other item in the queue, and the ticks survived the decision —
  // which empties the four checkboxes of the only thing they are there to assert: that a
  // human looked at THIS document.
  const [checksByProperty, setChecksByProperty] = useState<Record<string, ReviewChecks>>({});

  const checksFor = (propertyId: string): ReviewChecks =>
    checksByProperty[propertyId] ?? EMPTY_CHECKS;

  const allCheckedFor = (propertyId: string) => Object.values(checksFor(propertyId)).every(Boolean);

  async function loadPending() {
    if (!adminSecret.trim()) return;
    setBusy("load");
    setError(null);
    try {
      // The secret is held in module memory inside realApi and attached as the
      // x-demo-admin-secret header on every verifier call. It never leaves this
      // session — no code, env, or localStorage.
      setDemoAdminSecret(adminSecret.trim());
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
        onApproved(propertyId, res.attestation);
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
    setTamperCode(null);
    try {
      const tampered: Attestation = { ...lastAttestation, documentRoot: lastAttestation.documentRoot + "00" };
      await api.tokenize({ propertyId: tampered.propertyId, attestation: tampered });
      setTamperResult("unexpected"); // unexpected — tokenize should NOT have accepted this
    } catch (e) {
      // Only ATTESTATION_INVALID proves anything here. A bare catch reported EVERY failure as
      // a pass — including ALREADY_TOKENIZED, which is what you get by running this twice on
      // the same property, and which means the signature check was never reached. Claiming
      // "the tampered attestation was rejected" on the strength of a different error is
      // claiming evidence we do not have, in the one scene whose entire point is evidence.
      const code = e instanceof ApiRequestError ? e.code : "UNKNOWN";
      setTamperCode(code);
      setTamperResult(code === "ATTESTATION_INVALID" ? "blocked" : "inconclusive");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="border-b border-[var(--border)] pb-4 text-[22px] font-semibold tracking-[-0.03em]">Verifier <span className="font-normal text-[var(--faint)]">· human review</span></h2>

      <ActionCard title="Sign in" description="Use the admin secret to see pending properties." active={!unlocked}>
        <div className="flex gap-2">
          <input
            type="password"
            value={adminSecret}
            onChange={(e) => setAdminSecret(e.target.value)}
            placeholder="x-demo-admin-secret"
            className="flex-1 field"
          />
          <button
            onClick={loadPending}
            disabled={busy === "load"}
            className="btn btn-primary"
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
        <ActionCard key={item.propertyId} title={`${item.propertyId} — ${item.displayName}`} description={item.city} active>
          <ul className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] p-3 text-xs leading-relaxed text-[var(--muted)]">
            {item.files.map((f) => (
              <li key={f.name}>
                {f.name} · {f.type} · {(f.sizeBytes / 1024).toFixed(0)} KB
              </li>
            ))}
          </ul>
          <p className="mb-3 font-mono text-xs text-[var(--faint)]">Document root: {item.documentRoot.slice(0, 20)}…</p>

          <div className="mb-2 flex flex-col gap-1 text-xs">
            {[
              { key: "readable", label: "Document is legible" },
              { key: "matchesForm", label: "Matches the property form" },
              { key: "ownerMatch", label: "Owner/authority matches the demo record" },
              { key: "sufficient", label: "Sufficient for review" },
            ].map((c) => (
              <label key={c.key} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2">
                <input
                  type="checkbox"
                  checked={checksFor(item.propertyId)[c.key as keyof ReviewChecks]}
                  onChange={(e) =>
                    setChecksByProperty((prev) => ({
                      ...prev,
                      [item.propertyId]: {
                        ...(prev[item.propertyId] ?? EMPTY_CHECKS),
                        [c.key]: e.target.checked,
                      },
                    }))
                  }
                />
                {c.label}
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => decide(item.propertyId, "APPROVED")}
              disabled={!allCheckedFor(item.propertyId) || busy === item.propertyId + "APPROVED"}
              className="rounded-full bg-[var(--success)] px-4 py-2 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-[0.97] disabled:opacity-40 disabled:hover:scale-100"
            >
              Approve
            </button>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="rejection reason"
              className="field flex-1"
            />
            <button
              onClick={() => decide(item.propertyId, "REJECTED")}
              disabled={busy === item.propertyId + "REJECTED"}
              className="rounded-full bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-[0.97] disabled:opacity-40 disabled:hover:scale-100"
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
              className="btn btn-secondary btn-sm"
            >
              {busy === "tamper" ? "Testing..." : "🧪 Tamper test (corrupt documentRoot, try tokenize)"}
            </button>
            {tamperResult === "blocked" && (
              <p className="mt-2 text-sm text-[var(--success)]">
                ✅ Expected result: the tampered attestation was rejected on tokenize (ATTESTATION_INVALID).
              </p>
            )}
            {tamperResult === "inconclusive" && (
              <p className="mt-2 text-sm text-[var(--warning)]">
                ⚠ Inconclusive: tokenize failed with {tamperCode}, not ATTESTATION_INVALID — the
                signature was never checked. Re-run on a property that has not been tokenized yet.
              </p>
            )}
            {tamperResult === "unexpected" && (
              <p className="mt-2 text-sm text-[var(--danger)]">
                ⚠ Unexpected: the tampered attestation was accepted. This is a security bug — stop the demo.
              </p>
            )}
          </div>
        </ActionCard>
      )}

      {error && <ErrorCard error={error} />}
    </div>
  );
}
