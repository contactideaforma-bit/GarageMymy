// Accès CLIENT à la prospection éditeur (v13.1) : tout passe par /api/admin/prospection.
import { fetchAuth, lireReponse } from "@/lib/apiClient";
import type { Prospect, ProspectDocument, ProspectInteraction } from "@/lib/prospects";

export type GarageTrouve = {
  siren: string;
  siret: string;
  nom: string;
  raison_sociale: string;
  adresse: string;
  cp: string;
  ville: string;
  activite: string;
  dirigeant: string;
  est_siege: boolean;
  type: "carrosserie" | "garage" | "autre";
  deja: { prospect_id: string; owner_id: string; proprietaire: string; statut: string } | null;
};

export type ResultatRecherche = { garages: GarageTrouve[]; zone: string; page: number; totalPages: number; totalEntreprises: number };
export type CriteresRecherche = { zone: string; nom: string; siret: string; activite: string };

export async function rechercherGarages(c: CriteresRecherche, page = 1): Promise<ResultatRecherche> {
  const q = new URLSearchParams({ zone: c.zone, nom: c.nom, siret: c.siret, activite: c.activite, page: String(page) });
  const res = await fetchAuth(`/api/admin/prospection?${q.toString()}`);
  const r = await lireReponse<ResultatRecherche>(res);
  if (!r.ok || !r.data) throw new Error(r.error || "Recherche impossible.");
  return r.data;
}

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetchAuth("/api/admin/prospection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const r = await lireReponse<T>(res);
  if (!r.ok) throw new Error(r.error || "Opération refusée.");
  return r.data as T;
}

export const attribuerGarages = (owner_id: string, garages: GarageTrouve[]) =>
  post<{ crees: number; ignores: string[] }>({ action: "attribuer", owner_id, garages });
export const reattribuerProspects = (owner_id: string, prospect_ids: string[]) =>
  post<{ deplaces: number; bloquees: number }>({ action: "reattribuer", owner_id, prospect_ids });
export const retirerProspects = (prospect_ids: string[]) =>
  post<{ retires: number; conserves: number }>({ action: "retirer", prospect_ids });

export async function lireSuivi(): Promise<{ prospects: Prospect[]; moi: string }> {
  const res = await fetchAuth("/api/admin/prospection?vue=suivi");
  const r = await lireReponse<{ prospects: Prospect[]; moi: string }>(res);
  if (!r.ok || !r.data) throw new Error(r.error || "Lecture impossible.");
  return r.data;
}

export type JournalFiche = {
  interactions: ProspectInteraction[];
  documents: Pick<ProspectDocument, "id" | "type" | "numero" | "statut" | "created_at" | "signe_le" | "envoye_le">[];
};
export async function lireJournal(prospect_id: string): Promise<JournalFiche> {
  const res = await fetchAuth(`/api/admin/prospection?vue=journal&prospect_id=${encodeURIComponent(prospect_id)}`);
  const r = await lireReponse<JournalFiche>(res);
  if (!r.ok || !r.data) throw new Error(r.error || "Journal illisible.");
  return r.data;
}
