// Envoi d'email CÔTÉ SERVEUR (routes API uniquement — ne pas importer côté client).
// Logique partagée entre /api/send-email (envois manuels) et
// /api/relances-auto (cron) : SMTP configuré dans l'appli en priorité,
// repli Resend si présent.

import nodemailer from "nodemailer";
import { getAdminClient } from "./supabaseAdmin";

export type MailAttachment = { filename: string; content: string }; // base64

export type MailInput = {
  to: string; // une ou plusieurs adresses séparées par des virgules
  bcc?: string; // copie cachée (CCI), même format
  subject: string;
  html?: string;
  text?: string;
  fromFallback?: string; // utilisé pour Resend si RESEND_FROM absent
  replyTo?: string;
  attachments?: MailAttachment[];
};

export async function envoyerEmailServeur(
  input: MailInput,
  ownerId?: string // config SMTP DU garage concerné (sécurité multi-garages)
): Promise<{ ok: boolean; via?: string; error?: string; status?: number }> {
  const to = (input.to || "").trim();
  if (!to) return { ok: false, error: "Destinataire manquant.", status: 400 };

  // 1) SMTP configuré dans l'appli (boîte du garage appelant)
  const admin = getAdminClient();
  if (admin) {
    let query = admin.from("mail_config").select("*");
    if (ownerId) query = query.eq("owner_id", ownerId);
    const { data: cfg } = await query.limit(1).maybeSingle();
    if (cfg && cfg.smtp_host && cfg.smtp_user && cfg.smtp_pass) {
      const from =
        cfg.from_name && cfg.from_email
          ? `"${cfg.from_name}" <${cfg.from_email}>`
          : cfg.from_email || cfg.smtp_user;
      try {
        const transporter = nodemailer.createTransport({
          host: cfg.smtp_host,
          port: Number(cfg.smtp_port) || 587,
          secure: Boolean(cfg.smtp_secure),
          auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
        });
        await transporter.sendMail({
          from,
          to,
          bcc: input.bcc || undefined,
          replyTo: input.replyTo || cfg.from_email || undefined,
          subject: input.subject,
          html: input.html || undefined,
          text: input.text || undefined,
          attachments: (input.attachments || []).map((a) => ({
            filename: a.filename,
            content: a.content,
            encoding: "base64",
          })),
        });
        return { ok: true, via: "smtp" };
      } catch (err: unknown) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Échec de l'envoi SMTP.",
          status: 502,
        };
      }
    }
  }

  // 2) Repli : Resend
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      error:
        "Aucune méthode d'envoi configurée. Renseigne le SMTP dans Profil du garage > Envoi des emails (ou une clé Resend).",
    };
  }
  const from = (process.env.RESEND_FROM || input.fromFallback || "").trim();
  if (!from) {
    return {
      ok: false,
      status: 400,
      error: "Expéditeur manquant : renseigne RESEND_FROM ou l'email du profil.",
    };
  }
  const payload: Record<string, unknown> = {
    from,
    to: to.split(",").map((t) => t.trim()).filter(Boolean),
    ...(input.bcc
      ? { bcc: input.bcc.split(",").map((t) => t.trim()).filter(Boolean) }
      : {}),
    subject: input.subject,
    html: input.html || undefined,
    text: input.text || undefined,
  };
  if (input.replyTo) payload.reply_to = input.replyTo;
  if (input.attachments?.length) payload.attachments = input.attachments;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = (data && (data.message || data.error)) || `Erreur Resend (HTTP ${res.status}).`;
      return { ok: false, error: String(message), status: res.status };
    }
    return { ok: true, via: "resend" };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Échec de l'envoi.",
      status: 502,
    };
  }
}
