type Status = "idle" | "pending" | "success" | "error" | "info";

const STYLES: Record<Status, string> = {
  idle: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  error: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
};

export function StatusBadge({ status, children }: { status: Status; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[status]}`}>
      {children}
    </span>
  );
}
