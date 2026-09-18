// ============================================================
//  IMPORT D'UNE LISTE DE GARAGES (v13.4) — côté navigateur
//
//  Une collaboratrice prépare une liste dans Excel / Google Sheets
//  (nom, adresse, téléphone, email, suivi des appels…). L'éditeur l'importe
//  ici : lecture du fichier (.xlsx via JSZip, ou .csv), reconnaissance des
//  colonnes par leurs en-têtes, découpage de l'adresse, aperçu, puis envoi
//  à /api/admin/prospection (action « importer ») qui crée les fiches chez
//  le commercial choisi. Aucun réseau dans ce module.
// ============================================================

import JSZip from "jszip";

export type LigneImport = {
  ligne: number;          // n° de ligne dans le fichier (pour les messages)
  nom: string;
  adresse: string | null;
  cp: string | null;
  ville: string | null;
  tel: string | null;
  email: string | null;
  gerant: string | null;
  commentaire: string | null;
  // suivi éventuel déjà renseigné dans le fichier
  date_appel: string | null;   // YYYY-MM-DD
  repondu: boolean;
  pas_interesse: boolean;
  date_rappel: string | null;
  rdv: boolean;
  date_rdv: string | null;
};

export type ColonnesDetectees = Partial<Record<keyof Omit<LigneImport, "ligne" | "repondu" | "pas_interesse" | "rdv"> | "repondu" | "pas_interesse" | "rdv", number>>;

export type FichierLu = { entetes: string[]; lignes: string[][]; feuille: string };

/* ------------------------------ Lecture ------------------------------ */

/** Toutes les correspondances d'une regex globale (cible ES5, sans itérateur). */
function tous(re: RegExp, texte: string): RegExpExecArray[] {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const out: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = g.exec(texte)) !== null) {
    out.push(m);
    if (m[0] === "") g.lastIndex++;
  }
  return out;
}

