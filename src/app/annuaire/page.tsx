"use client";

// ============================================================
//  BASE DE DONNÉES (v13.52 — refonte) : trois familles de contacts
//  (clients, assurances, experts / cabinets) présentées en CARTES,
//  avec onglets comptés, recherche, tri A → Z / récents et formulaires
//  en modale. Les vues gardent leur logique (ClientsView, AssureursView,
//  ExpertsView) ; seule la présentation change.
// ============================================================

import { useEffect, useState } from "react";
import ClientsView from "@/components/ClientsView";
import ExpertsView from "@/components/ExpertsView";
import AssureursView from "@/components/AssureursView";
import ConfigBanner from "@/components/ConfigBanner";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import BaseMutualiseeView from "@/components/annuaire/BaseMutualiseeView";
import { estAdmin } from "@/lib/support";
import Ico from "@/components/Ico";

type Tab = "clients" | "assureurs" | "experts" | "mutualise";

const TABS: { key: Tab; label: string; ico: string; table: "clients" | "assureurs" | "experts" }[] = [
  { key: "clients", label: "Clients", ico: "user", table: "clients" },
  { key: "assureurs", label: "Assurances", ico: "shield", table: "assureurs" },
  { key: "experts", label: "Experts / cabinets", ico: "user-tie", table: "experts" },
];

export default function AnnuairePage() {
  const [tab, setTab] = useState<Tab>("clients");
  const [nb, setNb] = useState<Record<Tab, number | null>>({ clients: null, assureurs: null, experts: null, mutualise: null });
  // v13.56 — onglet « Base mutualisée » pour le compte éditeur.
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getUser().then(({ data }) => setAdmin(estAdmin(data.user?.email)));
  }, []);

  // v13.40 — lien direct vers un onglet : /annuaire?tab=experts
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "experts" || t === "assureurs" || t === "clients" || t === "mutualise") setTab(t);
  }, []);

  // Compteurs des onglets (best-effort, rafraîchis à chaque changement d'onglet).
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let annule = false;
    (async () => {
      const res = await Promise.all(TABS.map((t) => supabase.from(t.table).select("id", { count: "exact", head: true })));
      if (annule) return;
      const suivant: Record<Tab, number | null> = { clients: null, assureurs: null, experts: null, mutualise: null };
      TABS.forEach((t, i) => { suivant[t.key] = res[i].count ?? null; });
      setNb(suivant);
    })();
    return () => { annule = true; };
  }, [tab]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="titre-page">Base de données</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--mea-texte-3)" }}>
          Tous les contacts du garage, remplis automatiquement à l&apos;import des rapports. Un tap sur un numéro ou un e-mail pour appeler ou écrire.
        </p>
      </div>
      <ConfigBanner />

      <div className="annuaire-onglets" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={`annuaire-onglet ${tab === t.key ? "actif" : ""}`}>
            <Ico n={t.ico} />
            {t.label}
            {nb[t.key] != null && <span className="nb">{nb[t.key]}</span>}
          </button>
        ))}
        {admin && (
          <button type="button" role="tab" aria-selected={tab === "mutualise"} onClick={() => setTab("mutualise")} className={`annuaire-onglet ${tab === "mutualise" ? "actif" : ""}`} title="Tous les experts et assureurs de l'ensemble des garages (éditeur)">
            <Ico n="globe" />
            Base mutualisée
          </button>
        )}
      </div>

      {tab === "clients" && <ClientsView />}
      {tab === "assureurs" && <AssureursView />}
      {tab === "experts" && <ExpertsView />}
      {tab === "mutualise" && admin && <BaseMutualiseeView />}
    </div>
  );
}
