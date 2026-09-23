// ====================================================================
//  CONTRÔLE DU DEVIS DU RÉPARATEUR (mode expert, v13.23)
//
//  Le cœur de l'appli expert. L'expert a déjà son logiciel (création du
//  dossier, édition des rapports) et son extranet (échanges avec les
//  garages). Là où il perd du temps : confronter LIGNE PAR LIGNE le devis
//  du garage à son pré-rapport, puis décider.
//
//  1. RÉFÉRENCE = le pré-rapport (PDF de son logiciel lu par l'IA, rapport
//     chiffré dans l'appli, ou chiffrage attendu d'un tour précédent).
//  2. DEVIS du garage (PDF / photo lu par l'IA).
//  3. ÉCARTS : postes de main-d'œuvre (heures, taux, remise, forfait) et
//     opérations (pièces, prix, qualité, et CHANGEMENT D'OPÉRATION —
//     « AILE ARD. à redresser » devenue « AILE ARD. à remplacer »).
//     Chaque écart part « à trancher » : rien n'est décidé à la place de
//     l'expert.
//  4. DÉCISION par écart : accepter (valeur du devis) ou refuser
//     (maintenir le pré-rapport), avec un motif.
//  5. CONCLUSION : devis validé, demande de mise en conformité au garage
//     (nouveau tour quand le garage renvoie son devis), ou chiffrage de
//     l'expert imposé.
//
//  Ce fichier est PUR (aucun accès réseau) : testable et réutilisé par
//  l'écran, les PDF et le texte du courrier.
// ====================================================================

import { Choc, Operation, PosteChoc } from "./types";
import { ARRONDI, montantOperation, montantPoste, synthese } from "./chiffrage";
import { normaliser, normaliserDesignation } from "./comparaison";

/* -------------------------------- Types ------------------------------ */

export type DecisionControle = "a_trancher" | "accepte" | "refuse";
export type NatureEcartControle = "ajout" | "suppression" | "modification";
export type StatutControle = "a_trancher" | "attente_garage" | "valide";
export type ConclusionControle = "devis_valide" | "conformite_demandee" | "chiffrage_expert";

export type Chiffrage = { chocs: Choc[]; operations: Operation[] };

/** Un côté de la comparaison : le pré-rapport (référence) ou le devis. */
export type CoteControle = Chiffrage & {
  source: "pdf" | "rapport" | "tour_precedent" | "manuel";
  document_id?: string | null;
  rapport_id?: string | null;
  rapport_version?: number | null;
  nom: string | null;
  numero?: string | null;
  date?: string | null;
  /** Total HT imprimé sur le document (contrôle de la lecture automatique). */
  total_imprime_ht?: number | null;
  confiance?: string | null;
  /** L'expert a corrigé la lecture à la main. */
  corrige?: boolean;
};

export type EcartControle = {
  id: string;
  /** Clé STABLE (même écart après une relecture) : sert à conserver les décisions. */
  cle: string;
  type: "poste" | "operation";
  nature: NatureEcartControle;
  libelle: string;
  /** Précision lisible : « Redressage → Remplacement », « Taux », « Qualité de pièce »… */
  precision?: string | null;
  avant: string | null;
  apres: string | null;
  montant_avant: number;
  montant_apres: number;
  decision: DecisionControle;
  motif?: string | null;
  /** Données d'application (non affichées). */
  poste?: { cle: string; devis: PosteChoc | null };
  operation?: { index_ref: number | null; devis: Operation | null };
};

export type LigneConforme = { type: "poste" | "operation"; libelle: string; valeur: string; montant: number };

export type EntreeJournal = { date: string; action: string; detail?: string | null };

export type Controle = {
  id: string;
  owner_id: string;
  dossier_id: string;
  tour: number;
  parent_id: string | null;
  statut: StatutControle;
  conclusion: ConclusionControle | null;
  reference: CoteControle | null;
  devis: CoteControle | null;
  ecarts: EcartControle[];
  commentaire: string | null;
  journal: EntreeJournal[];
  resultat: (Chiffrage & { total_ht: number }) | null;
  rapport_id: string | null;
  cloture_le: string | null;
  created_at: string;
  updated_at: string;
};

