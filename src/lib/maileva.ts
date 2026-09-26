// ====================================================================
//  MAILEVA (groupe La Poste) — client API côté SERVEUR uniquement.
//
//  On envoie un PDF, Maileva l'imprime, le met sous pli et le remet au
//  facteur : lettre simple (API « mail ») ou recommandé AR papier
//  (API « registered_mail »). Parcours identique pour les deux :
//    1. jeton OAuth2 (grant « password » : login + mot de passe du compte
//       Maileva + client_id / client_secret de l'application API) ;
//    2. POST /sendings            → création de l'envoi (brouillon) ;
//    3. POST /sendings/{id}/documents (multipart : document + metadata) ;
//    4. POST /sendings/{id}/recipients (adresse sur 6 lignes AFNOR) ;
//    5. POST /sendings/{id}/submit → l'envoi part en production.
//  Suivi : GET /sendings/{id} et GET /sendings/{id}/recipients.
//
//  Les URL par défaut sont surchargées par les variables d'env
//  MAILEVA_*_URL si Maileva fait évoluer une version d'API.
// ====================================================================

import { getAdminClient } from "./supabaseAdmin";
import { dechiffrer } from "./coffre";

export type EnvMaileva = "sandbox" | "production";

export type IdentifiantsMaileva = {
  environnement: EnvMaileva;
  login: string;
  password: string;
  clientId: string;
  clientSecret: string;
  notificationEmail: string | null;
};

const URLS: Record<EnvMaileva, { auth: string; mail: string; lrar: string }> = {
  sandbox: {
    auth: process.env.MAILEVA_SANDBOX_AUTH_URL || "https://api.sandbox.maileva.net/authentication/oauth2/token",
    mail: process.env.MAILEVA_SANDBOX_MAIL_URL || "https://api.sandbox.maileva.net/mail/v2",
    lrar: process.env.MAILEVA_SANDBOX_LRAR_URL || "https://api.sandbox.maileva.net/registered_mail/v2",
  },
  production: {
    auth: process.env.MAILEVA_AUTH_URL || "https://api.maileva.com/authentication/oauth2/token",
    mail: process.env.MAILEVA_MAIL_URL || "https://api.maileva.com/mail/v2",
    lrar: process.env.MAILEVA_LRAR_URL || "https://api.maileva.com/registered_mail/v2",
  },
};

/**
 * Identifiants du garage connecté (table maileva_config, secrets chiffrés).
 * Repli : variables d'env MAILEVA_LOGIN / MAILEVA_PASSWORD / MAILEVA_CLIENT_ID /
 * MAILEVA_CLIENT_SECRET (compte unique de l'éditeur, refacturé aux garages).
 */
export async function identifiantsMaileva(ownerId: string): Promise<IdentifiantsMaileva | null> {
  const admin = getAdminClient();
  if (admin) {
    const { data: propre } = await admin.from("maileva_config").select("*").eq("owner_id", ownerId).limit(1).maybeSingle();
    let data = propre;
    // v13.28 — compte COMMUN de l'éditeur (ligne « commun »), payé par les garages en jetons.
    if (!(data?.login && data?.password && data?.client_id && data?.client_secret)) {
      const { data: commun } = await admin.from("maileva_config").select("*").eq("commun", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (commun) data = commun;
    }
    if (data?.login && data?.password && data?.client_id && data?.client_secret) {
      const password = dechiffrer(data.password);
      const clientSecret = dechiffrer(data.client_secret);
      if (password && clientSecret) {
        return {
          environnement: data.environnement === "production" ? "production" : "sandbox",
          login: data.login,
          password,
          clientId: data.client_id,
          clientSecret,
          notificationEmail: data.notification_email || null,
        };
      }
    }
  }
  const e = process.env;
  if (e.MAILEVA_LOGIN && e.MAILEVA_PASSWORD && e.MAILEVA_CLIENT_ID && e.MAILEVA_CLIENT_SECRET) {
    return {
      environnement: e.MAILEVA_ENV === "production" ? "production" : "sandbox",
      login: e.MAILEVA_LOGIN,
      password: e.MAILEVA_PASSWORD,
      clientId: e.MAILEVA_CLIENT_ID,
      clientSecret: e.MAILEVA_CLIENT_SECRET,
      notificationEmail: e.MAILEVA_NOTIFICATION_EMAIL || null,
    };
  }
  return null;
}

// Jeton mis en cache par compte (durée de vie Maileva ≈ 1 h ; marge de 2 min).
const cacheJetons = new Map<string, { jeton: string; expire: number }>();

export class ErreurMaileva extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

async function jeton(id: IdentifiantsMaileva): Promise<string> {
  const cle = `${id.environnement}:${id.login}:${id.clientId}`;
  const c = cacheJetons.get(cle);
  if (c && c.expire > Date.now()) return c.jeton;
  const corps = new URLSearchParams({
    grant_type: "password",
    username: id.login,
    password: id.password,
    client_id: id.clientId,
    client_secret: id.clientSecret,
  });
  const res = await fetch(URLS[id.environnement].auth, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: corps.toString(),
  });
  const texte = await res.text();
  let data: { access_token?: string; expires_in?: number; error_description?: string } = {};
  try { data = JSON.parse(texte); } catch { /* réponse non JSON */ }
  if (!res.ok || !data.access_token) {
    throw new ErreurMaileva(
      res.status === 401 || res.status === 400
        ? "Connexion à Maileva refusée : vérifie l'identifiant, le mot de passe, le client_id et le client_secret (et l'environnement test / production)."
        : `Maileva injoignable (authentification, erreur ${res.status}).`,
      res.status === 401 || res.status === 400 ? 401 : 502
    );
  }
  const duree = Math.max(60, (data.expires_in || 3600) - 120) * 1000;
  cacheJetons.set(cle, { jeton: data.access_token, expire: Date.now() + duree });
  return data.access_token;
}

