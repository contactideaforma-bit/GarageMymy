"use client";

// ============================================================
//  COMPARATEUR DES OFFRES (v13.42) — tableau « disponible / non
//  disponible » par formule, prix en tête (grille), colonnes
//  cliquables vers la fiche de chaque formule. Même ton que l'accueil :
//  fond clair, bordures nettes, pas de pression.
//  Mobile : le tableau défile horizontalement, la 1re colonne reste
//  collée à gauche.
// ============================================================

import Link from "next/link";
import type { Formule } from "@/lib/admin/economie";
import { tarifFormule, type Parametres } from "@/lib/admin/economie";
import { eur } from "./useGrille";
import { COMPARATIF, FICHES, FORMULES_ORDRE, NOM_COURT, type ValeurComparatif } from "./formules";

function Cellule({ v }: { v: ValeurComparatif }) {
  if (v === true) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-violet-700" aria-label="Inclus" title="Inclus">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    );
  }
  if (v === false) {
    return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-400" aria-label="Non disponible" title="Non disponible dans cette formule">—</span>;
  }
  return <span className="text-sm font-semibold text-slate-800">{v}</span>;
}

export default function ComparateurFormules({ params, engage, surligner, compact = false }: {
  params: Parametres;
  engage: boolean;
  /** Formule mise en avant (page de détail). */
  surligner?: Formule;
  compact?: boolean;
}) {
  const slugDe = (f: Formule) => FICHES.find((x) => x.formule === f)?.slug || "essentiel";
  return (
    <div className={`overflow-x-auto rounded-2xl border border-slate-200 bg-white ${compact ? "" : "shadow-sm"}`}>
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b-2 border-slate-800">
            <th scope="col" className="sticky left-0 z-10 bg-white px-4 py-4 text-sm font-semibold text-slate-500">
              Ce qui est inclus
            </th>
            {FORMULES_ORDRE.map((f) => {
              const t = tarifFormule(f, params);
              const prix = engage ? t.mensuelEngage : t.mensuel;
              const actif = surligner === f;
              return (
                <th key={f} scope="col" className={`px-3 py-4 text-center align-top ${actif ? "bg-violet-50" : ""}`}>
                  <Link href={`/formules/${slugDe(f)}`} className="block text-inherit no-underline">
                    <div className="text-sm font-semibold text-slate-900">{f === "essentiel" ? "Essentiel" : `Adhésion Service ${NOM_COURT[f]}`}</div>
                    <div className="mt-1 text-xl font-bold tracking-tight text-slate-900">{eur(prix)}<span className="text-xs font-normal text-slate-500"> / mois</span></div>
                    <div className="text-[11px] text-slate-500">{t.heures > 0 ? `${t.heures} h / mois de chargé de mission` : "Application seule"}</div>
                  </Link>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {COMPARATIF.map((g) => (
            <GroupeLignes key={g.titre} titre={g.titre} sousTitre={g.sousTitre} lignes={g.lignes} surligner={surligner} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupeLignes({ titre, sousTitre, lignes, surligner }: { titre: string; sousTitre?: string; lignes: (typeof COMPARATIF)[number]["lignes"]; surligner?: Formule }) {
  return (
    <>
      <tr className="border-t border-slate-200 bg-slate-50">
        <th scope="rowgroup" colSpan={1 + FORMULES_ORDRE.length} className="sticky left-0 px-4 py-2.5 text-left">
          <div className="text-sm font-semibold text-slate-900">{titre}</div>
          {sousTitre && <div className="text-xs font-normal text-slate-500">{sousTitre}</div>}
        </th>
      </tr>
      {lignes.map((l) => (
        <tr key={l.libelle} className="border-t border-slate-100">
          <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-2.5 text-sm font-normal text-slate-700" title={l.aide}>{l.libelle}</th>
          {FORMULES_ORDRE.map((f) => (
            <td key={f} className={`px-3 py-2.5 text-center ${surligner === f ? "bg-violet-50/60" : ""}`}><Cellule v={l.valeurs[f]} /></td>
          ))}
        </tr>
      ))}
    </>
  );
}
