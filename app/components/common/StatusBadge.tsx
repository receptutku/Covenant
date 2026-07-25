type Status = "idle" | "pending" | "success" | "error" | "info";

/**
 * Colour alone is not the signal — each badge also carries a dot, so a state is
 * still distinguishable in a screenshot, on a projector, or to someone who does
 * not separate red from green.
 */
const STYLES: Record<Status, { chip: string; dot: string }> = {
  idle: {
    chip: "bg-[var(--surface-sunken)] text-[var(--muted)] ring-1 ring-[var(--border)]",
    dot: "bg-[var(--faint)]",
  },
  pending: {
    chip: "bg-[var(--warning-soft)] text-[var(--warning)] ring-1 ring-[var(--warning-border)]",
    dot: "bg-[var(--warning)]",
  },
  success: {
    chip: "bg-[var(--success-soft)] text-[var(--success)] ring-1 ring-[var(--success-border)]",
    dot: "bg-[var(--success)]",
  },
  error: {
    chip: "bg-[var(--danger-soft)] text-[var(--danger)] ring-1 ring-[var(--danger-border)]",
    dot: "bg-[var(--danger)]",
  },
  info: {
    chip: "bg-[var(--azulejo-soft)] text-[var(--azulejo)] ring-1 ring-[color:rgba(34,91,122,0.24)] dark:ring-[color:rgba(101,171,208,0.28)]",
    dot: "bg-[var(--azulejo)]",
  },
};

export function StatusBadge({ status, children }: { status: Status; children: React.ReactNode }) {
  const style = STYLES[status];
  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${style.chip}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} aria-hidden />
      {children}
    </span>
  );
}
