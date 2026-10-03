// ====================================================================
//  QONTO — liens de paiement (côté SERVEUR uniquement), v13.28 → v13.38.
//
//  v13.38 : Qonto EXIGE OAuth 2.0 pour les liens de paiement (la clé API
//  renvoie « 401 OAuth2 authentication is required here »). Connexion
//  faite UNE fois par l'éditeur (Espace éditeur → Paiements → « Connecter
//  Qonto ») ; jetons stockés dans public.qonto_oauth et renouvelés seuls.
//  Env :
//    QONTO_CLIENT_ID, QONTO_CLIENT_SECRET   (portail développeur Qonto)
//    QONTO_REDIRECT_URI (facultatif, défaut <site>/api/qonto/callback)
//    QONTO_ENV=sandbox (+ QONTO_STAGING_TOKEN) pour tester
//    QONTO_LOGIN, QONTO_SECRET_KEY : ancienne clé API (repli, sans OAuth)
//  Les liens de paiement doivent aussi être activés dans Qonto (Mollie).
// ====================================================================

import { randomBytes } from "crypto";
import { getAdminClient } from "@/lib/supabaseAdmin";

const SANDBOX = process.env.QONTO_ENV === "sandbox";

const BASE = SANDBOX
  ? process.env.QONTO_SANDBOX_URL || "https://thirdparty-sandbox.staging.qonto.co/v2"
  : process.env.QONTO_API_URL || "https://thirdparty.qonto.com/v2";

const OAUTH = SANDBOX ? "https://oauth-sandbox.staging.qonto.co/oauth2" : "https://oauth.qonto.com/oauth2";

/** Portées demandées : liens de paiement + renouvellement sans reconnexion. */
export const QONTO_SCOPES = "offline_access payment_link.read payment_link.write";

export function qontoOAuthConfigure(): boolean {
  return Boolean(process.env.QONTO_CLIENT_ID && process.env.QONTO_CLIENT_SECRET);
}

/** Vrai si un moyen d'appeler Qonto est configuré (OAuth de préférence). */
export function qontoConfigure(): boolean {
  return qontoOAuthConfigure() || Boolean(process.env.QONTO_LOGIN && process.env.QONTO_SECRET_KEY);
}

export function qontoRedirectUri(): string {
  return process.env.QONTO_REDIRECT_URI || `${(process.env.NEXT_PUBLIC_SITE_URL || "https://myeasyauto.fr").replace(/\/$/, "")}/api/qonto/callback`;
}

export class ErreurQonto extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

function enTetesStaging(h: Record<string, string>) {
  if (SANDBOX && process.env.QONTO_STAGING_TOKEN) h["X-Qonto-Staging-Token"] = process.env.QONTO_STAGING_TOKEN;
  return h;
}

/* ------------------------------------------------------------ OAuth 2.0 */

type LigneOAuth = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  scope: string | null;
  environnement: string | null;
  connecte_par: string | null;
  connecte_le: string | null;
  derniere_erreur: string | null;
  etat_attendu?: string | null;
  etat_le?: string | null;
};

type ReponseJeton = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };

