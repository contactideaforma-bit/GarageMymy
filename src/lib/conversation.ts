// ============================================================
//  CONVERSATION GARAGE ↔ SECRÉTAIRE (v10.7, migration v59)
//
//  Le garagiste et la secrétaire partagent le MÊME compte My Easy Auto :
//  on « ruse » avec un bouton de bascule (qui écrit ?) mémorisé sur
//  l'appareil — le poste de la secrétaire reste sur « secrétaire »,
//  celui de l'atelier sur « garage ». L'auteur est porté par chaque
//  message ; les non-lus se comptent PAR RÔLE (lu_garage / lu_secretaire).
//
//  ⚠️ TOLÉRANCE MIGRATION : comme lib/ardoise.ts — si la table manque
//  (migration v59 non exécutée), on renvoie dispo=false et l'écran
//  explique quoi faire au lieu de planter.
// ============================================================

import { supabase } from "./supabaseClient";
import { MessageConversation } from "./types";

export type RoleConversation = "garage" | "secretaire";

export const ROLES: { valeur: RoleConversation; label: string; icone: string }[] = [
  { valeur: "garage", label: "Garage", icone: "🔧" },
  { valeur: "secretaire", label: "Secrétaire", icone: "🗂️" },
];

export const libelleRole = (r: RoleConversation | null | undefined): string =>
  r === "secretaire" ? "Secrétaire" : "Garage";

/* ------------------- Rôle mémorisé sur l'appareil -------------------- */

const CLE_ROLE = "mea.conversation.role";

export function lireRole(): RoleConversation {
  try {
    const v = localStorage.getItem(CLE_ROLE);
    return v === "secretaire" ? "secretaire" : "garage";
  } catch {
    return "garage";
  }
}

export function memoriserRole(r: RoleConversation): void {
  try {
    localStorage.setItem(CLE_ROLE, r);
  } catch {
    /* stockage indisponible : la bascule reste valable pour la session */
  }
}

export const autreRole = (r: RoleConversation): RoleConversation => (r === "garage" ? "secretaire" : "garage");

/* ------------------------------ Lecture ------------------------------ */

export type ChargementMessages = { messages: MessageConversation[]; dispo: boolean };

export async function chargerMessages(limite = 300): Promise<ChargementMessages> {
  const { data, error } = await supabase
    .from("conversation_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) return { messages: [], dispo: false };
  return { messages: ((data as MessageConversation[]) || []).reverse(), dispo: true };
}

/** Nombre de messages écrits PAR L'AUTRE et pas encore lus par `role`. */
export async function compterNonLus(role: RoleConversation): Promise<number> {
  const { count, error } = await supabase
    .from("conversation_messages")
    .select("id", { count: "exact", head: true })
    .eq(role === "garage" ? "lu_garage" : "lu_secretaire", false)
    .neq("auteur", role);
  if (error || count == null) return 0;
  return count;
}

/** Marque comme lus, pour `role`, tous les messages de l'autre. */
export async function marquerLus(role: RoleConversation): Promise<void> {
  const colonne = role === "garage" ? "lu_garage" : "lu_secretaire";
  await supabase
    .from("conversation_messages")
    .update({ [colonne]: true })
    .eq(colonne, false)
    .neq("auteur", role);
}

/* ------------------------------ Écriture ----------------------------- */

export async function envoyerMessage(args: {
  auteur: RoleConversation;
  texte: string;
  dossierId?: string | null;
}): Promise<MessageConversation> {
  const texte = args.texte.trim();
  if (!texte) throw new Error("Message vide.");
  const ligne: Record<string, unknown> = {
    auteur: args.auteur,
    texte,
    // Ce que j'écris est lu pour moi ; l'autre le découvrira.
    lu_garage: args.auteur === "garage",
    lu_secretaire: args.auteur === "secretaire",
  };
  if (args.dossierId) ligne.dossier_id = args.dossierId;
  const { data, error } = await supabase.from("conversation_messages").insert(ligne).select("*").single();
  if (error) throw error;
  return data as MessageConversation;
}

export async function supprimerMessage(id: string): Promise<void> {
  const { error } = await supabase.from("conversation_messages").delete().eq("id", id);
  if (error) throw error;
}

/* --------------------- Astuces de MY-MY (locales) --------------------- */

export const ASTUCES_MYMY: string[] = [
  "Le bouton en haut définit QUI écrit : laisse le poste de la secrétaire sur « Secrétaire » et celui de l'atelier sur « Garage » — c'est mémorisé sur chaque appareil.",
  "Relie un message à un dossier avec 🔍 : l'autre ouvre la fiche en un clic, fini les « c'est pour quelle voiture ? ».",
  "Une tâche créée ici apparaît aussi dans le bloc « À faire » du tableau de bord — et réciproquement. Une seule liste, deux endroits pour la voir.",
  "Précise « pour la secrétaire » ou « pour le garage » sur une tâche : chacun filtre les siennes dans « À faire ».",
  "Donne une échéance à une tâche : elle se cale automatiquement dans l'agenda.",
  "Le feu vert du chef d'atelier avant d'envoyer un devis ? Écris-le ici : « OK pour envoyer le devis Dupont » — la trace reste, et la secrétaire programme la suite.",
  "Depuis une fiche dossier, l'appli te SUGGÈRE la prochaine étape (faire signer l'OR, envoyer la facture…) : rien ne s'ajoute au tableau de bord tant que tu ne cliques pas « Programmer ».",
  "Coche une tâche par erreur ? « ↩ Annuler » (ou Ctrl+Z) dans le bloc À faire la ramène.",
];
