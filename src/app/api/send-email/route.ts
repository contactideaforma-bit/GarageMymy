import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getAdminClient } from "@/lib/supabaseAdmin";

type Attachment = { filename: string; content: string }; // content = base64

export async function POST(req: Request) {
  let body: {
    to?: string;
    from?: string;
    replyTo?: string;
    subject?: string;
    html?: string;
    text?: string;
    attachments?: Attachment[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const to = (body.to || "").trim();
  const subject = body.subject || "";
  if (!to) return NextResponse.json({ error: "Destinataire manquant." }, { status: 400 });

  // 1) Méthode prioritaire : SMTP configuré dans l'appli (boîte du garage)
  const admin = getAdminClient();
  if (admin) {
    const { data: cfg } = await admin.from("mail_config").select("*").limit(1).maybeSingle();
    if (cfg && cfg.smtp_host && cfg.smtp_user && cfg.smtp_pass) {
      const from =
        cfg.from_name && cfg.from_email
          ? `"${cfg.from_name}" <${cfg.from_email}>`
          : cfg.from_email || cfg.smtp_user;
      try {
        const transporter = nodemailer.createTransport({
          host: cfg.smtp_host,
          port: Number(cfg.smtp_port) || 587,
          secure: Boolean(cfg.smtp_secure), // true = 465
          auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
        });
        await transporter.sendMail({
          from,
          to,
          replyTo: cfg.from_email || undefined,
          subject,
          html: body.html || undefined,
          text: body.text || undefined,
          attachments: (body.attachments || []).map((a) => ({
            filename: a.filename,
            content: a.content,
            encoding: "base64",
          })),
        });
        return NextResponse.json({ ok: true, via: "smtp" });
      } catch (err: unknown) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Échec de l'envoi SMTP." },
          { status: 502 }
        );
      }
    }
  }

  // 2) Repli : Resend (si une clé est présente)
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Aucune méthode d'envoi configurée. Renseigne le SMTP dans Profil du garage > Envoi des emails (ou une clé Resend).",
      },
      { status: 500 }
    );
  }

  const from = (process.env.RESEND_FROM || body.from || "").trim();
  if (!from)
    return NextResponse.json(
      { error: "Expéditeur manquant : renseigne RESEND_FROM ou l'email du profil." },
      { status: 400 }
    );

  const payload: Record<string, unknown> = {
    from,
    to: [to],
    subject,
    html: body.html || undefined,
    text: body.text || undefined,
  };
  if (body.replyTo) payload.reply_to = body.replyTo;
  if (body.attachments?.length) payload.attachments = body.attachments;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = (data && (data.message || data.error)) || `Erreur Resend (HTTP ${res.status}).`;
      return NextResponse.json({ error: String(message) }, { status: res.status });
    }
    return NextResponse.json({ ok: true, via: "resend", id: data?.id ?? null });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Échec de l'envoi." },
      { status: 502 }
    );
  }
}
