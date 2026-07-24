export function ActionCard({
  title,
  description,
  disabledReason,
  techNote,
  children,
}: {
  title: string;
  description?: string;
  disabledReason?: string | null;
  techNote?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
      {description && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
      {children && <div className="mt-3">{children}</div>}
      {disabledReason && (
        <p className="mt-2 flex items-start gap-1 text-xs text-amber-600 dark:text-amber-400">
          <span aria-hidden>🔒</span>
          <span>{disabledReason}</span>
        </p>
      )}
      {techNote && <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">{techNote}</p>}
    </div>
  );
}
