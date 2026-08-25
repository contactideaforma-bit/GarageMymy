// Accès CLIENT à l'espace éditeur : tout passe par /api/admin/donnees.
import { fetchAuth, lireReponse } from "@/lib/apiClient";
import { Parametres } from "./economie";

export type Collaborateur = {
  id: string; created_at: string; type: "commercial" | "secretaire"; nom: string; prenom: string | null;
  email: string | null; tel: string | null; siret: string | null; adresse: string | null;
  statut: "actif" | "pause" | "termine"; date_debut: string | null; date_fin: string | null;
  iban: string | null; taux_retrocession: number | null; notes: string | null;
};
export type Abonnement = {
  id: string; created_at: string; garage_nom: string; garage_email: string | null; garage_owner_id: string | null;
  formule: "essentiel" | "starter" | "confort" | "serenite"; prix_ht: number; remise_pct: number; periodicite: "mensuel" | "annuel"; montant_annuel: number | null; heures: number;
  date_signature: string; date_debut: string; engagement_12: boolean; statut: "actif" | "suspendu" | "resilie";
  date_fin: string | null; commercial_id: string | null; secretaire_id: string | null; notes: string | null;
};
export type Mensualite = { id: string; abonnement_id: string; periode: string; montant_ht: number; payee_le: string | null; heures_faites: number | null; notes: string | null };
export type Reglement = {
  id: string; created_at: string; collaborateur_id: string; abonnement_id: string | null; cle: string | null;
  type: "commission" | "fidelite" | "bonus" | "retrocession" | "reprise" | "autre"; libelle: string; periode: string | null;
  montant: number; statut: "a_payer" | "paye" | "annule"; paye_le: string | null; facture_ref: string | null; notes: string | null;
};
export type Demande = { id: string; created_at: string; collaborateur_id: string; objet: string; contenu: string | null; statut: "ouverte" | "en_cours" | "close"; reponse: string | null; repondu_le: string | null };

export type TableAdmin = "collaborateurs" | "abonnements" | "abonnement_mensualites" | "collaborateur_reglements" | "collaborateur_demandes";

export async function lireTable<T>(table: TableAdmin): Promise<T[]> {
  const res = await fetchAuth(`/api/admin/donnees?table=${table}`);
  const r = await lireReponse<{ rows: T[] }>(res);
  if (!r.ok) throw new Error(r.error || "Lecture impossible.");
  return r.data?.rows || [];
}
export async function lireParametres(): Promise<Parametres> {
  const res = await fetchAuth("/api/admin/donnees?table=parametres");
  const r = await lireReponse<{ parametres: Parametres }>(res);
  if (!r.ok || !r.data) throw new Error(r.error || "Paramètres illisibles.");
  return r.data.parametres;
}
async function post<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const res = await fetchAuth("/api/admin/donnees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const r = await lireReponse<T>(res);
  if (!r.ok) throw new Error(r.error || "Opération refusée.");
  return r.data as T;
}
export const upsertLigne = <T,>(table: TableAdmin, row: Partial<T>) => post<{ row: T }>({ action: "upsert", table, row });
export const supprimerLigne = (table: TableAdmin, id: string) => post({ action: "delete", table, id });
export const enregistrerParametres = (valeur: Parametres) => post<{ parametres: Parametres }>({ action: "parametres", valeur });
export const genererMensualites = (abonnement_id: string) => post<{ ajoutees: number }>({ action: "generer_mensualites", abonnement_id });
export const genererReleve = () => post<{ ajoutees: number; total: number }>({ action: "generer_releve" });

export const LIBELLE_TYPE: Record<Reglement["type"], string> = {
  commission: "Prime de signature", fidelite: "Prime de fidélité", bonus: "Bonus", retrocession: "Rétrocession", reprise: "Reprise", autre: "Autre",
};
export const nomCollab = (c?: Collaborateur | null) => (c ? [c.prenom, c.nom].filter(Boolean).join(" ") : "—");
