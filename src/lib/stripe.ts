// ============================================================
//  STRIPE (v13.41) — client MINIMAL côté serveur, sans dépendance npm.
//
//  Utilisé pour le PRÉLÈVEMENT AUTOMATIQUE MENSUEL des inscriptions en
//  ligne : une session Stripe Checkout en mode « subscription » (carte ou
//  SEPA selon ce qui est activé dans le tableau de bord Stripe), puis les
//  webhooks `checkout.session.completed`, `invoice.paid`,
//  `invoice.payment_failed`, `customer.subscription.deleted`.
//
//  Variables Vercel :
//    STRIPE_SECRET_KEY      sk_live_… / sk_test_…
//    STRIPE_WEBHOOK_SECRET  whsec_… (endpoint https://myeasyauto.fr/api/stripe/webhook)
//
//  Les montants sont transmis en centimes, sans TVA (franchise en base,
//  art. 293 B du CGI).
// ============================================================

import { createHmac, timingSafeEqual } from "crypto";

const API = "https://api.stripe.com/v1";

export function stripeConfigure(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export class ErreurStripe extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

/** Encode un objet imbriqué au format attendu par Stripe (a[b][0][c]=…). */
export function encoderForm(obj: Record<string, unknown>, prefixe = "", out: string[] = []): string[] {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const cle = prefixe ? `${prefixe}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item && typeof item === "object") encoderForm(item as Record<string, unknown>, `${cle}[${i}]`, out);
        else out.push(`${encodeURIComponent(`${cle}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === "object") {
      encoderForm(v as Record<string, unknown>, cle, out);
    } else {
      out.push(`${encodeURIComponent(cle)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out;
}

async function appel<T>(methode: "GET" | "POST" | "DELETE", chemin: string, corps?: Record<string, unknown>, idempotence?: string): Promise<T> {
  const cle = process.env.STRIPE_SECRET_KEY;
  if (!cle) throw new ErreurStripe("Stripe n'est pas configuré (STRIPE_SECRET_KEY).", 503);
  const headers: Record<string, string> = { Authorization: `Bearer ${cle}`, "Stripe-Version": "2024-06-20" };
  if (idempotence) headers["Idempotency-Key"] = idempotence;
  let body: string | undefined;
  if (corps && methode !== "GET") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = encoderForm(corps).join("&");
  }
  const url = methode === "GET" && corps ? `${API}${chemin}?${encoderForm(corps).join("&")}` : `${API}${chemin}`;
  const res = await fetch(url, { method: methode, headers, body });
  const texte = await res.text();
  let data: unknown = null;
  try { data = texte ? JSON.parse(texte) : null; } catch { data = null; }
  if (!res.ok) {
    const msg = (data as { error?: { message?: string } } | null)?.error?.message || `Stripe : erreur ${res.status}`;
    throw new ErreurStripe(msg, res.status === 401 ? 503 : 502);
  }
  return data as T;
}

export type SessionCheckout = { id: string; url: string | null; status: string | null; customer: string | null; subscription: string | null; payment_status?: string | null; metadata?: Record<string, string> };

/**
 * Session Checkout « abonnement » : une ligne récurrente mensuelle (prix
 * créé à la volée) + éventuellement une ligne unique (mise en service).
 */
export async function creerSessionAbonnement(args: {
  venteId: string;
  numero: string;
  email: string;
  garageNom: string;
  libelleOffre: string;
  mensualite: number;         // € nets
  miseEnService: number;      // € nets, 0 si offerte
  engagement12: boolean;
  successUrl: string;
  cancelUrl: string;
}): Promise<SessionCheckout> {
  const centimes = (n: number) => Math.round(Math.max(0, n) * 100);
  const lignes: Record<string, unknown>[] = [
    {
      quantity: 1,
      price_data: {
        currency: "eur",
        unit_amount: centimes(args.mensualite),
        recurring: { interval: "month" },
        product_data: { name: `My Easy Auto — ${args.libelleOffre}`, description: `Abonnement mensuel · ${args.garageNom}${args.engagement12 ? " · engagement 12 mois" : " · sans engagement"} · TVA non applicable, art. 293 B du CGI` },
      },
    },
  ];
  if (args.miseEnService > 0) {
    lignes.push({
      quantity: 1,
      price_data: { currency: "eur", unit_amount: centimes(args.miseEnService), product_data: { name: "Mise en service (paramétrage, import, formation à distance)", description: "Facturée une seule fois · TVA non applicable, art. 293 B du CGI" } },
    });
  }
  return appel<SessionCheckout>(
    "POST",
    "/checkout/sessions",
    {
      mode: "subscription",
      customer_email: args.email,
      client_reference_id: args.venteId,
      line_items: lignes,
      locale: "fr",
      billing_address_collection: "required",
      subscription_data: {
        description: `${args.libelleOffre} — ${args.garageNom} (${args.numero})`,
        metadata: { vente_id: args.venteId, numero: args.numero, garage: args.garageNom.slice(0, 200) },
      },
      metadata: { vente_id: args.venteId, numero: args.numero },
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      allow_promotion_codes: false,
    },
    `checkout-${args.venteId}-${Date.now()}`
  );
}

export async function lireSession(id: string): Promise<SessionCheckout> {
  return appel<SessionCheckout>("GET", `/checkout/sessions/${encodeURIComponent(id)}`);
}

export type AbonnementStripe = { id: string; status: string; customer: string; current_period_start: number; current_period_end: number; cancel_at_period_end: boolean; metadata?: Record<string, string> };
export async function lireAbonnement(id: string): Promise<AbonnementStripe> {
  return appel<AbonnementStripe>("GET", `/subscriptions/${encodeURIComponent(id)}`);
}
export async function resilierAbonnement(id: string, finDePeriode = true): Promise<AbonnementStripe> {
  if (finDePeriode) return appel<AbonnementStripe>("POST", `/subscriptions/${encodeURIComponent(id)}`, { cancel_at_period_end: true });
  return appel<AbonnementStripe>("DELETE", `/subscriptions/${encodeURIComponent(id)}`);
}

export type FactureStripe = {
  id: string; status: string; customer: string | null; hosted_invoice_url: string | null; invoice_pdf: string | null;
  amount_paid: number; amount_due: number; period_start: number; period_end: number; billing_reason?: string | null;
  /** Versions d'API < 2025-03-31 : identifiant de l'abonnement directement sur la facture. */
  subscription?: string | { id: string } | null;
  /** Versions d'API ≥ 2025-03-31 (basil, endive…) : l'abonnement est porté par `parent`. */
  parent?: { type?: string; subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
  lines?: {
    data: {
      period?: { start: number; end: number };
      price?: { recurring?: { interval?: string } | null } | null;
      pricing?: { type?: string; price_details?: { price?: string; product?: string } | null } | null;
      parent?: { type?: string; subscription_item_details?: { subscription?: string | null } | null } | null;
    }[];
  };
};

/** Identifiant de l'abonnement d'une facture, quelle que soit la version d'API du webhook. */
export function abonnementDeFacture(f: FactureStripe): string | null {
  const brut = f.parent?.subscription_details?.subscription ?? f.subscription ?? f.lines?.data?.find((l) => l.parent?.subscription_item_details?.subscription)?.parent?.subscription_item_details?.subscription ?? null;
  if (!brut) return null;
  return typeof brut === "string" ? brut : brut.id || null;
}

export type EvenementStripe = { id: string; type: string; created: number; data: { object: Record<string, unknown> } };

/**
 * Vérifie la signature `Stripe-Signature` (t=…,v1=…) : HMAC-SHA256 du
 * « t.corps » avec le secret du webhook, tolérance 5 minutes.
 */
export function verifierSignatureWebhook(corps: string, enTete: string | null, secret = process.env.STRIPE_WEBHOOK_SECRET || ""): EvenementStripe {
  if (!secret) throw new ErreurStripe("STRIPE_WEBHOOK_SECRET manquant.", 503);
  if (!enTete) throw new ErreurStripe("Signature absente.", 400);
  const parts = Object.fromEntries(enTete.split(",").map((p) => p.split("=").map((s) => s.trim()) as [string, string]));
  const t = parts.t;
  const v1 = enTete.split(",").filter((p) => p.trim().startsWith("v1=")).map((p) => p.trim().slice(3));
  if (!t || !v1.length) throw new ErreurStripe("Signature mal formée.", 400);
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) throw new ErreurStripe("Signature expirée.", 400);
  const attendu = createHmac("sha256", secret).update(`${t}.${corps}`, "utf8").digest("hex");
  const ok = v1.some((s) => s.length === attendu.length && timingSafeEqual(Buffer.from(s, "hex"), Buffer.from(attendu, "hex")));
  if (!ok) throw new ErreurStripe("Signature invalide.", 400);
  try {
    return JSON.parse(corps) as EvenementStripe;
  } catch {
    throw new ErreurStripe("Corps illisible.", 400);
  }
}
