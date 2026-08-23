import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { envoyerEmailServeur } from "@/lib/mailer";
import { envoyerPush } from "@/lib/pushServeur";
import { comptesAdmin, emailsAdminServeur, emailHtml } from "@/lib/supportServeur";
import { Ticket } from "@/lib/types";

// ============================================================
//  NOTIFICATION D'UN NOUVEAU TICKET (v43)
//
//  Appelée par le garage juste après la création (ou la relance) d'un
//  ticket. Prévient l'éditeur sur DEUX canaux :
//    · email vers ADMIN_EMAILS (avec tout le contexte technique) ;
//    · notification push sur ses appareils (système v42).
//
//  Best-effort : si l'email ou le push échoue, le ticket reste enregistré
//  et visible sur la page /support/admin.
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Service non configuré côté serveur (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }

  let body: { ticketId?: string; relance?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  if (!body.ticketId) {
    return NextResponse.json({ error: "Ticket manquant." }, { status: 400 });
  }

  // Le ticket doit appartenir à l'appelant : personne ne déclenche une
  // notification sur le ticket d'un autre garage.
  const { data, error } = await admin
    .from("tickets")
    .select("*")
    .eq("id", body.ticketId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Ticket introuvable." }, { status: 404 });
  }
  const ticket = data as Ticket;

  const gravite =
    ticket.gravite === "bloquant" ? "BLOQUANT" : ticket.gravite === "gene" ? "Gênant" : "Mineur";
  const titre = body.relance
    ? `Nouveau message — ${ticket.numero || "ticket"}`
    : `Nouveau ticket ${gravite} — ${ticket.numero || ""}`;

  const lignes = [
    `Garage : ${ticket.garage_nom || "—"} (${user.email || "compte sans email"})`,
    `Gravité : ${gravite}`,
    `Catégorie : ${ticket.categorie}`,
    `Page concernée : ${ticket.page || "—"}`,
    `Version : ${ticket.version_app || "—"}`,
    `Navigateur : ${ticket.navigateur || "—"}`,
    `Rappeler au : ${ticket.contact_tel || "—"} · ${ticket.contact_email || "—"}`,
  ];

  // ---------- 1. Email vers l'éditeur ----------
  const destinataires = emailsAdminServeur().join(",");
  const comptes = await comptesAdmin(admin);
  // Expéditeur : le compte admin (sa config SMTP, sinon repli Resend).
  const expediteurId = comptes[0]?.id || user.id;
  let mail: { ok: boolean; error?: string } = { ok: false, error: "non tenté" };
  try {
    mail = await envoyerEmailServeur(
      {
        to: destinataires,
        subject: `[My Easy Auto] ${titre} — ${ticket.sujet}`,
        html: emailHtml(ticket.sujet, lignes, ticket.description),
        text: `${titre}\n\n${lignes.join("\n")}\n\n${ticket.description}`,
        replyTo: ticket.contact_email || user.email || undefined,
      },
      expediteurId
    );
  } catch (e) {
    mail = { ok: false, error: e instanceof Error ? e.message : "échec email" };
  }

  // ---------- 2. Notification push vers l'éditeur ----------
  let pushes = 0;
  for (const c of comptes) {
    try {
      const r = await envoyerPush(admin, c.id, {
        titre: body.relance ? "Nouveau message sur un ticket" : `Ticket ${gravite}`,
        corps: `${ticket.garage_nom || "Un garage"} : ${ticket.sujet}`,
        url: "/support/admin",
        tag: `ticket-${ticket.id}`,
        persistante: ticket.gravite === "bloquant",
      });
      pushes += r.envoyes;
    } catch {
      /* best-effort */
    }
  }

  return NextResponse.json({
    ok: true,
    email: mail.ok,
    emailErreur: mail.ok ? null : mail.error || null,
    push: pushes,
  });
}
