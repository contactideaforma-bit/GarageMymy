// ====================================================================
//  COMPARAISON DEVIS DU RÉPARATEUR ↔ PRÉ-RAPPORT (mode expert, v13.11)
//
//  Le devis (lu par /api/expert/analyser, mode=devis) est rapproché du
//  chiffrage du pré-rapport : postes de main-d'œuvre (heures, taux,
//  forfait) et opérations (pièces, redressages…). Chaque écart est
//  présenté à l'expert qui l'ACCEPTE (valeur du devis) ou le REFUSE
//  (valeur du pré-rapport). Le rapport définitif est ensuite construit
//  à partir des décisions.
// ====================================================================

import { Choc, Operation, PosteChoc, RapportExpert } from "./types";
import { ARRONDI, montantOperation, montantPoste } from "./chiffrage";

export type NatureEcart = "ajout" | "suppression" | "modification";
export type Decision = "accepte" | "refuse";

export type Ecart = {
  id: string;
  type: "poste" | "operation";
  nature: NatureEcart;
  libelle: string;
  /** Valeur lisible côté pré-rapport / côté devis (null si absente). */
  avant: string | null;
  apres: string | null;
  /** Montant HT : pré-rapport → devis. */
  montant_avant: number;
  montant_apres: number;
  decision: Decision;
  commentaire?: string | null;
  /** Données nécessaires pour appliquer la décision (non affichées). */
  poste?: { cle: string; devis: PosteChoc | null };
  operation?: { cle: string; devis: Operation | null };
};

export type Comparaison = {
  document_id: string | null;
  document_nom: string | null;
  rapport_base_id: string;
  base_version: number;
  date: string;
  total_pre_rapport: number;
  total_devis: number;
  commentaire: string | null;
  ecarts: Ecart[];
};

/* ------------------------------ Normalisation ----------------------- */

