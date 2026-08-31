// PARTICULARITÉS DE DOSSIER (v7.0) — étiquettes réutilisables posées sur les
// dossiers : courtier, agrément, apporteur d'affaires, campagne…
// Elles servent à retrouver et regrouper les dossiers dans la liste.

import { supabase } from "./supabaseClient";

export type Particularite = {
  id: string;
  created_at: string;
  nom: string;
  categorie: string; // courtier | agrement | apporteur | autre
  couleur: string; // violet | pink | teal | amber | emerald | blue
  notes: string | null;
  // ---- TARIFS D'AGRÉMENT (v11.2, migration v61) — tous facultatifs ----
  /** Taux horaires négociés (€/h HT). */
  taux_t1?: number | null;
  taux_t2?: number | null;
  taux_t3?: number | null;
  taux_peinture?: number | null;
  /** Taux des ingrédients de peinture (€/h HT). */
  taux_ingredients?: number | null;
  /** Remise en % sur les pièces / sur la main d'œuvre. */
  remise_pieces?: number | null;
  remise_mo?: number | null;
  /** Mots clés d'assureur (« MAIF, Filia ») pour rattacher automatiquement les dossiers importés. */
  assureurs?: string | null;
};

/** Champs tarifaires modifiables depuis le panneau (v11.2). */
export type TarifsAgrement = Pick<
  Particularite,
  "taux_t1" | "taux_t2" | "taux_t3" | "taux_peinture" | "taux_ingredients" | "remise_pieces" | "remise_mo" | "assureurs"
>;

export type LienParticularite = { dossier_id: string; particularite_id: string };

export const CATEGORIES_PARTICULARITE: Record<string, string> = {
  courtier: "Courtier",
  agrement: "Agrément",
  apporteur: "Apporteur d'affaires",
  autre: "Autre",
};

export const COULEURS_PARTICULARITE: Record<string, string> = {
  violet: "bg-violet-100 text-violet-700",
  pink: "bg-pink-100 text-pink-700",
  teal: "bg-teal-100 text-teal-700",
  amber: "bg-amber-100 text-amber-700",
  emerald: "bg-emerald-100 text-emerald-700",
  blue: "bg-blue-100 text-blue-700",
};

export function badgeParticularite(couleur: string | null | undefined): string {
  return COULEURS_PARTICULARITE[couleur || "violet"] || COULEURS_PARTICULARITE.violet;
}

// Couleur proposée par défaut selon la famille choisie.
export function couleurParDefaut(categorie: string): string {
  if (categorie === "courtier") return "blue";
  if (categorie === "agrement") return "emerald";
  if (categorie === "apporteur") return "amber";
  return "violet";
}

/* ----------------------------- Chargement ----------------------------- */

export async function chargerParticularites(): Promise<Particularite[]> {
  const { data } = await supabase
    .from("particularites")
    .select("*")
    .order("nom", { ascending: true });
  return (data as Particularite[]) || [];
}

export async function chargerLiens(dossierId?: string): Promise<LienParticularite[]> {
  let req = supabase.from("dossier_particularites").select("dossier_id,particularite_id");
  if (dossierId) req = req.eq("dossier_id", dossierId);
  const { data } = await req;
  return (data as LienParticularite[]) || [];
}

/* ------------------------------ Écriture ------------------------------ */

