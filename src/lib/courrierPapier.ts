// ====================================================================
//  CIRCUIT PAPIER D'UN COURRIER (v13.42)
//  Tant que l'envoi dématérialisé est en pause, un courrier (impayé,
//  litige) suit ce circuit : édité → signé → imprimé → posté par le
//  garage → envoi CONFIRMÉ dans l'appli. La tâche « à poster » reste en
//  suspens sur l'ardoise tant que l'envoi n'est pas confirmé ; pour un
//  recommandé, une seconde tâche demande la photo de la preuve de dépôt
//  / de l'avis de réception, jointe aux pièces du dossier.
// ====================================================================

import { supabase } from "./supabaseClient";
import { CourrierRecouvrement, LigneArdoise, PieceDossier } from "./types";
import { ajouterRappel, basculerRappel } from "./ardoise";
import { lireRole } from "./conversation";
import { deposerFichier } from "./storage";
import { LIBELLE_TYPE_COURRIER, echeanceRappel } from "./recouvrement";

/** Type de pièce du dossier qui reçoit les AR / preuves de dépôt. */
export const TYPE_PIECE_AR = "accuse_reception";

export const origineAPoster = (courrierId: string) => `courrier:${courrierId}`;
export const origineAR = (courrierId: string) => `ar:${courrierId}`;

export function libelleCourrier(c: Pick<CourrierRecouvrement, "type">): string {
  return LIBELLE_TYPE_COURRIER[c.type] || "Courrier";
}

/** Tâche encore ouverte (non cochée) portant cette origine, sinon null. */
export async function tacheOuverte(origine: string): Promise<LigneArdoise | null> {
  const { data } = await supabase.from("ardoise").select("*").eq("origine", origine).eq("fait", false).limit(1).maybeSingle();
  return (data as LigneArdoise | null) || null;
}

/** Crée la tâche si aucune n'est déjà ouverte pour cette origine. */
export async function creerTacheSiAbsente(args: { texte: string; dossierId: string; origine: string; echeance?: string | null }): Promise<LigneArdoise | null> {
  try {
    const existante = await tacheOuverte(args.origine);
    if (existante) return existante;
    return await ajouterRappel({ texte: args.texte, dossierId: args.dossierId, echeance: args.echeance ?? null, ordre: -1, auteur: lireRole(), pour: null, origine: args.origine });
  } catch { return null; }
}

/** Coche toutes les tâches ouvertes de cette origine (l'envoi est confirmé / l'AR est joint). */
export async function cloturerTaches(origine: string): Promise<void> {
  try {
    const { data } = await supabase.from("ardoise").select("*").eq("origine", origine).eq("fait", false);
    for (const l of (data as LigneArdoise[]) || []) await basculerRappel(l, true);
  } catch { /* ardoise facultative */ }
}

/** Tâche « à poster » : le courrier est signé, il attend d'être imprimé et posté. */
export async function programmerTacheAPoster(c: CourrierRecouvrement, canal: "lrar" | "courrier" | "remis_en_main"): Promise<void> {
  const mode = canal === "lrar" ? "en recommandé AR" : canal === "courrier" ? "en courrier simple" : "en main propre";
  await creerTacheSiAbsente({
    texte: `À poster ${mode} : ${libelleCourrier(c)} → ${c.destinataire_nom || c.destinataire} — puis confirmer l'envoi dans le dossier`,
    dossierId: c.dossier_id,
    origine: origineAPoster(c.id),
    echeance: echeanceRappel(1),
  });
}

/** Tâche « AR à joindre » après un recommandé posté. */
export async function programmerTacheAR(c: CourrierRecouvrement, numero?: string | null): Promise<void> {
  await creerTacheSiAbsente({
    texte: `Joindre la photo de l'avis de réception${numero ? ` (recommandé n° ${numero})` : ""} : ${libelleCourrier(c)} → ${c.destinataire_nom || c.destinataire}`,
    dossierId: c.dossier_id,
    origine: origineAR(c.id),
    echeance: echeanceRappel(7),
  });
}

/** L'AR (ou la preuve de dépôt) de ce courrier est-il déjà dans les pièces du dossier ? */
export function arJoint(pieces: Pick<PieceDossier, "type" | "path">[], courrierId: string): boolean {
  return pieces.some((p) => p.type === TYPE_PIECE_AR && p.path.includes(courrierId));
}

/**
 * Enregistre la photo (déjà convertie en PDF) de l'AR / preuve de dépôt
 * dans les pièces du dossier, rattachée au courrier par son id dans le
 * chemin, et clôture la tâche « AR à joindre ».
 */
export async function joindreAccuseReception(c: CourrierRecouvrement, blob: Blob, nature: "depot" | "ar"): Promise<void> {
  const path = await deposerFichier("pieces", `${c.dossier_id}/${TYPE_PIECE_AR}-${c.id}-${nature}-${Date.now()}.pdf`, blob, { contentType: "application/pdf" });
  const nom = `${nature === "ar" ? "Avis de réception" : "Preuve de dépôt"} — ${libelleCourrier(c)}${c.numero_suivi ? ` — n° ${c.numero_suivi}` : ""} — ${new Date().toLocaleDateString("fr-FR")}.pdf`;
  const { error } = await supabase.from("pieces_dossier").insert({ dossier_id: c.dossier_id, type: TYPE_PIECE_AR, nom, path });
  if (error) throw error;
  if (nature === "ar") await cloturerTaches(origineAR(c.id));
}
