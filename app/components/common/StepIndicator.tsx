/**
 * Progress along one role's flow.
 *
 * Completed steps recede rather than celebrate: what matters on stage is where
 * the flow is *now*, and a row of bright green ticks competes with that.
 */
export function StepIndicator({ steps, activeIndex }: { steps: string[]; activeIndex: number }) {
  return (
    <ol className="flex flex-wrap items-center justify-end gap-1">
      {steps.map((label, i) => {
        const state = i === activeIndex ? "active" : i < activeIndex ? "done" : "todo";
        const styles =
          state === "active"
            ? "bg-[var(--accent)] text-[var(--accent-foreground)] font-semibold shadow-sm"
            : state === "done"
              ? "bg-[var(--azulejo-soft)] text-[var(--azulejo)]"
              : "text-[var(--faint)] ring-1 ring-[var(--border)]";
        return (
          <li
            key={label}
            className={`flex min-h-7 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${styles}`}
          >
            <span className="tabular" aria-hidden>
              {state === "done" ? "✓" : i + 1}
            </span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
