"use client";

import { useState } from "react";
import { api, ApiRequestError } from "@/lib/apiClient";
import { devIssueSellerSession } from "@/lib/realApi";
import type { Attestation } from "@/lib/api-types";
import { WorldVerifyButton } from "@/app/components/WorldVerifyButton";
import { StepIndicator } from "@/app/components/common/StepIndicator";
import { ActionCard } from "@/app/components/common/ActionCard";
import { StatusBadge } from "@/app/components/common/StatusBadge";
import { PrivacyNote } from "@/app/components/common/PrivacyNote";
import { ErrorCard } from "@/app/components/common/ErrorCard";
import { EvidenceLink } from "@/app/components/common/EvidenceLink";

const STEPS = ["Selfie", "Upload", "Review", "Tokenize", "ENS"];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // "data:application/pdf;base64,XXXX" → keep only the XXXX part
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function SellerView({ attestations }: { attestations: Record<string, Attestation> }) {
  const [session, setSession] = useState<{ token: string; expiresAt: string } | null>(null);
  const [propertyId, setPropertyId] = useState("PROP-002");
  const [displayName, setDisplayName] = useState("Alfama 2BR");
  const [city, setCity] = useState("Lisbon");
  const [sellerAccountId, setSellerAccountId] = useState("0.0.123456");
  const [tokenSymbol, setTokenSymbol] = useState("ALFM");
  const [files, setFiles] = useState<File[]>([]);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiRequestError | Error | null>(null);

  // Dev-only bypass (Phase A7 not done yet — no real World IDKit widget).
  const [devSecret, setDevSecret] = useState("");
  const [showDevBypass, setShowDevBypass] = useState(false);

  const [documentRoot, setDocumentRoot] = useState<string | null>(null);
  const [propertyState, setPropertyState] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [tokenizeResult, setTokenizeResult] = useState<{ tokenId: string; hashscanUrl: string } | null>(null);

  const step = !session ? 0 : !documentRoot ? 1 : propertyState !== "TOKENIZED" ? 2 : 4;

  async function handleProof(proof: Record<string, unknown>) {
    setBusy("selfie");
    setError(null);
    try {
      const res = await api.onboardSeller({ proof, action: "onboard-seller" });
      setSession({ token: res.sellerSessionToken, expiresAt: res.expiresAt });
    } catch (e) {
      setError(e as ApiRequestError);
    } finally {
      setBusy(null);
    }
  }

  async function handleDevBypass() {
    setBusy("selfie");
    setError(null);
    try {
      const res = await devIssueSellerSession(devSecret);
      setSession({ token: res.sellerSessionToken, expiresAt: res.expiresAt });
    } catch (e) {
      setError(e as ApiRequestError);
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmit() {
    if (!session) return;
    setBusy("submit");
    setError(null);
    try {
      const encoded = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          type: f.type as "application/pdf" | "image/png" | "image/jpeg",
          dataBase64: await fileToBase64(f),
        })),
      );
      const res = await api.submitProperty({
        sellerSessionToken: session.token,
        propertyId,
        displayName,
        city,
        sellerAccountId,
        tokenSymbol,
        files: encoded,
      });
      setDocumentRoot(res.documentRoot);
      setPropertyState(res.state);
    } catch (e) {
      setError(e as ApiRequestError);
    } finally {
      setBusy(null);
    }
  }

  async function handleRefreshStatus() {
    if (!session) return;
    setBusy("refresh");
    setError(null);
    try {
      // Ask the server about THIS property. The earlier version scanned the HCS
      // timeline for event names, which answers a question about the topic
      // rather than about one property — so every property read as "Tokenized"
      // and the Tokenize button never appeared. The rejection reason also lives
      // only here: on-chain there is just a hash of it, because a reviewer's
      // free text is the natural place for personal data.
      const res = await api.getProperty(propertyId, session.token);
      setPropertyState(res.state);
      setRejectReason(res.rejectionReason);
      if (res.tokenId && res.hashscanUrl) {
        setTokenizeResult({ tokenId: res.tokenId, hashscanUrl: res.hashscanUrl });
      }
    } catch (e) {
      setError(e as ApiRequestError);
    } finally {
      setBusy(null);
    }
  }

  async function handleTokenize() {
    setBusy("tokenize");
    setError(null);
    try {
      const attestation = attestations[propertyId];
      if (!attestation) {
        throw new Error("No attestation yet — wait for verifier approval and refresh the status.");
      }
      const res = await api.tokenize({ propertyId, attestation });
      setPropertyState(res.state);
      setTokenizeResult({ tokenId: res.tokenId, hashscanUrl: res.hashscanUrl });
    } catch (e) {
      setError(e as ApiRequestError);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Seller</h2>
        <StepIndicator steps={STEPS} activeIndex={step} />
      </div>

      <ActionCard title="1. Selfie Check (World ID)" description="No liveness proof, no document upload — the seller gate.">
        {!session ? (
          <div className="flex flex-col gap-2">
            <WorldVerifyButton
              action="onboard-seller"
              signal={propertyId}
              label={busy === "selfie" ? "Verifying..." : "Verify with Selfie (World ID)"}
              disabled={busy === "selfie"}
              onProof={handleProof}
            />

            <button
              type="button"
              onClick={() => setShowDevBypass((v) => !v)}
              className="w-fit text-xs text-zinc-500 underline"
            >
              {showDevBypass ? "Hide dev bypass" : "Dev: skip Selfie (testing only)"}
            </button>

            {showDevBypass && (
              <div className="flex items-center gap-2 rounded-md border border-dashed border-amber-400 p-2">
                <input
                  type="password"
                  value={devSecret}
                  onChange={(e) => setDevSecret(e.target.value)}
                  placeholder="admin secret"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
                <button
                  onClick={handleDevBypass}
                  disabled={busy === "selfie" || !devSecret}
                  className="rounded-md bg-amber-500 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  {busy === "selfie" ? "..." : "Issue dev session"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <StatusBadge status="success">Session active · valid until {new Date(session.expiresAt).toLocaleTimeString()}</StatusBadge>
            <button
              type="button"
              onClick={() => setSession(null)}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
            >
              Reset session
            </button>
          </div>
        )}
        <PrivacyNote>
          Only session active/expiry info is shown. The raw World nullifier or proof is never kept on screen or in
          localStorage. The dev bypass above skips real World verification entirely — testing only, never in the
          real demo.
        </PrivacyNote>
      </ActionCard>

      <ActionCard
        title="2. Submit Property Documents"
        description="Up to 3 files, PDF/PNG/JPEG, 5MB each."
        disabledReason={!session ? "Selfie verification is required first." : undefined}
      >
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              placeholder="propertyId"
              disabled={!session}
            />
            <input
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={tokenSymbol}
              onChange={(e) => setTokenSymbol(e.target.value)}
              placeholder="token symbol"
              disabled={!session}
            />
            <input
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="display name"
              disabled={!session}
            />
            <input
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="city"
              disabled={!session}
            />
            <input
              className="col-span-2 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={sellerAccountId}
              onChange={(e) => setSellerAccountId(e.target.value)}
              placeholder="seller Hedera account"
              disabled={!session}
            />
          </div>
          <input
            type="file"
            multiple
            accept="application/pdf,image/png,image/jpeg"
            disabled={!session}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))}
            className="text-sm"
          />
          {files.length > 0 && (
            <ul className="text-xs text-zinc-500">
              {files.map((f) => (
                <li key={f.name}>
                  {f.name} — {(f.size / 1024).toFixed(0)} KB
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={handleSubmit}
            disabled={!session || files.length === 0 || busy === "submit"}
            className="w-fit rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {busy === "submit" ? "Submitting..." : "Submit documents"}
          </button>
        </div>
        <PrivacyNote>Document bytes and salts stay server-side only; the response carries just the Merkle root.</PrivacyNote>
      </ActionCard>

      {documentRoot && (
        <ActionCard title="3. Review Status" description={`Document root: ${documentRoot.slice(0, 18)}…`}>
          <div className="flex items-center gap-2">
            {propertyState === "PENDING_REVIEW" && <StatusBadge status="pending">Awaiting review</StatusBadge>}
            {propertyState === "APPROVED" && <StatusBadge status="success">Approved — Ed25519 signed</StatusBadge>}
            {propertyState === "REJECTED" && <StatusBadge status="error">Rejected</StatusBadge>}
            {propertyState === "TOKENIZED" && <StatusBadge status="success">Tokenized</StatusBadge>}
            <button
              onClick={handleRefreshStatus}
              disabled={busy === "refresh"}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
            >
              {busy === "refresh" ? "..." : "Refresh status"}
            </button>
          </div>
          {propertyState === "REJECTED" && rejectReason && (
            <p className="mt-2 text-sm text-red-600">Reason: {rejectReason}</p>
          )}
        </ActionCard>
      )}

      {propertyState === "APPROVED" && (
        <ActionCard title="4. Tokenize" description="Only runs for a valid, signed APPROVED record.">
          <button
            onClick={handleTokenize}
            disabled={busy === "tokenize"}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {busy === "tokenize" ? "Tokenizing..." : "Tokenize (HTS)"}
          </button>
        </ActionCard>
      )}

      {tokenizeResult && (
        <ActionCard title="5. Token Created" description={`Token ID: ${tokenizeResult.tokenId}`}>
          <EvidenceLink href={tokenizeResult.hashscanUrl} label="View on HashScan" />
          <p className="mt-2 text-xs text-zinc-500">Next: read the live ENS config from the Buyer column.</p>
        </ActionCard>
      )}

      {error && <ErrorCard error={error} />}
    </div>
  );
}
