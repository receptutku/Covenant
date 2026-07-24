export function StepIndicator({ steps, activeIndex }: { steps: string[]; activeIndex: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {steps.map((label, i) => {
        const state = i === activeIndex ? "active" : i < activeIndex ? "done" : "todo";
        const styles =
          state === "active"
            ? "bg-black text-white dark:bg-white dark:text-black font-semibold"
            : state === "done"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500";
        return (
          <li key={label} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${styles}`}>
            <span>{state === "done" ? "✓" : i + 1}</span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
