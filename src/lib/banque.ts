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
    if (isNaN(montant) && iDebit !== -1 && iCredit !== -1) {
      const deb = parseMontantFr(r[iDebit] || "");
      const cre = parseMontantFr(r[iCredit] || "");
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
export function hashTransaction(l: LigneReleve): string {
  const key = `${l.date}|${l.libelle.toLowerCase()}|${l.montant.toFixed(2)}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  return `${(h >>> 0).toString(16)}-${key.length}`;
}

/* --------------------------- Rapprochement --------------------------- */

function normalise(s: string): string {
  return s.toUpperCase().replace(/[\s\-_.]/g, "");
}

/**
 * Suggère la facture correspondant à un crédit bancaire.
 * Priorités : n° de facture présent dans le libellé > montant = reste à payer
 * > montant = total TTC (+ bonus si le nom du client apparaît).
 */
export function suggererFacture(
  montant: number,
  libelle: string,
  factures: FactureBanque[]
): FactureBanque | null {
  if (montant <= 0) return null;
  const lib = normalise(libelle);
  let best: FactureBanque | null = null;
  let bestScore = 0;

  for (const f of factures) {
    if (f.reste <= 0) continue;
    let score = 0;
    if (f.numero && lib.includes(normalise(f.numero))) score += 100;
    if (Math.abs(f.reste - montant) <= 0.01) score += 50;
    else if (Math.abs((Number(f.total_ttc) || 0) - montant) <= 0.01) score += 40;
    const nom = f.dossier?.client_nom || "";
    if (nom && nom.length >= 4 && lib.includes(normalise(nom))) score += 20;
    if (score > bestScore) { bestScore = score; best = f; }
  }
  return bestScore >= 40 ? best : null;
}

export function calculeReste(f: Document & { paiements: Paiement[] }): number {
  return resteAPayer(f.total_ttc, totalPaye(f.paiements));
}
