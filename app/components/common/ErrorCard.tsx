import { ApiRequestError } from "@/lib/api-types";

/**
 * All error displays — including the golden-scene card — go through here.
 * If `hederaStatus` is present it becomes the large display text (KYC-denied
 * golden scene); otherwise `code` is shown. Logic always reads `code`; this is
 * purely visual.
 */
export function ErrorCard({ error, note }: { error: ApiRequestError | Error; note?: string }) {
  const isApiError = error instanceof ApiRequestError;
  const headline = isApiError && error.hederaStatus ? error.hederaStatus : isApiError ? error.code : "ERROR";

  return (
    <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
      <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
        <span className="text-xl" aria-hidden>
          ⛔
        </span>
        <span className="break-all font-mono text-sm font-bold">{headline}</span>
      </div>
      <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error.message}</p>
      {isApiError && error.hederaStatus && (
        <p className="mt-1 text-xs text-red-400">code: {error.code}</p>
      )}
      {note && <p className="mt-2 text-xs text-red-500">{note}</p>}
    </div>
  );
}
