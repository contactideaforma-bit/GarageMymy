// ============================================================
//  RENTABILITÉ (v49)
//
//  Ce que personne d'autre ne dit au carrossier : combien lui rapporte
//  RÉELLEMENT chaque dossier, et quels assureurs lui coûtent de la
//  trésorerie.
//
//  Trois calculs, tous à partir de données déjà présentes :
//
//   1. MARGE = CA facturé HT − coût des pièces − coût des heures passées.
//      · coût des pièces  : commandes réceptionnées (prix d'achat), ou la
//        saisie manuelle `cout_pieces_reel` si le garage ne saisit pas ses
//        commandes ;
//      · coût des heures  : heures passées × coût horaire de l'atelier
//        (charges comprises — pas le taux facturé).
//
//   2. ÉCART D'HEURES = heures vendues (postes T1/T2/T3/peinture du
//      chiffrage) − heures réellement passées. C'est la fuite la plus
//      fréquente : on vend 6 h, on en passe 9.
//
//   3. DÉLAI D'ENCAISSEMENT par assureur = jours entre l'émission de la
//      facture et le paiement qui la solde. Le classement des mauvais
//      payeurs sort tout seul.
//
//  Prudence assumée : sans coût horaire renseigné, on n'affiche AUCUNE
//  marge plutôt qu'un chiffre faux.
// ============================================================

import {
  CommandePiece,
  Document,
  DocumentLigne,
  Dossier,
  Paiement,
} from "./types";
import { categorieDe, estLigneIngredients } from "./documents";
import { round2, totalPaye, estSoldee } from "./paiements";

/* ------------------------------ Heures ------------------------------- */

/**
 * Heures VENDUES : quantité des lignes de main-d'œuvre du chiffrage.
 * Les ingrédients de peinture sont exclus — c'est un forfait matière
 * indexé sur le temps de peinture, pas du temps de travail en plus.
 */
export function heuresVendues(lignes: DocumentLigne[]): number {
  return round2(
    lignes
      .filter((l) => categorieDe(l) === "mo" && !estLigneIngredients(l.designation))
      .reduce((s, l) => s + (Number(l.quantite) || 0), 0)
  );
}

/* ------------------------------ Coûts -------------------------------- */

/** Coût d'achat des pièces : commandes saisies, sinon saisie manuelle. */
export function coutPieces(dossier: Dossier, commandes: CommandePiece[]): number {
  const achat = commandes.reduce((s, c) => s + (Number(c.prix_ht) || 0), 0);
  if (achat > 0) return round2(achat);
  return round2(Number(dossier.cout_pieces_reel) || 0);
}

/* ------------------------------- Marge ------------------------------- */

export type MargeDossier = {
  dossier: Dossier;
  /** Chiffre d'affaires HT réellement facturé (pas le chiffrage). */
  ca: number;
  coutPieces: number;
  coutMainOeuvre: number;
  marge: number;
  /** Marge en % du CA (null si pas de CA). */
  taux: number | null;
  heuresVendues: number;
  heuresPassees: number | null;
  /** Vendues − passées : négatif = on a travaillé plus que vendu. */
  ecartHeures: number | null;
  /** false quand le coût horaire n'est pas renseigné : marge non calculable. */
  calculable: boolean;
};

export function margeDossier(args: {
  dossier: Dossier;
  factures: Document[];
  lignes: DocumentLigne[];
  commandes: CommandePiece[];
  coutHoraire: number | null;
}): MargeDossier {
  const { dossier, factures, lignes, commandes, coutHoraire } = args;

  const ca = round2(factures.reduce((s, f) => s + (Number(f.total_ht) || 0), 0));
  const vendues = heuresVendues(lignes);
  const passeesBrut = dossier.heures_passees;
  const passees = passeesBrut === null || passeesBrut === undefined ? null : Number(passeesBrut);

  const pieces = coutPieces(dossier, commandes);
  // Sans saisie d'heures réelles, on retient les heures VENDUES : c'est
  // l'hypothèse optimiste, et elle est signalée à l'écran.
  const heuresPourCout = passees ?? vendues;
  const calculable = Boolean(coutHoraire && coutHoraire > 0);
  const coutMo = calculable ? round2(heuresPourCout * (coutHoraire as number)) : 0;

  const marge = calculable ? round2(ca - pieces - coutMo) : 0;

  return {
    dossier,
    ca,
    coutPieces: pieces,
    coutMainOeuvre: coutMo,
    marge,
    taux: calculable && ca > 0 ? round2((marge / ca) * 100) : null,
    heuresVendues: vendues,
    heuresPassees: passees,
    ecartHeures: passees === null ? null : round2(vendues - passees),
    calculable,
  };
}