async function demanderJeton(champs: Record<string, string>): Promise<ReponseJeton> {
  const corps = new URLSearchParams({
    ...champs,
    client_id: process.env.QONTO_CLIENT_ID || "",
    client_secret: process.env.QONTO_CLIENT_SECRET || "",
  });
  const res = await fetch(`${OAUTH}/token`, {
    method: "POST",
    headers: enTetesStaging({ "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }),
    body: corps.toString(),
  });
  const texte = await res.text();
  let data: Record<string, unknown> = {};
  try { data = texte ? JSON.parse(texte) : {}; } catch { data = {}; }
  if (!res.ok || !data.access_token) {
    const detail = (data.error_description as string) || (data.error as string) || texte.slice(0, 200);
    throw new ErreurQonto(`Connexion Qonto refusée (${res.status})${detail ? ` : ${detail}` : ""}`, 401);
  }
  return data as unknown as ReponseJeton;
}

async function enregistrerJetons(j: ReponseJeton, extra: Partial<LigneOAuth> = {}) {
  const admin = getAdminClient();
  if (!admin) throw new ErreurQonto("Service non configuré.", 500);
  const expire = new Date(Date.now() + (Number(j.expires_in) || 3600) * 1000).toISOString();
  const { error } = await admin.from("qonto_oauth").upsert({
    id: 1,
    access_token: j.access_token,
    // Le jeton de renouvellement ne sert qu'une fois : on garde TOUJOURS le dernier reçu.
    ...(j.refresh_token ? { refresh_token: j.refresh_token } : {}),
    expires_at: expire,
    ...(j.scope ? { scope: j.scope } : {}),
    environnement: SANDBOX ? "sandbox" : "production",
    maj_le: new Date().toISOString(),
    derniere_erreur: null,
    ...extra,
  });
  if (error) throw new ErreurQonto(`Enregistrement de la connexion Qonto impossible (migration v95 ?) : ${error.message}`, 500);
}

/** URL d'autorisation Qonto (à ouvrir dans le navigateur de l'éditeur). */
export async function urlAutorisationQonto(): Promise<string> {
  if (!qontoOAuthConfigure()) throw new ErreurQonto("QONTO_CLIENT_ID / QONTO_CLIENT_SECRET absents des variables Vercel (redéploie après les avoir ajoutées).", 503);
  const admin = getAdminClient();
  if (!admin) throw new ErreurQonto("Service non configuré.", 500);
  const etat = randomBytes(32).toString("hex");
  const { error } = await admin.from("qonto_oauth").upsert({ id: 1, etat_attendu: etat, etat_le: new Date().toISOString(), maj_le: new Date().toISOString() });
  if (error) throw new ErreurQonto(`Table qonto_oauth absente : exécute supabase/migration_v95.sql (${error.message}).`, 500);
  const q = new URLSearchParams({
    client_id: process.env.QONTO_CLIENT_ID!,
    redirect_uri: qontoRedirectUri(),
    response_type: "code",
    scope: QONTO_SCOPES,
    state: etat,
  });
  return `${OAUTH}/auth?${q.toString()}`;
}

/** Retour de Qonto : vérifie le « state », échange le code contre les jetons. */
export async function finaliserConnexionQonto(code: string, etat: string): Promise<void> {
  const admin = getAdminClient();
  if (!admin) throw new ErreurQonto("Service non configuré.", 500);
  const { data } = await admin.from("qonto_oauth").select("etat_attendu, etat_le, connecte_par").eq("id", 1).maybeSingle();
  const l = data as LigneOAuth | null;
  const age = l?.etat_le ? Date.now() - new Date(l.etat_le).getTime() : Infinity;
  if (!l?.etat_attendu || l.etat_attendu !== etat || age > 15 * 60 * 1000) {
    throw new ErreurQonto("Lien de connexion expiré ou invalide : relance « Connecter Qonto » depuis l'espace éditeur.", 400);
  }
  const j = await demanderJeton({ grant_type: "authorization_code", code, redirect_uri: qontoRedirectUri() });
  if (!j.refresh_token) {
    await enregistrerJetons(j, { etat_attendu: null, connecte_le: new Date().toISOString() });
    throw new ErreurQonto("Qonto n'a pas fourni de jeton de renouvellement : ajoute la portée « offline_access » à l'application dans le portail Qonto, puis reconnecte.", 400);
  }
  await enregistrerJetons(j, { etat_attendu: null, etat_le: null, connecte_le: new Date().toISOString() });
}

export async function noterConnecteurQonto(email: string | null) {
  const admin = getAdminClient();
  if (admin && email) await admin.from("qonto_oauth").update({ connecte_par: email }).eq("id", 1);
}

/** Jeton d'accès valide (renouvelé automatiquement), ou null si pas connecté. */
async function jetonAcces(): Promise<string | null> {
  if (!qontoOAuthConfigure()) return null;
  const admin = getAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("qonto_oauth").select("*").eq("id", 1).maybeSingle();
  const l = data as LigneOAuth | null;
  if (!l?.access_token && !l?.refresh_token) return null;
  const encoreValide = l.expires_at && new Date(l.expires_at).getTime() - Date.now() > 2 * 60 * 1000;
  if (l.access_token && encoreValide) return l.access_token;
  if (!l.refresh_token) return null;
  try {
    const j = await demanderJeton({ grant_type: "refresh_token", refresh_token: l.refresh_token });
    await enregistrerJetons(j);
    return j.access_token;
  } catch (e) {
    // Deux appels simultanés : l'autre a peut-être déjà renouvelé (jeton à usage unique).
    const { data: relu } = await admin.from("qonto_oauth").select("access_token, expires_at").eq("id", 1).maybeSingle();
    if (relu?.access_token && relu.expires_at && new Date(relu.expires_at).getTime() - Date.now() > 60 * 1000) return relu.access_token as string;
    await admin.from("qonto_oauth").update({ derniere_erreur: e instanceof Error ? e.message : "renouvellement impossible", maj_le: new Date().toISOString() }).eq("id", 1);
    throw new ErreurQonto("La connexion Qonto a expiré : reconnecte Qonto depuis l'espace éditeur (Paiements → Connecter Qonto).", 503);
  }
}

export type EtatConnexionQonto = {
  oauthConfigure: boolean;
  connecte: boolean;
  environnement: string;
  connectePar: string | null;
  connecteLe: string | null;
  scope: string | null;
  derniereErreur: string | null;
  redirectUri: string;
};

export async function etatConnexionQonto(): Promise<EtatConnexionQonto> {
  const admin = getAdminClient();
  let l: LigneOAuth | null = null;
  if (admin) {
    const { data } = await admin.from("qonto_oauth").select("*").eq("id", 1).maybeSingle();
    l = data as LigneOAuth | null;
  }
  return {
    oauthConfigure: qontoOAuthConfigure(),
    connecte: Boolean(l?.refresh_token),
    environnement: SANDBOX ? "sandbox" : "production",
    connectePar: l?.connecte_par || null,
    connecteLe: l?.connecte_le || null,
    scope: l?.scope || null,
    derniereErreur: l?.derniere_erreur || null,
    redirectUri: qontoRedirectUri(),
  };
}

export async function deconnecterQonto(): Promise<void> {
  const admin = getAdminClient();
  if (admin) await admin.from("qonto_oauth").update({ access_token: null, refresh_token: null, expires_at: null, scope: null, maj_le: new Date().toISOString() }).eq("id", 1);
}

/* ------------------------------------------------------------ appels API */

async function appel<T>(chemin: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  if (!qontoConfigure()) throw new ErreurQonto("Paiement en ligne pas encore activé (connexion Qonto manquante).", 503);
  const headers: Record<string, string> = enTetesStaging({ Accept: "application/json" });
  if (qontoOAuthConfigure()) {
    const jeton = await jetonAcces();
    if (!jeton) throw new ErreurQonto("Qonto n'est pas encore connecté : Espace éditeur → Paiements → « Connecter Qonto ».", 503);
    headers.Authorization = `Bearer ${jeton}`;
  } else {
    headers.Authorization = `${process.env.QONTO_LOGIN}:${process.env.QONTO_SECRET_KEY}`;
  }
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + chemin, {
    method: init.method || "GET",
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  const texte = await res.text();
  let data: unknown = null;
  try { data = texte ? JSON.parse(texte) : null; } catch { data = null; }
  if (!res.ok) {
    const d = (data || {}) as { errors?: { detail?: string; code?: string }[]; message?: string };
    const detail = d.errors?.map((e) => e.detail || e.code).filter(Boolean).join(" ; ") || d.message || texte.slice(0, 200);
    if (res.status === 401 && /oauth/i.test(detail || "")) {
      throw new ErreurQonto("Qonto exige une connexion OAuth pour les liens de paiement : ajoute QONTO_CLIENT_ID / QONTO_CLIENT_SECRET sur Vercel puis « Connecter Qonto » (espace éditeur → Paiements).", 503);
    }
    throw new ErreurQonto(`Qonto a refusé la demande (${res.status})${detail ? ` : ${detail}` : ""}`, res.status >= 500 ? 502 : 400);
  }
  return (data || {}) as T;
}

export type LienPaiement = { id: string; url: string; status: string };

/** Lien de paiement « panier » à usage unique pour un pack de jetons. */
export async function creerLienPaiement(args: { titre: string; description: string; prixHt: number; tauxTva: number }): Promise<LienPaiement> {
  const r = await appel<{ payment_link?: { id: string; url: string; status: string } }>("/payment_links", {
    method: "POST",
    json: {
      payment_link: {
        potential_payment_methods: (process.env.QONTO_MOYENS_PAIEMENT || "credit_card,apple_pay,paypal").split(",").map((s) => s.trim()).filter(Boolean),
        reusable: false,
        items: [
          {
            title: args.titre.slice(0, 120),
            description: args.description.slice(0, 250),
            type: "service",
            quantity: 1,
            measure_unit: "unit",
            unit_price: { value: args.prixHt.toFixed(2), currency: "EUR" },
            vat_rate: String(args.tauxTva),
          },
        ],
      },
    },
  });
  if (!r.payment_link?.url) throw new ErreurQonto("Qonto n'a pas renvoyé de lien de paiement.");
  return { id: r.payment_link.id, url: r.payment_link.url, status: r.payment_link.status };
}

/** Statut d'un lien : open | processing | paid | expired | canceled. */
export async function statutLienPaiement(id: string): Promise<string> {
  const r = await appel<{ payment_link?: { status?: string } }>(`/payment_links/${encodeURIComponent(id)}`);
  return r.payment_link?.status || "open";
}
