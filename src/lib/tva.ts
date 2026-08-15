// TVA & conversion HT ↔ TTC (v7.7)
//
// `dossiers.montant` est le montant HT retenu au rapport d'expertise.
// Le garage veut le lire AUSSI en TTC partout où il apparaît (liste des
// sinistres, fiche dossier, tableau de bord). Le taux vit désormais sur le
// dossier (`dossiers.tva`, migration v40) : il est rempli par l'analyse du
// rapport et reste modifiable à la main — un dossier exonéré ou à taux réduit
// affiche donc un TTC juste, et pas un 20 % plaqué d'office.

import { round2 } from "./paiements";

export const TVA_DEFAUT = 20;

type AvecTva = { tva?: number | string | null; montant?: number | null } | null | undefined;

/** Taux de TVA d'un dossier, en % (20 par défaut). */
export function tauxTva(d: AvecTva): number {
  const t = Number(d?.tva);
  return Number.isFinite(t) && t >= 0 ? t : TVA_DEFAUT;
}

/** Montant TTC à partir d'un HT et d'un taux en %. */
export function ttc(ht: number | null | undefined, taux: number | null | undefined): number {
  return round2((Number(ht) || 0) * (1 + (Number(taux) || 0) / 100));
}

/** Montant TTC du dossier (montant HT du rapport + TVA du dossier). */
export function montantTtc(d: AvecTva): number {
  return ttc(d?.montant, tauxTva(d));
}

/** Somme des montants TTC d'une liste de dossiers (chaque dossier a son taux). */
export function totalTtc(dossiers: AvecTva[]): number {
  return round2(dossiers.reduce((s, d) => s + montantTtc(d), 0));
}
