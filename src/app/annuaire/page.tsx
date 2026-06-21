"use client";

import { useState } from "react";
import ClientsView from "@/components/ClientsView";
import ExpertsView from "@/components/ExpertsView";
import AssureursView from "@/components/AssureursView";
import ConfigBanner from "@/components/ConfigBanner";

type Tab = "clients" | "assureurs" | "experts";

const TABS: { key: Tab; label: string }[] = [
  { key: "clients", label: "Clients" },
  { key: "assureurs", label: "Assurances" },
  { key: "experts", label: "Experts / cabinets" },
];

export default function AnnuairePage() {
  const [tab, setTab] = useState<Tab>("clients");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white mb-6">Annuaire</h1>
      <ConfigBanner />

      <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1 mb-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${
              tab === t.key ? "bg-white/15 text-white font-medium" : "text-white/60 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "clients" && <ClientsView />}
      {tab === "assureurs" && <AssureursView />}
      {tab === "experts" && <ExpertsView />}
    </div>
  );
}