function decoderXml(t: string): string {
  return t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** Colonne « AB » → index 27 (0 = A). */
function indexColonne(ref: string): number {
  const lettres = ref.replace(/\d+/g, "");
  let n = 0;
  for (const c of lettres) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** Numéro de série Excel → YYYY-MM-DD. */
function dateExcel(n: number): string {
  const ms = Math.round((n - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

/** Lit la PREMIÈRE feuille d'un classeur .xlsx (texte partagé, texte en ligne, nombres, dates). */
export async function lireXlsx(fichier: File): Promise<FichierLu> {
  const zip = await JSZip.loadAsync(await fichier.arrayBuffer());
  // Nom de la première feuille + chemin (workbook.xml + rels)
  const wb = await zip.file("xl/workbook.xml")?.async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  let chemin = "xl/worksheets/sheet1.xml";
  let feuille = "Feuille 1";
  if (wb && rels) {
    const m = wb.match(/<sheet\b[^>]*\bname="([^"]*)"[^>]*\br:id="([^"]*)"/);
    if (m) {
      feuille = decoderXml(m[1]);
      const rel = rels.match(new RegExp(`<Relationship\\b[^>]*\\bId="${m[2]}"[^>]*\\bTarget="([^"]*)"`)) || rels.match(new RegExp(`<Relationship\\b[^>]*\\bTarget="([^"]*)"[^>]*\\bId="${m[2]}"`));
      if (rel) chemin = rel[1].startsWith("/") ? rel[1].slice(1) : `xl/${rel[1].replace(/^\.\//, "")}`;
    }
  }
  const xml = await zip.file(chemin)?.async("string");
  if (!xml) throw new Error("Feuille introuvable dans le fichier Excel.");

  // Chaînes partagées
  const partagees: string[] = [];
  const ss = await zip.file("xl/sharedStrings.xml")?.async("string");
  if (ss) {
    for (const m of tous(/<si>([\s\S]*?)<\/si>/g, ss)) {
      const t = tous(/<t[^>]*>([\s\S]*?)<\/t>/g, m[1]).map((x) => x[1]).join("");
      partagees.push(decoderXml(t));
    }
  }
  // Styles : quelles cellules sont des dates (numFmt de date) ?
  const dateStyles = new Set<number>();
  const styles = await zip.file("xl/styles.xml")?.async("string");
  if (styles) {
    const numFmts = new Map<number, string>();
    for (const m of tous(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g, styles)) numFmts.set(Number(m[1]), decoderXml(m[2]));
    const xfs = styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/);
    if (xfs) {
      tous(/<xf\b[^>]*numFmtId="(\d+)"/g, xfs[1]).forEach((m, i) => {
        const id = Number(m[1]);
        const code = numFmts.get(id) || "";
        if ((id >= 14 && id <= 22) || /[dy]/i.test(code.replace(/\[[^\]]*\]/g, "").replace(/"[^"]*"/g, ""))) dateStyles.add(i);
      });
    }
  }

  const lignes: string[][] = [];
  for (const rm of tous(/<row\b[^>]*>([\s\S]*?)<\/row>/g, xml)) {
    const cellules: string[] = [];
    for (const cm of tous(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, rm[1])) {
      const attrs = cm[1];
      const corps = cm[2] || "";
      const ref = (attrs.match(/\br="([A-Z]+)\d+"/) || [])[1] || "";
      const type = (attrs.match(/\bt="(\w+)"/) || [])[1] || "";
      const style = Number((attrs.match(/\bs="(\d+)"/) || [])[1] || -1);
      let valeur = "";
      if (type === "s") {
        const idx = Number((corps.match(/<v>([^<]*)<\/v>/) || [])[1]);
        valeur = partagees[idx] ?? "";
      } else if (type === "inlineStr") {
        valeur = decoderXml(tous(/<t[^>]*>([\s\S]*?)<\/t>/g, corps).map((x) => x[1]).join(""));
      } else if (type === "b") {
        valeur = (corps.match(/<v>([^<]*)<\/v>/) || [])[1] === "1" ? "☑" : "☐";
      } else {
        const v = (corps.match(/<v>([^<]*)<\/v>/) || [])[1];
        if (v == null) valeur = "";
        else if (type === "str" || type === "e") valeur = decoderXml(v);
        else {
          const n = Number(v);
          valeur = !isNaN(n) && dateStyles.has(style) && n > 20000 && n < 80000 ? dateExcel(n) : String(n === Math.trunc(n) ? n : v);
        }
      }
      if (ref) cellules[indexColonne(ref)] = valeur;
      else cellules.push(valeur);
    }
    lignes.push(Array.from(cellules, (c) => (c ?? "").toString().trim()));
  }
  const nonVides = lignes.filter((l) => l.some(Boolean));
  if (!nonVides.length) throw new Error("La feuille est vide.");
  return { entetes: nonVides[0], lignes: nonVides.slice(1), feuille };
}

/** CSV (séparateur , ; ou tabulation, guillemets gérés). */
export function lireCsv(texte: string): FichierLu {
  const t = texte.replace(/^﻿/, "");
  const premiere = t.split(/\r?\n/)[0] || "";
  const sep = [";", ",", "\t"].map((s) => ({ s, n: premiere.split(s).length })).sort((a, b) => b.n - a.n)[0].s;
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = "";
  let guillemets = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (guillemets) {
      if (c === '"' && t[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === sep) { ligne.push(champ.trim()); champ = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      ligne.push(champ.trim()); champ = "";
      if (ligne.some(Boolean)) lignes.push(ligne);
      ligne = [];
    } else champ += c;
  }
  ligne.push(champ.trim());
  if (ligne.some(Boolean)) lignes.push(ligne);
  if (!lignes.length) throw new Error("Le fichier est vide.");
  return { entetes: lignes[0], lignes: lignes.slice(1), feuille: "CSV" };
}

export async function lireFichierListe(fichier: File): Promise<FichierLu> {
  const nom = fichier.name.toLowerCase();
  if (nom.endsWith(".xlsx") || nom.endsWith(".xlsm")) return lireXlsx(fichier);
  if (nom.endsWith(".csv") || nom.endsWith(".txt")) return lireCsv(await fichier.text());
  if (nom.endsWith(".xls")) throw new Error("Ancien format .xls : enregistre le fichier en .xlsx (Fichier → Enregistrer sous) puis réessaie.");
  throw new Error("Format non reconnu : fichier .xlsx ou .csv attendu.");
}

/* ------------------------------ Colonnes ------------------------------ */

function norm(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const MOTIFS: [keyof ColonnesDetectees, RegExp][] = [
  ["nom", /^(nom|garage|nom du garage|carrosserie|societe|entreprise|raison sociale|enseigne)/],
  ["tel", /(tel|telephone|phone|portable|mobile|fixe)/],
  ["email", /(mail|e mail|courriel)/],
  ["cp", /^(cp|code postal|codepostal)$/],
  ["ville", /^(ville|commune|localite)$/],
  ["adresse", /(adresse|address|rue|voie)/],
  ["gerant", /(gerant|dirigeant|contact|interlocuteur|patron|responsable)/],
  ["date_appel", /(date.*appel|appele le|date appel|dernier appel)/],
  ["repondu", /^(repondu|reponse|joint|decroche)/],
  ["pas_interesse", /(pas interesse|refus|non interesse)/],
  ["date_rappel", /(rappel|a rappeler|relance)/],
  ["date_rdv", /(date.*rdv|date.*rendez|rdv le)/],
  ["rdv", /^(rdv|rendez vous|rendez)/],
  ["commentaire", /(commentaire|remarque|note|observation|suivi)/],
];

/** Reconnaît les colonnes d'après leurs en-têtes (la première correspondance gagne). */
export function detecterColonnes(entetes: string[]): ColonnesDetectees {
  const cols: ColonnesDetectees = {};
  const pris = new Set<number>();
  for (const [cle, re] of MOTIFS) {
    const i = entetes.findIndex((e, idx) => !pris.has(idx) && re.test(norm(e)));
    if (i >= 0) { cols[cle] = i; pris.add(i); }
  }
  return cols;
}

/* ------------------------------ Normalisation ------------------------------ */

/** « 3 Rue Imhaus, 13006 Marseille » → { adresse, cp, ville }. */
export function analyserAdresse(brut: string | null | undefined): { adresse: string | null; cp: string | null; ville: string | null } {
  const a = (brut || "").replace(/\s+/g, " ").trim();
  if (!a) return { adresse: null, cp: null, ville: null };
  const m = a.match(/^(.*?)[,\s]*\b(\d{5})\s+([^,]+?)\s*(?:,\s*France)?$/i);
  if (m) return { adresse: m[1].replace(/[,\s]+$/, "").trim() || null, cp: m[2], ville: m[3].trim() || null };
  return { adresse: a, cp: null, ville: null };
}

/** « +33 4 91 48 70 17 » → « 04 91 48 70 17 ». */
export function normaliserTel(brut: string | null | undefined): string | null {
  let t = (brut || "").replace(/[^\d+]/g, "");
  if (!t) return null;
  if (t.startsWith("+33")) t = "0" + t.slice(3);
  else if (t.startsWith("0033")) t = "0" + t.slice(4);
  else if (t.length === 9 && !t.startsWith("0")) t = "0" + t;
  if (/^0\d{9}$/.test(t)) return t.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  return (brut || "").trim() || null;
}

function coche(v: string | undefined): boolean {
  const t = norm(v || "");
  return /^(x|oui|o|yes|y|true|1|vrai|ok|fait)$/.test(t) || /[☑✓✔√]/.test(v || "");
}

function date(v: string | undefined): string | null {
  const t = (v || "").trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (m) {
    const an = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${an}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

export function normaliserLignes(f: FichierLu, cols: ColonnesDetectees): { lignes: LigneImport[]; sansNom: number } {
  const get = (l: string[], k: keyof ColonnesDetectees) => (cols[k] != null ? l[cols[k] as number] || "" : "");
  const lignes: LigneImport[] = [];
  let sansNom = 0;
  f.lignes.forEach((l, i) => {
    const nom = get(l, "nom").replace(/\s+/g, " ").trim();
    if (!nom) { sansNom++; return; }
    const adr = analyserAdresse(get(l, "adresse"));
    lignes.push({
      ligne: i + 2,
      nom: nom.slice(0, 200),
      adresse: adr.adresse,
      cp: get(l, "cp").replace(/\D/g, "").slice(0, 5) || adr.cp,
      ville: get(l, "ville").trim() || adr.ville,
      tel: normaliserTel(get(l, "tel")),
      email: get(l, "email").trim().toLowerCase() || null,
      gerant: get(l, "gerant").trim() || null,
      commentaire: get(l, "commentaire").trim() || null,
      date_appel: date(get(l, "date_appel")),
      repondu: coche(get(l, "repondu")),
      pas_interesse: coche(get(l, "pas_interesse")),
      date_rappel: date(get(l, "date_rappel")),
      rdv: coche(get(l, "rdv")),
      date_rdv: date(get(l, "date_rdv")),
    });
  });
  return { lignes, sansNom };
}

/** Clé de dédoublonnage : téléphone, sinon nom + code postal. */
export function cleDoublon(x: { nom?: string | null; tel?: string | null; cp?: string | null }): string[] {
  const cles: string[] = [];
  const tel = (x.tel || "").replace(/\D/g, "");
  if (tel.length >= 9) cles.push(`tel:${tel.slice(-9)}`);
  const nom = norm(x.nom || "").replace(/\b(sarl|sas|sasu|eurl|carrosserie|garage|auto|automobile|automobiles|de|du|des|la|le|les|l|d)\b/g, " ").replace(/\s+/g, " ").trim();
  if (nom) cles.push(`nom:${nom}|${x.cp || ""}`);
  return cles;
}
