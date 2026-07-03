// Helpers Flotte du garage : alertes assurance (J+40), conformité,
// statut location/sinistre. Repris de l'idée du projet "flotte-auto".

import { Dossier, FlotteVehicule } from "./types";
import { estActif } from "./format";

// L'alerte assurance se déclenche 40 jours après la date de souscription.
export const ALERTE_ASSURANCE_JOURS = 40;

export type AlerteAssurance = "aucune" | "ok" | "bientot" | "expiree";

export function joursAvantAlerte(dateAssurance: string | null): number | null {
  if (!dateAssurance) return null;
  const d = new Date(dateAssurance);
  if (isNaN(d.getTime())) return null;
  const alerte = new Date(d);
  alerte.setDate(alerte.getDate() + ALERTE_ASSURANCE_JOURS);
  alerte.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((alerte.getTime() - today.getTime()) / 86400000);
}

export function alerteAssurance(v: Pick<FlotteVehicule, "date_assurance">): AlerteAssurance {
  const j = joursAvantAlerte(v.date_assurance);
  if (j === null) return "aucune";
  if (j < 0) return "expiree";
  if (j <= 10) return "bientot";
  return "ok";
}

export const ALERTE_INFO: Record<AlerteAssurance, { label: string; badge: string }> = {
  aucune: { label: "—", badge: "bg-slate-100 text-slate-500" },
  ok: { label: "OK", badge: "bg-emerald-100 text-emerald-700" },
  bientot: { label: "Bientôt", badge: "bg-amber-100 text-amber-700" },
  expiree: { label: "Expirée", badge: "bg-rose-100 text-rose-700" },
};

export function estConforme(v: Pick<FlotteVehicule, "ct_ok" | "cg_ok" | "entretien_ok">): boolean {
  return v.ct_ok && v.cg_ok && v.entretien_ok;
}

/* ------------------------- Lien avec les dossiers ------------------------- */

function normaliseImmat(s: string | null | undefined): string {
  return (s || "").toUpperCase().replace(/[\s\-_.]/g, "");
}

// Dossier sinistre EN COURS correspondant à ce véhicule (par immatriculation).
export function dossierActifPourImmat(immat: string, dossiers: Dossier[]): Dossier | null {
  const cible = normaliseImmat(immat);
  if (!cible) return null;
  return (
    dossiers.find(
      (d) => normaliseImmat(d.immatriculation) === cible && estActif(d.statut)
    ) || null
  );
}

// Un véhicule est "sinistré" si un dossier actif le concerne OU si une date
// de sinistre a été saisie manuellement.
export function estSinistre(v: FlotteVehicule, dossierActif: Dossier | null): boolean {
  return Boolean(dossierActif || v.date_sinistre);
}
