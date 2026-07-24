"use client";

import { useState } from "react";
import { SellerView } from "@/app/views/SellerView";
import { VerifierView } from "@/app/views/VerifierView";
import { BuyerView } from "@/app/views/BuyerView";

const TABS = [
  { key: "seller", label: "Seller" },
  { key: "verifier", label: "Verifier" },
  { key: "buyer", label: "Buyer" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabKey>("seller");

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950 sm:px-8">
        <h1 className="text-xl font-bold">PPREV</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          A fractional real-estate protocol: no token without a verified property, no share without proof of
          eligibility.
        </p>
      </header>

      {/* Mobile: tab switcher */}
      <nav className="flex gap-1 border-b border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950 lg:hidden">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
              activeTab === t.key
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Mobile: single column, active tab only */}
      <main className="flex-1 p-4 sm:p-6 lg:hidden">
        {activeTab === "seller" && <SellerView />}
        {activeTab === "verifier" && <VerifierView />}
        {activeTab === "buyer" && <BuyerView />}
      </main>

      {/* Desktop: all three columns side by side */}
      <main className="hidden flex-1 grid-cols-3 gap-6 p-6 lg:grid">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <SellerView />
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <VerifierView />
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <BuyerView />
        </div>
      </main>
    </div>
  );
}
