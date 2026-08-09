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
};

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
