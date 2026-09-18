// Calculs du chiffrage d'un procès-verbal d'expertise (mode expert, v13.5).
// Reproduit les totaux du modèle Alliance Experts : Détail choc (MO / peinture
// par poste), Opérations effectuées (pièces), synthèse Chiffrage.

import { Choc, Operation, PosteChoc, RapportExpert } from "./types";

export const POSTES_STANDARD = [
  "Tôlerie T1",
  "Tôlerie T2",
  "Tôlerie T3",
  "Mécanique M1",
  "Mécanique M2",
  "Sellerie",
  "Électricité",
  "Peinture T1",
  "Peinture T2",
  "Nacré vernis",
  "Opaque vernis",
  "Ingrédients peinture",
  "Forfait",
];

export const ARRONDI = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function montantPoste(p: PosteChoc): number {
  if (p.forfait !== null && p.forfait !== undefined && Number(p.forfait) > 0) return ARRONDI(Number(p.forfait));
  const brut = (Number(p.heures) || 0) * (Number(p.taux) || 0);
  return ARRONDI(brut * (1 - (Number(p.remise) || 0) / 100));
}

export function estPeinture(poste: string): boolean {
  return /peinture|vernis|ingr/i.test(poste);
}
export function estForfait(poste: string): boolean {
  return /forfait/i.test(poste);
}

export function montantOperation(o: Operation): number {
  return ARRONDI((Number(o.qte) || 0) * (Number(o.prix_unit) || 0));
}

export type Synthese = {
  forfaits: number;
  peinture: number;
  mo: number;
  pieces: number;
  fournitures: number;
  vetuste: number;
  remise: number;
  ht: number;
  tva: number;
  ttc: number;
  srgc: number;
  parChoc: { numero: number; libelle: string; mo: number; peinture: number; forfaits: number; total: number }[];
};

export function synthese(r: Pick<RapportExpert, "chocs" | "operations" | "remise" | "vetuste" | "srgc" | "taux_tva">): Synthese {
  let forfaits = 0;
  let peinture = 0;
  let mo = 0;
  const parChoc = (r.chocs || []).map((c) => {
    let cMo = 0, cPeint = 0, cForf = 0;
    for (const p of c.postes || []) {
      const m = montantPoste(p);
      if (estForfait(p.poste)) cForf += m;
      else if (estPeinture(p.poste)) cPeint += m;
      else cMo += m;
    }
    forfaits += cForf; peinture += cPeint; mo += cMo;
    return { numero: c.numero, libelle: c.libelle || `Choc ${c.numero}`, mo: ARRONDI(cMo), peinture: ARRONDI(cPeint), forfaits: ARRONDI(cForf), total: ARRONDI(cMo + cPeint + cForf) };
  });
  let pieces = 0;
  let fournitures = 0;
  for (const o of r.operations || []) {
    const m = montantOperation(o);
    if (o.op === "E") pieces += m;
    else if (o.op === "FO") forfaits += m;
    else fournitures += m;
  }
  const vetuste = Number(r.vetuste) || 0;
  const remise = Number(r.remise) || 0;
  const ht = ARRONDI(forfaits + peinture + mo + pieces + fournitures - vetuste - remise);
  const taux = r.taux_tva === null || r.taux_tva === undefined ? 20 : Number(r.taux_tva);
  const tva = ARRONDI(ht * taux / 100);
  return {
    forfaits: ARRONDI(forfaits), peinture: ARRONDI(peinture), mo: ARRONDI(mo), pieces: ARRONDI(pieces),
    fournitures: ARRONDI(fournitures), vetuste: ARRONDI(vetuste), remise: ARRONDI(remise),
    ht, tva, ttc: ARRONDI(ht + tva), srgc: ARRONDI(Number(r.srgc) || 0), parChoc,
  };
}

/** Chiffrage vide avec un premier choc et les postes usuels. */
export function chocParDefaut(numero = 1, taux = { t1: 65, t2: 70, peinture: 70 }): Choc {
  return {
    numero,
    libelle: `Choc ${numero}`,
    postes: [
      { poste: "Tôlerie T1", heures: 0, taux: taux.t1, remise: 0 },
      { poste: "Tôlerie T2", heures: 0, taux: taux.t2, remise: 0 },
      { poste: "Peinture T1", heures: 0, taux: taux.peinture, remise: 0 },
      { poste: "Nacré vernis", heures: 0, taux: taux.peinture, remise: 0 },
    ],
  };
}

export function operationVide(): Operation {
  return { op: "E", peinture: false, designation: "", qte: 1, prix_unit: 0, reference: null, qualite: null, fournisseur: null };
}

/** Libellé du code opération tel qu'imprimé : « E* », « L* », « I », … */
export function codeImprime(o: Operation): string {
  return `${o.op}${o.peinture ? "*" : ""}`;
}

/** Heures de main-d'œuvre totales (tôlerie + peinture) — pour l'immobilisation. */
export function heuresTotales(chocs: Choc[]): number {
  let h = 0;
  for (const c of chocs || []) for (const p of c.postes || []) if (!p.forfait) h += Number(p.heures) || 0;
  return ARRONDI(h);
}

/** Durée technique d'immobilisation estimée : 8 h ouvrées / jour + 1 jour de séchage/contrôle, arrondie au demi-jour. */
export function immobilisationEstimee(chocs: Choc[]): number {
  const h = heuresTotales(chocs);
  if (!h) return 0;
  return Math.max(0.5, Math.ceil((h / 8 + 1) * 2) / 2);
}

export const LEGENDE_OPERATIONS =
  "E = Remplacement, FO = Forfait, I = Redressage, L = Peinture seule, M = Marbre, N = Dépose repose, P = Contrôle, V = Mesure, A = Port, C = Consigne";
export const LEGENDE_DETAIL =
  "Une * après une opération indique une opération de peinture, un – après une consigne indique que celle-ci est déduite. Un P après une opération indique une opération plastique, un S après une opération indique une opération de sécurité. Pièce de seconde main : R après une opération indique une pièce de réemploi, Q après une opération indique une pièce équivalente, O après une opération indique une pièce d'origine.";