/** Vérifie les identifiants (nouveau jeton, sans cache). Aucun envoi créé. */
export async function testerConnexion(id: IdentifiantsMaileva): Promise<void> {
  cacheJetons.delete(`${id.environnement}:${id.login}:${id.clientId}`);
  await jeton(id);
}

async function appel<T = Record<string, unknown>>(
  id: IdentifiantsMaileva,
  base: string,
  chemin: string,
  init: { method?: string; json?: unknown; form?: FormData } = {}
): Promise<T> {
  const token = await jeton(id);
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  let body: BodyInit | undefined;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  } else if (init.form) {
    body = init.form;
  }
  const res = await fetch(base + chemin, { method: init.method || "GET", headers, body });
  const texte = await res.text();
  let data: unknown = null;
  try { data = texte ? JSON.parse(texte) : null; } catch { data = null; }
  if (!res.ok) {
    const d = (data || {}) as { message?: string; errors?: { message?: string; field?: string }[] };
    const detail = d.errors?.map((e) => [e.field, e.message].filter(Boolean).join(" : ")).join(" ; ") || d.message || texte.slice(0, 300);
    throw new ErreurMaileva(`Maileva a refusé la demande (${res.status}) : ${detail || "sans détail"}`, res.status >= 500 ? 502 : 400);
  }
  return (data || {}) as T;
}

export type AdresseMaileva = {
  lignes: string[]; // 6 lignes : 1 identité · 2 compl. identité · 3 compl. adresse · 4 n° + voie · 5 lieu-dit / BP · 6 CP + ville
  pays: string; // code ISO (FR)
};

export type Expediteur = { lignes: string[]; pays: string };

export type EnvoiDemande = {
  type: "simple" | "lrar";
  nom: string; // libellé de l'envoi chez Maileva
  customId: string; // notre id (envois_postaux.id)
  pdf: Buffer;
  nomFichier: string;
  destinataire: AdresseMaileva;
  expediteur: Expediteur;
  couleur: boolean;
  rectoVerso: boolean;
  arScanne: boolean;
};

/** Crée, remplit et SOUMET l'envoi. Renvoie les identifiants Maileva. */
export async function envoyerCourrier(id: IdentifiantsMaileva, d: EnvoiDemande): Promise<{ sendingId: string; recipientId: string | null; statut: string | null }> {
  const base = d.type === "lrar" ? URLS[id.environnement].lrar : URLS[id.environnement].mail;
  const l = (i: number) => (d.expediteur.lignes[i] || "").slice(0, 38) || undefined;

  const creation: Record<string, unknown> = {
    name: d.nom.slice(0, 100),
    custom_id: d.customId,
    color_printing: d.couleur,
    duplex_printing: d.rectoVerso,
    // Page porte-adresse ajoutée par Maileva : le PDF n'a pas besoin d'avoir
    // l'adresse placée pile dans la fenêtre de l'enveloppe.
    optional_address_sheet: true,
  };
  if (id.notificationEmail) creation.notification_email = id.notificationEmail;
  if (d.type === "lrar") {
    creation.acknowledgement_of_receipt = true;
    creation.acknowledgement_of_receipt_scanning = d.arScanne;
    creation.sender_address_line_1 = l(0);
    creation.sender_address_line_2 = l(1);
    creation.sender_address_line_3 = l(2);
    creation.sender_address_line_4 = l(3);
    creation.sender_address_line_5 = l(4);
    creation.sender_address_line_6 = l(5);
    creation.sender_country_code = d.expediteur.pays || "FR";
  } else {
    creation.postage_type = process.env.MAILEVA_POSTAGE_TYPE || "FAST";
  }

  const envoi = await appel<{ id?: string }>(id, base, "/sendings", { method: "POST", json: creation });
  if (!envoi.id) throw new ErreurMaileva("Maileva n'a pas renvoyé d'identifiant d'envoi.");
  const sid = envoi.id;

  try {
    const form = new FormData();
    form.append("document", new Blob([new Uint8Array(d.pdf)], { type: "application/pdf" }), d.nomFichier);
    form.append("metadata", JSON.stringify({ priority: 1, name: d.nomFichier }));
    await appel(id, base, `/sendings/${sid}/documents`, { method: "POST", form });

    const dest: Record<string, unknown> = { custom_id: d.customId, country_code: d.destinataire.pays || "FR" };
    d.destinataire.lignes.slice(0, 6).forEach((v, i) => {
      if (v && v.trim()) dest[`address_line_${i + 1}`] = v.trim().slice(0, 38);
    });
    const rec = await appel<{ id?: string }>(id, base, `/sendings/${sid}/recipients`, { method: "POST", json: dest });

    await appel(id, base, `/sendings/${sid}/submit`, { method: "POST" });
    return { sendingId: sid, recipientId: rec.id || null, statut: "PENDING" };
  } catch (e) {
    // On ne laisse pas un brouillon orphelin chez Maileva.
    try { await appel(id, base, `/sendings/${sid}`, { method: "DELETE" }); } catch { /* best-effort */ }
    throw e;
  }
}

