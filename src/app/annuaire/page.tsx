"use client";

import { useState } from "react";
import ExpertsView from "@/components/ExpertsView";
import AssureursView from "@/components/AssureursView";
import ConfigBanner from "@/components/ConfigBanner";

export default function AnnuairePage() {
  const [tab, setTab] = useState<"experts" | "assureurs">("experts");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white mb-6">Annuaire</h1>
      <ConfigBanner />

      <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1 mb-5">
        <button
          onClick={() => setTab("experts")}
          className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${
            tab === "experts" ? "bg-white/15 text-white font-medium" : "text-white/60 hover:text-white"
          }`}
        >
          Experts / cabinets
        </button>
        <button
          onClick={() => setTab("assureurs")}
          className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${
            tab === "assureurs" ? "bg-white/15 text-white font-medium" : "text-white/60 hover:text-white"
          }`}
        >
          Assurances
        </button>
      </div>

      {tab === "experts" ? <ExpertsView /> : <AssureursView />}
    </div>
  );
}
