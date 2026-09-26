// ====================================================================
//  QONTO — liens de paiement (côté SERVEUR uniquement), v13.28.
//
//  Auth par clé API : en-tête « Authorization: <login>:<clé secrète> »
//  (Qonto → Intégrations et partenariats → Clé API). Les liens de paiement
//  doivent être activés dans Qonto (connexion Mollie, faite une fois dans
//  l'appli Qonto). Env :
//    QONTO_LOGIN, QONTO_SECRET_KEY
//    QONTO_ENV=sandbox (+ QONTO_STAGING_TOKEN) pour tester
// ====================================================================

const BASE =
  process.env.QONTO_ENV === "sandbox"
    ? process.env.QONTO_SANDBOX_URL || "https://thirdparty-sandbox.staging.qonto.co/v2"
    : process.env.QONTO_API_URL || "https://thirdparty.qonto.com/v2";

export function qontoConfigure(): boolean {
  return Boolean(process.env.QONTO_LOGIN && process.env.QONTO_SECRET_KEY);
}

export class ErreurQonto extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

async function appel<T>(chemin: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  if (!qontoConfigure()) throw new ErreurQonto("Paiement en ligne pas encore activé (clé API Qonto manquante).", 503);
  const headers: Record<string, string> = {
    Authorization: `${process.env.QONTO_LOGIN}:${process.env.QONTO_SECRET_KEY}`,
    Accept: "application/json",
  };
  if (process.env.QONTO_ENV === "sandbox" && process.env.QONTO_STAGING_TOKEN) {
    headers["X-Qonto-Staging-Token"] = process.env.QONTO_STAGING_TOKEN;
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
