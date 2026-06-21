"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Dossier, Evenement, Document } from "@/lib/types";
import { formatEuros, formatDate, formatDateTime, estActif } from "@/lib/format";
import StatCard from "@/components/StatCard";
import StatutBadge from "@/components/StatutBadge";
import ConfigBanner from "@/components/ConfigBanner";

export default function DashboardPage() {
  const router = useRouter();
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [d, e, docs] = await Promise.all([
        supabase.from("dossiers").select("*").order("created_at", { ascending: false }),
        supabase.from("evenements").select("*").order("date_evenement", { ascending: true }),
        supabase.from("documents").select("*").eq("type", "facture"),
      ]);
      if (d.data) setDossiers(d.data as Dossier[]);
      if (e.data) setEvenements(e.data as Evenement[]);
      if (docs.data) setDocuments(docs.data as Document[]);
      setLoading(false);
    })();
  }, []);

  const enCours = dossiers.filter((d) => estActif(d.statut));

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  // Véhicules présents au garage : réparation en cours aujourd'hui, ou statut "réparation"
  const presents = dossiers.filter(
    (d) =>
      (d.reparation_debut && d.reparation_fin && d.reparation_debut <= todayKey && todayKey <= d.reparation_fin) ||
      d.statut === "reparation"
  );
  // Total des factures créées le mois en cours
  const totalMois = documents
    .filter((f) => {
      const ref = f.date_document || f.created_at;
      if (!ref) return false;
      const dt = new Date(ref);
      return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
    })
    .reduce((sum, f) => sum + (Number(f.total_ttc) || 0), 0);

  const aVenir = evenements.filter((e) => new Date(e.date_evenement) >= now);
  const passes = evenements.filter((e) => new Date(e.date_evenement) < now).reverse();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-white">Tableau de bord</h1>
        <Link href="/import" className="btn-primary">⬆ Importer un rapport</Link>
      </div>

      <ConfigBanner />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Véhicules au garage" value={String(presents.length)} hint="en réparation" />
        <StatCard label="Dossiers en cours" value={String(enCours.length)} />
        <StatCard
          label="Total facturé (mois en cours)"
          value={formatEuros(totalMois)}
          hint={now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
        />
        <StatCard label="Événements à venir" value={String(aVenir.length)} />
      </div>

      {/* Visuel : véhicules présents au garage */}
      <section className="glass-card p-5 mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-white">🚗 Véhicules présents au garage</h2>
          <span className="text-sm text-white/50">{presents.length} véhicule{presents.length > 1 ? "s" : ""}</span>
        </div>
        {presents.length === 0 ? (
          <p className="text-sm text-white/40">Aucun véhicule en réparation actuellement.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {presents.map((d) => (
              <button
                key={d.id}
                onClick={() => router.push(`/sinistres/${d.id}`)}
                className="glass-soft px-4 py-3 text-left hover:bg-white/10 transition-colors min-w-[12rem]"
              >
                <div className="text-2xl">🚗</div>
                <div className="mt-1 text-sm font-medium text-white truncate">
                  {d.marque_modele || d.numero_sinistre || "Véhicule"}
                </div>
                <div className="text-xs text-white/50 truncate">
                  {d.immatriculation || "—"}{d.reparateur ? ` · ${d.reparateur}` : ""}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 glass-card">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="font-semibold text-white">Dossiers en cours</h2>
            <Link href="/sinistres" className="text-sm text-accent-pink hover:underline">
              Voir tout
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-white/50">
                <tr>
                  <th className="px-5 py-2 font-medium">N° sinistre</th>
                  <th className="px-5 py-2 font-medium">Client</th>
                  <th className="px-5 py-2 font-medium">Véhicule</th>
                  <th className="px-5 py-2 font-medium">Statut</th>
                  <th className="px-5 py-2 font-medium text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={5} className="px-5 py-6 text-center text-white/40">Chargement…</td></tr>
                )}
                {!loading && enCours.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-6 text-center text-white/40">Aucun dossier en cours.</td></tr>
                )}
                {enCours.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => router.push(`/sinistres/${d.id}`)}
                    className="border-t border-white/5 hover:bg-white/5 cursor-pointer"
                  >
                    <td className="px-5 py-3 font-medium text-white">{d.numero_sinistre || "—"}</td>
                    <td className="px-5 py-3 text-white/80">{d.client_nom || "—"}</td>
                    <td className="px-5 py-3 text-white/80">
                      {d.marque_modele || "—"}{d.immatriculation ? ` (${d.immatriculation})` : ""}
                    </td>
                    <td className="px-5 py-3"><StatutBadge statut={d.statut} /></td>
                    <td className="px-5 py-3 text-right text-white/90">{formatEuros(d.montant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="glass-card">
          <div className="px-5 py-4 border-b border-white/10">
            <h2 className="font-semibold text-white">Agenda</h2>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <div className="text-xs font-semibold uppercase text-white/40 mb-2">À venir</div>
              {aVenir.length === 0 && <p className="text-sm text-white/40">Aucun événement.</p>}
              <ul className="space-y-2">
                {aVenir.slice(0, 5).map((e) => (
                  <li key={e.id} className="text-sm">
                    <div className="font-medium text-white">{e.titre}</div>
                    <div className="text-white/40 text-xs">{formatDateTime(e.date_evenement)}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-white/40 mb-2">Passés</div>
              {passes.length === 0 && <p className="text-sm text-white/40">Aucun événement.</p>}
              <ul className="space-y-2">
                {passes.slice(0, 3).map((e) => (
                  <li key={e.id} className="text-sm opacity-60">
                    <div className="font-medium text-white">{e.titre}</div>
                    <div className="text-white/40 text-xs">{formatDate(e.date_evenement)}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
