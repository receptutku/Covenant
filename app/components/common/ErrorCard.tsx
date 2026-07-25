import { ApiRequestError } from "@/lib/api-types";

/**
 * Every error display, including the golden scene, goes through here.
 *
 * When `hederaStatus` is present it becomes the headline — that string is the
 * whole point of the scene, because it was written by Hedera's consensus nodes
 * rather than by this application, and it should be the largest thing on screen
 * when it appears. Our own `code` drops to a footnote. Logic never reads any of
 * this; it is purely visual.
 */
export function ErrorCard({ error, note }: { error: ApiRequestError | Error; note?: string }) {
  const isApiError = error instanceof ApiRequestError;
  const fromNetwork = isApiError && Boolean(error.hederaStatus);
  const headline = fromNetwork ? error.hederaStatus! : isApiError ? error.code : "ERROR";

  return (
    <div className="evidence-panel overflow-hidden rounded-2xl border-[var(--danger-border)]">
      {fromNetwork && (
        <div className="border-b border-[var(--danger-border)] bg-[var(--danger-soft)] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--danger)]">
          Rejected by the Hedera network
        </div>
      )}

      <div className={fromNetwork ? "p-5 sm:p-6" : "p-5"}>
        <p
          className={`break-all font-mono font-bold leading-[0.98] tracking-[-0.04em] text-[var(--danger)] ${
            fromNetwork ? "text-[30px] sm:text-[36px]" : "text-base"
          }`}
        >
          {headline}
        </p>

        <p className="mt-4 text-[13px] leading-relaxed text-[var(--danger)]">{error.message}</p>

        {fromNetwork && (
          <p className="mt-4 font-mono text-[11px] text-[var(--muted)]">code: {error.code}</p>
        )}

        {note && (
          <p className="mt-4 border-t border-[var(--danger-border)] pt-4 text-xs leading-relaxed text-[var(--muted)]">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}
