import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { estAdminServeur } from "@/lib/supportServeur";
import { Incident } from "@/lib/etatService";

// ============================================================
//  ÉTAT DU SERVICE (v45)
//
//  GET  → PUBLIC : incidents en cours + 20 derniers résolus.
//         Aucune authentification : la page /etat doit répondre même
//         quand le garage n'arrive plus à se connecter — c'est
//         justement à ce moment-là qu'il la consulte.
//  POST → ÉDITEUR : publier un incident, le mettre à jour, le clore.
// ============================================================

export const runtime = "nodejs";

export async function GET() {
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ actifs: [], historique: [] });

  const { data, error } = await admin
    .from("service_incidents")
    .select("*")
    .order("debut", { ascending: false })
    .limit(40);
  // Migration v45 pas encore passée : on répond « tout va bien » plutôt
  // que de faire planter le bandeau sur toutes les pages.
  if (error) return NextResponse.json({ actifs: [], historique: [] });

  const tous = (data as Incident[]) || [];
  return NextResponse.json({
    actifs: tous.filter((i) => !i.resolu),
    historique: tous.filter((i) => i.resolu).slice(0, 20),
  });
}

export async function POST(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });
  if (!estAdminServeur(user.email)) {
    return NextResponse.json({ error: "Réservé à l'éditeur." }, { status: 403 });
  }
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Service non configuré." }, { status: 500 });
  }

  let body: {
    id?: string;
    titre?: string;
    message?: string;
    niveau?: string;
    perimetre?: string;
    suivi?: string;
    resoudre?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  // ---------- Mise à jour / clôture ----------
  if (body.id) {
    const maj: Record<string, unknown> = {};
    if (body.titre) maj.titre = body.titre;
    if (body.message) maj.message = body.message;
    if (body.niveau) maj.niveau = body.niveau;
    if (body.perimetre !== undefined) maj.perimetre = body.perimetre || null;
    if (body.suivi !== undefined) maj.suivi = body.suivi || null;
    if (body.resoudre) {
      maj.resolu = true;
      maj.fin = new Date().toISOString();
    }
    const { data, error } = await admin
      .from("service_incidents")
      .update(maj)
      .eq("id", body.id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, incident: data });
  }

  // ---------- Publication ----------
  if (!body.titre || !body.message) {
    return NextResponse.json({ error: "Titre et message obligatoires." }, { status: 400 });
  }
  const { data, error } = await admin
    .from("service_incidents")
    .insert({
      titre: body.titre,
      message: body.message,
      niveau: ["info", "degrade", "panne"].includes(body.niveau || "") ? body.niveau : "info",
      perimetre: body.perimetre || null,
      debut: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json(
      { error: "Table `service_incidents` absente : exécute la migration v45." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, incident: data });
}
