"use client";

import { useState, useEffect } from "react";
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
  // Filled from /api/health on mount. A hard-coded id is exactly what that endpoint exists
  // to kill: this one is invented, it is visible on screen during the pitch, it is echoed
  // into the verifier's queue card, and it is signed into the attestation.
  const [sellerAccountId, setSellerAccountId] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("ALFM");

  // The operator is the seller/landlord in the demo's role mapping, and /api/health is the
  // only trustworthy source for it: the ids differ per environment and per .env, so anything
  // typed into source is a lie waiting to be shown on a projector.
  useEffect(() => {
    api
      .health()
      .then((h) => setSellerAccountId((current) => current || (h.demoAccounts.operator ?? "")))
      .catch(() => {
        /* leave it empty — an empty required field is honest, an invented id is not */
      });
  }, []);
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

  // APPROVED is its own step, not the tail of Review: it is exactly when the Tokenize card
  // appears. Collapsing it into "everything that is not TOKENIZED" meant index 3 was never
  // reached, so the bar jumped from Review to ENS while the seller was being asked to mint.
  const step = !session
    ? 0
    : !documentRoot
      ? 1
      : propertyState === "TOKENIZED"
        ? 4
        : propertyState === "APPROVED"
          ? 3
          : 2;

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

  // For the two calls that carry the session token. A session lasts 30 minutes by default
  // and nothing on screen notices it lapsing: the badge keeps reading "Session active", every
  // submit and refresh 401s, and the World button is gated on `!session` so it never returns.
  // Dropping the session is what puts Selfie Check back within reach.
  function reportError(e: unknown) {
    if (e instanceof ApiRequestError && e.code === "SELLER_SESSION_EXPIRED") setSession(null);
    setError(e as ApiRequestError);
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
      reportError(e);
    } finally {
      setBusy(null);
    }
  }

  // Whether the SERVER holds an approval — not whether this tab holds the signature.
  const [attestationOnServer, setAttestationOnServer] = useState(false);

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
      // The server knows an approval exists; only this browser tab holds the signature
      // itself. After a reload the two disagree, and the seller would otherwise get an
      // APPROVED badge, a Tokenize button, and a bare thrown Error on clicking it.
      setAttestationOnServer(res.hasAttestation);
      if (res.tokenId && res.hashscanUrl) {
        setTokenizeResult({ tokenId: res.tokenId, hashscanUrl: res.hashscanUrl });
      }
    } catch (e) {
      reportError(e);
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
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-3 border-b border-[var(--border)] pb-4">
        <h2 className="text-[22px] font-semibold tracking-[-0.03em]">Seller</h2>
        <StepIndicator steps={STEPS} activeIndex={step} />
      </div>

      <ActionCard title="1. Selfie Check (World ID)" description="Proof of a live human, without a document upload — the seller gate." active={step === 0}>
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
              className="w-fit text-xs text-[var(--muted)] underline"
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
                  className="field"
                />
                <button
                  onClick={handleDevBypass}
                  disabled={busy === "selfie" || !devSecret}
                  className="rounded-full bg-[var(--warning)] px-3 py-1.5 text-xs font-semibold text-white transition-transform hover:scale-[1.02] active:scale-[0.97] disabled:opacity-50 disabled:hover:scale-100"
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
              className="btn btn-secondary btn-sm"
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
        active={step === 1}
      >
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              className="field"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              placeholder="propertyId"
              disabled={!session}
            />
            <input
              className="field"
              value={tokenSymbol}
              onChange={(e) => setTokenSymbol(e.target.value)}
              placeholder="token symbol"
              disabled={!session}
            />
            <input
              className="field"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="display name"
              disabled={!session}
            />
            <input
              className="field"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="city"
              disabled={!session}
            />
            <input
              className="field col-span-2"
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
            className="text-sm text-[var(--muted)] file:mr-3 file:rounded-lg file:border file:border-[var(--border-strong)] file:bg-[var(--surface-sunken)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[var(--foreground)]"
          />
          {files.length > 0 && (
            <ul className="text-xs text-[var(--muted)]">
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
            className="btn btn-primary w-fit"
          >
            {busy === "submit" ? "Submitting..." : "Submit documents"}
          </button>
        </div>
        <PrivacyNote>Document bytes and salts stay server-side only; the response carries just the Merkle root.</PrivacyNote>
      </ActionCard>

      {documentRoot && (
        <ActionCard title="3. Review Status" description={`Document root: ${documentRoot.slice(0, 18)}…`} active={step === 2}>
          <div className="flex items-center gap-2">
            {propertyState === "PENDING_REVIEW" && <StatusBadge status="pending">Awaiting review</StatusBadge>}
            {propertyState === "APPROVED" && <StatusBadge status="success">Approved — Ed25519 signed</StatusBadge>}
            {propertyState === "REJECTED" && <StatusBadge status="error">Rejected</StatusBadge>}
            {propertyState === "TOKENIZED" && <StatusBadge status="success">Tokenized</StatusBadge>}
            <button
              onClick={handleRefreshStatus}
              // Without a session the handler returns immediately: no spinner, no error,
              // no state change. A dead button reads as a broken app.
              disabled={busy === "refresh" || !session}
              className="btn btn-secondary btn-sm"
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
        <ActionCard title="4. Tokenize" description="Only runs for a valid, signed APPROVED record." active={step === 3}>
          {attestationOnServer && !attestations[propertyId] && (
            <p className="mb-2 text-xs text-amber-600">
              The server holds an approval for this property, but this browser no longer has the
              signature — it is kept in memory only and a page reload discards it. Re-submit and
              have it approved again, or use the dev session helper.
            </p>
          )}
          <button
            onClick={handleTokenize}
            disabled={busy === "tokenize" || !attestations[propertyId]}
            className="btn btn-primary"
          >
            {busy === "tokenize" ? "Tokenizing..." : "Tokenize (HTS)"}
          </button>
        </ActionCard>
      )}

      {tokenizeResult && (
        <ActionCard title="5. Token Created" description={`Token ID: ${tokenizeResult.tokenId}`}>
          <EvidenceLink href={tokenizeResult.hashscanUrl} label="View on HashScan" />
          <p className="mt-2 text-xs text-[var(--muted)]">Next: read the live ENS config from the Buyer column.</p>
        </ActionCard>
      )}

      {error && (
        <ErrorCard
          error={error}
          note={
            error instanceof ApiRequestError && error.code === "WORLD_PROOF_REPLAY"
              ? "A World nullifier is derived from (identity, app, action), so it is the same value every time one person repeats one check — the second rehearsal always lands here. Clear it with the \u201cClear World replay guard\u201d button in the Buyer column."
              : error instanceof ApiRequestError && error.code === "SELLER_SESSION_EXPIRED"
                ? "The session has been cleared here too, so the Selfie Check button is back. A session is not bound to a property — the review state is held server-side, so verify again and Refresh status picks up where this left off."
                : undefined
          }
        />
      )}
    </div>
  );
}