export async function creerParticularite(
  nom: string,
  categorie = "autre",
  couleur?: string
): Promise<Particularite> {
  const { data, error } = await supabase
    .from("particularites")
    .insert({
      nom: nom.trim(),
      categorie,
      couleur: couleur || couleurParDefaut(categorie),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Particularite;
}

export async function supprimerParticularite(id: string): Promise<void> {
  const { error } = await supabase.from("particularites").delete().eq("id", id);
  if (error) throw error;
}

export async function poserParticularite(dossierId: string, particulariteId: string): Promise<void> {
  const { error } = await supabase
    .from("dossier_particularites")
    .upsert(
      { dossier_id: dossierId, particularite_id: particulariteId },
      { onConflict: "dossier_id,particularite_id", ignoreDuplicates: true }
    );
  if (error) throw error;
}

export async function retirerParticularite(dossierId: string, particulariteId: string): Promise<void> {
  const { error } = await supabase
    .from("dossier_particularites")
    .delete()
    .eq("dossier_id", dossierId)
    .eq("particularite_id", particulariteId);
  if (error) throw error;
}

/* ------------------------------- Dérivés ------------------------------- */

// Index dossier → étiquettes, pour la liste des sinistres.
export function indexParDossier(
  liens: LienParticularite[],
  catalogue: Particularite[]
): Record<string, Particularite[]> {
  const parId = new Map(catalogue.map((p) => [p.id, p]));
  const index: Record<string, Particularite[]> = {};
  for (const l of liens) {
    const p = parId.get(l.particularite_id);
    if (!p) continue;
    (index[l.dossier_id] ||= []).push(p);
  }
  for (const k of Object.keys(index)) {
    index[k].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }
  return index;
}

/* ==================================================================
 *  AGRÉMENTS À TARIF PARTICULIER (v11.2)
 *
 *  Certains garages sont agréés par un assureur avec des CONDITIONS
 *  NÉGOCIÉES : taux horaires plafonnés, remise sur les pièces… Le rapport
 *  de l'expert applique en principe ces taux, mais pas toujours ; et le
 *  garage doit facturer aux conditions de l'agrément. Ici : détection de
 *  l'agrément par l'assureur du dossier, comparaison des taux du rapport
 *  avec ceux de l'agrément, et calcul des lignes « aux tarifs de
 *  l'agrément » — appliquées SEULEMENT sur action de l'utilisateur.
 * ================================================================== */

export function aDesTarifs(p: Particularite | null | undefined): boolean {
  if (!p) return false;
  return [p.taux_t1, p.taux_t2, p.taux_t3, p.taux_peinture, p.taux_ingredients, p.remise_pieces, p.remise_mo].some(
    (v) => v != null && Number(v) > 0
  );
}

const sansAccents = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Les agréments dont un mot clé d'assureur figure dans le nom d'assureur du dossier. */
export function agrementsPourAssureur(catalogue: Particularite[], assureur: string | null | undefined): Particularite[] {
  const cible = sansAccents((assureur || "").trim());
  if (!cible) return [];
  return catalogue.filter((p) => {
    if (p.categorie !== "agrement") return false;
    const cles = (p.assureurs || "")
      .split(/[,;\n]/)
      .map((k) => sansAccents(k.trim()))
      .filter((k) => k.length >= 3);
    return cles.some((k) => cible.includes(k));
  });
}

/** « T1 62 €/h · T2 62 €/h · Peinture 68 €/h · Ingr. 30 €/h · Pièces −12 % ». */
export function resumeTarifs(p: Particularite): string {
  const euros = (v: number | null | undefined) => (v != null && Number(v) > 0 ? `${Number(v).toLocaleString("fr-FR")} €/h` : null);
  const parts: string[] = [];
  if (euros(p.taux_t1)) parts.push(`T1 ${euros(p.taux_t1)}`);
  if (euros(p.taux_t2)) parts.push(`T2 ${euros(p.taux_t2)}`);
  if (euros(p.taux_t3)) parts.push(`T3 ${euros(p.taux_t3)}`);
  if (euros(p.taux_peinture)) parts.push(`Peinture ${euros(p.taux_peinture)}`);
  if (euros(p.taux_ingredients)) parts.push(`Ingrédients ${euros(p.taux_ingredients)}`);
  if (p.remise_pieces != null && Number(p.remise_pieces) > 0) parts.push(`Pièces −${Number(p.remise_pieces)} %`);
  if (p.remise_mo != null && Number(p.remise_mo) > 0) parts.push(`MO −${Number(p.remise_mo)} %`);
  return parts.join(" · ");
}

type LigneTarifable = {
  designation: string;
  prix_unitaire: number | string;
  remise?: number | string | null;
  categorie?: string | null;
};

/** Poste d'un libellé de main d'œuvre : t1 | t2 | t3 | peinture | ingredients | null. */
export function posteDe(designation: string | null | undefined): "t1" | "t2" | "t3" | "peinture" | "ingredients" | null {
  const d = sansAccents((designation || "").trim()).replace(/^(?:mo|m\.o\.|main d.?(?:oe|œ)uvre|forfait)\s*[:\-–]?\s*/, "");
  if (/^ingr/.test(d)) return "ingredients";
  if (/^t\s*-?\s*1\b/.test(d)) return "t1";
  if (/^t\s*-?\s*2\b/.test(d)) return "t2";
  if (/^t\s*-?\s*3\b/.test(d)) return "t3";
  if (/^(?:peinture\b|t\.?\s*p\.?(?:$|[\s(\-–])|temps\s+(?:de\s+)?peinture)/.test(d)) return "peinture";
  return null;
}

export function tauxAgrement(p: Particularite, poste: ReturnType<typeof posteDe>): number | null {
  const v =
    poste === "t1" ? p.taux_t1
    : poste === "t2" ? p.taux_t2
    : poste === "t3" ? p.taux_t3
    : poste === "peinture" ? p.taux_peinture
    : poste === "ingredients" ? p.taux_ingredients
    : null;
  return v != null && Number(v) > 0 ? Number(v) : null;
}

/**
 * Écarts entre les lignes (rapport ou document) et les tarifs de
 * l'agrément — phrases prêtes à afficher. Vide = tout est conforme.
 */
export function ecartsTarifs(p: Particularite, lignes: LigneTarifable[]): string[] {
  const ecarts: string[] = [];
  const euros = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  for (const l of lignes) {
    const cat = l.categorie || "";
    const pu = Number(l.prix_unitaire) || 0;
    const rem = Number(l.remise) || 0;
    if (cat === "mo") {
      const poste = posteDe(l.designation);
      const taux = tauxAgrement(p, poste);
      if (poste && taux != null && Math.abs(pu - taux) > 0.009) {
        ecarts.push(`${l.designation.trim()} : ${euros(pu)}/h au lieu de ${euros(taux)}/h (agrément)`);
      }
      if (poste && poste !== "ingredients" && p.remise_mo != null && Number(p.remise_mo) > 0 && Math.abs(rem - Number(p.remise_mo)) > 0.009) {
        ecarts.push(`${l.designation.trim()} : remise ${rem} % au lieu de ${Number(p.remise_mo)} % (agrément)`);
      }
    } else if (cat === "piece" && p.remise_pieces != null && Number(p.remise_pieces) > 0 && pu > 0) {
      if (Math.abs(rem - Number(p.remise_pieces)) > 0.009) {
        ecarts.push(`${l.designation.trim()} : remise ${rem} % au lieu de ${Number(p.remise_pieces)} % (agrément)`);
      }
    }
  }
  return ecarts;
}

/** Copie des lignes avec les taux / remises de l'agrément appliqués. */
export function appliquerTarifs<T extends LigneTarifable>(p: Particularite, lignes: T[]): T[] {
  return lignes.map((l) => {
    const cat = l.categorie || "";
    if (cat === "mo") {
      const poste = posteDe(l.designation);
      const taux = tauxAgrement(p, poste);
      const maj = { ...l };
      if (taux != null) maj.prix_unitaire = typeof l.prix_unitaire === "string" ? String(taux) : (taux as T["prix_unitaire"]);
      if (poste && poste !== "ingredients" && p.remise_mo != null && Number(p.remise_mo) > 0) {
        maj.remise = (typeof l.remise === "string" ? String(Number(p.remise_mo)) : Number(p.remise_mo)) as T["remise"];
      }
      return maj;
    }
    if (cat === "piece" && p.remise_pieces != null && Number(p.remise_pieces) > 0 && Number(l.prix_unitaire) > 0) {
      return {
        ...l,
        remise: (typeof l.remise === "string" ? String(Number(p.remise_pieces)) : Number(p.remise_pieces)) as T["remise"],
      };
    }
    return l;
  });
}

/** Enregistre les tarifs d'un agrément (migration v61). */
export async function enregistrerTarifs(id: string, tarifs: TarifsAgrement): Promise<void> {
  const { error } = await supabase.from("particularites").update(tarifs).eq("id", id);
  if (error) throw error;
}