export type SuiviMaileva = {
  statutEnvoi: string | null;
  statutDestinataire: string | null;
  numeroSuivi: string | null;
  evenements: { date: string | null; statut: string; detail: string | null }[];
  brut: unknown;
};

/** Relit l'état d'un envoi (envoi + destinataire + statuts de distribution). */
export async function suiviCourrier(id: IdentifiantsMaileva, type: "simple" | "lrar", sendingId: string, recipientId: string | null): Promise<SuiviMaileva> {
  const base = type === "lrar" ? URLS[id.environnement].lrar : URLS[id.environnement].mail;
  const envoi = await appel<Record<string, unknown>>(id, base, `/sendings/${sendingId}`);
  let rec: Record<string, unknown> | null = null;
  if (recipientId) {
    try {
      const liste = await appel<{ recipients?: Record<string, unknown>[] }>(id, base, `/sendings/${sendingId}/recipients`);
      rec = (liste.recipients || []).find((r) => r.id === recipientId) || (liste.recipients || [])[0] || null;
    } catch { rec = null; }
  }
  let evenements: SuiviMaileva["evenements"] = [];
  if (recipientId) {
    try {
      const ds = await appel<{ delivery_statuses?: Record<string, unknown>[] }>(id, base, `/sendings/${sendingId}/recipients/${recipientId}/delivery_statuses`);
      evenements = (ds.delivery_statuses || []).map((s) => ({
        date: (s.date as string) || (s.event_date as string) || null,
        statut: String(s.code || s.status || s.label || ""),
        detail: (s.label as string) || (s.description as string) || null,
      }));
    } catch { /* pas encore de statut de distribution */ }
  }
  const champ = (o: Record<string, unknown> | null, ...cles: string[]) => {
    if (!o) return null;
    for (const c of cles) if (o[c]) return String(o[c]);
    return null;
  };
  return {
    statutEnvoi: champ(envoi, "status"),
    statutDestinataire: champ(rec, "status"),
    numeroSuivi: champ(rec, "registered_number", "tracking_number", "registered_mail_number", "postage_number"),
    evenements,
    brut: { envoi, destinataire: rec },
  };
}

/** Télécharge une preuve (AR scanné, archive du courrier, preuve de dépôt). */
export async function telechargerPreuve(
  id: IdentifiantsMaileva,
  type: "simple" | "lrar",
  sendingId: string,
  recipientId: string,
  quoi: "ar" | "archive" | "depot"
): Promise<{ contenu: ArrayBuffer; contentType: string }> {
  const base = type === "lrar" ? URLS[id.environnement].lrar : URLS[id.environnement].mail;
  const chemin =
    quoi === "ar"
      ? `/sendings/${sendingId}/recipients/${recipientId}/download_acknowledgement_of_receipt`
      : quoi === "depot"
        ? `/sendings/${sendingId}/recipients/${recipientId}/download_deposit_proof`
        : `/sendings/${sendingId}/recipients/${recipientId}/download_archive`;
  const token = await jeton(id);
  const res = await fetch(base + chemin, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new ErreurMaileva(
      res.status === 404 ? "Document pas encore disponible chez Maileva (l'AR arrive après la distribution)." : `Téléchargement impossible (erreur ${res.status}).`,
      res.status === 404 ? 404 : 502
    );
  }
  return { contenu: await res.arrayBuffer(), contentType: res.headers.get("content-type") || "application/pdf" };
}