/* ------------------------------ Libellés ----------------------------- */

export const STATUTS_CONTROLE: Record<StatutControle, { label: string; badge: string }> = {
  a_trancher: { label: "À trancher", badge: "badge-warn" },
  attente_garage: { label: "Attente du garage", badge: "badge-info" },
  valide: { label: "Validé", badge: "badge-ok" },
};

export const LIBELLE_CONCLUSION: Record<ConclusionControle, string> = {
  devis_valide: "Devis du garage validé",
  conformite_demandee: "Mise en conformité demandée au garage",
  chiffrage_expert: "Chiffrage de l'expert maintenu",
};

export const LIBELLE_NATURE_CONTROLE: Record<NatureEcartControle, string> = {
  ajout: "Ajouté par le garage",
  suppression: "Absent du devis",
  modification: "Modifié",
};

export const LIBELLE_DECISION: Record<DecisionControle, string> = {
  a_trancher: "À trancher",
  accepte: "Accepté",
  refuse: "Refusé",
};

/** Motifs proposés d'un clic (l'expert peut écrire le sien). */
export const MOTIFS_REFUS = [
  "Temps hors barème constructeur",
  "Élément réparable : remplacement non justifié",
  "Dommage non imputable au sinistre",
  "Opération non constatée à l'expertise",
  "Taux horaire non conforme à l'agrément",
  "Prix de la pièce supérieur au tarif",
  "Pièce de réemploi / équivalente à privilégier",
];
export const MOTIFS_ACCEPTATION = [
  "Dommage constaté au démontage",
  "Justifié par le réparateur (photos)",
  "Conforme au barème",
  "Prix conforme au tarif constructeur",
];

export const LIBELLE_OP: Record<string, string> = {
  E: "Remplacement", FO: "Forfait", I: "Redressage", L: "Peinture seule", M: "Marbre",
  N: "Dépose repose", P: "Contrôle", V: "Mesure", A: "Port", C: "Consigne",
};

/* ------------------------------ Outils ------------------------------- */

