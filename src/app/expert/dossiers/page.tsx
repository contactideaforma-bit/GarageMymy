"use client";

// LISTE DES DOSSIERS D'EXPERTISE (v13.5) : recherche, filtre par statut, création.

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import DossierExpertForm from "@/components/expert/DossierExpertForm";
import { BadgeStatutExpert, EnTete, Vide } from "@/components/expert/ui";
import { chargerDossiers } from "@/lib/expertise/data";
import { DossierExpert, STATUTS_EXPERTISE } from "@/lib/expertise/types";
import { formatDate } from "@/lib/format";

function ListeDossiers() {
  const router = useRouter();
  const params = useSearchParams();
  const [dossiers, setDossiers] = useState<DossierExpert[]>([]);
  const [chargement, setChargement] = useState(true);
  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState<string>("actifs");
  const [creation, setCreation] = useState(false);

  useEffect(() => {
    chargerDossiers().then(({ dossiers: d }) => { setDossiers(d); setChargement(false); });
  }, []);
  useEffect(() => {
    if (params.get("nouveau") === "1") setCreation(true);
  }, [params]);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return dossiers.filter((d) => {
      if (statut === "actifs" && (d.statut === "cloture" || d.statut === "emis")) return false;
      if (statut !== "actifs" && statut !== "tous" && d.statut !== statut) return false;
      if (!q) return true;
      return [d.numero, d.immatriculation, d.marque, d.modele, d.lese_nom, d.assure_nom, d.mandant_nom, d.numero_sinistre, d.reparateur_nom]
        .some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [dossiers, recherche, statut]);

  return (
    <div className="space-y-4">
      <EnTete titre="Dossiers d'expertise" sousTitre={`${dossiers.length} mission(s)`} actions={<button className="btn-primary" onClick={() => setCreation(true)}>+ Nouvelle mission</button>} />

      <div className="glass-card flex flex-wrap items-center gap-2 p-3">
        <input className="field-input field-compact max-w-xs" placeholder="Rechercher : immat, nom, n° sinistre…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        <select className="field-input field-compact w-auto" value={statut} onChange={(e) => setStatut(e.target.value)}>
          <option value="actifs">En cours</option>
          <option value="tous">Tous</option>
          {STATUTS_EXPERTISE.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select>
        <span className="text-xs text-white/50">{filtres.length} affiché(s)</span>
      </div>

      {chargement ? (
        <div className="skeleton h-40 rounded-2xl" />
      ) : filtres.length === 0 ? (
        <div className="glass-card p-4">
          <Vide titre="Aucun dossier" texte={dossiers.length ? "Modifie la recherche ou le filtre." : "Crée ta première mission d'expertise."} action={<button className="btn-primary" onClick={() => setCreation(true)}>+ Nouvelle mission</button>} />
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="al-table">
            <thead>
              <tr>
                <th>N° rapport</th><th>Véhicule</th><th>Lésé / assuré</th><th>Mandant</th><th>Réparateur</th><th>Mission</th><th>Visite</th><th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {filtres.map((d) => (
                <tr key={d.id} className="cursor-pointer hover:bg-white/5" onClick={() => router.push(`/expert/dossiers/${d.id}`)}>
                  <td className="font-semibold"><Link href={`/expert/dossiers/${d.id}`}>{d.numero}</Link></td>
                  <td>
                    <div className="font-medium">{d.immatriculation || "—"}</div>
                    <div className="text-xs text-white/55">{[d.marque, d.modele].filter(Boolean).join(" ")}</div>
                  </td>
                  <td>{d.lese_nom || d.assure_nom || "—"}</td>
                  <td>
                    <div>{d.mandant_nom || "—"}</div>
                    {d.numero_sinistre && <div className="text-xs text-white/55">Sinistre {d.numero_sinistre}</div>}
                  </td>
                  <td>{d.reparateur_nom || "—"}</td>
                  <td>{formatDate(d.date_mission)}</td>
                  <td>{formatDate(d.date_visite)}</td>
                  <td><BadgeStatutExpert statut={d.statut} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creation && (
        <DossierExpertForm
          onClose={() => { setCreation(false); if (params.get("nouveau")) router.replace("/expert/dossiers"); }}
          onSaved={(d) => router.push(`/expert/dossiers/${d.id}`)}
        />
      )}
    </div>
  );
}

export default function PageDossiersExpert() {
  return (
    <Suspense fallback={<div className="skeleton h-40 rounded-2xl" />}>
      <ListeDossiers />
    </Suspense>
  );
}