export function normaliser(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Désignation de pièce normalisée : les positions sont ramenées aux
 * abréviations du chiffrage (« AILE AV G », « AILE AVANT GAUCHE », « AILE
 * AVG. » → « aile avg »), pour que le devis et le pré-rapport se retrouvent.
 */
export function normaliserDesignation(s: string | null | undefined): string {
  return normaliser(s)
    .replace(/\bavant\b/g, "av")
    .replace(/\barriere\b/g, "ar")
    .replace(/\bgauche\b/g, "g")
    .replace(/\bdroite?\b/g, "d")
    .replace(/\b(av|ar)\s+(g|d)\b/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

const clePoste = (p: PosteChoc) => normaliser(p.poste);
const cleOperation = (o: Operation) => `${o.op}|${normaliserDesignation(o.designation)}`;

/** Similarité de Dice sur les mots (0..1) : « AILE AVG. » ≈ « AILE AV G ». */
function similarite(a: string, b: string): number {
  const ma = new Set(a.split(" ").filter((m) => m.length > 1));
  const mb = new Set(b.split(" ").filter((m) => m.length > 1));
  if (!ma.size || !mb.size) return a === b ? 1 : 0;
  let commun = 0;
  ma.forEach((m) => { if (mb.has(m)) commun += 1; });
  return (2 * commun) / (ma.size + mb.size);
}

const eur = (n: number) => `${ARRONDI(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const h = (n: number) => `${Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} h`;

/* --------------------------- Agrégation des postes ------------------ */

type PosteAgrege = { poste: string; heures: number; taux: number; remise: number; forfait: number | null; montant: number };

function agregerPostes(chocs: Choc[]): Map<string, PosteAgrege> {
  const m = new Map<string, PosteAgrege>();
  for (const c of chocs || []) {
    for (const p of c.postes || []) {
      const cle = clePoste(p);
      if (!cle) continue;
      const cur = m.get(cle);
      const forfait = p.forfait !== null && p.forfait !== undefined && Number(p.forfait) > 0 ? Number(p.forfait) : null;
      if (!cur) {
        m.set(cle, { poste: p.poste, heures: Number(p.heures) || 0, taux: Number(p.taux) || 0, remise: Number(p.remise) || 0, forfait, montant: montantPoste(p) });
      } else {
        cur.heures += Number(p.heures) || 0;
        if (forfait) cur.forfait = (cur.forfait || 0) + forfait;
        cur.montant += montantPoste(p);
        if (!cur.taux) cur.taux = Number(p.taux) || 0;
      }
    }
  }
  return m;
}

function decrirePoste(p: PosteAgrege): string {
  if (p.forfait) return `forfait ${eur(p.forfait)}`;
  return `${h(p.heures)} × ${eur(p.taux)}${p.remise ? ` −${p.remise} %` : ""}`;
}

function decrireOperation(o: Operation): string {
  if (!o.qte && !o.prix_unit) return "main-d'œuvre";
  const q = o.qualite === "origine" ? " (O)" : o.qualite === "equivalente" ? " (Q)" : o.qualite === "reemploi" ? " (R)" : "";
  return `${o.qte} × ${eur(o.prix_unit)}${q}`;
}

/* ------------------------------- Comparaison ------------------------ */

export function comparer(rapport: Pick<RapportExpert, "chocs" | "operations">, devis: { chocs: Choc[]; operations: Operation[] }): Ecart[] {
  const ecarts: Ecart[] = [];
  let n = 0;
  const id = () => `e${(n += 1)}`;

  // --- Postes de main-d'œuvre ---
  const avant = agregerPostes(rapport.chocs || []);
  const apres = agregerPostes(devis.chocs || []);
  const devisPostes = new Map<string, PosteChoc>();
  for (const c of devis.chocs || []) for (const p of c.postes || []) if (!devisPostes.has(clePoste(p))) devisPostes.set(clePoste(p), p);

  const clesPostes = new Set<string>();
  avant.forEach((_, k) => clesPostes.add(k));
  apres.forEach((_, k) => clesPostes.add(k));
  clesPostes.forEach((cle) => {
    const a = avant.get(cle);
    const b = apres.get(cle);
    if (a && !b) {
      ecarts.push({ id: id(), type: "poste", nature: "suppression", libelle: a.poste, avant: decrirePoste(a), apres: null, montant_avant: a.montant, montant_apres: 0, decision: "refuse", poste: { cle, devis: null } });
    } else if (!a && b) {
      ecarts.push({ id: id(), type: "poste", nature: "ajout", libelle: b.poste, avant: null, apres: decrirePoste(b), montant_avant: 0, montant_apres: b.montant, decision: "refuse", poste: { cle, devis: devisPostes.get(cle) || null } });
    } else if (a && b) {
      const diff = Math.abs(a.heures - b.heures) > 0.01 || Math.abs(a.taux - b.taux) > 0.01 || Math.abs((a.forfait || 0) - (b.forfait || 0)) > 0.01 || Math.abs(a.remise - b.remise) > 0.01;
      if (diff) {
        // Poste du devis reconstitué (agrégé) pour l'application.
        const pd: PosteChoc = { poste: a.poste, heures: b.heures, taux: b.taux, remise: b.remise, forfait: b.forfait };
        ecarts.push({ id: id(), type: "poste", nature: "modification", libelle: a.poste, avant: decrirePoste(a), apres: decrirePoste(b), montant_avant: a.montant, montant_apres: b.montant, decision: "refuse", poste: { cle, devis: pd } });
      }
    }
  });

  // --- Opérations ---
  const opsAvant = (rapport.operations || []).map((o, i) => ({ o, cle: cleOperation(o), i, vue: false }));
  const opsApres = (devis.operations || []).map((o, i) => ({ o, cle: cleOperation(o), i, vue: false }));

  const trouverCorrespondance = (x: { o: Operation; cle: string }) => {
    // 1. clé exacte ; 2. même code + désignation proche (≥ 0,6).
    let cand = opsApres.find((y) => !y.vue && y.cle === x.cle);
    if (!cand) {
      let meilleur = 0;
      for (const y of opsApres) {
        if (y.vue || y.o.op !== x.o.op) continue;
        const s = similarite(normaliserDesignation(x.o.designation), normaliserDesignation(y.o.designation));
        if (s > meilleur && s >= 0.6) { meilleur = s; cand = y; }
      }
    }
    return cand;
  };

  for (const x of opsAvant) {
    const y = trouverCorrespondance(x);
    if (!y) {
      ecarts.push({ id: id(), type: "operation", nature: "suppression", libelle: `${x.o.op}${x.o.peinture ? "*" : ""} ${x.o.designation}`, avant: decrireOperation(x.o), apres: null, montant_avant: montantOperation(x.o), montant_apres: 0, decision: "refuse", operation: { cle: x.cle, devis: null } });
      continue;
    }
    y.vue = true;
    x.vue = true;
    const a = x.o;
    const b = y.o;
    const diff = Math.abs((a.qte || 0) - (b.qte || 0)) > 0.001 || Math.abs((a.prix_unit || 0) - (b.prix_unit || 0)) > 0.01 || (a.qualite || null) !== (b.qualite || null) || Boolean(a.peinture) !== Boolean(b.peinture);
    if (diff) {
      const bd: Operation = { ...a, qte: b.qte, prix_unit: b.prix_unit, qualite: b.qualite ?? a.qualite ?? null, peinture: b.peinture, reference: b.reference || a.reference || null };
      ecarts.push({ id: id(), type: "operation", nature: "modification", libelle: `${a.op}${a.peinture ? "*" : ""} ${a.designation}`, avant: decrireOperation(a), apres: decrireOperation(b), montant_avant: montantOperation(a), montant_apres: montantOperation(b), decision: "refuse", operation: { cle: x.cle, devis: bd } });
    }
  }
  for (const y of opsApres) {
    if (y.vue) continue;
    ecarts.push({ id: id(), type: "operation", nature: "ajout", libelle: `${y.o.op}${y.o.peinture ? "*" : ""} ${y.o.designation}`, avant: null, apres: decrireOperation(y.o), montant_avant: 0, montant_apres: montantOperation(y.o), decision: "refuse", operation: { cle: y.cle, devis: y.o } });
  }

  // Les écarts les plus lourds en premier, à montant égal : ajouts, modifs, suppressions.
  const poids = { ajout: 0, modification: 1, suppression: 2 };
  return ecarts.sort((a, b) => Math.abs(b.montant_apres - b.montant_avant) - Math.abs(a.montant_apres - a.montant_avant) || poids[a.nature] - poids[b.nature]);
}

/* ------------------------------- Application ------------------------ */

/** Construit chocs + opérations du rapport définitif à partir des décisions. */
export function appliquerDecisions(rapport: Pick<RapportExpert, "chocs" | "operations">, ecarts: Ecart[]): { chocs: Choc[]; operations: Operation[] } {
  let chocs: Choc[] = (rapport.chocs || []).map((c) => ({ ...c, postes: (c.postes || []).map((p) => ({ ...p })) }));
  let operations: Operation[] = (rapport.operations || []).map((o) => ({ ...o }));

  for (const e of ecarts) {
    if (e.decision !== "accepte") continue;
    if (e.type === "poste" && e.poste) {
      const { cle, devis } = e.poste;
      if (e.nature === "suppression") {
        chocs = chocs.map((c) => ({ ...c, postes: c.postes.filter((p) => clePoste(p) !== cle) }));
      } else if (e.nature === "ajout" && devis) {
        if (!chocs.length) chocs = [{ numero: 1, libelle: null, postes: [] }];
        chocs[0] = { ...chocs[0], postes: [...chocs[0].postes, { ...devis }] };
      } else if (e.nature === "modification" && devis) {
        // Le premier poste portant ce nom prend les valeurs du devis, les
        // éventuels doublons (autres chocs) sont retirés : le devis est
        // agrégé, le rapport définitif l'est donc aussi.
        let pose = false;
        chocs = chocs.map((c) => ({
          ...c,
          postes: c.postes.flatMap((p) => {
            if (clePoste(p) !== cle) return [p];
            if (pose) return [];
            pose = true;
            return [{ ...p, heures: devis.heures, taux: devis.taux, remise: devis.remise, forfait: devis.forfait ?? null }];
          }),
        }));
      }
    } else if (e.type === "operation" && e.operation) {
      const { cle, devis } = e.operation;
      if (e.nature === "suppression") {
        const i = operations.findIndex((o) => cleOperation(o) === cle);
        if (i >= 0) operations.splice(i, 1);
      } else if (e.nature === "ajout" && devis) {
        operations.push({ ...devis });
      } else if (e.nature === "modification" && devis) {
        const i = operations.findIndex((o) => cleOperation(o) === cle);
        if (i >= 0) operations[i] = { ...operations[i], qte: devis.qte, prix_unit: devis.prix_unit, qualite: devis.qualite ?? null, peinture: devis.peinture, reference: devis.reference ?? operations[i].reference ?? null };
        else operations.push({ ...devis });
      }
    }
  }
  return { chocs, operations };
}

export const LIBELLE_NATURE: Record<NatureEcart, string> = { ajout: "Ajouté au devis", suppression: "Absent du devis", modification: "Modifié" };

/** Comparaison « nettoyée » pour la base (sans les données d'application). */
export function comparaisonPourBase(c: Comparaison): Comparaison {
  return { ...c, ecarts: c.ecarts.map(({ poste: _p, operation: _o, ...reste }) => reste) };
}
