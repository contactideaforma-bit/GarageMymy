// IMPORT DE L'ANNUAIRE EXPERT (v13.6) : Excel / CSV lus dans le navigateur
// (lib/admin/importListe.ts), PDF / image lus par l'IA (/api/expert/importer-liste).
// Sortie unique : des FicheAnnuaire prêtes à être enregistrées.

import { analyserAdresse, lireFichierListe, normaliserTel, type FichierLu } from "@/lib/admin/importListe";
import { fetchAuth, lireReponse } from "@/lib/apiClient";
import { FicheAnnuaire } from "./types";

export type CategorieAnnuaire = "assurances" | "clients" | "garages";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const MOTIFS: [keyof FicheAnnuaire, RegExp][] = [
  ["nom", /^(nom|raison sociale|societe|compagnie|assureur|client|garage|reparateur|carrosserie|entreprise|denomination|name)/],
  ["siret", /siret/],
  ["siren", /siren/],
  ["code_postal", /(code postal|cp|postal|zip)/],
  ["ville", /(ville|commune|city|localite)/],
  ["adresse", /(adresse|address|rue|voie)/],
  ["tel", /(tel|telephone|portable|mobile|phone|fixe)/],
  ["email", /(mail|courriel)/],
  ["contact", /(contact|interlocuteur|gestionnaire|responsable|dirigeant|gerant)/],
  ["notes", /(note|commentaire|remarque|observation)/],
];

export function detecterColonnesAnnuaire(entetes: string[]): Partial<Record<keyof FicheAnnuaire, number>> {
  const cols: Partial<Record<keyof FicheAnnuaire, number>> = {};
  const pris = new Set<number>();
  for (const [cle, re] of MOTIFS) {
    const i = entetes.findIndex((e, idx) => !pris.has(idx) && re.test(norm(e)));
    if (i >= 0) { cols[cle] = i; pris.add(i); }
  }
  // Pas de colonne « nom » reconnue : la première colonne texte fait office de nom.
  if (cols.nom === undefined) {
    const i = entetes.findIndex((_, idx) => !pris.has(idx));
    if (i >= 0) cols.nom = i;
  }
  return cols;
}

export function fichesDepuisTableau(f: FichierLu, cols: Partial<Record<keyof FicheAnnuaire, number>>): FicheAnnuaire[] {
  const v = (l: string[], k: keyof FicheAnnuaire) => (cols[k] === undefined ? "" : (l[cols[k] as number] || "").trim());
  const fiches: FicheAnnuaire[] = [];
  for (const l of f.lignes) {
    const nom = v(l, "nom");
    if (!nom) continue;
    let adresse = v(l, "adresse") || null;
    let cp = v(l, "code_postal") || null;
    let ville = v(l, "ville") || null;
    if (adresse && !cp && !ville) {
      const a = analyserAdresse(adresse);
      adresse = a.adresse; cp = a.cp; ville = a.ville;
    }
    const siret = v(l, "siret").replace(/\D/g, "") || null;
    fiches.push({
      nom,
      adresse,
      code_postal: cp,
      ville,
      siret,
      siren: v(l, "siren").replace(/\D/g, "") || (siret ? siret.slice(0, 9) : null),
      tel: normaliserTel(v(l, "tel")),
      email: v(l, "email").toLowerCase() || null,
      contact: v(l, "contact") || null,
      notes: v(l, "notes") || null,
    });
  }
  return fiches;
}

/** Lit un fichier (xlsx, csv, pdf, image) et renvoie des fiches + un aperçu des colonnes. */
export async function lireFichierAnnuaire(file: File, categorie: CategorieAnnuaire): Promise<{ fiches: FicheAnnuaire[]; source: "tableau" | "ia"; entetes?: string[]; colonnes?: Partial<Record<keyof FicheAnnuaire, number>> }> {
  const nom = file.name.toLowerCase();
  if (nom.endsWith(".xlsx") || nom.endsWith(".xlsm") || nom.endsWith(".csv") || nom.endsWith(".txt")) {
    const f = await lireFichierListe(file);
    const colonnes = detecterColonnesAnnuaire(f.entetes);
    return { fiches: fichesDepuisTableau(f, colonnes), source: "tableau", entetes: f.entetes, colonnes };
  }
  const form = new FormData();
  form.append("file", file);
  form.append("categorie", categorie);
  const res = await fetchAuth("/api/expert/importer-liste", { method: "POST", body: form });
  const r = await lireReponse<{ data: { fiches: FicheAnnuaire[] } }>(res);
  if (!r.ok || !r.data) throw new Error(r.error || "Lecture du fichier impossible.");
  return { fiches: r.data.data.fiches, source: "ia" };
}

export const cleFiche = (nom: string | null | undefined) => norm(nom || "").replace(/\s/g, "");
