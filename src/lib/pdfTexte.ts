// ============================================================
//  CALQUE TEXTE D'UN PDF — extraction SANS dépendance (v9.0)
//
//  POURQUOI CE FICHIER EXISTE.
//  On envoyait le rapport d'expertise au modèle sous forme d'IMAGE (bloc
//  `document`). Il devait donc deviner VISUELLEMENT quelle valeur se
//  trouve sous quelle colonne. Sur les rapports en GRILLE (BCA, Allianz),
//  où les postes T1/T2/T3/TP sont des colonnes espacées de plusieurs
//  centimètres, il se trompait de colonne ou ne voyait rien du tout :
//  d'où des factures sans T1 ni T2 et un total faux.
//
//  Or ces rapports embarquent un vrai calque texte, avec la position
//  exacte de chaque fragment. On le lit ici et on RECONSTRUIT la mise en
//  page en texte brut, colonnes alignées. Le modèle n'a plus rien à
//  deviner : il lit des caractères.
//
//  Aucune dépendance : `zlib` est fourni par Node. Ce qu'on fait :
//    1. inflater les flux FlateDecode qui contiennent des opérateurs de
//       texte (Tj / TJ) et les concaténer dans l'ordre du fichier — le
//       contenu d'une page est souvent DÉCOUPÉ en plusieurs flux, et une
//       coupure peut tomber au milieu d'un bloc BT…ET ;
//    2. suivre les opérateurs de position (Tm, Td, TD) pour connaître le
//       x et le y de chaque fragment ;
//    3. regrouper les fragments par ligne (tolérance verticale) et les
//       placer à leur colonne (≈ 4,2 points par caractère).
//
//  ⚠️ Ne fonctionne QUE sur un PDF avec calque texte. Un scan renvoie une
//  chaîne vide : l'appelant retombe alors sur la lecture de l'image.
// ============================================================

import zlib from "node:zlib";

/** Au-delà, on tronque : le prompt a un budget, et un rapport utile tient large. */
const MAX_CARACTERES = 60_000;

/** En dessous, il n'y a pas de calque texte exploitable (scan). */
const MIN_CARACTERES = 200;

/** Largeur moyenne d'un caractère, en points — sert à placer les colonnes. */
const LARGEUR_CARACTERE = 4.2;

/** Deux fragments à moins de 3 points d'écart vertical sont sur la même ligne. */
const TOLERANCE_LIGNE = 3;

/** Un saut de plus de 300 points VERS LE HAUT = nouvelle page. */
const SAUT_DE_PAGE = 300;

/** Caractères WinAnsi 128-159 (le reste correspond à Latin-1). */
const WIN_ANSI: Record<number, string> = {
  128: "€", 130: "‚", 131: "ƒ", 132: "„", 133: "…", 134: "†", 135: "‡",
  136: "ˆ", 137: "‰", 138: "Š", 139: "‹", 140: "Œ", 142: "Ž", 145: "'",
  146: "'", 147: "“", 148: "”", 149: "•", 150: "–", 151: "—", 152: "˜",
  153: "™", 154: "š", 155: "›", 156: "œ", 158: "ž", 159: "Ÿ",
};

const ECHAPPEMENTS: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 };

/** Décode une chaîne PDF littérale : échappements et codes octaux. */
function decoderChaine(brut: string): string {
  let sortie = "";
  for (let i = 0; i < brut.length; i += 1) {
    const c = brut[i];
    if (c !== "\\") {
      const code = brut.charCodeAt(i);
      sortie += WIN_ANSI[code] ?? c;
      continue;
    }
    i += 1;
    if (i >= brut.length) break;
    const suivant = brut[i];
    if (suivant >= "0" && suivant <= "7") {
      let octal = "";
      while (i < brut.length && octal.length < 3 && brut[i] >= "0" && brut[i] <= "7") {
        octal += brut[i];
        i += 1;
      }
      i -= 1;
      const code = parseInt(octal, 8);
      sortie += WIN_ANSI[code] ?? String.fromCharCode(code);
    } else if (ECHAPPEMENTS[suivant] !== undefined) {
      sortie += String.fromCharCode(ECHAPPEMENTS[suivant]);
    } else {
      sortie += suivant; // \( \) \\ …
    }
  }
  return sortie;
}

