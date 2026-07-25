"use client";

import { useState } from "react";
import { SellerView } from "@/app/views/SellerView";
import { VerifierView } from "@/app/views/VerifierView";
import { BuyerView } from "@/app/views/BuyerView";
import type { Attestation } from "@/lib/api-types";

const TABS = [
  { key: "seller", label: "Seller" },
  { key: "verifier", label: "Verifier" },
  { key: "buyer", label: "Buyer" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabKey>("seller");

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

      {/*
        Each view is mounted exactly ONCE and shown/hidden with CSS only.
        Rendering them conditionally per tab would unmount the inactive ones and
        wipe their state — e.g. the seller would lose their session just by
        looking at the verifier tab. Below `lg` only the active tab is visible;
        from `lg` up all three sit side by side.
      */}
      <main className="flex-1 p-4 sm:p-6 lg:grid lg:grid-cols-3 lg:gap-6 lg:p-6">
        <div
          className={`${activeTab === "seller" ? "block" : "hidden"} lg:block rounded-2xl lg:border lg:border-zinc-200 lg:bg-white lg:p-4 lg:dark:border-zinc-800 lg:dark:bg-zinc-950`}
        >
          <SellerView attestations={attestations} />
        </div>
        <div
          className={`${activeTab === "verifier" ? "block" : "hidden"} lg:block rounded-2xl lg:border lg:border-zinc-200 lg:bg-white lg:p-4 lg:dark:border-zinc-800 lg:dark:bg-zinc-950`}
        >
          <VerifierView onApproved={handleApproved} />
        </div>
        <div
          className={`${activeTab === "buyer" ? "block" : "hidden"} lg:block rounded-2xl lg:border lg:border-zinc-200 lg:bg-white lg:p-4 lg:dark:border-zinc-800 lg:dark:bg-zinc-950`}
        >
          <BuyerView />
        </div>
      </main>
    </div>
  );
}
