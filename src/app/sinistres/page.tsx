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

  function rapportUrl(path: string | null): string | null {
    if (!path) return null;
    const { data } = supabase.storage.from("rapports").getPublicUrl(path);
    return data.publicUrl;
  }

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
              <tr><td colSpan={8} className="px-5 py-8 text-center text-white/40">Chargement…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-white/40">
                Aucun dossier. Importe un rapport ou clique sur « + Ajouter un dossier ».
              </td></tr>
            )}
            {filtered.map((d) => {
              const url = rapportUrl(d.rapport_path);
              return (
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
                  <td className="px-5 py-3 text-white/80">{d.assureur || "—"}</td>
                  <td className="px-5 py-3 text-white/80">{formatDate(d.date_sinistre)}</td>
                  <td className="px-5 py-3">
                    <StatutBadge statut={d.statut} />
                    <div className="mt-1.5 w-32">
                      <ProgressionDossier statut={d.statut} size="sm" />
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right text-white/90">{formatEuros(d.montant)}</td>
                  <td className="px-5 py-3">
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-accent-pink hover:underline"
                      >
                        Voir
                      </a>
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

      {showForm && <DossierForm onClose={() => setShowForm(false)} onSaved={load} />}
    </div>
  );
}
