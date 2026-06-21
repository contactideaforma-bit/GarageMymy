"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Dossier, Evenement } from "@/lib/types";
import { formatEuros, formatDate, formatDateTime, estActif } from "@/lib/format";
import StatCard from "@/components/StatCard";
import StatutBadge from "@/components/StatutBadge";
import ConfigBanner from "@/components/ConfigBanner";

export default function DashboardPage() {
  const router = useRouter();
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [d, e] = await Promise.all([
        supabase.from("dossiers").select("*").order("created_at", { ascending: false }),
        supabase.from("evenements").select("*").order("date_evenement", { ascending: true }),
      ]);
      if (d.data) setDossiers(d.data as Dossier[]);
      if (e.data) setEvenements(e.data as Evenement[]);
      setLoading(false);
    })();
  }, []);

  const enCours = dossiers.filter((d) => estActif(d.statut));

  // Total € des dossiers dont le sinistre tombe dans le mois en cours
  const now = new Date();
  const totalMois = dossiers
    .filter((d) => {
      const ref = d.date_sinistre || d.created_at;
      if (!ref) return false;
      const dt = new Date(ref);
      return (
        dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear()
      );
    })
    .reduce((sum, d) => sum + (Number(d.montant) || 0), 0);

  const aVenir = evenements.filter((e) => new Date(e.date_evenement) >= now);
  const passes = evenements
    .filter((e) => new Date(e.date_evenement) < now)
    .reverse();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Tableau de bord</h1>
        <Link
          href="/sinistres"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + Nouveau dossier
        </Link>
      </div>

      <ConfigBanner />

      {/* Statistiques */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Dossiers en cours" value={String(enCours.length)} />
        <StatCard
          label="Total dossiers (mois en cours)"
          value={formatEuros(totalMois)}
          hint={now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
        />
        <StatCard label="Événements à venir" value={String(aVenir.length)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dossiers en cours */}
        <section className="lg:col-span-2 rounded-xl bg-white border border-slate-200 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Dossiers en cours</h2>
            <Link href="/sinistres" className="text-sm text-brand hover:underline">
              Voir tout
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500 bg-slate-50">
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
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-slate-400">
                      Chargement…
                    </td>
                  </tr>
                )}
                {!loading && enCours.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-slate-400">
                      Aucun dossier en cours.
                    </td>
                  </tr>
                )}
                {enCours.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => router.push(`/sinistres/${d.id}`)}
                    className="border-t border-surface-line hover:bg-surface-muted cursor-pointer"
                  >
                    <td className="px-5 py-3 font-medium text-ink">
                      {d.numero_sinistre || "—"}
                    </td>
                    <td className="px-5 py-3">{d.client_nom || "—"}</td>
                    <td className="px-5 py-3">
                      {d.marque_modele || "—"}
                      {d.immatriculation ? ` (${d.immatriculation})` : ""}
                    </td>
                    <td className="px-5 py-3">
                      <StatutBadge statut={d.statut} />
                    </td>
                    <td className="px-5 py-3 text-right">{formatEuros(d.montant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Agenda */}
        <section className="rounded-xl bg-white border border-slate-200 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Agenda</h2>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <div className="text-xs font-semibold uppercase text-slate-400 mb-2">
                À venir
              </div>
              {aVenir.length === 0 && (
                <p className="text-sm text-slate-400">Aucun événement.</p>
              )}
              <ul className="space-y-2">
                {aVenir.slice(0, 5).map((e) => (
                  <li key={e.id} className="text-sm">
                    <div className="font-medium text-slate-800">{e.titre}</div>
                    <div className="text-slate-400 text-xs">
                      {formatDateTime(e.date_evenement)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-slate-400 mb-2">
                Passés
              </div>
              {passes.length === 0 && (
                <p className="text-sm text-slate-400">Aucun événement.</p>
              )}
              <ul className="space-y-2">
                {passes.slice(0, 3).map((e) => (
                  <li key={e.id} className="text-sm opacity-70">
                    <div className="font-medium text-slate-700">{e.titre}</div>
                    <div className="text-slate-400 text-xs">
                      {formatDate(e.date_evenement)}
                    </div>
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
