import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { estAdminServeur } from "@/lib/supportServeur";
import { ErreurPaiement, Niveau, digestEditeur, envoyerAppel, lienPaiement, reactiverSiRegularise, relancer, situation, suspendrePourImpaye, traiterQuotidien, verifierLiens } from "@/lib/admin/paiementsServeur";
import { definirEtat } from "@/lib/admin/comptesServeur";

// ============================================================
//  SUIVI DES PAIEMENTS — espace éditeur (v13.33). Réservé ADMIN_EMAILS.
//  GET                                → situation complète
//  POST { action: "lien", mensualite_id }              → lien Qonto
//  POST { action: "relancer", mensualite_id, niveau }  → email de relance (1..4)
//  POST { action: "payee", mensualite_id, mode?, date? } → pointage + réactivation
//  POST { action: "suspendre" | "reactiver", abonnement_id }
//  POST { action: "verifier_liens" } · { action: "digest" } · { action: "cron" }
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 60;

async function garde(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return { erreur: NextResponse.json(REPONSE_401, { status: 401 }) };
  if (!estAdminServeur(user.email)) return { erreur: NextResponse.json({ error: "Accès réservé à l'éditeur." }, { status: 403 }) };
  const admin = getAdminClient();
  if (!admin) return { erreur: NextResponse.json({ error: "Service non configuré." }, { status: 500 }) };
  return { admin, user };
}

export async function GET(req: Request) {
  const g = await garde(req);
  if ("erreur" in g) return g.erreur;
  try {
    return NextResponse.json(await situation(g.admin));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? `${e.message} (migration v93 ?)` : "Lecture impossible." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const g = await garde(req);
  if ("erreur" in g) return g.erreur;
  const { admin, user } = g;
  let body: { action?: string; mensualite_id?: string; abonnement_id?: string; niveau?: number; mode?: string; date?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }); }
  const auteur = user.email || "editeur";
  try {
    switch (body.action) {
      case "lien": {
        const r = await lienPaiement(admin, body.mensualite_id || "");
        return NextResponse.json({ ok: true, ...r });
      }
      case "appel": {
        // v13.39 — appel de paiement AVANT l'échéance (email + lien + IBAN)
        const r = await envoyerAppel(admin, body.mensualite_id || "", auteur);
        return NextResponse.json(r);
      }
      case "relancer": {
        const niveau = Math.min(4, Math.max(1, Number(body.niveau) || 1)) as Niveau;
        const r = await relancer(admin, body.mensualite_id || "", niveau, auteur);
        return NextResponse.json(r);
      }
      case "payee": {
        const { data: m } = await admin.from("abonnement_mensualites").select("id,abonnement_id,notes").eq("id", body.mensualite_id || "").maybeSingle();
        if (!m) return NextResponse.json({ error: "Mensualité introuvable." }, { status: 404 });
        const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? body.date : new Date().toISOString().slice(0, 10);
        const { error } = await admin.from("abonnement_mensualites").update({ payee_le: date, mode_paiement: body.mode || null }).eq("id", m.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        const reactive = await reactiverSiRegularise(admin, m.abonnement_id);
        return NextResponse.json({ ok: true, reactive });
      }
      case "suspendre": {
        const r = await suspendrePourImpaye(admin, body.abonnement_id || "", auteur);
        return NextResponse.json(r);
      }
      case "reactiver": {
        const { data: a } = await admin.from("abonnements").select("garage_owner_id,garage_email,garage_nom").eq("id", body.abonnement_id || "").maybeSingle();
        if (!a) return NextResponse.json({ error: "Abonnement introuvable." }, { status: 404 });
        let owner = a.garage_owner_id as string | null;
        if (!owner && a.garage_email) {
          const { data: u } = await admin.auth.admin.listUsers({ perPage: 1000 });
          owner = u?.users.find((x) => (x.email || "").toLowerCase() === String(a.garage_email).toLowerCase())?.id || null;
        }
        if (!owner) return NextResponse.json({ error: "Aucun compte rattaché." }, { status: 400 });
        await definirEtat(admin, { owner_id: owner, etat: "actif", motif: null, message: null, fin_le: null, purge_le: null });
        await admin.from("paiement_relances").insert({ abonnement_id: body.abonnement_id, garage_nom: a.garage_nom, email: a.garage_email, niveau: 5, canal: "manuel", auteur, sujet: "Réactivation manuelle", ok: true });
        return NextResponse.json({ ok: true });
      }
      case "verifier_liens":
        return NextResponse.json({ ok: true, ...(await verifierLiens(admin)) });
      case "digest":
        return NextResponse.json({ ok: true, envoye: await digestEditeur(admin) });
      case "cron":
        return NextResponse.json({ ok: true, rapport: await traiterQuotidien(admin) });
      default:
        return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
    }
  } catch (e) {
    const status = e instanceof ErreurPaiement ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Opération impossible." }, { status });
  }
}
