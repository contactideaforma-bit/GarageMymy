// ====================================================================
//  COMPTEUR D'HEURES DE SECRÉTARIAT (v11.6)
//
//  La secrétaire déclare son temps ET ce qu'elle a fait. Deux usages :
//   · le garage voit à quoi part son forfait (fin des « vous avez fait
//     quoi de mes 20 heures ? ») ;
//   · l'éditeur a un relevé daté et détaillé, opposable en cas de
//     contestation, de demande d'heures supplémentaires ou de litige
//     sur la qualité du travail.
//
//  Les durées sont stockées en MINUTES (entier) : aucun arrondi, aucune
//  virgule, et l'addition reste exacte.
// ====================================================================

import { supabase } from "./supabaseClient";

export type LigneHeures = {
  id: string;
  created_at: string;
  jour: string;          // AAAA-MM-JJ
  minutes: number;
  description: string;
  dossier_id: string | null;
  /** v12.4 — tous les dossiers concernés (dossier_id = le premier). */
  dossier_ids?: string[] | null;
  auteur: string | null;
};

/** Liste des dossiers d'une ligne, quelle que soit la version de la table. */
export function dossiersDeLigne(l: Pick<LigneHeures, "dossier_id" | "dossier_ids">): string[] {
  const ids = Array.isArray(l.dossier_ids) ? l.dossier_ids.filter(Boolean) : [];
  if (ids.length) return ids;
  return l.dossier_id ? [l.dossier_id] : [];
}

/** Durées proposées en un clic (minutes). */
export const DUREES = [15, 30, 45, 60, 90, 120, 180, 240] as const;

/** 90 → « 1 h 30 » ; 45 → « 45 min » ; 120 → « 2 h ». */
export function formatDuree(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  if (r === 0) return `${h} h`;
  return `${h} h ${String(r).padStart(2, "0")}`;
}

/** Mois courant au format AAAA-MM (heure de Paris). */
export function moisCourant(d: Date = new Date()): string {
  const p = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}`;
}

/** « août 2026 » */
export function libelleMois(mois: string): string {
  const [a, m] = mois.split("-").map(Number);
  return new Date(a, (m || 1) - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

export function bornesDuMois(mois: string): { debut: string; fin: string } {
  const [a, m] = mois.split("-").map(Number);
  const debut = `${mois}-01`;
  const dernier = new Date(a, m, 0).getDate();
  return { debut, fin: `${mois}-${String(dernier).padStart(2, "0")}` };
}

export function totalMinutes(lignes: LigneHeures[]): number {
  return lignes.reduce((s, l) => s + (Number(l.minutes) || 0), 0);
}

/* ------------------------------ Accès ------------------------------ */

export async function chargerHeures(mois: string): Promise<LigneHeures[]> {
  const { debut, fin } = bornesDuMois(mois);
  const { data, error } = await supabase
    .from("heures_secretariat")
    .select("*")
    .gte("jour", debut)
    .lte("jour", fin)
    .order("jour", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as LigneHeures[]) || [];
}

export async function ajouterHeures(l: {
  jour: string;
  minutes: number;
  description: string;
  /** Un ou plusieurs dossiers (v12.4). `dossier_id` seul reste accepté. */
  dossier_ids?: string[] | null;
  dossier_id?: string | null;
  auteur?: string | null;
}): Promise<void> {
  const ids = Array.from(new Set([...(l.dossier_ids || []), l.dossier_id || ""].filter(Boolean)));
  const base = {
    jour: l.jour,
    minutes: l.minutes,
    description: l.description.trim(),
    // Premier dossier en `dossier_id` : compatibilité avec l'existant.
    dossier_id: ids[0] || null,
    auteur: l.auteur || null,
  };
  const { error } = await supabase.from("heures_secretariat").insert({ ...base, dossier_ids: ids });
  if (!error) return;
  // Migration v68 pas encore exécutée : on enregistre au moins le premier dossier.
  if (/dossier_ids/i.test(error.message || "")) {
    const { error: e2 } = await supabase.from("heures_secretariat").insert(base);
    if (e2) throw e2;
    return;
  }
  throw error;
}

export async function supprimerHeures(id: string): Promise<void> {
  const { error } = await supabase.from("heures_secretariat").delete().eq("id", id);
  if (error) throw error;
}

/** Forfait mensuel déclaré sur le profil du garage (null = non renseigné). */
export async function forfaitHeures(): Promise<number | null> {
  const { data } = await supabase.from("entreprise").select("forfait_heures_mois").maybeSingle();
  const v = (data as { forfait_heures_mois?: number | null } | null)?.forfait_heures_mois;
  return typeof v === "number" && v > 0 ? v : null;
}
