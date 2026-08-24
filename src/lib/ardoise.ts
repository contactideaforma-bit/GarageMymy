// ============================================================
//  RAPPELS DU GARAGE (table `ardoise`) — v41
//
//  Ce qu'on appelait « l'ardoise » devient les RAPPELS ÉCRITS : le
//  tableau de bord les affiche dans le même bloc « À faire » que les
//  rappels AUTOMATIQUES calculés par `lib/actions.ts`.
//
//  Trois nouveautés par rapport à la v7.2 (migration v41) :
//    1. `dossier_id`  — un rappel peut viser un dossier précis ;
//    2. `echeance`    — un rappel peut être daté ;
//    3. `evenement_id`— une échéance crée un vrai RDV dans l'agenda,
//                       pour que le rappel apparaisse dans le calendrier.
//
//  ⚠️ TOLÉRANCE MIGRATION : on lit toujours avec `select("*")`. Si la
//  migration v41 n'est pas passée, les colonnes manquent simplement
//  (undefined) et le reste de l'écran continue de fonctionner.
// ============================================================

import { supabase } from "./supabaseClient";
import { ecrireOuEnfiler } from "./horsLigne";
import { LigneArdoise } from "./types";

/** Catégorie utilisée pour les RDV créés depuis un rappel. */
export const CATEGORIE_RAPPEL = "rappel";

/* ------------------------------ Lecture ------------------------------ */

export type ChargementRappels = {
  lignes: LigneArdoise[];
  /** false = table `ardoise` absente (migration v38 non exécutée) */
  dispo: boolean;
};

export async function chargerRappels(dossierId?: string): Promise<ChargementRappels> {
  let q = supabase.from("ardoise").select("*");
  if (dossierId) q = q.eq("dossier_id", dossierId);
  const { data, error } = await q
    .order("fait", { ascending: true })
    .order("ordre", { ascending: true })
    .order("created_at", { ascending: false });
  // Migration v38 pas encore passée : on masque la partie « mes rappels »
  // plutôt que d'afficher une erreur.
  if (error) return { lignes: [], dispo: false };
  return { lignes: (data as LigneArdoise[]) || [], dispo: true };
}

/* --------------------------- Agenda (RDV) ---------------------------- */

/**
 * Crée le rendez-vous d'agenda correspondant à un rappel daté.
 * Renvoie l'id de l'événement, ou null si l'insertion échoue (le rappel
 * reste utilisable, simplement sans entrée dans le calendrier).
 */
