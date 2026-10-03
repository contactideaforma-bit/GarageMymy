// Accès CLIENT à l'espace commercial (v10.2) : tout passe par /api/commercial.
import { fetchAuth, lireReponse } from "./apiClient";
import { Parametres, fusionnerParametres } from "./admin/economie";
import type { ParametresPublics } from "./admin/ventePublic";
import type { ParametresOffre } from "./prospects";

export type CollaborateurMoi = {
  id: string; nom: string; prenom: string | null; code_apporteur: string | null; zone: string | null; portefeuille: string | null; signature: string | null; statut: string;
};
export type ContexteCommercial = {
  collaborateur: CollaborateurMoi | null;
  estAdmin: boolean;
  parametres: Parametres;
  /** v13.37 — un lien de paiement en ligne est disponible (Qonto ou lien CB fixe). */
  paiementEnLigne: boolean;
  /** v13.37 — liens Qonto uniques, vérifiables automatiquement. */
  qonto: boolean;
};

export async function chargerContexteCommercial(): Promise<ContexteCommercial> {
  const res = await fetchAuth("/api/commercial");
  const r = await lireReponse<{ collaborateur: CollaborateurMoi | null; estAdmin: boolean; parametres: ParametresPublics; paiementEnLigne?: boolean; qonto?: boolean }>(res);
  if (!r.ok || !r.data) throw new Error(r.error || "Espace commercial indisponible.");
  const parametres = fusionnerParametres(r.data.parametres);
  return {
    collaborateur: r.data.collaborateur,
    estAdmin: r.data.estAdmin,
    parametres,
    paiementEnLigne: r.data.paiementEnLigne ?? Boolean(parametres.lienPaiementCb),
    qonto: Boolean(r.data.qonto),
  };
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

/** v13.31 — le commercial crée lui-même le compte du garage une fois le contrat signé. */
export type ResultatCompteGarageCommercial = { ok: boolean; ownerId: string; dejaExistant: boolean; emailEnvoye: boolean; erreurEmail: string | null; motDePasse?: string };
export const creerCompteGarageCommercial = (vente_id: string) => post<ResultatCompteGarageCommercial>({ action: "creer_compte_garage", vente_id });

/** v13.31 — renvoi de l'email de bienvenue : pose un NOUVEAU mot de passe provisoire et renvoie l'email. */
export type ResultatRenvoiBienvenue = { ok: boolean; email: string; emailEnvoye: boolean; erreurEmail: string | null; motDePasse?: string };
export const renvoyerBienvenueCommercial = (vente_id: string) => post<ResultatRenvoiBienvenue>({ action: "renvoyer_bienvenue", vente_id });

export const nomCommercial = (c: CollaborateurMoi | null) => (c ? [c.prenom, c.nom].filter(Boolean).join(" ") : "IDEAFORMA");

/* ------------- v13.37 — paiement de la 1re échéance (parcours de vente) ------------- */
export type LienPaiementVente = { url: string; qonto: boolean; statut: string | null };
export const lienPaiementVente = (vente_id: string) => post<LienPaiementVente>({ action: "lien_paiement", vente_id });
export const envoyerPaiementVente = (args: { vente_id: string; mode: "lien" | "virement"; to?: string }) =>
  post<{ ok: boolean; url: string | null }>({ action: "envoyer_paiement", ...args });
export const verifierPaiementVente = (vente_id: string) => post<{ statut: string | null; paye: boolean }>({ action: "verifier_paiement", vente_id });