const eur = (n: number) => `${ARRONDI(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const hFr = (n: number) => `${Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} h`;

/** Similarité de Dice sur les mots (0..1) : « AILE ARD. REPARER » ≈ « AILE ARD. ». */
export function similarite(a: string, b: string): number {
  const ma = new Set(a.split(" ").filter((m) => m.length > 1));
  const mb = new Set(b.split(" ").filter((m) => m.length > 1));
  if (!ma.size || !mb.size) return a === b ? 1 : 0;
  let commun = 0;
  ma.forEach((m) => { if (mb.has(m)) commun += 1; });
  return (2 * commun) / (ma.size + mb.size);
}

/** Mots d'action retirés pour rapprocher « AILE ARD. REPARER » de « AILE ARD. ». */
const MOTS_ACTION = /\b(reparer|reparation|redresser|redressage|remplacer|remplacement|peindre|peinture|raccord|dep rep|depose|repose|controle|forfait)\b/g;
function cleOrgane(designation: string): string {
  return normaliserDesignation(designation).replace(MOTS_ACTION, " ").replace(/\s+/g, " ").trim();
}

const clePoste = (p: PosteChoc) => normaliser(p.poste);
export const codeOp = (o: Operation) => `${o.op}${o.peinture ? "*" : ""}`;
const libOp = (o: Operation) => `${codeOp(o)} ${o.designation}`;

export function totalHT(c: Chiffrage | null | undefined): number {
  if (!c) return 0;
  return synthese({ chocs: c.chocs || [], operations: c.operations || [], remise: 0, vetuste: 0, srgc: 0, taux_tva: 20 }).ht;
}

type PosteAgrege = { poste: string; heures: number; taux: number; remise: number; forfait: number | null; montant: number };

function agregerPostes(chocs: Choc[]): Map<string, PosteAgrege> {
  const m = new Map<string, PosteAgrege>();
  for (const c of chocs || []) {
    for (const p of c.postes || []) {
      const cle = clePoste(p);
      if (!cle) continue;
      const forfait = p.forfait !== null && p.forfait !== undefined && Number(p.forfait) > 0 ? Number(p.forfait) : null;
      const montant = montantPoste(p);
      if (!forfait && !(Number(p.heures) > 0)) continue; // poste vide (0 h) : ignoré
      const cur = m.get(cle);
      if (!cur) {
        m.set(cle, { poste: p.poste, heures: Number(p.heures) || 0, taux: Number(p.taux) || 0, remise: Number(p.remise) || 0, forfait, montant });
      } else {
        cur.heures = ARRONDI(cur.heures + (Number(p.heures) || 0));
        if (forfait) cur.forfait = ARRONDI((cur.forfait || 0) + forfait);
        cur.montant = ARRONDI(cur.montant + montant);
        if (!cur.taux) cur.taux = Number(p.taux) || 0;
      }
    }
  }
  return m;
}

export function decrirePoste(p: { heures: number; taux: number; remise?: number | null; forfait?: number | null }): string {
  if (p.forfait && Number(p.forfait) > 0) return `forfait ${eur(Number(p.forfait))}`;
  return `${hFr(p.heures)} × ${eur(p.taux)}${Number(p.remise) ? ` −${Number(p.remise)} %` : ""}`;
}

const QUALITE: Record<string, string> = { origine: "origine", equivalente: "équivalente", reemploi: "réemploi" };

export function decrireOperation(o: Operation): string {
  const q = o.qualite ? ` · ${QUALITE[o.qualite] || o.qualite}` : "";
  if (!Number(o.qte) && !Number(o.prix_unit)) return `${LIBELLE_OP[o.op] || o.op}${o.peinture ? " + peinture" : ""}${q}`;
  const rem = Number(o.remise) ? ` −${Number(o.remise)} %` : "";
  return `${Number(o.qte).toLocaleString("fr-FR")} × ${eur(o.prix_unit)}${rem}${q}`;
}

function precisionOperation(a: Operation, b: Operation): string {
  const p: string[] = [];
  // Changement d'opération : c'est LA décision à prendre, le reste en découle.
  if (a.op !== b.op) return `${LIBELLE_OP[a.op] || a.op} → ${LIBELLE_OP[b.op] || b.op}`;
  if (Boolean(a.peinture) !== Boolean(b.peinture)) p.push(b.peinture ? "peinture ajoutée" : "peinture retirée");
  if (Math.abs((a.qte || 0) - (b.qte || 0)) > 0.001) p.push("quantité");
  if (Math.abs((a.prix_unit || 0) - (b.prix_unit || 0)) > 0.01) p.push("prix");
  if (Math.abs((Number(a.remise) || 0) - (Number(b.remise) || 0)) > 0.01) p.push("remise");
  if ((a.qualite || null) !== (b.qualite || null)) p.push(a.qualite && b.qualite ? `pièce ${QUALITE[a.qualite]} → ${QUALITE[b.qualite]}` : `pièce ${QUALITE[b.qualite || a.qualite || ""] || ""}`.trim());
  return p.join(" · ");
}

function precisionPoste(a: PosteAgrege, b: PosteAgrege): string {
  const p: string[] = [];
  if (Math.abs(a.heures - b.heures) > 0.01) p.push(`${b.heures > a.heures ? "+" : ""}${hFr(ARRONDI(b.heures - a.heures))}`);
  if (Math.abs(a.taux - b.taux) > 0.01) p.push("taux horaire");
  if (Math.abs(a.remise - b.remise) > 0.01) p.push("remise");
  if (Math.abs((a.forfait || 0) - (b.forfait || 0)) > 0.01) p.push("forfait");
  return p.join(" · ");
}

function differe(a: Operation, b: Operation): boolean {
  return a.op !== b.op
    || Math.abs((a.qte || 0) - (b.qte || 0)) > 0.001
    || Math.abs((a.prix_unit || 0) - (b.prix_unit || 0)) > 0.01
    || Math.abs((Number(a.remise) || 0) - (Number(b.remise) || 0)) > 0.01
    || (a.qualite || null) !== (b.qualite || null)
    || Boolean(a.peinture) !== Boolean(b.peinture);
}

/* ----------------------------- Comparaison --------------------------- */

export type ResultatComparaison = { ecarts: EcartControle[]; conformes: LigneConforme[] };

/**
 * Confronte le devis à la référence. Rapprochement des opérations en trois
 * passes : 1) même code + même désignation ; 2) même code + désignation
 * proche ; 3) même organe, code différent (changement d'opération).
 */
export function comparerControle(reference: Chiffrage, devis: Chiffrage): ResultatComparaison {
  const ecarts: EcartControle[] = [];
  const conformes: LigneConforme[] = [];
  let n = 0;
  const id = () => `e${(n += 1)}`;

  // --- Postes de main-d'œuvre ---
  const avant = agregerPostes(reference.chocs || []);
  const apres = agregerPostes(devis.chocs || []);
  const cles = new Set<string>();
  avant.forEach((_, k) => cles.add(k));
  apres.forEach((_, k) => cles.add(k));
  cles.forEach((cle) => {
    const a = avant.get(cle);
    const b = apres.get(cle);
    const pd = b ? { poste: (a || b).poste, heures: b.heures, taux: b.taux, remise: b.remise, forfait: b.forfait } : null;
    if (a && !b) {
      ecarts.push({ id: id(), cle: `p|${cle}`, type: "poste", nature: "suppression", libelle: a.poste, avant: decrirePoste(a), apres: null, montant_avant: a.montant, montant_apres: 0, decision: "a_trancher", poste: { cle, devis: null } });
    } else if (!a && b) {
      ecarts.push({ id: id(), cle: `p|${cle}`, type: "poste", nature: "ajout", libelle: b.poste, avant: null, apres: decrirePoste(b), montant_avant: 0, montant_apres: b.montant, decision: "a_trancher", poste: { cle, devis: pd } });
    } else if (a && b) {
      const diff = Math.abs(a.heures - b.heures) > 0.01 || Math.abs(a.taux - b.taux) > 0.01 || Math.abs((a.forfait || 0) - (b.forfait || 0)) > 0.01 || Math.abs(a.remise - b.remise) > 0.01;
      if (diff) ecarts.push({ id: id(), cle: `p|${cle}`, type: "poste", nature: "modification", libelle: a.poste, precision: precisionPoste(a, b), avant: decrirePoste(a), apres: decrirePoste(b), montant_avant: a.montant, montant_apres: b.montant, decision: "a_trancher", poste: { cle, devis: pd } });
      else conformes.push({ type: "poste", libelle: a.poste, valeur: decrirePoste(a), montant: a.montant });
    }
  });

  // --- Opérations ---
  type Item = { o: Operation; i: number; cle: string; organe: string; paire: number | null };
  const itemise = (ops: Operation[]): Item[] => (ops || []).map((o, i) => ({ o, i, cle: `${o.op}|${normaliserDesignation(o.designation)}`, organe: cleOrgane(o.designation), paire: null }));
  const refs = itemise(reference.operations);
  const devs = itemise(devis.operations);

  const apparier = (critere: (x: Item, y: Item) => number) => {
    for (const x of refs) {
      if (x.paire !== null) continue;
      let meilleur = 0;
      let cand: Item | null = null;
      for (const y of devs) {
        if (y.paire !== null) continue;
        const s = critere(x, y);
        if (s > meilleur) { meilleur = s; cand = y; }
      }
      if (cand) { x.paire = cand.i; cand.paire = x.i; }
    }
  };
  apparier((x, y) => (x.cle === y.cle ? 1 : 0));
  apparier((x, y) => {
    if (x.o.op !== y.o.op) return 0;
    const s = similarite(normaliserDesignation(x.o.designation), normaliserDesignation(y.o.designation));
    return s >= 0.6 ? s : 0;
  });
  apparier((x, y) => {
    if (!x.organe || !y.organe) return 0;
    const s = x.organe === y.organe ? 1 : similarite(x.organe, y.organe);
    return s >= 0.75 ? s : 0;
  });

  // Occurrences : deux lignes identiques gardent des clés distinctes.
  const occ = new Map<string, number>();
  const cleUnique = (base: string) => { const k = (occ.get(base) || 0) + 1; occ.set(base, k); return k > 1 ? `${base}#${k}` : base; };

  for (const x of refs) {
    if (x.paire === null) {
      ecarts.push({ id: id(), cle: cleUnique(`o|${x.cle}|`), type: "operation", nature: "suppression", libelle: libOp(x.o), avant: decrireOperation(x.o), apres: null, montant_avant: montantOperation(x.o), montant_apres: 0, decision: "a_trancher", operation: { index_ref: x.i, devis: null } });
      continue;
    }
    const y = devs[x.paire];
    if (differe(x.o, y.o)) {
      const remplacement = x.o.op !== y.o.op;
      const devisOp: Operation = remplacement
        ? { ...y.o }
        : { ...x.o, qte: y.o.qte, prix_unit: y.o.prix_unit, remise: Number(y.o.remise) || 0, qualite: y.o.qualite ?? x.o.qualite ?? null, peinture: y.o.peinture, reference: y.o.reference || x.o.reference || null };
      ecarts.push({
        id: id(), cle: cleUnique(`o|${x.cle}|${y.cle}`), type: "operation", nature: "modification",
        libelle: remplacement ? `${x.o.designation}` : libOp(x.o), precision: precisionOperation(x.o, y.o),
        avant: `${remplacement ? codeOp(x.o) + " · " : ""}${decrireOperation(x.o)}`,
        apres: `${remplacement ? codeOp(y.o) + " · " : ""}${decrireOperation(y.o)}`,
        montant_avant: montantOperation(x.o), montant_apres: montantOperation(y.o), decision: "a_trancher",
        operation: { index_ref: x.i, devis: devisOp },
      });
    } else {
      conformes.push({ type: "operation", libelle: libOp(x.o), valeur: decrireOperation(x.o), montant: montantOperation(x.o) });
    }
  }
  for (const y of devs) {
    if (y.paire !== null) continue;
    ecarts.push({ id: id(), cle: cleUnique(`o||${y.cle}`), type: "operation", nature: "ajout", libelle: libOp(y.o), avant: null, apres: decrireOperation(y.o), montant_avant: 0, montant_apres: montantOperation(y.o), decision: "a_trancher", operation: { index_ref: null, devis: { ...y.o } } });
  }

  // Les plus lourds d'abord ; à montant égal : main-d'œuvre, puis ajouts, modifs, suppressions.
  const poids = { ajout: 0, modification: 1, suppression: 2 };
  ecarts.sort((a, b) => Math.abs(b.montant_apres - b.montant_avant) - Math.abs(a.montant_apres - a.montant_avant) || (a.type === b.type ? 0 : a.type === "poste" ? -1 : 1) || poids[a.nature] - poids[b.nature]);
  return { ecarts, conformes };
}