async function creerEvenement(
  texte: string,
  echeance: string,
  dossierId: string | null
): Promise<string | null> {
  const { data, error } = await supabase
    .from("evenements")
    .insert({
      dossier_id: dossierId,
      titre: texte,
      description: "Rappel créé depuis le bloc « À faire ».",
      date_evenement: echeance,
      categorie: CATEGORIE_RAPPEL,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

async function supprimerEvenement(id: string | null | undefined): Promise<void> {
  if (!id) return;
  await supabase.from("evenements").delete().eq("id", id);
}

/* ------------------------------ Écriture ----------------------------- */

/**
 * Ajoute un rappel. `echeance` est une chaîne ISO (ou null).
 * L'éventuel RDV d'agenda est créé AVANT la ligne, puis retiré si
 * l'insertion du rappel échoue — pas de RDV orphelin dans le calendrier.
 */
export async function ajouterRappel(args: {
  texte: string;
  dossierId?: string | null;
  echeance?: string | null;
  ordre?: number;
}): Promise<LigneArdoise> {
  const texte = args.texte.trim();
  const dossierId = args.dossierId || null;
  const echeance = args.echeance || null;

  const evenementId = echeance ? await creerEvenement(texte, echeance, dossierId) : null;

  const ligne: Record<string, unknown> = { texte, ordre: args.ordre ?? 0 };
  if (dossierId) ligne.dossier_id = dossierId;
  if (echeance) ligne.echeance = echeance;
  if (evenementId) ligne.evenement_id = evenementId;

  const { data, error } = await supabase.from("ardoise").insert(ligne).select("*").single();
  if (error) {
    await supprimerEvenement(evenementId);
    throw error;
  }
  return data as LigneArdoise;
}

/**
 * Coche / décoche un rappel. Le RDV d'agenda est conservé (trace).
 *
 * MODE DÉGRADÉ (v47) : cocher une tâche est le geste le plus fréquent et
 * le plus anodin — il ne doit jamais échouer parce que le Wi-Fi de
 * l'atelier a coupé. L'opération part en file d'attente le cas échéant.
 */
export async function basculerRappel(ligne: LigneArdoise, fait: boolean): Promise<void> {
  await ecrireOuEnfiler({
    table: "ardoise",
    type: "update",
    colonne: "id",
    valeur: ligne.id,
    donnees: { fait, fait_le: fait ? new Date().toISOString() : null },
    libelle: fait ? `Rappel coché : ${ligne.texte.slice(0, 40)}` : `Rappel décoché : ${ligne.texte.slice(0, 40)}`,
  });
}

/**
 * Modifie le TEXTE d'un rappel (v8.6). Le rendez-vous d'agenda associé
 * suit : son titre est le texte du rappel, il doit rester cohérent.
 */
export async function modifierRappel(ligne: LigneArdoise, texte: string): Promise<LigneArdoise> {
  const t = texte.trim();
  if (!t) throw new Error("Le rappel ne peut pas être vide.");
  const { data, error } = await supabase
    .from("ardoise")
    .update({ texte: t })
    .eq("id", ligne.id)
    .select("*")
    .single();
  if (error) throw error;
  if (ligne.evenement_id) {
    await supabase.from("evenements").update({ titre: t }).eq("id", ligne.evenement_id);
  }
  return data as LigneArdoise;
}

/** Supprime un rappel ET son rendez-vous d'agenda. */
export async function supprimerRappel(ligne: LigneArdoise): Promise<void> {
  const { error } = await supabase.from("ardoise").delete().eq("id", ligne.id);
  if (error) throw error;
  await supprimerEvenement(ligne.evenement_id);
}

/**
 * Change l'échéance d'un rappel et resynchronise l'agenda :
 *   null  → le RDV est supprimé ;
 *   date  → le RDV est créé s'il n'existe pas, sinon déplacé.
 * Renvoie la ligne mise à jour.
 */
export async function definirEcheance(
  ligne: LigneArdoise,
  echeance: string | null
): Promise<LigneArdoise> {
  let evenementId = ligne.evenement_id || null;

  if (!echeance) {
    await supprimerEvenement(evenementId);
    evenementId = null;
  } else if (evenementId) {
    const { error } = await supabase
      .from("evenements")
      .update({ date_evenement: echeance, titre: ligne.texte })
      .eq("id", evenementId);
    // RDV supprimé entre-temps depuis l'agenda : on en recrée un.
    if (error) evenementId = await creerEvenement(ligne.texte, echeance, ligne.dossier_id || null);
  } else {
    evenementId = await creerEvenement(ligne.texte, echeance, ligne.dossier_id || null);
  }

  const { data, error } = await supabase
    .from("ardoise")
    .update({ echeance, evenement_id: evenementId })
    .eq("id", ligne.id)
    .select("*")
    .single();
  if (error) throw error;
  return data as LigneArdoise;
}

/** Rattache (ou détache) un rappel à un dossier ; le RDV suit. */
export async function definirDossier(
  ligne: LigneArdoise,
  dossierId: string | null
): Promise<LigneArdoise> {
  if (ligne.evenement_id) {
    await supabase.from("evenements").update({ dossier_id: dossierId }).eq("id", ligne.evenement_id);
  }
  const { data, error } = await supabase
    .from("ardoise")
    .update({ dossier_id: dossierId })
    .eq("id", ligne.id)
    .select("*")
    .single();
  if (error) throw error;
  return data as LigneArdoise;
}

/* ------------------------------ Affichage ---------------------------- */

/** Bornes du jour courant, pour distinguer « en retard » de « aujourd'hui ». */
function finDuJour(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function estEnRetard(echeance?: string | null): boolean {
  if (!echeance) return false;
  const t = new Date(echeance).getTime();
  return !isNaN(t) && t < Date.now();
}

export function estAujourdhui(echeance?: string | null): boolean {
  if (!echeance) return false;
  const t = new Date(echeance).getTime();
  return !isNaN(t) && t >= Date.now() && t <= finDuJour();
}

/** « auj. 14:30 », « 18/08 09:00 » — court, pour tenir sur une ligne. */
export function libelleEcheance(echeance?: string | null): string {
  if (!echeance) return "";
  const d = new Date(echeance);
  if (isNaN(d.getTime())) return "";
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (estAujourdhui(echeance)) return `auj. ${heure}`;
  return `${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} ${heure}`;
}

/* ------------- Conversion <input type="datetime-local"> -------------- */

/** ISO → « 2026-08-18T09:00 » (valeur attendue par l'input, heure locale). */
export function isoVersLocal(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** « 2026-08-18T09:00 » (heure locale) → ISO, ou null si vide/invalide. */
export function localVersIso(valeur: string): string | null {
  if (!valeur) return null;
  const d = new Date(valeur);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}
