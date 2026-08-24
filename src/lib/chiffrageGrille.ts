// ============================================================
//  LECTURE DÉTERMINISTE DU CHIFFRAGE EN GRILLE (v9.1)
//
//  POURQUOI ON NE DEMANDE PLUS AU MODÈLE DE LIRE CETTE GRILLE.
//  Les rapports BCA / Allianz présentent la main d'œuvre en MATRICE :
//  les postes sont des COLONNES (T1, T2, T3, TP), les natures de travaux
//  des LIGNES, avec une ligne « Taux horaires ». Trois versions de prompt
//  n'ont pas suffi : le modèle ratait T1 et T2 et le total tombait faux.
//
//  Or cette mise en page est PARFAITEMENT régulière : à partir du calque
//  texte (lib/pdfTexte.ts), les colonnes sont des positions de caractères.
//  On la lit donc EN CODE, sans IA — et surtout on VÉRIFIE le résultat
//  contre les sous-totaux imprimés par le rapport lui-même
//  (« Main d'oeuvre HT », « Pièces HT », « Total HTVA »).
//
//  ⚠️ RÈGLE : cette lecture n'est retenue que si son arithmétique retombe
//  sur le TOTAL du rapport à 1 € près. Sinon on renvoie null et l'analyse
//  IA habituelle reprend la main. On ne remplace jamais une lecture
//  incertaine par une autre lecture incertaine.
// ============================================================

import { CategorieLigne } from "./documents";

/** Colonnes de postes reconnues, et le libellé qu'on leur donne. */
const POSTES: Record<string, string> = { T1: "T1", T2: "T2", T3: "T3", TP: "Peinture" };

/** Tolérance de rapprochement avec les totaux du rapport. */
const TOLERANCE = 1;

export type LigneGrille = {
  designation: string;
  quantite: number;
  prix_unitaire: number;
  remise: number;
  categorie: CategorieLigne;
};

export type RecapRapport = {
  mo: number | null;
  pieces: number | null;
  ingTaux: number | null;
  ingTotal: number | null;
  tva: number | null;
  total: number | null;
};

export type ChiffrageGrille = {
  lignes: LigneGrille[];
  montant: number;
  tva: number | null;
  recap: RecapRapport;
};

