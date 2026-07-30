import { NextResponse } from "next/server";
import { envoyerEmailServeur, MailAttachment } from "@/lib/mailer";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { getAdminClient } from "@/lib/supabaseAdmin";

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
    dossierId?: string | null; // journalisation serveur (table emails)
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  // ---------- Validation des entrées ----------
  const adresses = (s?: string) =>
    (s || "").split(",").map((a) => a.trim()).filter(Boolean);
  const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

  const to = adresses(body.to);
  const bcc = adresses(body.bcc);
  if (to.length === 0 && bcc.length === 0) {
    return NextResponse.json({ error: "Aucun destinataire." }, { status: 400 });
  }
  if (to.length + bcc.length > 50) {
    return NextResponse.json({ error: "Trop de destinataires (50 maximum)." }, { status: 400 });
  }
  const invalide = [...to, ...bcc].find((a) => !EMAIL_RE.test(a));
  if (invalide) {
    return NextResponse.json({ error: `Adresse email invalide : ${invalide}` }, { status: 400 });
  }
  if ((body.subject || "").length > 500) {
    return NextResponse.json({ error: "Objet trop long (500 caractères max)." }, { status: 400 });
  }
  if ((body.html || "").length + (body.text || "").length > 500_000) {
    return NextResponse.json({ error: "Corps du message trop volumineux." }, { status: 413 });
  }
  const pj = body.attachments || [];
  if (pj.length > 20) {
    return NextResponse.json({ error: "Trop de pièces jointes (20 maximum)." }, { status: 400 });
  }
  const poidsPj = pj.reduce((s, a) => s + (a.content?.length || 0), 0);
  if (poidsPj > 20_000_000) {
    return NextResponse.json({ error: "Pièces jointes trop lourdes (15 Mo maximum au total)." }, { status: 413 });
  }

  // Expéditeur de repli (Resend) : dérivé du PROFIL du garage côté serveur,
  // jamais du body — sinon, avec une clé Resend partagée, un compte pourrait
  // émettre au nom de n'importe qui.
  let fromFallback: string | undefined;
  const admin = getAdminClient();
  if (admin) {
    const { data: ent } = await admin
      .from("entreprise")
      .select("nom,email")
      .eq("owner_id", user.id)
      .limit(1)
      .maybeSingle();
    if (ent?.email) {
      fromFallback = ent.nom ? `"${ent.nom}" <${ent.email}>` : ent.email;
    }
  }

  const result = await envoyerEmailServeur(
    {
      to: to.join(", "),
      bcc: bcc.length ? bcc.join(", ") : undefined,
      subject: body.subject || "",
      html: body.html,
      text: body.text,
      fromFallback,
      replyTo: body.replyTo,
      attachments: body.attachments,
    },
    user.id // config SMTP du garage connecté
  );

  // JOURNALISATION CÔTÉ SERVEUR : l'envoi et sa trace sont liés. Avant, le
  // journal était écrit par le navigateur APRÈS la réponse — un onglet fermé
  // au mauvais moment laissait un email parti sans aucune trace.
  if (admin) {
    const { error: eJournal } = await admin.from("emails").insert({
      dossier_id: body.dossierId || null,
      destinataire: to.join(", "),
      objet: body.subject || "",
      corps: body.text || "",
      statut: result.ok ? "envoye" : "echec",
      erreur: result.ok ? null : result.error || null,
      owner_id: user.id,
    });
    if (eJournal) console.error("send-email: journal non écrit:", eJournal.message);
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status || 500 });
  }
  return NextResponse.json({ ok: true, via: result.via });
}
