import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { envoyerEmailServeur } from "@/lib/mailer";
import { comptesAdmin, emailsAdminServeur } from "@/lib/supportServeur";

// ============================================================
//  FORMULAIRE DE CONTACT DU SITE (v9.4) — route PUBLIQUE, sans compte.
//
//  1. Contrôles : champs obligatoires, email plausible, piège à robots,
//     taille bornée, 5 envois max par heure et par adresse IP.
//  2. Enregistrement dans `messages_contact` (migration v51) — c'est la
//     trace de référence, même si l'email échoue.
//  3. Email à l'éditeur (ADMIN_EMAILS, sinon contact@myeasyauto.fr) via
//     la config SMTP du compte admin, repli Resend. Best-effort.
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 20;

const MAX_PAR_HEURE = 5;
const compteurs = new Map<string, { n: number; depuis: number }>();

function tropDeDemandes(ip: string): boolean {
  const maintenant = Date.now();
  const c = compteurs.get(ip);
  if (!c || maintenant - c.depuis > 3_600_000) {
    compteurs.set(ip, { n: 1, depuis: maintenant });
    return false;
  }
  c.n += 1;
  return c.n > MAX_PAR_HEURE;
}

function texte(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function echapper(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  // Piège à robots : un humain ne voit pas ce champ.
  if (texte(body.site, 10)) return NextResponse.json({ ok: true });

  const nom = texte(body.nom, 120);
  const email = texte(body.email, 160).toLowerCase();
  const telephone = texte(body.telephone, 40);
  const garage = texte(body.garage, 160);
  const message = texte(body.message, 4000);

  if (!nom || !email || !message) {
    return NextResponse.json({ error: "Nom, email et message sont obligatoires." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: "L'adresse email semble incorrecte." }, { status: 400 });
  }

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "inconnue";
  if (tropDeDemandes(ip)) {
    return NextResponse.json(
      { error: "Trop de messages envoyés depuis cette connexion. Réessayez dans une heure." },
      { status: 429 }
    );
  }

  const admin = getAdminClient();
  let enregistre = false;
  if (admin) {
    const { error } = await admin.from("messages_contact").insert({
      nom,
      email,
      telephone: telephone || null,
      garage: garage || null,
      message,
      ip,
      user_agent: (req.headers.get("user-agent") || "").slice(0, 300),
    });
    enregistre = !error;
    if (error) console.error("[contact] enregistrement impossible :", error.message);
  }

  // Email à l'éditeur — expéditeur : le premier compte admin (sa config SMTP).
  let envoye = false;
  if (admin) {
    const comptes = await comptesAdmin(admin);
    const expediteurId = comptes[0]?.id;
    if (expediteurId) {
      const lignes = [
        `Nom : ${nom}`,
        `Email : ${email}`,
        `Téléphone : ${telephone || "—"}`,
        `Garage : ${garage || "—"}`,
        "",
        message,
      ];
      const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#1e2233">
<h2 style="margin:0 0 12px">Nouveau message depuis myeasyauto.fr</h2>
<table style="border-collapse:collapse">
<tr><td style="padding:2px 12px 2px 0;color:#666">Nom</td><td>${echapper(nom)}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#666">Email</td><td><a href="mailto:${echapper(email)}">${echapper(email)}</a></td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#666">Téléphone</td><td>${echapper(telephone || "—")}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#666">Garage</td><td>${echapper(garage || "—")}</td></tr>
</table>
<p style="white-space:pre-wrap;margin-top:16px;padding:12px;background:#f6f7fb;border-radius:8px">${echapper(message)}</p>
<p style="color:#999;font-size:12px">IP ${echapper(ip)}</p></div>`;
      const res = await envoyerEmailServeur(
        {
          to: emailsAdminServeur().join(","),
          subject: `[myeasyauto.fr] Contact — ${nom}${garage ? ` (${garage})` : ""}`,
          html,
          text: lignes.join("\n"),
          replyTo: email,
        },
        expediteurId
      );
      envoye = res.ok;
      if (!res.ok) console.error("[contact] email non envoyé :", res.error);
    }
  }

  if (!enregistre && !envoye) {
    return NextResponse.json(
      { error: "Le service de contact est momentanément indisponible." },
      { status: 503 }
    );
  }
  return NextResponse.json({ ok: true, enregistre, envoye });
}
