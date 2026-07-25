/**
 * A privacy claim, stated where the data would otherwise be collected.
 *
 * Deliberately quiet: these lines matter, but they are reassurance rather than
 * instruction, and a screen where every note shouts has no emphasis left for the
 * two moments that need it.
 */
export function PrivacyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2.5 text-[11px] leading-relaxed text-[var(--muted)]">
      <svg
        viewBox="0 0 16 16"
        className="mt-[2px] h-3.5 w-3.5 shrink-0 fill-none stroke-current stroke-[1.5] text-[var(--azulejo)]"
        aria-hidden
      >
        <rect x="3.25" y="7" width="9.5" height="6.25" rx="1.5" />
        <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
      </svg>
      <span>{children}</span>
    </p>
  );
}
