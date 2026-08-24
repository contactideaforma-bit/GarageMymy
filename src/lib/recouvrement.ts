// ============================================================
//  RECOUVREMENT — escalade automatique des impayés (v50)
//
//  Une relance isolée ne récupère rien : ce qui paie, c'est la RÉGULARITÉ
//  et la GRADATION. Trois paliers, comptés en jours de RETARD (pas en
//  jours depuis la dernière relance) :
//
//     J+15  relance courtoise      envoyée automatiquement
//     J+30  relance ferme          envoyée automatiquement
//     J+45  mise en demeure        JAMAIS automatique — c'est un acte
//                                  juridique, le garage doit le décider
//
//  Le compteur « récupéré grâce aux relances » (encaissements survenus
//  APRÈS une relance) sert à une seule chose : montrer noir sur blanc ce
//  que l'outil rapporte.
// ============================================================

import { Document, Paiement, Relance } from "./types";
import { estSoldee, round2, totalPaye } from "./paiements";

export type Palier = {
  niveau: number;
  /** Jours de retard à partir desquels ce palier se déclenche. */
  jours: number;
  label: string;
  court: string;
  /** true = le garage doit valider lui-même (aucun envoi automatique). */
  manuel: boolean;
  badge: string;
};

export const PALIERS: Palier[] = [
  { niveau: 1, jours: 15, label: "Relance courtoise", court: "Relance 1", manuel: false, badge: "badge badge-info" },
  { niveau: 2, jours: 30, label: "Relance ferme", court: "Relance 2", manuel: false, badge: "badge badge-warn" },
  { niveau: 3, jours: 45, label: "Mise en demeure", court: "Mise en demeure", manuel: true, badge: "badge badge-danger" },
];

export const PALIER_CONTENTIEUX_JOURS = 60;

function jour(d: string | null | undefined): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  return isNaN(t) ? null : t;
}

/** Jours de retard d'une facture (0 si pas encore échue). */
export function joursDeRetard(facture: Document): number {
  const ech = jour(facture.date_echeance);
  if (ech === null) return 0;
  const j = Math.floor((Date.now() - ech) / 86400000);
  return j > 0 ? j : 0;
}

export type EtatRecouvrement = {
  reste: number;
  retard: number;
  /** Nombre de relances déjà envoyées sur cette facture. */
  faites: number;
  /** Palier atteint compte tenu du retard (null si rien à faire). */
  attendu: Palier | null;
  /** Palier à déclencher maintenant (null si à jour). */
  aFaire: Palier | null;
  /** Prochain palier et dans combien de jours. */
  prochain: Palier | null;
  joursAvantProchain: number | null;
  /** Impayé de plus de 60 jours après mise en demeure. */
  contentieux: boolean;
};

export function etatRecouvrement(
  facture: Document,
  paiements: Paiement[],
  relances: Relance[]
): EtatRecouvrement {
  const paye = totalPaye(paiements.filter((p) => p.document_id === facture.id));
  const reste = round2(Math.max(0, (Number(facture.total_ttc) || 0) - paye));
  const soldee = estSoldee(facture.total_ttc, paye);
  const retard = joursDeRetard(facture);
  const faites = relances.filter((r) => r.document_id === facture.id).length;

  if (soldee || reste <= 0.01 || retard === 0) {
    return {
      reste,
      retard,
      faites,
      attendu: null,
      aFaire: null,
      prochain: PALIERS[0],
      joursAvantProchain: null,
      contentieux: false,
    };
  }

  // Dernier palier dont le seuil est franchi.
  const atteints = PALIERS.filter((p) => retard >= p.jours);
  const attendu = atteints.length > 0 ? atteints[atteints.length - 1] : null;

  // Ce qu'il reste à faire : le premier palier franchi qui n'a pas encore
  // sa relance. `faites` sert de curseur — une relance = un palier.
  const aFaire = atteints.length > faites ? atteints[faites] : null;

  const suivant = PALIERS.find((p) => retard < p.jours) || null;

  return {
    reste,
    retard,
    faites,
    attendu,
    aFaire,
    prochain: suivant,
    joursAvantProchain: suivant ? suivant.jours - retard : null,
    contentieux: retard >= PALIER_CONTENTIEUX_JOURS && faites >= PALIERS.length,
  };
}

/* --------------------- Ce que les relances rapportent ---------------- */

/**
 * Somme des encaissements arrivés APRÈS une relance sur la même facture.
 * Approximation assumée et volontairement PRUDENTE : on ne compte que les
 * paiements postérieurs à la première relance, et jamais un paiement
 * antérieur. Le chiffre est donc un plancher.
 */
export function euroRecuperes(
  factures: Document[],
  paiements: Paiement[],
  relances: Relance[]
): { montant: number; factures: number } {
  let montant = 0;
  let nb = 0;
  for (const f of factures) {
    const rels = relances
      .filter((r) => r.document_id === f.id)
      .map((r) => jour(r.date_relance))
      .filter((t): t is number => t !== null);
    if (rels.length === 0) continue;
    const premiere = Math.min(...rels);

    const apres = paiements.filter((p) => {
      if (p.document_id !== f.id) return false;
      const t = jour(p.date_paiement);
      return t !== null && t >= premiere;
    });
    if (apres.length === 0) continue;
    montant = round2(montant + apres.reduce((s, p) => s + (Number(p.montant) || 0), 0));
    nb += 1;
  }
  return { montant, factures: nb };
}

/** Phrase courte pour l'écran : « Relance 2 à envoyer (32 j de retard) ». */
export function libelleEtat(e: EtatRecouvrement): string {
  if (e.reste <= 0.01) return "Soldée";
  if (e.retard === 0) return "Dans les délais";
  if (e.contentieux) return `Contentieux — ${e.retard} j de retard`;
  if (e.aFaire) return `${e.aFaire.label} à envoyer (${e.retard} j de retard)`;
  if (e.prochain && e.joursAvantProchain !== null) {
    return `${e.prochain.label} dans ${e.joursAvantProchain} j`;
  }
  return `${e.retard} j de retard`;
}
