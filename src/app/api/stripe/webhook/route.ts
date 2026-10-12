import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { ErreurStripe, verifierSignatureWebhook, type FactureStripe, type SessionCheckout } from "@/lib/stripe";
import { confirmerStripe, traiterAbonnementStripeTermine, traiterFactureStripe } from "@/lib/admin/inscriptionServeur";

// ============================================================
//  WEBHOOK STRIPE (v13.41) — https://myeasyauto.fr/api/stripe/webhook
//
//  Événements à cocher dans le tableau de bord Stripe → Développeurs →
//  Webhooks : checkout.session.completed · invoice.paid ·
//  invoice.payment_failed · customer.subscription.deleted.
//  Signature vérifiée (STRIPE_WEBHOOK_SECRET), idempotence par
//  `stripe_evenements` (un événement n'est traité qu'une fois).
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "Service non configuré." }, { status: 500 });
  const corps = await req.text();
  let evt;
  try {
    evt = verifierSignatureWebhook(corps, req.headers.get("stripe-signature"));
  } catch (e) {
    const status = e instanceof ErreurStripe ? e.status : 400;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Signature invalide." }, { status });
  }

  // Idempotence : Stripe renvoie les événements tant qu'il n'a pas reçu 200.
  const { error: eIns } = await admin.from("stripe_evenements").insert({ id: evt.id, type: evt.type });
  if (eIns) {
    if (eIns.code === "23505") return NextResponse.json({ ok: true, deja: true });
    console.error("[stripe] journal :", eIns.message); // migration v98 absente : on traite quand même
  }

  let resultat = "ignoré";
  let erreur: string | null = null;
  try {
    const objet = evt.data.object as Record<string, unknown>;
    if (evt.type === "checkout.session.completed" || evt.type === "checkout.session.async_payment_succeeded") {
      resultat = (await confirmerStripe(admin, objet as unknown as SessionCheckout)) ? "inscription activée" : "session non payée";
    } else if (evt.type === "invoice.paid" || evt.type === "invoice.payment_succeeded") {
      resultat = await traiterFactureStripe(admin, objet as unknown as FactureStripe, true);
    } else if (evt.type === "invoice.payment_failed") {
      resultat = await traiterFactureStripe(admin, objet as unknown as FactureStripe, false);
    } else if (evt.type === "customer.subscription.deleted") {
      resultat = await traiterAbonnementStripeTermine(admin, String(objet.id || ""));
    }
  } catch (e) {
    erreur = e instanceof Error ? e.message : "Erreur de traitement.";
    console.error("[stripe]", evt.type, erreur);
  }
  await admin.from("stripe_evenements").update({ traite: !erreur, erreur }).eq("id", evt.id);
  // 200 même en cas d'erreur métier : Stripe ne doit pas marteler ; l'erreur est journalisée.
  return NextResponse.json({ ok: !erreur, resultat, erreur });
}