/* ------------------------ Délais d'encaissement ---------------------- */

/**
 * Nombre de jours entre l'émission d'une facture et le paiement qui l'a
 * soldée. `null` si elle n'est pas encore soldée.
 */
export function delaiEncaissement(facture: Document, paiements: Paiement[]): number | null {
  const liee = paiements.filter((p) => p.document_id === facture.id);
  if (liee.length === 0) return null;
  if (!estSoldee(facture.total_ttc, totalPaye(liee))) return null;

  const emission = facture.date_document || facture.created_at;
  if (!emission) return null;
  const dates = liee
    .map((p) => (p.date_paiement ? new Date(p.date_paiement).getTime() : NaN))
    .filter((t) => !isNaN(t));
  if (dates.length === 0) return null;

  const jours = Math.round((Math.max(...dates) - new Date(emission).getTime()) / 86400000);
  return jours < 0 ? 0 : jours;
}

export type StatAssureur = {
  assureur: string;
  dossiers: number;
  caTtc: number;
  encaisse: number;
  resteDu: number;
  /** Délai moyen de paiement, en jours (null si aucune facture soldée). */
  delaiMoyen: number | null;
  /** Nombre de factures encore dues au-delà de 45 jours. */
  enRetard: number;
};

const RETARD_JOURS = 45;

/** Classement des assureurs — le tri met les plus lents en tête. */
export function statsParAssureur(
  dossiers: Dossier[],
  factures: Document[],
  paiements: Paiement[]
): StatAssureur[] {
  const parDossier = new Map(dossiers.map((d) => [d.id, d]));
  const acc = new Map<string, StatAssureur & { delais: number[] }>();

  for (const f of factures) {
    const d = f.dossier_id ? parDossier.get(f.dossier_id) : undefined;
    const nom = (d?.assureur || "Sans assurance / client direct").trim();
    if (!acc.has(nom)) {
      acc.set(nom, {
        assureur: nom,
        dossiers: 0,
        caTtc: 0,
        encaisse: 0,
        resteDu: 0,
        delaiMoyen: null,
        enRetard: 0,
        delais: [],
      });
    }
    const a = acc.get(nom)!;
    const liee = paiements.filter((p) => p.document_id === f.id);
    const paye = totalPaye(liee);
    const ttc = Number(f.total_ttc) || 0;

    a.caTtc = round2(a.caTtc + ttc);
    a.encaisse = round2(a.encaisse + paye);
    const reste = round2(Math.max(0, ttc - paye));
    a.resteDu = round2(a.resteDu + reste);

    const delai = delaiEncaissement(f, paiements);
    if (delai !== null) a.delais.push(delai);

    if (reste > 0.01) {
      const emission = f.date_document || f.created_at;
      const age = emission ? (Date.now() - new Date(emission).getTime()) / 86400000 : 0;
      if (age > RETARD_JOURS) a.enRetard += 1;
    }
  }

  // Nombre de dossiers distincts par assureur.
  const dossiersParAssureur = new Map<string, Set<string>>();
  for (const f of factures) {
    const d = f.dossier_id ? parDossier.get(f.dossier_id) : undefined;
    const nom = (d?.assureur || "Sans assurance / client direct").trim();
    if (!dossiersParAssureur.has(nom)) dossiersParAssureur.set(nom, new Set());
    if (d) dossiersParAssureur.get(nom)!.add(d.id);
  }

  return Array.from(acc.values())
    .map((a) => ({
      assureur: a.assureur,
      dossiers: dossiersParAssureur.get(a.assureur)?.size || 0,
      caTtc: a.caTtc,
      encaisse: a.encaisse,
      resteDu: a.resteDu,
      delaiMoyen:
        a.delais.length > 0
          ? Math.round(a.delais.reduce((s: number, x: number) => s + x, 0) / a.delais.length)
          : null,
      enRetard: a.enRetard,
    }))
    .sort((x, y) => (y.delaiMoyen ?? -1) - (x.delaiMoyen ?? -1));
}

/* ------------------------------ Périodes ----------------------------- */

export const PERIODES = [
  { code: "mois", label: "Ce mois-ci", jours: 31 },
  { code: "trimestre", label: "3 mois", jours: 92 },
  { code: "annee", label: "12 mois", jours: 366 },
  { code: "tout", label: "Tout", jours: 0 },
] as const;

export function dansPeriode(date: string | null | undefined, code: string): boolean {
  if (code === "tout") return true;
  if (!date) return false;
  const p = PERIODES.find((x) => x.code === code);
  if (!p || p.jours === 0) return true;
  const t = new Date(date).getTime();
  if (isNaN(t)) return false;
  return Date.now() - t <= p.jours * 86400000;
}
