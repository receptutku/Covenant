export function PrivacyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 rounded-md bg-zinc-50 p-2 text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
      <span aria-hidden>🔒</span>
      <span>{children}</span>
    </p>
  );
}
