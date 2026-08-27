// ÉTAT DU COMPTE GARAGE (v10.1) — lecture côté client de comptes_etat.
import { supabase, definirLectureSeule } from "./supabaseClient";

export type EtatCompte = {
  owner_id: string;
  etat: "actif" | "suspendu" | "lecture_seule" | "ferme";
  motif: string | null;
  message: string | null;
  depuis: string;
  fin_le: string | null;
  purge_le: string | null;
};

export const LIBELLE_ETAT: Record<EtatCompte["etat"], string> = {
  actif: "Actif",
  suspendu: "Suspendu (impayé)",
  lecture_seule: "Lecture seule (contrat terminé)",
  ferme: "Fermé (à purger)",
};

/** État du compte connecté (null = actif ou table absente). Pose le mode lecture seule. */
export async function chargerEtatCompte(): Promise<EtatCompte | null> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) return null;
  const { data, error } = await supabase.from("comptes_etat").select("*").eq("owner_id", uid).maybeSingle();
  if (error || !data) {
    definirLectureSeule(false);
    return null;
  }
  const e = data as EtatCompte;
  definirLectureSeule(e.etat === "lecture_seule" || e.etat === "ferme");
  return e;
}