/** « 1 234,56 » / « 1.234,56 » → 1234.56 */
function nb(s: string | null | undefined): number | null {
  if (s == null) return null;
  const t = String(s)
    .replace(/ /g, " ")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

function premier(lignes: string[], re: RegExp): number[] {
  for (const l of lignes) {
    const m = l.match(re);
    if (m) return m.slice(1).map(nb).filter((v): v is number => v !== null);
  }
  return [];
}

/** Sous-totaux imprimés dans le récapitulatif du rapport. */
export function lireRecap(lignes: string[]): RecapRapport {
  const mo = premier(lignes, /Main\s*d.?\s*oeuvre\s+HT\s+([\d\s.,]+?)\s*$/i);
  const pieces = premier(lignes, /Pi[eè]ces\s+HT\s+([\d\s.,]+?)\s*$/i);
  const ing = premier(lignes, /Ingr[eé]dients?\s+peinture\s+HT\s+([\d\s.,]+?)\s+([\d\s.,]+?)\s*$/i);
  // La ligne « TVA » du récapitulatif n'est pas en début de ligne : le bloc
  // « OBSERVATIONS » est imprimé à sa gauche. On exige deux espaces avant et
  // après pour ne pas confondre avec « TVA intracommunautaire ».
  const tva = premier(lignes, /(?:^|\s{2})TVA\s{2,}([\d\s.,]+?)\s*$/i);
  const total = premier(
    lignes,
    /(?:Total\s+HTVA|Montant\s+r[eé]paration\s+HTVA|TOTAL\s+HT)\s+([\d\s.,]+?)\s*$/i
  );
  return {
    mo: mo[0] ?? null,
    pieces: pieces[0] ?? null,
    ingTaux: ing[0] ?? null,
    ingTotal: ing[1] ?? null,
    tva: tva[0] ?? null,
    total: total[0] ?? null,
  };
}

/** Les postes de main d'œuvre lus dans la matrice T1/T2/T3/TP. */
export function lireGrille(lignes: string[]): LigneGrille[] | null {
  let iEntete = -1;
  let colonnes: { code: string; col: number }[] = [];

  for (let i = 0; i < lignes.length; i += 1) {
    const trouves: { code: string; col: number }[] = [];
    for (const code of Object.keys(POSTES)) {
      const re = new RegExp(`(?:^|[^A-Za-z0-9])(${code})(?![A-Za-z0-9])`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(lignes[i])) !== null) {
        trouves.push({ code, col: m.index + m[0].indexOf(code) });
      }
    }
    // Deux colonnes de postes sur la même ligne = c'est l'en-tête de la grille.
    if (trouves.length >= 2) {
      iEntete = i;
      colonnes = trouves;
      break;
    }
  }
  if (iEntete < 0) return null;

  // Le récapitulatif est imprimé À DROITE, sur les mêmes lignes : on borne la
  // zone de lecture pour ne pas prendre « 1880,00 » pour des heures.
  const bornes = lignes.slice(iEntete, iEntete + 6).map((l) => {
    const m = l.match(/(Main\s*d.?\s*oeuvre\s+HT|Pi[eè]ces\s+HT|Total\s+HTVA)/i);
    return m && m.index !== undefined ? m.index : 9999;
  });
  const limite = Math.min(Math.min(...bornes), Math.max(...colonnes.map((c) => c.col)) + 14);

  const heures: Record<string, number> = {};
  const taux: Record<string, number> = {};
  for (const c of colonnes) heures[c.code] = 0;

  for (let i = iEntete + 1; i < Math.min(lignes.length, iEntete + 12); i += 1) {
    const gauche = lignes[i].slice(0, limite);
    if (!gauche.trim()) continue;
    const estTaux = /taux\s+horaire/i.test(gauche);
    // La case « Forfait » d'une grille est un MONTANT, pas des heures.
    const estForfait = /^\s*forfait/i.test(gauche);

    const re = /\d+(?:[.,]\d+)?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(gauche)) !== null) {
      const valeur = nb(m[0]);
      if (valeur === null) continue;
      const fin = m.index + m[0].length;
      let meilleure: { code: string; col: number } | null = null;
      let distance = 99;
      for (const c of colonnes) {
        const d = Math.abs(fin - (c.col + 2));
        if (d < distance) {
          distance = d;
          meilleure = c;
        }
      }
      if (!meilleure || distance > 12) continue;
      if (estTaux) taux[meilleure.code] = valeur;
      else if (!estForfait) heures[meilleure.code] = (heures[meilleure.code] || 0) + valeur;
    }
    if (/^\s*(forfait|total)/i.test(gauche)) break;
  }

  const postes: LigneGrille[] = [];
  for (const c of colonnes) {
    const h = heures[c.code] || 0;
    const t = taux[c.code] || 0;
    if (h > 0 && t > 0) {
      postes.push({
        designation: POSTES[c.code],
        quantite: h,
        prix_unitaire: t,
        remise: 0,
        categorie: "mo",
      });
    }
  }
  return postes.length ? postes : null;
}

