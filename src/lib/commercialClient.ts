// Accès CLIENT à l'espace commercial (v10.2) : tout passe par /api/commercial.
import { fetchAuth, lireReponse } from "./apiClient";
import { Parametres, fusionnerParametres } from "./admin/economie";
import type { ParametresPublics } from "./admin/ventePublic";
import type { ParametresOffre } from "./prospects";

export type CollaborateurMoi = {
  id: string; nom: string; prenom: string | null; code_apporteur: string | null; zone: string | null; portefeuille: string | null; signature: string | null; statut: string;
};
export type ContexteCommercial = { collaborateur: CollaborateurMoi | null; estAdmin: boolean; parametres: Parametres };

export async function chargerContexteCommercial(): Promise<ContexteCommercial> {
  const res = await fetchAuth("/api/commercial");
  const r = await lireReponse<{ collaborateur: CollaborateurMoi | null; estAdmin: boolean; parametres: ParametresPublics }>(res);
  if (!r.ok || !r.data) throw new Error(r.error || "Espace commercial indisponible.");
  return { collaborateur: r.data.collaborateur, estAdmin: r.data.estAdmin, parametres: fusionnerParametres(r.data.parametres) };
}

async function post<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const res = await fetchAuth("/api/commercial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const r = await lireReponse<T>(res);
  if (!r.ok) throw new Error(r.error || "Opération refusée.");
  return r.data as T;
}

export const enregistrerSignatureCommercial = (signature: string | null) => post({ action: "signature", signature });
export const declarerVente = (args: { prospect_id: string; offre: ParametresOffre; signature: string; signataire_nom?: string; signataire_qualite?: string; paiement_demande?: "virement" | "cb" | null }) =>
  post<{ id: string; numero: string }>({ action: "declarer_vente", ...args });
export const majPaiement = (args: { vente_id: string; paiement_demande?: "virement" | "cb"; reference?: string; confirme?: boolean; montant?: number | null }) =>
  post({ action: "paiement", ...args });

export const nomCommercial = (c: CollaborateurMoi | null) => (c ? [c.prenom, c.nom].filter(Boolean).join(" ") : "IDEAFORMA");
