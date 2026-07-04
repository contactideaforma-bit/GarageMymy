import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { envoyerEmailServeur } from "@/lib/mailer";
import { templateRelance, totalPaye, resteAPayer } from "@/lib/paiements";

// RELANCES AUTOMATIQUES (cron quotidien planifié dans vercel.json).
// Pour chaque facture : échéance dépassée + reste à payer + dossier avec
// relance_auto activé + email assureur connu + pas de relance depuis 7 jours
// + moins de 2 relances déjà faites → envoi automatique de la relance n°1 ou
// n°2 à l'assureur. La MISE EN DEMEURE (n°3) reste toujours manuelle.

export const runtime = "nodejs";
export const maxDuration = 60;

const DELAI_ENTRE_RELANCES_JOURS = 7;
const MAX_RELANCES_AUTO = 2;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function executer(req: Request) {
  // Protection : si CRON_SECRET est défini, l'appel doit le fournir
  // (Vercel Cron envoie automatiquement "Authorization: Bearer <CRON_SECRET>").
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY manquante : relances auto indisponibles." },
      { status: 500 }
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString().slice(0, 10);

  // Factures échues (toutes, service role : on filtre ensuite par dossier)
  const { data: docs, error: e1 } = await admin
    .from("documents")
    .select("*")
    .eq("type", "facture")
    .not("date_echeance", "is", null)
    .lt("date_echeance", todayIso);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  const factures = docs || [];
  if (factures.length === 0) return NextResponse.json({ ok: true, examinees: 0, envoyees: 0 });

  const docIds = factures.map((f) => f.id);
  const dossierIds = Array.from(new Set(factures.map((f) => f.dossier_id).filter(Boolean)));

  const [dossiersRes, paiementsRes, relancesRes] = await Promise.all([
    admin.from("dossiers").select("*").in("id", dossierIds),
    admin.from("paiements").select("*").in("document_id", docIds),
    admin.from("relances").select("*").in("document_id", docIds).order("date_relance", { ascending: false }),
  ]);
  const dossiers = dossiersRes.data || [];
  const paiements = paiementsRes.data || [];
  const relances = relancesRes.data || [];

  let envoyees = 0;
  const details: string[] = [];

  for (const f of factures) {
    const dossier = dossiers.find((d) => d.id === f.dossier_id);
    if (!dossier || !dossier.relance_auto || !dossier.assureur_email) continue;

    const paye = totalPaye(paiements.filter((p) => p.document_id === f.id));
    const reste = resteAPayer(f.total_ttc, paye);
    if (reste <= 0) continue;

    const rels = relances.filter((r) => r.document_id === f.id);
    if (rels.length >= MAX_RELANCES_AUTO) continue; // la mise en demeure reste manuelle
    const derniere = rels[0]?.date_relance ? new Date(rels[0].date_relance) : null;
    if (derniere && (today.getTime() - derniere.getTime()) / 86400000 < DELAI_ENTRE_RELANCES_JOURS) continue;

    const niveau = rels.length + 1;
    const { subject, body } = templateRelance(niveau, f, dossier);
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.5">${escapeHtml(
      body
    ).replace(/\n/g, "<br>")}</div>`;

    // Config SMTP DU garage propriétaire de la facture (multi-garages)
    const res = await envoyerEmailServeur(
      { to: dossier.assureur_email, subject, text: body, html },
      f.owner_id
    );

    // Journalisation (owner_id EXPLICITE : le service role n'a pas d'auth.uid())
    await admin.from("emails").insert({
      dossier_id: dossier.id,
      destinataire: dossier.assureur_email,
      objet: subject,
      corps: body,
      statut: res.ok ? "envoye" : "echec",
      erreur: res.ok ? null : res.error || null,
      owner_id: f.owner_id,
    });
    if (res.ok) {
      await admin.from("relances").insert({
        dossier_id: dossier.id,
        document_id: f.id,
        date_relance: todayIso,
        canal: "email",
        notes: `Relance automatique n°${niveau}`,
        owner_id: f.owner_id,
      });
      envoyees++;
      details.push(`${f.numero || f.id} → relance n°${niveau} (${dossier.assureur_email})`);
    } else {
      details.push(`${f.numero || f.id} → ÉCHEC : ${res.error}`);
    }
  }

  return NextResponse.json({ ok: true, examinees: factures.length, envoyees, details });
}

export async function GET(req: Request) {
  return executer(req);
}
export async function POST(req: Request) {
  return executer(req);
}