/**
 * Relecture d'un document : on garde la décision (et le motif) des écarts
 * INCHANGÉS ; un écart dont les valeurs ont bougé repasse « à trancher ».
 */
export function fusionnerDecisions(anciens: EcartControle[], nouveaux: EcartControle[]): EcartControle[] {
  const parCle = new Map(anciens.map((e) => [e.cle, e]));
  return nouveaux.map((e) => {
    const a = parCle.get(e.cle);
    if (!a || a.decision === "a_trancher") return e;
    if (a.avant !== e.avant || a.apres !== e.apres) return e;
    return { ...e, decision: a.decision, motif: a.motif ?? null };
  });
}

/* ----------------------------- Application --------------------------- */

/**
 * Chiffrage retenu : la référence, où chaque écart ACCEPTÉ prend la valeur
 * du devis. Refusé ou à trancher → la référence est conservée.
 */
export function appliquerControle(reference: Chiffrage, ecarts: EcartControle[]): Chiffrage {
  let chocs: Choc[] = (reference.chocs || []).map((c) => ({ ...c, postes: (c.postes || []).map((p) => ({ ...p })) }));
  const ops: (Operation | null)[] = (reference.operations || []).map((o) => ({ ...o }));
  const ajouts: Operation[] = [];

  for (const e of ecarts) {
    if (e.decision !== "accepte") continue;
    if (e.type === "poste" && e.poste) {
      const { cle, devis } = e.poste;
      if (e.nature === "suppression") {
        chocs = chocs.map((c) => ({ ...c, postes: c.postes.filter((p) => clePoste(p) !== cle) }));
      } else if (e.nature === "ajout" && devis) {
        if (!chocs.length) chocs = [{ numero: 1, libelle: "Choc 1", postes: [] }];
        chocs[0] = { ...chocs[0], postes: [...chocs[0].postes, { ...devis }] };
      } else if (e.nature === "modification" && devis) {
        // Le devis est agrégé par poste : le 1er poste de ce nom prend ses
        // valeurs, les doublons éventuels (autres chocs) sont retirés.
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
      const { index_ref, devis } = e.operation;
      if (e.nature === "suppression" && index_ref !== null && index_ref < ops.length) ops[index_ref] = null;
      else if (e.nature === "modification" && devis && index_ref !== null && index_ref < ops.length) ops[index_ref] = { ...devis };
      else if (e.nature === "ajout" && devis) ajouts.push({ ...devis });
    }
  }
  return { chocs, operations: [...ops.filter((o): o is Operation => o !== null), ...ajouts] };
}

/* ------------------------------- Synthèse ---------------------------- */

export type ResumeControle = {
  total: number;
  aTrancher: number;
  acceptes: number;
  refuses: number;
  totalReference: number;
  totalDevis: number;
  totalRetenu: number;
  /** Montant du devis non retenu (devis − retenu) : ce que le contrôle a fait économiser. */
  economie: number;
  termine: boolean;
};

export function resumer(c: Pick<Controle, "reference" | "devis" | "ecarts">): ResumeControle {
  const e = c.ecarts || [];
  const totalReference = totalHT(c.reference);
  const totalDevis = totalHT(c.devis);
  const totalRetenu = c.reference ? totalHT(appliquerControle(c.reference, e)) : 0;
  const aTrancher = e.filter((x) => x.decision === "a_trancher").length;
  return {
    total: e.length,
    aTrancher,
    acceptes: e.filter((x) => x.decision === "accepte").length,
    refuses: e.filter((x) => x.decision === "refuse").length,
    totalReference,
    totalDevis,
    totalRetenu,
    economie: c.devis ? ARRONDI(totalDevis - totalRetenu) : 0,
    termine: Boolean(c.reference && c.devis) && aTrancher === 0,
  };
}

/** Écart entre le total lu et le total imprimé sur le document (> 1 € et > 1 %). */
export function alerteLecture(cote: CoteControle | null | undefined): { lu: number; imprime: number; ecart: number } | null {
  if (!cote || !cote.total_imprime_ht) return null;
  const lu = totalHT(cote);
  const imprime = Number(cote.total_imprime_ht) || 0;
  const ecart = ARRONDI(imprime - lu);
  if (Math.abs(ecart) <= Math.max(1, imprime * 0.01)) return null;
  return { lu, imprime, ecart };
}

/** Chiffrage attendu pour le tour suivant : la référence + les écarts acceptés. */
export function chiffrageAttendu(c: Pick<Controle, "reference" | "ecarts">): Chiffrage {
  return c.reference ? appliquerControle(c.reference, c.ecarts || []) : { chocs: [], operations: [] };
}

/* ------------------------ Ce qu'il faut ressaisir -------------------- */

export type LigneARessaisir = { action: "Modifier" | "Ajouter" | "Supprimer"; type: "poste" | "operation"; libelle: string; avant: string | null; valeur: string | null; delta: number };

/** Les SEULES lignes à reporter dans le logiciel de l'expert : les écarts acceptés. */
export function lignesARessaisir(ecarts: EcartControle[]): LigneARessaisir[] {
  return ecarts.filter((e) => e.decision === "accepte").map((e) => ({
    action: e.nature === "ajout" ? "Ajouter" : e.nature === "suppression" ? "Supprimer" : "Modifier",
    type: e.type,
    libelle: e.libelle,
    avant: e.avant,
    valeur: e.apres,
    delta: ARRONDI(e.montant_apres - e.montant_avant),
  }));
}

/* ----------------------------- Textes -------------------------------- */

export function texteDemandeConformite(args: {
  garage: string | null;
  dossierNumero: string;
  immatriculation: string | null;
  vehicule: string | null;
  sinistre: string | null;
  devisNom: string | null;
  ecarts: EcartControle[];
  commentaire: string | null;
  expert: string | null;
  cabinet: string | null;
  totalAttendu: number;
}): string {
  const refuses = args.ecarts.filter((e) => e.decision === "refuse");
  const acceptes = args.ecarts.filter((e) => e.decision === "accepte");
  const l: string[] = [];
  l.push(`Objet : dossier ${args.dossierNumero}${args.immatriculation ? ` — ${args.immatriculation}` : ""}${args.vehicule ? ` (${args.vehicule})` : ""} — demande de mise en conformité du devis`);
  if (args.sinistre) l.push(`Sinistre n° ${args.sinistre}`);
  l.push("");
  l.push(`Madame, Monsieur${args.garage ? ` (${args.garage})` : ""},`);
  l.push("");
  l.push(`Après examen de votre devis${args.devisNom ? ` « ${args.devisNom} »` : ""} au regard de notre pré-rapport, nous ne pouvons pas le valider en l'état. Nous vous remercions de bien vouloir le mettre en conformité sur les points suivants :`);
  l.push("");
  refuses.forEach((e, i) => {
    l.push(`${i + 1}. ${e.libelle}${e.precision ? ` (${e.precision})` : ""}`);
    l.push(`   Votre devis : ${e.apres || "ligne absente"} — Retenu par l'expert : ${e.avant || "ligne non retenue"}`);
    if (e.motif) l.push(`   Motif : ${e.motif}`);
  });
  if (acceptes.length) {
    l.push("");
    l.push(`Les ${acceptes.length === 1 ? "modification suivante est acceptée" : `${acceptes.length} modifications suivantes sont acceptées`} :`);
    acceptes.forEach((e) => l.push(`- ${e.libelle} : ${e.apres || "ligne retirée"}`));
  }
  l.push("");
  l.push(`Montant HT attendu après mise en conformité : ${eur(args.totalAttendu)}.`);
  if (args.commentaire) { l.push(""); l.push(args.commentaire); }
  l.push("");
  l.push("Dans l'attente de votre devis rectifié, nous restons à votre disposition.");
  l.push("");
  l.push("Cordialement,");
  if (args.expert) l.push(args.expert);
  if (args.cabinet) l.push(args.cabinet);
  return l.join("\n");
}

export function libelleStatut(c: Pick<Controle, "statut">): { label: string; badge: string } {
  return STATUTS_CONTROLE[c.statut] || STATUTS_CONTROLE.a_trancher;
}

export function maintenant(): string {
  return new Date().toISOString();
}

/** Ajoute une entrée au journal (garde les 200 dernières). */
export function journaliser(j: EntreeJournal[] | null | undefined, action: string, detail?: string | null): EntreeJournal[] {
  return [...(j || []), { date: maintenant(), action, detail: detail ?? null }].slice(-200);
}
