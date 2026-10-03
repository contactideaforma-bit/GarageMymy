import { NextResponse } from "next/server";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { envoyerEmailServeur, MailAttachment } from "@/lib/mailer";
import { CHAMPS_DECLARATION, InfosDeclaration, construireEmail, manquants } from "@/lib/declarationExperts";

// ============================================================
//  DÉCLARATION DU GARAGE AUPRÈS DES EXPERTS (v13.40)
//  POST { destinataires: [{ expert_id?, email, cabinet, expert_nom }],
//         sujet, intro, avecKbis, test? }
//  → un email PERSONNALISÉ par cabinet (jamais de liste visible des autres
//    cabinets), depuis la boîte du garage (SMTP de son compte), HTML à sa
//    charte (logo) + Kbis en pièce jointe. Lots de 15 maximum par appel :
//    le navigateur enchaîne les lots et affiche la progression.
//  test = true → un seul envoi, à l'adresse du garage, sans journal.
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 60;

type Dest = { expert_id?: string | null; email: string; cabinet: string | null; expert_nom: string | null };
const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "Service non configuré." }, { status: 500 });

  let body: { destinataires?: Dest[]; sujet?: string; intro?: string; avecKbis?: boolean; test?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }); }

  const { data: ent, error: eEnt } = await admin.from("entreprise").select("*").eq("owner_id", user.id).limit(1).maybeSingle();
  if (eEnt) return NextResponse.json({ error: `Profil illisible (migration v97 ?) : ${eEnt.message}` }, { status: 500 });
  if (!ent) return NextResponse.json({ error: "Complète d'abord le profil du garage." }, { status: 400 });
  const infos = Object.fromEntries([...CHAMPS_DECLARATION, "signature_mail"].map((k) => [k, (ent as Record<string, unknown>)[k] ?? null])) as unknown as InfosDeclaration;
  const m = manquants(infos);
  if (m.bloquants.length) return NextResponse.json({ error: `Il manque ${m.bloquants.join(", ")} (étape 1 de l'assistant).` }, { status: 400 });

  const sujet = txt(body.sujet, 200);
  const intro = txt(body.intro, 3000);
  if (!sujet || !intro) return NextResponse.json({ error: "Objet et message obligatoires." }, { status: 400 });

  // Logo : bucket public « entreprise » → URL directe dans l'email.
  const logoUrl = ent.logo_path ? admin.storage.from("entreprise").getPublicUrl(ent.logo_path).data.publicUrl : null;

  // Kbis : bucket PRIVÉ, lu côté serveur et joint en PDF.
  let pj: MailAttachment[] | undefined;
  const avecKbis = Boolean(body.avecKbis && ent.kbis_path);
  if (avecKbis) {
    const { data: f, error: eF } = await admin.storage.from("prive").download(ent.kbis_path);
    if (eF || !f) return NextResponse.json({ error: "Kbis illisible : redépose-le à l'étape 1." }, { status: 400 });
    const buf = Buffer.from(await f.arrayBuffer());
    if (buf.length > 6_000_000) return NextResponse.json({ error: "Kbis trop lourd (6 Mo maximum)." }, { status: 413 });
    const nomFichier = `Kbis_${String(ent.nom || "garage").replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 40)}.pdf`;
    pj = [{ filename: nomFichier, content: buf.toString("base64") }];
  }

  const fromFallback = ent.email ? (ent.nom ? `"${ent.nom}" <${ent.email}>` : ent.email) : undefined;

  // ---- ENVOI TEST : à soi-même
  if (body.test) {
    const to = String(ent.email || user.email || "");
    if (!EMAIL_RE.test(to)) return NextResponse.json({ error: "Aucune adresse email valide sur le profil pour le test." }, { status: 400 });
    const { html, text } = construireEmail(infos, { cabinet: "Cabinet exemple", expert_nom: null }, { intro, logoUrl, avecKbis });
    const r = await envoyerEmailServeur({ to, subject: `[TEST] ${sujet}`, html, text, attachments: pj, fromFallback }, user.id);
    if (!r.ok) return NextResponse.json({ error: r.error || "Envoi impossible." }, { status: r.status || 502 });
    return NextResponse.json({ ok: true, envoyes: 1, echecs: 0, resultats: [{ email: to, ok: true }] });
  }

  const dests = (Array.isArray(body.destinataires) ? body.destinataires : [])
    .map((d) => ({ expert_id: d.expert_id || null, email: txt(d.email, 200).toLowerCase(), cabinet: txt(d.cabinet, 200) || null, expert_nom: txt(d.expert_nom, 120) || null }))
    .filter((d) => EMAIL_RE.test(d.email));
  if (!dests.length) return NextResponse.json({ error: "Aucun destinataire valide." }, { status: 400 });
  if (dests.length > 15) return NextResponse.json({ error: "15 cabinets maximum par lot." }, { status: 400 });

  const resultats: { email: string; cabinet: string | null; ok: boolean; erreur?: string }[] = [];
  for (const d of dests) {
    const { html, text } = construireEmail(infos, d, { intro, logoUrl, avecKbis });
    const r = await envoyerEmailServeur({ to: d.email, subject: sujet, html, text, attachments: pj, fromFallback, replyTo: ent.email || undefined }, user.id);
    resultats.push({ email: d.email, cabinet: d.cabinet, ok: r.ok, erreur: r.ok ? undefined : r.error || "erreur" });
    await admin.from("emails").insert({
      dossier_id: null, destinataire: d.email, objet: sujet, corps: text, statut: r.ok ? "envoye" : "echec", erreur: r.ok ? null : r.error || null, owner_id: user.id,
    });
    if (r.ok && d.expert_id) {
      await admin.from("experts").update({ declaration_envoyee_le: new Date().toISOString() }).eq("id", d.expert_id).eq("owner_id", user.id);
    }
  }
  const envoyes = resultats.filter((r) => r.ok).length;
  await admin.from("declarations_experts").insert({ owner_id: user.id, sujet, envoyes, echecs: resultats.length - envoyes, details: resultats });
  return NextResponse.json({ ok: true, envoyes, echecs: resultats.length - envoyes, resultats });
}
