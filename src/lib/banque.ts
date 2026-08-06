// Helpers Banque : parsing des relevés CSV (toutes banques) et
// rapprochement automatique transactions ↔ factures.

import { Document, Dossier, Paiement } from "./types";
import { resteAPayer, totalPaye } from "./paiements";

export type LigneReleve = {
  date: string; // AAAA-MM-JJ
  libelle: string;
  montant: number; // crédit > 0, débit < 0
  reference: string | null;
};

export type FactureBanque = Document & {
  dossier: Dossier | null;
  paiements: Paiement[];
  reste: number;
};

/* ----------------------------- Parsing CSV ----------------------------- */

// Découpe un CSV en cellules (gère guillemets et séparateur ; , ou tab).
function parseCsvBrut(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const sep = [";", ",", "\t"]
    .map((s) => ({ s, n: firstLine.split(s).length }))
    .sort((a, b) => b.n - a.n)[0].s;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === sep) {
      row.push(cell); cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

// "1 234,56" | "1.234,56" | "-12.34" → nombre. NaN si illisible.
export function parseMontantFr(s: string): number {
  let t = (s || "").replace(/[\s  €]/g, "").trim();
  if (!t) return NaN;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return isNaN(n) ? NaN : n;
}

// "13/08/2026" | "13-08-2026" | "2026-08-13" → "2026-08-13". null si illisible.
export function parseDateFr(s: string): string | null {
  const t = (s || "").trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yyyy}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

function chercheColonne(headers: string[], motsCles: string[]): number {
  const H = headers.map((h) => h.toLowerCase());
  for (const mot of motsCles) {
    const i = H.findIndex((h) => h.includes(mot));
    if (i !== -1) return i;
  }
  return -1;
}

/**
 * Parse un relevé bancaire CSV (export de n'importe quelle banque).
 * Détecte l'en-tête (date / libellé / montant OU débit+crédit / référence) ;
 * sinon suppose colonnes : date, libellé, montant.
 */
export function parseReleveCsv(text: string): { lignes: LigneReleve[]; ignorees: number } {
  const rows = parseCsvBrut(text);
  if (rows.length === 0) return { lignes: [], ignorees: 0 };

  const headers = rows[0].map((h) => h.trim());
  const iDate = chercheColonne(headers, ["date"]);
  const iLib = chercheColonne(headers, ["libell", "label", "description", "motif", "opération", "operation", "détail", "detail"]);
  const iMontant = chercheColonne(headers, ["montant", "amount"]);
  const iDebit = chercheColonne(headers, ["débit", "debit"]);
  const iCredit = chercheColonne(headers, ["crédit", "credit"]);
  const iRef = chercheColonne(headers, ["référence", "reference", "réf", "ref"]);

  const avecEntete = iDate !== -1 && (iLib !== -1 || iMontant !== -1 || iCredit !== -1);
  const dataRows = avecEntete ? rows.slice(1) : rows;
  const cDate = avecEntete ? iDate : 0;
  const cLib = avecEntete && iLib !== -1 ? iLib : 1;
  const cMontant = avecEntete && iMontant !== -1 ? iMontant : avecEntete ? -1 : 2;

  const lignes: LigneReleve[] = [];
  let ignorees = 0;
  for (const r of dataRows) {
    const date = parseDateFr(r[cDate] || "");
    let montant = NaN;
    if (cMontant !== -1) montant = parseMontantFr(r[cMontant] || "");
    // Colonnes Débit/Crédit : chacune traitée indépendamment (certains exports
    // n'ont qu'une des deux colonnes).
    if (isNaN(montant) && (iDebit !== -1 || iCredit !== -1)) {
      const deb = iDebit !== -1 ? parseMontantFr(r[iDebit] || "") : NaN;
      const cre = iCredit !== -1 ? parseMontantFr(r[iCredit] || "") : NaN;
      if (!isNaN(cre) && cre !== 0) montant = Math.abs(cre);
      else if (!isNaN(deb) && deb !== 0) montant = -Math.abs(deb);
    }
    const libelle = (r[cLib] || "").trim().replace(/\s+/g, " ");
    if (!date || isNaN(montant) || montant === 0) { ignorees++; continue; }
    lignes.push({
      date,
      libelle: libelle || "(sans libellé)",
      montant,
      reference: iRef !== -1 ? (r[iRef] || "").trim() || null : null,
    });
  }
  return { lignes, ignorees };
}

// Empreinte stable pour dédupliquer les réimports du même relevé.
// `occurrence` distingue deux opérations LÉGITIMEMENT identiques du même jour
// (même libellé + même montant, ex. deux franchises de 150 €) : sans lui, la
// seconde était silencieusement écartée à l'import.
export function hashTransaction(l: LigneReleve, occurrence = 0): string {
  // occurrence 0 : clé IDENTIQUE à l'ancien format → les transactions déjà en
  // base restent dédupliquées lors d'un réimport (pas de doublons rétroactifs).
  const base = `${l.date}|${l.libelle.toLowerCase()}|${l.montant.toFixed(2)}`;
  const key = occurrence > 0 ? `${base}|${occurrence}` : base;
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  return `${(h >>> 0).toString(16)}-${key.length}`;
}

// Hash de toutes les lignes d'un relevé, en numérotant les doublons exacts
// (1re occurrence = 0, 2e = 1…). Stable d'un réimport à l'autre du même relevé.
export function hashTransactions(lignes: LigneReleve[]): string[] {
  const vus = new Map<string, number>();
  return lignes.map((l) => {
    const base = `${l.date}|${l.libelle.toLowerCase()}|${l.montant.toFixed(2)}`;
    const n = vus.get(base) || 0;
    vus.set(base, n + 1);
    return hashTransaction(l, n);
  });
}

/* --------------------------- Rapprochement --------------------------- */

function normalise(s: string): string {
  return s.toUpperCase().replace(/[\s\-_.]/g, "");
}

/* ------------------- Analyse du relevé : correspondances ------------------- */
// v6.7 — On identifie les dossiers DÉJÀ RÉGLÉS en retrouvant, dans le libellé
// du virement, le N° DE FACTURE ou le N° DE DOSSIER (sinistre). C'est la
// référence qui fait foi : un montant identique ne prouve rien (deux factures
// peuvent avoir le même total), une référence oui.

export type MotifRapprochement =
  | "numero_facture"
  | "numero_sinistre"
  | "immatriculation"
  | "montant_exact"
  | "montant_total"
  | "nom_client";

export const LIBELLE_MOTIF: Record<MotifRapprochement, string> = {
  numero_facture: "N° de facture",
  numero_sinistre: "N° de dossier",
  immatriculation: "Immatriculation",
  montant_exact: "Montant = reste dû",
  montant_total: "Montant = total TTC",
  nom_client: "Nom du client",
};

export type Correspondance = {
  facture: FactureBanque;
  score: number;
  motifs: MotifRapprochement[];
  /** Référence trouvée dans le libellé ET montant compatible → rapprochable sans relecture. */
  certaine: boolean;
};

/**
 * Cherche une référence dans un libellé bancaire normalisé.
 * Tolère les libellés TRONQUÉS par la banque (souvent ~32 caractères) en
 * retombant sur le suffixe numérique significatif de la référence.
 */
function contientReference(libelleNormalise: string, ref: string | null | undefined, minLen = 5): boolean {
  if (!ref) return false;
  const r = normalise(ref);
  if (r.length < minLen) return false;
  if (libelleNormalise.includes(r)) return true;
  if (r.length >= 9) {
    const suffixe = r.slice(-9);
    if (/^\d{6,}$/.test(suffixe) && libelleNormalise.includes(suffixe)) return true;
  }
  return false;
}

/**
 * Analyse un CRÉDIT bancaire et renvoie la facture qui lui correspond.
 * Renvoie null si rien de probant, ou si deux factures sont à égalité
 * (ambiguïté → on préfère laisser l'humain trancher).
 */
export function analyserCredit(
  montant: number,
  libelle: string,
  reference: string | null,
  factures: FactureBanque[]
): Correspondance | null {
  if (montant <= 0) return null;
  const lib = normalise(`${libelle || ""} ${reference || ""}`);
  const candidats: Correspondance[] = [];

  for (const f of factures) {
    if (f.reste <= 0) continue;
    const motifs: MotifRapprochement[] = [];
    let score = 0;

    if (contientReference(lib, f.numero, 6)) { score += 100; motifs.push("numero_facture"); }
    if (contientReference(lib, f.dossier?.numero_sinistre, 5)) { score += 80; motifs.push("numero_sinistre"); }
    if (contientReference(lib, f.dossier?.immatriculation, 6)) { score += 45; motifs.push("immatriculation"); }

    if (Math.abs(f.reste - montant) <= 0.01) { score += 50; motifs.push("montant_exact"); }
    else if (Math.abs((Number(f.total_ttc) || 0) - montant) <= 0.01) { score += 40; motifs.push("montant_total"); }

    const nom = f.dossier?.client_nom || "";
    if (nom.length >= 4 && lib.includes(normalise(nom))) { score += 20; motifs.push("nom_client"); }

    if (score > 0) {
      const parReference =
        motifs.includes("numero_facture") ||
        motifs.includes("numero_sinistre") ||
        motifs.includes("immatriculation");
      candidats.push({
        facture: f,
        score,
        motifs,
        // Certaine = la référence désigne CETTE facture et le virement ne
        // dépasse pas ce qui reste dû (sinon : trop-perçu, on fait relire).
        certaine: parReference && montant <= f.reste + 0.01,
      });
    }
  }

  if (candidats.length === 0) return null;
  candidats.sort((a, b) => b.score - a.score);
  const meilleur = candidats[0];
  // Égalité parfaite entre deux factures → ambigu, on ne décide pas tout seul.
  if (candidats[1] && candidats[1].score === meilleur.score) {
    return { ...meilleur, certaine: false };
  }
  return meilleur.score >= 40 ? meilleur : null;
}

/**
 * Suggère la facture correspondant à un crédit bancaire.
 * Priorités : n° de facture / n° de dossier présents dans le libellé, puis
 * montant = reste à payer, puis montant = total TTC (+ bonus nom du client).
 */
export function suggererFacture(
  montant: number,
  libelle: string,
  factures: FactureBanque[]
): FactureBanque | null {
  return analyserCredit(montant, libelle, null, factures)?.facture || null;
}

export function calculeReste(f: Document & { paiements: Paiement[] }): number {
  return resteAPayer(f.total_ttc, totalPaye(f.paiements));
}
