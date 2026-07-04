import { NextResponse } from "next/server";
import { envoyerEmailServeur, MailAttachment } from "@/lib/mailer";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // SÉCURITÉ : envoi réservé aux utilisateurs connectés (sinon la route
  // serait un relais de spam ouvert sur internet).
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });
  let body: {
    to?: string;
    bcc?: string;
    from?: string;
    replyTo?: string;
    subject?: string;
    html?: string;
    text?: string;
    attachments?: MailAttachment[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const result = await envoyerEmailServeur(
    {
      to: body.to || "",
      bcc: body.bcc || undefined,
      subject: body.subject || "",
      html: body.html,
      text: body.text,
      fromFallback: body.from,
      replyTo: body.replyTo,
      attachments: body.attachments,
    },
    user.id // config SMTP du garage connecté
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status || 500 });
  }
  return NextResponse.json({ ok: true, via: result.via });
}
