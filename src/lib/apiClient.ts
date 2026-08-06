// fetch AUTHENTIFIÉ vers nos routes API : joint le jeton Supabase de la
// session courante (Authorization: Bearer …). À utiliser pour TOUTES les
// routes /api/* protégées.

import { supabase } from "./supabaseClient";

export async function fetchAuth(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

/**
 * Lit la réponse d'une route /api/* SANS jamais planter sur du non-JSON.
 *
 * Quand l'hébergeur interrompt une fonction (durée dépassée, plantage), il
 * renvoie une page HTML : `res.json()` échouait alors avec « Unexpected token
 * 'A', "An error o"… is not valid JSON ». On renvoie ici un message clair et
 * exploitable par l'utilisateur.
 */
export async function lireReponse<T = unknown>(
  res: Response
): Promise<{ ok: boolean; data: T | null; error: string | null }> {
  const brut = await res.text();
  let data: unknown = null;
  try {
    data = brut ? JSON.parse(brut) : null;
  } catch {
    data = null;
  }

  if (data && typeof data === "object") {
    if (res.ok) return { ok: true, data: data as T, error: null };
    const msg = (data as { error?: string }).error;
    return { ok: false, data: null, error: msg || messageStatut(res.status, brut) };
  }
  return { ok: false, data: null, error: messageStatut(res.status, brut) };
}

function messageStatut(status: number, brut = ""): string {
  const html = /^\s*</.test(brut) || /an error occurred/i.test(brut);
  if (status === 504 || /timeout|timed out|FUNCTION_INVOCATION_TIMEOUT/i.test(brut)) {
    return (
      "L'analyse a dépassé le temps autorisé par l'hébergeur. C'est fréquent avec un " +
      "rapport SCANNÉ (pages en images) ou très long : réessaie, ou n'envoie que les pages " +
      "utiles (conclusions + liste des pièces). Tu peux aussi saisir le dossier à la main."
    );
  }
  if (status === 413) return "Fichier trop volumineux : envoie un PDF de moins de 10 Mo.";
  if (status === 401) return "Session expirée : reconnecte-toi puis réessaie.";
  if (status === 402) return "Quota d'analyse IA atteint pour ce mois.";
  if (status === 429) return "Trop de demandes d'affilée : réessaie dans quelques instants.";
  if (status === 0) return "Connexion interrompue : vérifie ta connexion internet puis réessaie.";
  if (html || status >= 500) {
    return (
      "L'analyse s'est interrompue côté serveur (erreur " + status + "). " +
      "Réessaie dans un instant ; si le rapport est un scan de plusieurs pages, envoie " +
      "seulement les pages utiles ou saisis le dossier à la main."
    );
  }
  return `Réponse inattendue du serveur (erreur ${status}).`;
}
