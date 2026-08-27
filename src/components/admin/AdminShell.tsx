"use client";

// COQUE DE L'ESPACE ÉDITEUR (v53) : garde d'affichage (le contrôle réel est
// fait par /api/admin/*), titre et onglets communs.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { estAdmin } from "@/lib/support";

const ONGLETS: [string, string][] = [
  ["/admin", "Tableau de bord"],
  ["/admin/simulateur", "Simulateur"],
  ["/admin/ventes", "Ventes"],
  ["/admin/portefeuilles", "Portefeuilles"],
  ["/admin/abonnements", "Abonnements"],
  ["/admin/collaborateurs", "Collaborateurs"],
  ["/admin/reglements", "Relevés & paiements"],
  ["/admin/demandes", "Demandes"],
];

export default function AdminShell({ titre, actions, children }: { titre: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const [autorise, setAutorise] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAutorise(estAdmin(data.user?.email)));
  }, []);

  if (autorise === null) return <p className="text-sm text-white/50">Vérification…</p>;
  if (!autorise) {
    return (
      <div className="glass-card p-6">
        <h1 className="titre-page">Espace éditeur</h1>
        <p className="mt-3 text-sm text-white/60">Cet espace est réservé à IDEAFORMA.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-accent-teal">Espace éditeur · IDEAFORMA</span>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="titre-page">{titre}</h1>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
      <div className="segment flex-wrap">
        {ONGLETS.map(([href, label]) => (
          <Link key={href} href={href} className={`segment-btn ${pathname === href ? "actif" : ""}`}>{label}</Link>
        ))}
      </div>
      {children}
    </div>
  );
}

/** Champ de formulaire compact pour les modales admin. */
export function ChampAdmin({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

export function euros(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
}
export function dateFr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR");
}
export function moisFr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
}
