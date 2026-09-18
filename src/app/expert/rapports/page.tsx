"use client";

// RAPPORTS (v13.5) : tous les procès-verbaux, brouillons et émis, avec
// leur montant et l'accès au PDF archivé.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EnTete, Vide } from "@/components/expert/ui";
import { chargerDossiers, chargerTousRapports, ouvrirFichierExpert } from "@/lib/expertise/data";
import { synthese } from "@/lib/expertise/chiffrage";
import { DossierExpert, RapportExpert } from "@/lib/expertise/types";
import { formatDate, formatEuros } from "@/lib/format";

export default function PageRapportsExpert() {
  const [rapports, setRapports] = useState<RapportExpert[]>([]);
  const [dossiers, setDossiers] = useState<Record<string, DossierExpert>>({});
  const [filtre, setFiltre] = useState<"tous" | "emis" | "brouillon">("tous");
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    Promise.all([chargerTousRapports(), chargerDossiers()]).then(([r, { dossiers: d }]) => {
      setRapports(r);
      setDossiers(Object.fromEntries(d.map((x) => [x.id, x])));
      setChargement(false);
    });
  }, []);

  const liste = useMemo(() => rapports.filter((r) => filtre === "tous" || r.statut === filtre), [rapports, filtre]);
  const totalEmis = useMemo(() => rapports.filter((r) => r.statut === "emis").reduce((s, r) => s + synthese(r).ht, 0), [rapports]);

  return (
    <div className="space-y-4">
      <EnTete titre="Rapports d'expertise" sousTitre={`${rapports.filter((r) => r.statut === "emis").length} émis · ${formatEuros(totalEmis)} HT chiffrés`} />
      <div className="glass-card flex flex-wrap items-center gap-2 p-3">
        <div className="segment">
          {(["tous", "emis", "brouillon"] as const).map((f) => (
            <button key={f} className={`segment-btn ${filtre === f ? "actif" : ""}`} onClick={() => setFiltre(f)}>{f === "tous" ? "Tous" : f === "emis" ? "Émis" : "Brouillons"}</button>
          ))}
        </div>
      </div>
      {chargement ? (
        <div className="skeleton h-40 rounded-2xl" />
      ) : liste.length === 0 ? (
        <div className="glass-card p-4"><Vide titre="Aucun rapport" texte="Les rapports se créent depuis la fiche d'un dossier (onglet Rapport)." /></div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="al-table">
            <thead><tr><th>N° rapport</th><th>Date</th><th>Véhicule</th><th>Lésé</th><th>Mandant</th><th>Source</th><th className="num">Total HT</th><th className="num">Total TTC</th><th>Statut</th><th></th></tr></thead>
            <tbody>
              {liste.map((r) => {
                const d = dossiers[r.dossier_id];
                const s = synthese(r);
                return (
                  <tr key={r.id}>
                    <td className="font-semibold">{d ? <Link href={`/expert/dossiers/${d.id}`}>{r.numero}</Link> : r.numero}{r.version > 1 && <span className="ml-1 text-xs text-white/50">v{r.version}</span>}</td>
                    <td>{formatDate(r.date_rapport || r.created_at)}</td>
                    <td>{d ? [d.immatriculation, d.marque, d.modele].filter(Boolean).join(" ") : "—"}</td>
                    <td>{d?.lese_nom || d?.assure_nom || "—"}</td>
                    <td>{d?.mandant_nom || "—"}</td>
                    <td className="text-xs">{r.source}</td>
                    <td className="num">{formatEuros(s.ht)}</td>
                    <td className="num">{formatEuros(s.ttc)}</td>
                    <td><span className={`badge ${r.statut === "emis" ? "badge-ok" : "badge-warn"}`}>{r.statut === "emis" ? "Émis" : "Brouillon"}</span></td>
                    <td className="whitespace-nowrap text-right">
                      {r.pdf_path && <button className="btn-ghost btn-compact" onClick={() => ouvrirFichierExpert(r.pdf_path!)}>PDF</button>}
                      {d && <Link href={`/expert/dossiers/${d.id}`} className="btn-ghost btn-compact ml-1">Ouvrir</Link>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
