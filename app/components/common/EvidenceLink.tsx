/**
 * A link out to something a reviewer can check without us — HashScan, a raw
 * Mirror Node endpoint. Styled as a distinct class of thing from the buttons
 * that act on the protocol, because these only ever prove.
 */
export function EvidenceLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface-sunken)] px-3 py-1 text-[13px] font-semibold text-[var(--azulejo)] transition-all hover:border-[var(--azulejo)] hover:bg-[var(--azulejo-soft)]"
    >
      {label}
      <svg
        viewBox="0 0 12 12"
        className="h-3 w-3 shrink-0 fill-none stroke-current stroke-[1.75]"
        aria-hidden
      >
        <path d="M4 2h6v6" />
        <path d="M10 2 2.5 9.5" />
      </svg>
    </a>
  );
}
