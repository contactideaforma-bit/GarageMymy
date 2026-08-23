import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { envoyerEmailServeur } from "@/lib/mailer";
import { envoyerPush } from "@/lib/pushServeur";
import { annuaireComptes, estAdminServeur, emailHtml } from "@/lib/supportServeur";
import { Ticket, TicketMessage } from "@/lib/types";

// ============================================================
//  CONSOLE D'ASSISTANCE DE L'ÉDITEUR (v43)
//
//  GET            → tous les tickets, tous garages confondus.
//  GET ?id=<uuid> → un ticket + son fil de discussion.
//  POST           → répondre et/ou changer le statut ; le garage est
//                   prévenu (notification push + email).
//
//  SÉCURITÉ : ces tickets appartiennent à d'AUTRES comptes ; les
//  politiques RLS `owner` les rendraient invisibles. On passe donc par la
//  clé service role, MAIS uniquement après avoir vérifié que l'appelant
//  fait partie de ADMIN_EMAILS. Sans cette vérification, la route serait
//  une fuite de données entre garages.
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 30;

const REFUS = { error: "Accès réservé à l'éditeur de l'application." };

type Garde =
  | { erreur: NextResponse; user: null; admin: null }
  | { erreur: null; user: { id: string; email: string | null }; admin: SupabaseClient };

async function garde(req: Request): Promise<Garde> {
  const vide = { user: null, admin: null } as const;
  const user = await utilisateurDepuisRequete(req);
  if (!user) return { erreur: NextResponse.json(REPONSE_401, { status: 401 }), ...vide };
  if (!estAdminServeur(user.email)) {
    return { erreur: NextResponse.json(REFUS, { status: 403 }), ...vide };
  }
  const admin = getAdminClient();
  if (!admin) {
    return {
      erreur: NextResponse.json(
        { error: "Service non configuré (SUPABASE_SERVICE_ROLE_KEY)." },
        { status: 500 }
      ),
      ...vide,
    };
  }
  return { erreur: null, user, admin };
}

export async function GET(req: Request) {
  const g = await garde(req);
  if (g.erreur) return g.erreur;
  const { admin } = g;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id) {
    const { data, error } = await admin.from("tickets").select("*").eq("id", id).maybeSingle();
    if (error || !data) return NextResponse.json({ error: "Ticket introuvable." }, { status: 404 });
    const { data: msgs } = await admin
      .from("ticket_messages")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });
    // Ouvrir un ticket vaut lecture.
    await admin.from("tickets").update({ lu_admin: true }).eq("id", id);
    return NextResponse.json({
      ticket: { ...(data as Ticket), lu_admin: true },
      messages: (msgs as TicketMessage[]) || [],
    });
  }

  const { data, error } = await admin
    .from("tickets")
    .select("*")
    .order("maj_le", { ascending: false })
    .limit(500);
  if (error) {
    return NextResponse.json(
      { error: "Table `tickets` absente : exécute la migration v43." },
      { status: 500 }
    );
  }

  const tickets = (data as Ticket[]) || [];
  const comptes = await annuaireComptes(admin);
  const { data: ents } = await admin.from("entreprise").select("owner_id,nom,tel,email");
  const parOwner = new Map<string, { nom?: string; tel?: string; email?: string }>();
  for (const e of (ents as { owner_id: string; nom?: string; tel?: string; email?: string }[]) || []) {
    parOwner.set(e.owner_id, e);
  }

  return NextResponse.json({
    tickets: tickets.map((t) => ({
      ...t,
      compte_email: comptes.get(t.owner_id || "") || null,
      entreprise_nom: parOwner.get(t.owner_id || "")?.nom || t.garage_nom || null,
    })),
  });
}

export async function POST(req: Request) {
  const g = await garde(req);
  if (g.erreur) return g.erreur;
  const { admin, user } = g;

  let body: { ticketId?: string; statut?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  if (!body.ticketId) return NextResponse.json({ error: "Ticket manquant." }, { status: 400 });

  const { data, error } = await admin
    .from("tickets")
    .select("*")
    .eq("id", body.ticketId)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Ticket introuvable." }, { status: 404 });
  const ticket = data as Ticket;

  const message = (body.message || "").trim();
  const statut = body.statut && ["nouveau", "en_cours", "resolu", "ferme"].includes(body.statut)
    ? body.statut
    : null;

  // ---------- 1. Réponse dans le fil ----------
  let ligne: TicketMessage | null = null;
  if (message) {
    const { data: m, error: e2 } = await admin
      .from("ticket_messages")
      .insert({
        ticket_id: ticket.id,
        auteur: "support",
        auteur_nom: "Assistance My Easy Auto",
        message,
        // La ligne doit rester lisible par le GARAGE (politique owner).
        owner_id: ticket.owner_id,
      })
      .select("*")
      .single();
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    ligne = m as TicketMessage;
  }

  // ---------- 2. Statut ----------
  const maj: Record<string, unknown> = {
    maj_le: new Date().toISOString(),
    lu_admin: true,
  };
  if (message) maj.lu_garage = false;
  if (statut) {
    maj.statut = statut;
    if (statut === "ferme") maj.ferme_le = new Date().toISOString();
  }
  await admin.from("tickets").update(maj).eq("id", ticket.id);

  // ---------- 3. Prévenir le garage ----------
  if (ticket.owner_id && (message || statut)) {
    const titre = message ? "Réponse de l'assistance" : "Votre ticket a été mis à jour";
    try {
      await envoyerPush(admin, ticket.owner_id, {
        titre,
        corps: message ? message.slice(0, 120) : `Ticket ${ticket.numero || ""} : ${statut}`,
        url: "/support",
        tag: `ticket-${ticket.id}`,
      });
    } catch {
      /* best-effort */
    }
    if (ticket.contact_email && message) {
      try {
        await envoyerEmailServeur(
          {
            to: ticket.contact_email,
            subject: `[My Easy Auto] Réponse à votre demande ${ticket.numero || ""}`,
            html: emailHtml(
              ticket.sujet,
              [`Ticket : ${ticket.numero || "—"}`, `Statut : ${statut || ticket.statut}`],
              message
            ),
            text: message,
            replyTo: user.email || undefined,
          },
          user.id
        );
      } catch {
        /* best-effort */
      }
    }
  }

  return NextResponse.json({ ok: true, message: ligne, statut: statut || ticket.statut });
}
