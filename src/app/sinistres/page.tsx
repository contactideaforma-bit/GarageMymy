"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Dossier } from "@/lib/types";
import { formatEuros, formatDate } from "@/lib/format";
import DossierForm from "@/components/DossierForm";
import StatutBadge from "@/components/StatutBadge";
import ProgressionDossier from "@/components/ProgressionDossier";
import ConfigBanner from "@/components/ConfigBanner";
import { ouvrirFichier } from "@/lib/storage";

export default function SinistresPage() {
  const router = useRouter();
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("dossiers")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setDossiers(data as Dossier[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);


  const term = q.trim().toLowerCase();
  const filtered = term
    ? dossiers.filter((d) =>
        [d.numero_sinistre, d.client_nom, d.marque_modele, d.immatriculation, d.assureur]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(term))
      )
    : dossiers;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-white">Sinistres</h1>
        <div className="flex gap-2">
          <Link href="/import" className="btn-ghost">Importer un rapport</Link>
          <button onClick={() => setShowForm(true)} className="btn-primary">
            + Ajouter un dossier
          </button>
        </div>
      </div>

      <ConfigBanner />

      <div className="mb-4">
        <input
          className="field-input max-w-sm"
          placeholder="Rechercher (client, véhicule, n° sinistre, assureur…)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-white/50">
            <tr>
              <th className="px-4 py-3 font-medium">N° sinistre</th>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Véhicule</th>
              <th className="px-4 py-3 font-medium">Immatriculation</th>
              <th className="px-4 py-3 font-medium hidden xl:table-cell">Assureur</th>
              <th className="px-4 py-3 font-medium hidden lg:table-cell">Date sinistre</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium text-right">Montant HT</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">Rapport</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-white/40">Chargement…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-white/40">
                Aucun dossier. Importe un rapport ou clique sur « + Ajouter un dossier ».
              </td></tr>
            )}
            {filtered.map((d) => {
              return (
                <tr
                  key={d.id}
                  onClick={() => router.push(`/sinistres/${d.id}`)}
                  className="border-t border-white/5 hover:bg-white/5 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-white">{d.numero_sinistre || "—"}</td>
                  <td className="px-4 py-3 text-white/80">{d.client_nom || "—"}</td>
                  <td className="px-4 py-3 text-white/80 hidden md:table-cell">{d.marque_modele || "—"}</td>
                  <td className="px-4 py-3 text-white/80 whitespace-nowrap">{d.immatriculation || "—"}</td>
                  <td className="px-4 py-3 text-white/80 hidden xl:table-cell">{d.assureur || "—"}</td>
                  <td className="px-4 py-3 text-white/80 hidden lg:table-cell">{formatDate(d.date_sinistre)}</td>
                  <td className="px-5 py-3">
                    <StatutBadge statut={d.statut} />
                    {d.mode_cession && (
                      <span className="ml-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold bg-teal-100 text-teal-700">
                        Cession
                      </span>
                    )}
                    <div className="mt-1.5 w-32">
                      <ProgressionDossier statut={d.statut} size="sm" />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-white/90 whitespace-nowrap">{formatEuros(d.montant)}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {d.rapport_path ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          ouvrirFichier("rapports", d.rapport_path!);
                        }}
                        className="text-accent-pink hover:underline"
                      >
                        Voir
                      </button>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
        <DossierForm
          onClose={() => setShowForm(false)}
          onSaved={(id) => (id ? router.push(`/sinistres/${id}`) : load())}
        />
      )}
    </div>
  );
}