/** Concatène les flux de contenu inflatés, dans l'ordre du fichier. */
function contenuDuPdf(octets: Buffer): string {
  const brut = octets.toString("latin1");
  const morceaux: string[] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(brut)) !== null) {
    const debut = m.index + m[0].length;
    const fin = brut.indexOf("endstream", debut);
    if (fin === -1) continue;
    const donnees = brut.slice(debut, fin);
    for (const candidat of [donnees, donnees.replace(/[\r\n]+$/, "")]) {
      try {
        const inflate = zlib.inflateSync(Buffer.from(candidat, "latin1")).toString("latin1");
        // On ne garde que ce qui dessine du texte (les images et les
        // polices embarquées sont du binaire sans intérêt ici).
        if (inflate.includes("Tj") || inflate.includes("TJ")) morceaux.push(inflate);
        break;
      } catch {
        /* flux non compressé ou non-zlib : ignoré */
      }
    }
  }
  return morceaux.join("\n");
}

type Fragment = { page: number; y: number; x: number; texte: string };

const JETON = new RegExp(
  [
    String.raw`(?<chaine>\((?:\\.|[^\\()])*\))\s*Tj`,
    String.raw`(?<tableau>\[(?:[^\[\]\\]|\\.)*\])\s*TJ`,
    String.raw`(?<tm>[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+(?<tx>[-\d.]+)\s+(?<ty>[-\d.]+)\s+Tm)`,
    String.raw`(?<td>(?<dx>[-\d.]+)\s+(?<dy>[-\d.]+)\s+(?:TD|Td))`,
  ].join("|"),
  "gs"
);

const CHAINES_DU_TABLEAU = /\((?:\\.|[^\\()])*\)/g;

/**
 * Texte d'un PDF, mise en page conservée.
 * Renvoie "" si le PDF n'a pas de calque texte exploitable (scan).
 */
export function texteDuPdf(octets: Buffer): string {
  let contenu: string;
  try {
    contenu = contenuDuPdf(octets);
  } catch {
    return "";
  }
  if (!contenu) return "";

  const fragments: Fragment[] = [];
  let x = 0;
  let y = 0;
  let page = 0;
  let yPrecedent: number | null = null;

  // Boucle `exec` plutôt que `matchAll` : la cible TypeScript du projet
  // n'autorise pas l'itération des itérateurs de RegExp.
  JETON.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = JETON.exec(contenu)) !== null) {
    const g = (m.groups || {}) as Record<string, string | undefined>;
    if (g.tm !== undefined) {
      const nx = Number(g.tx);
      const ny = Number(g.ty);
      if (yPrecedent !== null && ny > yPrecedent + SAUT_DE_PAGE) page += 1;
      x = nx;
      y = ny;
      yPrecedent = ny;
    } else if (g.td !== undefined) {
      x += Number(g.dx);
      y += Number(g.dy);
    } else if (g.chaine !== undefined) {
      const t = decoderChaine(g.chaine.slice(1, -1));
      if (t.trim()) fragments.push({ page, y, x, texte: t });
    } else if (g.tableau !== undefined) {
      const t = (g.tableau.match(CHAINES_DU_TABLEAU) || [])
        .map((p: string) => decoderChaine(p.slice(1, -1)))
        .join("");
      if (t.trim()) fragments.push({ page, y, x, texte: t });
    }
  }
  if (fragments.length === 0) return "";

  // Regroupement par ligne : même page, y proche.
  fragments.sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const lignes: { page: number; y: number; items: Fragment[] }[] = [];
  for (const f of fragments) {
    const derniere = lignes[lignes.length - 1];
    if (derniere && derniere.page === f.page && Math.abs(derniere.y - f.y) <= TOLERANCE_LIGNE) {
      derniere.items.push(f);
    } else {
      lignes.push({ page: f.page, y: f.y, items: [f] });
    }
  }

  const sortie = lignes.map(({ items }) => {
    let ligne = "";
    for (const f of items.slice().sort((a, b) => a.x - b.x)) {
      const colonne = Math.round(f.x / LARGEUR_CARACTERE);
      if (colonne > ligne.length) ligne += " ".repeat(colonne - ligne.length);
      else if (ligne && !ligne.endsWith(" ")) ligne += " ";
      ligne += f.texte;
    }
    return ligne.replace(/\s+$/, "");
  });

  const texte = sortie.join("\n");
  if (texte.length < MIN_CARACTERES) return "";

  // Garde-fou : une police à encodage exotique (CID/Identity) produirait du
  // charabia, PIRE que pas de texte du tout. On mesure la proportion de
  // caractères plausibles pour un rapport français.
  const lisibles = (
    texte.match(/[A-Za-z0-9À-ÿŒœŸ\s.,;:!?()%€/'"°+\-–—*&#@[\]_]/g) || []
  ).length;
  if (lisibles / texte.length < 0.9) return "";

  return texte.length > MAX_CARACTERES ? `${texte.slice(0, MAX_CARACTERES)}\n[…texte tronqué]` : texte;
}
