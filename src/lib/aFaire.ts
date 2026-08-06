// « À faire aujourd'hui » — marques de tâches FAITES (v35).
//
// Le moteur `calculeProchaineAction` recalcule la liste à chaque chargement :
// pour qu'une action cochée reste masquée, on persiste une marque
// (dossier_id, code) dans la table `actions_faites`.
//
// Auto-nettoyage : dès que le dossier avance, son code d'action change ;
// la marque devient obsolète et est supprimée (cf. `marquesObsoletes`), donc
// une action identique qui reviendrait plus tard s'affichera bien à nouveau.

import { supabase } from "./supabaseClient";
import { ActionFaite } from "./types";

export function cleAction(dossierId: string, code: string): string {
  return `${dossierId}::${code}`;
}

export function estActionFaite(
  faites: ActionFaite[],
  dossierId: string,
  code: string
): boolean {
  return faites.some((f) => f.dossier_id === dossierId && f.code === code);
}

// Marque une action comme faite. Renvoie la ligne créée (ou existante).
export async function marquerActionFaite(
  dossierId: string,
  code: string
): Promise<ActionFaite> {
  const { data, error } = await supabase
    .from("actions_faites")
    .upsert(
      { dossier_id: dossierId, code, fait_le: new Date().toISOString() },
      { onConflict: "dossier_id,code" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as ActionFaite;
}

// Décoche : l'action revient dans la liste « à faire ».
export async function annulerActionFaite(dossierId: string, code: string): Promise<void> {
  const { error } = await supabase
    .from("actions_faites")
    .delete()
    .eq("dossier_id", dossierId)
    .eq("code", code);
  if (error) throw error;
}

// Marques qui ne correspondent plus à aucune action en cours : le dossier a
// avancé (ou a été clôturé) → la coche n'a plus lieu d'être.
export function marquesObsoletes(
  faites: ActionFaite[],
  clesValides: Set<string>
): ActionFaite[] {
  return faites.filter((f) => !clesValides.has(cleAction(f.dossier_id, f.code)));
}

export async function purgerMarques(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await supabase.from("actions_faites").delete().in("id", ids);
}
