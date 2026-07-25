/**
 * The unit every step of every flow is built from.
 *
 * The leading number in the copy ("1. Selfie Check") is split out and set apart,
 * so the eye can follow the sequence down a column without reading — which is
 * what makes a three-column demo legible at a glance.
 */
export function ActionCard({
  title,
  description,
  disabledReason,
  techNote,
  children,
  active,
}: {
  title: string;
  description?: string;
  disabledReason?: string | null;
  techNote?: string;
  children?: React.ReactNode;
  /** Purely visual: the view passes whatever it already knows is the current step. */
  active?: boolean;
}) {
  const match = /^(\d+(?:-\d+)?\.)\s*(.*)$/.exec(title);
  const [step, heading] = match ? [match[1], match[2]] : [null, title];

  return (
    <section className={`glass-panel rounded-2xl p-4 sm:p-5 ${active ? "step-active" : ""}`}>
      <div className="flex items-start gap-3">
        {step && (
          <span className="tabular mt-0.5 rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] px-2 py-1 font-mono text-[11px] font-semibold text-[var(--azulejo)]">
            {step}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-semibold leading-tight tracking-[-0.01em]">{heading}</h3>
          {description && (
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">{description}</p>
          )}
        </div>
      </div>

      {children && <div className="mt-4">{children}</div>}

      {disabledReason && (
        <p className="mt-4 flex items-start gap-2 border-t border-[var(--border)] pt-3 text-xs leading-relaxed text-[var(--muted)]">
          <LockIcon />
          <span>{disabledReason}</span>
        </p>
      )}

      {techNote && <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs leading-relaxed text-[var(--faint)]">{techNote}</p>}
    </section>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="mt-[2px] h-3 w-3 shrink-0 fill-none stroke-current stroke-[1.5]"
      aria-hidden
    >
      <rect x="3.25" y="7" width="9.5" height="6.25" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}
