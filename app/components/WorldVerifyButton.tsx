"use client";

import { useState } from "react";
import { IDKitRequestWidget, identityCheck, proofOfHuman } from "@worldcoin/idkit";
import type { IDKitResult, IDKitErrorCodes, RpContext } from "@worldcoin/idkit-core";
import { api, ApiRequestError } from "@/lib/apiClient";
import type { WorldAction } from "@/lib/api-types";

/**
 * The real World ID 4.0 gate.
 *
 * Nothing here is configured from the client: app id, rp id, environment and the
 * signed RP context all come from `POST /api/rp-signature`, because the signing
 * key that authenticates the request lives on the server and must stay there.
 *
 * The context is fetched on click rather than on mount. It carries a 300-second
 * validity window, so fetching it early means a user who pauses over the form
 * opens the widget with an already-expired context.
 *
 * The resulting payload is forwarded to the backend untouched; `success: true`
 * in it means nothing on its own, and the server re-verifies against World
 * before it will issue a session or a KYC grant.
 */
export function WorldVerifyButton({
  action,
  signal,
  label,
  disabled,
  onProof,
}: {
  action: WorldAction;
  /** Binds the proof to this specific context (property, account). */
  signal: string;
  label: string;
  disabled?: boolean;
  onProof: (proof: Record<string, unknown>) => void | Promise<void>;
}) {
  const [config, setConfig] = useState<{
    app_id: `app_${string}`;
    action: string;
    rp_context: RpContext;
    environment: "production" | "staging" | "sandbox";
  } | null>(null);
  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPreparing(true);
    setError(null);
    try {
      const rp = await api.getRpSignature({ action, signal });
      setConfig({
        app_id: rp.appId as `app_${string}`,
        action: rp.action,
        environment: rp.environment,
        // The wire shape and IDKit's shape differ in two field names; map rather
        // than reshape either side, so neither has to know about the other.
        rp_context: {
          rp_id: rp.rpId,
          nonce: rp.rpContext.nonce,
          created_at: rp.rpContext.created_at,
          expires_at: rp.rpContext.expires_at,
          signature: rp.rpContext.sig,
        },
      });
      setOpen(true);
    } catch (e) {
      const err = e as ApiRequestError;
      setError(err.message || "Could not start verification.");
    } finally {
      setPreparing(false);
    }
  }

  function handleError(code: IDKitErrorCodes) {
    // Surfaced verbatim: during the demo the distinction between a user closing
    // the sheet and a replayed nullifier is the whole diagnosis.
    setError(`World returned "${code}".`);
    setOpen(false);
  }

  async function handleSuccess(result: IDKitResult) {
    setOpen(false);
    await onProof(result as unknown as Record<string, unknown>);
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={start}
        disabled={disabled || preparing}
        className="w-fit rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {preparing ? "Preparing..." : label}
      </button>

      {config && (
        <IDKitRequestWidget
          open={open}
          onOpenChange={setOpen}
          app_id={config.app_id}
          action={config.action}
          rp_context={config.rp_context}
          environment={config.environment}
          // v4 proofs only. Accepting legacy proofs would mean tracking two
          // nullifier namespaces to stop the same person passing twice.
          allow_legacy_proofs={false}
          preset={
            action === "onboard-seller"
              ? proofOfHuman({ signal })
              : identityCheck({ attributes: [{ type: "minimum_age", value: 18 }] })
          }
          onSuccess={handleSuccess}
          onError={handleError}
        />
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
