// ====================================================================
//  NOTES DE DOSSIER HORODATÉES (v13.16)
//
//  Le commentaire du dossier (dossiers.note, texte libre) devient un
//  JOURNAL : chaque ajout est précédé d'une ligne-marque « — jj/mm/aaaa
//  HH:MM — ». Le champ reste un simple texte (compatible avec tout ce qui
//  l'affiche déjà : Mymy, exports, recherche), mais l'écran le présente en
//  entrées datées, dans l'ordre chronologique. Un texte ancien sans marque
//  est affiché comme une entrée « avant le journal ».
// ====================================================================

export type NoteEntree = { date: string | null; heure: string | null; texte: string };

const MARQUE = /^— (\d{2}\/\d{2}\/\d{4}) (\d{2}:\d{2}) —$/;

export function marqueNote(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `— ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())} —`;
}

/** Découpe le texte brut en entrées datées (ordre du texte = ordre chronologique). */
export function decouperNotes(brut: string | null | undefined): NoteEntree[] {
  const lignes = (brut || "").replace(/\r\n/g, "\n").split("\n");
  const entrees: NoteEntree[] = [];
  let courante: NoteEntree | null = null;
  for (const l of lignes) {
    const m = MARQUE.exec(l.trim());
    if (m) {
      if (courante && courante.texte.trim()) entrees.push({ ...courante, texte: courante.texte.trim() });
      courante = { date: m[1], heure: m[2], texte: "" };
    } else {
      if (!courante) courante = { date: null, heure: null, texte: "" };
      courante.texte += (courante.texte ? "\n" : "") + l;
    }
  }
  if (courante && courante.texte.trim()) entrees.push({ ...courante, texte: courante.texte.trim() });
  return entrees;
}

/** Ajoute une entrée horodatée à la fin du texte brut. */
export function ajouterNote(brut: string | null | undefined, nouvelle: string, quand: Date = new Date()): string {
  const t = nouvelle.trim();
  if (!t) return brut || "";
  const base = (brut || "").trimEnd();
  return `${base ? base + "\n\n" : ""}${marqueNote(quand)}\n${t}`;
}

/** Vrai si le texte contient déjà au moins une marque de journal. */
export function estJournal(brut: string | null | undefined): boolean {
  return (brut || "").split("\n").some((l) => MARQUE.test(l.trim()));
}
