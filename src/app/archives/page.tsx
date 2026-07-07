"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Dossier } from "@/lib/types";
import { formatDate, formatEuros } from "@/lib/format";
import ConfigBanner from "@/components/ConfigBanner";

/**
 * ARCHIVES : trace des dossiers clos dont le contenu complet a été
 * téléchargé en ZIP puis purgé du serveur.
 */
export default function ArchivesPage() {
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("dossiers")
        .select("*")
        .eq("archive", true)
        .order("archive_le", { ascending: false });
      setDossiers((data as Dossier[]) || []);
      setLoading(false);
    })();
  }, []);

  const term = q.trim().toLowerCase();
  const filtres = term
    ? dossiers.filter((d) =>
        [d.numero_sinistre, d.client_nom, d.immatriculation, d.marque_modele, d.assureur]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term))
      )
    : dossiers;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white mb-2">Archives</h1>
      <p className="text-white/60 mb-6 text-sm">
        Dossiers clos archivés : leur contenu complet (documents, rapport, pièces, historique)
        a été téléchargé en ZIP puis retiré du serveur. Seule cette trace est conservée.
      </p>
      <ConfigBanner />

      <div className="mb-4">
        <input
          className="field-input max-w-sm"
          placeholder="Rechercher (client, immat, n° sinistre…)"
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
              <th className="px-4 py-3 font-medium text-right">Montant HT</th>
              <th className="px-4 py-3 font-medium">Archivé le</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-white/40">Chargement…</td></tr>
            )}
            {!loading && filtres.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-white/40">
                {dossiers.length === 0
                  ? "Aucune archive. Le bouton « Archiver » apparaît sur les dossiers clôturés."
                  : "Aucun résultat."}
              </td></tr>
            )}
            {filtres.map((d) => (
              <tr key={d.id} className="border-t border-white/5">
                <td className="px-4 py-3 font-medium text-white">{d.numero_sinistre || "—"}</td>
                <td className="px-4 py-3 text-white/80">{d.client_nom || "—"}</td>
                <td className="px-4 py-3 text-white/80 hidden md:table-cell">{d.marque_modele || "—"}</td>
                <td className="px-4 py-3 text-white/80 whitespace-nowrap">{d.immatriculation || "—"}</td>
                <td className="px-4 py-3 text-right text-white/90 whitespace-nowrap">{formatEuros(d.montant)}</td>
                <td className="px-4 py-3 text-white/70 whitespace-nowrap">{formatDate(d.archive_le)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-white/40">
        Le fichier ZIP téléchargé lors de l&apos;archivage est la copie de référence : conserve-le
        précieusement (obligation légale de conservation des factures : 10 ans).
      </p>
    </div>
  );
}