/** Le tableau des libellés (N° / Act / Libellé / Prix (HT) / Q). */
export function lireTableau(lignes: string[]): LigneGrille[] | null {
  let iEntete = -1;
  let colPrix = -1;
  let colQ = -1;
  for (let i = 0; i < lignes.length; i += 1) {
    if (/Libell[eé]/i.test(lignes[i]) && /Prix/i.test(lignes[i])) {
      iEntete = i;
      colPrix = lignes[i].search(/Prix/i);
      colQ = lignes[i].search(/(?:^|[^A-Za-z])Q(?![A-Za-z])/);
      break;
    }
  }
  if (iEntete < 0 || colPrix < 0) return null;

  const out: LigneGrille[] = [];
  for (let i = iEntete + 1; i < lignes.length; i += 1) {
    const l = lignes[i];
    const m = l.match(/^\s*(\d{1,3})\s+([A-Z]{1,4})\s+(.*)$/);
    if (!m) {
      // La légende (« A autre, C changer… ») ou la grille marquent la fin.
      if (out.length && /^\s*(?:[A-Z] autre|PUB\b)/.test(l)) break;
      continue;
    }
    const reste = m[3];
    const debutReste = l.length - reste.length;
    // Les chiffres ne sont cherchés QUE dans la zone des colonnes de droite :
    // sinon une référence constructeur (81A853717AGRU) ou un libellé comme
    // « PEINTURE S3 » était pris pour un prix et tronquait la désignation.
    const debutChiffres = Math.max(debutReste, colPrix - 6);
    const zone = l.slice(debutChiffres);
    const nums: { v: number; fin: number }[] = [];
    const re = /\d+(?:[.,]\d+)?/g;
    let n: RegExpExecArray | null;
    while ((n = re.exec(zone)) !== null) {
      const v = nb(n[0]);
      if (v !== null) nums.push({ v, fin: debutChiffres + n.index + n[0].length });
    }
    const prix = nums.find((x) => Math.abs(x.fin - (colPrix + 9)) <= 6);
    const q = colQ >= 0 ? nums.find((x) => x !== prix && Math.abs(x.fin - (colQ + 4)) <= 6) : undefined;

    const libelle = l.slice(debutReste, debutChiffres).replace(/\s+$/, "").trim();
    if (!libelle) continue;
    const quantite = q ? q.v : 1;
    out.push({
      // Code opération conservé entre parenthèses, comme sur les autres formats.
      designation: `${libelle} (${m[2]})`,
      quantite,
      // ⚠️ Prix absent = 0, et la ligne est CONSERVÉE : ce sont les opérations
      // comprises dans la main d'œuvre, que le garage veut voir sur la facture.
      prix_unitaire: prix ? Math.round((prix.v / (quantite || 1)) * 100) / 100 : 0,
      remise: 0,
      categorie: m[2] === "F" ? "autre" : "piece",
    });
  }
  return out.length ? out : null;
}

const somme = (l: LigneGrille[]): number =>
  Math.round(
    l.reduce((s, x) => s + x.quantite * x.prix_unitaire * (1 - (x.remise || 0) / 100), 0) * 100
  ) / 100;

/**
 * Lecture complète d'un chiffrage en grille.
 * Renvoie null si le format n'est pas reconnu OU si l'arithmétique ne
 * retombe pas sur le total du rapport : dans ce cas, l'analyse IA reprend.
 */
export function lireChiffrageGrille(texte: string): ChiffrageGrille | null {
  if (!texte) return null;
  const lignes = texte.split("\n");

  const recap = lireRecap(lignes);
  if (recap.total === null || recap.total <= 0) return null;

  const postes = lireGrille(lignes);
  const tableau = lireTableau(lignes);
  if (!postes || !tableau) return null;

  const ingredients: LigneGrille[] =
    recap.ingTaux && recap.ingTotal
      ? [
          {
            designation: "Ingrédients de peinture",
            quantite: Math.round((recap.ingTotal / recap.ingTaux) * 100) / 100,
            prix_unitaire: recap.ingTaux,
            remise: 0,
            categorie: "mo",
          },
        ]
      : [];

  const lignesCompletes = [...tableau, ...postes, ...ingredients];
  const total = somme(lignesCompletes);

  // LE contrôle qui décide : on ne retient cette lecture que si elle retombe
  // sur le total imprimé par le rapport.
  if (Math.abs(total - recap.total) > TOLERANCE) return null;

  const tva =
    recap.tva && recap.total ? Math.round((recap.tva / recap.total) * 100) : null;

  return { lignes: lignesCompletes, montant: recap.total, tva, recap };
}
