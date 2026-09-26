// Appels navigateur → routes /api/courrier-postal/* (v13.27).
import { fetchAuth, lireReponse } from "./apiClient";
import type { EnvoiPostal } from "./envoisPostaux";

export type ConfigMaileva = {
  migration: boolean;
  configured: boolean;
  viaEnv?: boolean;
  environnement: "sandbox" | "production";
  login: string;
  client_id: string;
  notification_email: string;
  couleur: boolean;
  recto_verso: boolean;
  hasPassword: boolean;
  hasSecret: boolean;
  expediteur: { nom: string | null; adresse: string | null; code_postal: string | null; ville: string | null } | null;
};

export async function lireConfigMaileva(): Promise<{ config: ConfigMaileva | null; error: string | null }> {
  const r = await lireReponse<ConfigMaileva>(await fetchAuth("/api/courrier-postal/config"));
  return { config: r.data, error: r.error };
}

export async function enregistrerConfigMaileva(champs: Record<string, unknown>): Promise<string | null> {
  const r = await lireReponse(await fetchAuth("/api/courrier-postal/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(champs) }));
  return r.error;
}

export async function testerConfigMaileva(): Promise<string | null> {
  return enregistrerConfigMaileva({ tester: true });
}

export type DemandeEnvoi = {
  pdfBase64: string;
  nomFichier: string;
  type: "simple" | "lrar";
  objet: string;
  lignes: string[];
  pays?: string;
  couleur: boolean;
  rectoVerso: boolean;
  arScanne: boolean;
  dossierId?: string | null;
  courrierId?: string | null;
};

export async function envoyerParLaPoste(d: DemandeEnvoi): Promise<{ envoi: EnvoiPostal | null; error: string | null }> {
  const r = await lireReponse<{ envoi: EnvoiPostal }>(
    await fetchAuth("/api/courrier-postal/envoyer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) })
  );
  return { envoi: r.data?.envoi || null, error: r.error };
}

export async function actualiserSuivi(ids?: string[]): Promise<{ envois: EnvoiPostal[]; error: string | null; erreurs: string[] }> {
  const r = await lireReponse<{ envois: EnvoiPostal[]; erreurs?: string[] }>(
    await fetchAuth("/api/courrier-postal/suivi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) })
  );
  return { envois: r.data?.envois || [], error: r.error, erreurs: r.data?.erreurs || [] };
}

/** Ouvre une preuve Maileva (AR scanné, preuve de dépôt, archive) dans un nouvel onglet. */
export async function ouvrirPreuve(id: string, quoi: "ar" | "depot" | "archive"): Promise<string | null> {
  const fenetre = window.open("", "_blank");
  const res = await fetchAuth(`/api/courrier-postal/preuve?id=${encodeURIComponent(id)}&quoi=${quoi}`);
  if (!res.ok) {
    fenetre?.close();
    const r = await lireReponse(res);
    return r.error || "Document indisponible.";
  }
  const url = URL.createObjectURL(await res.blob());
  if (fenetre) fenetre.location.href = url; else window.open(url, "_blank");
  return null;
}

/** File → base64 (sans le préfixe data:). */
export function fichierEnBase64(f: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result || ""); resolve(s.substring(s.indexOf(",") + 1)); };
    r.onerror = () => reject(r.error || new Error("Lecture du fichier impossible."));
    r.readAsDataURL(f);
  });
}
