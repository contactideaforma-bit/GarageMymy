"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Dossier } from "@/lib/types";
import { formatEuros, formatDate, labelStatut } from "@/lib/format";
import DossierForm from "@/components/DossierForm";
import ConfigBanner from "@/components/ConfigBanner";

export default function SinistresPage() {
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

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

  function rapportUrl(path: string | null): string | null {
    if (!path) return null;
    const { data } = supabase.storage.from("rapports").getPublicUrl(path);
    return data.publicUrl;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Sinistres</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + Ajouter un dossier
        </button>
      </div>

      <ConfigBanner />

      <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 bg-slate-50">
            <tr>
              <th className="px-5 py-3 font-medium">N° sinistre</th>
              <th className="px-5 py-3 font-medium">Client</th>
              <th className="px-5 py-3 font-medium">Véhicule</th>
              <th className="px-5 py-3 font-medium">Assureur</th>
              <th className="px-5 py-3 font-medium">Date sinistre</th>
              <th className="px-5 py-3 font-medium">Statut</th>
              <th className="px-5 py-3 font-medium text-right">Montant</th>
              <th className="px-5 py-3 font-medium">Rapport</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                  Chargement…
                </td>
              </tr>
            )}
            {!loading && dossiers.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                  Aucun dossier. Clique sur « + Ajouter un dossier ».
                </td>
              </tr>
            )}
            {dossiers.map((d) => {
              const url = rapportUrl(d.rapport_path);
              return (
                <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800">
                    {d.numero_sinistre || "—"}
                  </td>
                  <td className="px-5 py-3">{d.client_nom || "—"}</td>
                  <td className="px-5 py-3">
                    {d.marque_modele || "—"}
                    {d.immatriculation ? ` (${d.immatriculation})` : ""}
                  </td>
                  <td className="px-5 py-3">{d.assureur || "—"}</td>
                  <td className="px-5 py-3">{formatDate(d.date_sinistre)}</td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-xs">
                      {labelStatut(d.statut)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">{formatEuros(d.montant)}</td>
                  <td className="px-5 py-3">
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand hover:underline"
                      >
                        📄 Voir
                      </a>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
        <DossierForm onClose={() => setShowForm(false)} onSaved={load} />
      )}
    </div>
  );
}
