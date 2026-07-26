"use client";

import { useEffect, useState } from "react";
import { SellerView } from "@/app/views/SellerView";
import { VerifierView } from "@/app/views/VerifierView";
import { BuyerView } from "@/app/views/BuyerView";
import { AuditTimeline } from "@/app/views/AuditTimeline";
import { CapTable } from "@/app/views/CapTable";
import type { Attestation } from "@/lib/api-types";

const TABS = [
  { key: "seller", label: "Seller" },
  { key: "verifier", label: "Verifier" },
  { key: "buyer", label: "Buyer" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function FlowArrow() {
  return (
    <svg viewBox="0 0 16 10" className="h-2.5 w-4 shrink-0 fill-none stroke-current stroke-[1.5] text-[var(--faint)]" aria-hidden>
      <path d="M1 5h13" />
      <path d="M9.5 1 14 5l-4.5 4" />
    </svg>
  );
}

const CHAIN_BADGES = [
  { key: "hedera", label: "Hedera", dot: "bg-[#101a2b]" },
  { key: "world", label: "World ID", dot: "bg-[#1f9d63]" },
  { key: "ens", label: "ENS", dot: "bg-[#5b7fe6]" },
] as const;

type ThemePreference = "system" | "light" | "dark";
const THEME_STORAGE_KEY = "pprev-theme";

/*
 * Self-contained, presentational-only preference: it flips a class on <html>
 * that globals.css already knows how to read (.theme-light / .theme-dark).
 * Nothing here touches API calls, demo state, or any existing handler.
 */
function useThemePreference() {
  // Always starts as "system" on both server and the client's first render —
  // matching them exactly avoids a hydration mismatch. localStorage doesn't
  // exist during SSR, so reading it has to happen after mount, in an effect;
  // that one extra render (Auto → the real saved preference) is the correct
  // trade-off, not a bug the set-state-in-effect rule is warning about.
  const [theme, setTheme] = useState<ThemePreference>("system");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark" || stored === "system") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap from a browser API unavailable during SSR
        setTheme(stored);
      }
    } catch {
      /* localStorage unavailable — stay on system default */
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-light", "theme-dark");
    if (theme === "light") root.classList.add("theme-light");
    if (theme === "dark") root.classList.add("theme-dark");
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* ignore — preference just won't persist across reloads */
    }
  }, [theme]);

  return [theme, setTheme] as const;
}

const THEME_OPTIONS: { key: ThemePreference; label: string }[] = [
  { key: "system", label: "Auto" },
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
];

function ThemeSwitch({
  theme,
  onChange,
}: {
  theme: ThemePreference;
  onChange: (t: ThemePreference) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--surface-sunken)] p-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]">
      {THEME_OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`rounded-full px-2.5 py-1 transition-colors ${
            theme === o.key
              ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
              : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabKey>("seller");
  const [theme, setTheme] = useThemePreference();

  // Lifted here because Seller and Verifier are separate components/sessions in
  // real life; in this single-page demo they share state through the parent.
  // The Verifier issues the attestation, the Seller needs it to call tokenize —
  // docs/API.md has no dedicated "fetch my attestation" endpoint, so the page
  // itself acts as the notification channel between the two roles.
  const [attestations, setAttestations] = useState<Record<string, Attestation>>({});

  function handleApproved(propertyId: string, attestation: Attestation) {
    setAttestations((prev) => ({ ...prev, [propertyId]: attestation }));
  }

  return (
    <div className="app-shell flex flex-1 flex-col">
      <header className="px-4 pt-4 sm:px-6 sm:pt-6">
        {/*
          Compact by design: a judge must reach the working Seller/Verifier/Buyer
          columns without scrolling. Kept deliberately plain — a clean glass
          panel, confident type, nothing decorative competing for attention.
        */}
        <div className="lisbon-hero relative overflow-hidden rounded-lg border border-[var(--border-strong)]">
          <div className="relative z-10 flex flex-col gap-4 px-5 py-5 sm:px-7 sm:py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-[30px] font-semibold leading-none tracking-[-0.01em] sm:text-[36px]">Covenant</h1>
                <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[var(--muted)]">
                  A fractional real-estate protocol: no token without a verified property, no share without proof
                  of eligibility.
                </p>
              </div>
              {/* Which chains are actually load-bearing, stated once and without explanation. */}
              <div className="flex flex-col items-end gap-2">
                <ThemeSwitch theme={theme} onChange={setTheme} />
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--faint)]">
                  {CHAIN_BADGES.map((b) => (
                    <span
                      key={b.key}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-1.5"
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${b.dot}`} aria-hidden />
                      {b.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/*
              Desktop-only: a purely decorative strip framing the three columns as
              one pipeline rather than three unrelated cards. No state, no links —
              just the story the layout below already tells, said once at a glance.
            */}
            <div className="hidden items-center justify-center gap-3 rounded-full border border-[var(--border)] bg-[var(--glass)] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)] backdrop-blur lg:flex">
              <span className="text-[var(--foreground)]">Seller submits</span>
              <FlowArrow />
              <span className="text-[var(--foreground)]">Verifier approves</span>
              <FlowArrow />
              <span className="text-[var(--foreground)]">Buyer settles on Hedera</span>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile: tab switcher */}
      <nav className="mx-4 mt-3 flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--glass)] p-1.5 backdrop-blur lg:hidden">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
              activeTab === t.key
                ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                : "text-[var(--muted)] hover:bg-[var(--surface-sunken)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/*
        Each view is mounted exactly ONCE and shown/hidden with CSS only.
        Rendering them conditionally per tab would unmount the inactive ones and
        wipe their state — e.g. the seller would lose their session just by
        looking at the verifier tab. Below `lg` only the active tab is visible;
        from `lg` up all three sit side by side.
      */}
      <main className="flex-1 p-4 sm:p-6 lg:grid lg:grid-cols-3 lg:items-start lg:gap-5 lg:p-6">
        <div
          className={`${activeTab === "seller" ? "block" : "hidden"} lg:block glass-panel rounded-lg p-4 sm:p-5`}
        >
          <SellerView attestations={attestations} />
        </div>
        <div
          className={`${activeTab === "verifier" ? "block" : "hidden"} lg:block glass-panel rounded-lg p-4 sm:p-5`}
        >
          <VerifierView onApproved={handleApproved} />
        </div>
        <div
          className={`${activeTab === "buyer" ? "block" : "hidden"} lg:block evidence-panel rounded-lg p-4 sm:p-5`}
        >
          <BuyerView />
        </div>
      </main>

      {/*
        Full width and always visible, below all three roles: this panel is the
        claim that none of the above has to be taken on trust, and it reads from
        a public source rather than from anything the three columns own.
      */}
      <section className="p-4 pt-0 sm:p-6 sm:pt-0">
        <div className="evidence-hero">
          <h2 className="font-display text-[26px] font-semibold leading-[1.05] tracking-[-0.01em] sm:text-[30px]">
            Public <span className="seller-hero-accent">verification</span>
          </h2>
          <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-[var(--muted)]">
            Read directly from Hedera&apos;s Mirror Node — not from anything this application stores.
            Anyone can reach the same figures without going through this server.
          </p>
          <div className="seller-live-badge" aria-hidden="true">
            <span className="seller-live-dot" />
            Live · Hedera Mirror Node
          </div>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2 lg:items-start">
          <AuditTimeline />
          <CapTable />
        </div>
      </section>
    </div>
  );
}
