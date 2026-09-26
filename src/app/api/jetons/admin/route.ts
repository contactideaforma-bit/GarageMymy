import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { estAdminServeur, tousLesComptes } from "@/lib/supportServeur";
import { verifierAchatsEnAttente } from "@/lib/jetonsServeur";

export const runtime = "nodejs";
export const maxDuration = 60;

// Console éditeur : soldes et achats de tous les garages, crédit manuel
// (geste commercial, virement reçu hors lien, correction).

export async function GET(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });
  if (!estAdminServeur(user.email)) return NextResponse.json({ error: "Réservé à l'éditeur." }, { status: 403 });
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante côté serveur." }, { status: 500 });

  await verifierAchatsEnAttente(admin, null);
  const [comptes, soldes, achats, envois, ents] = await Promise.all([
    tousLesComptes(admin),
    admin.from("jetons_soldes").select("*"),
    admin.from("achats_jetons").select("*").order("created_at", { ascending: false }).limit(200),
    admin.from("envois_postaux").select("owner_id, type, jetons, statut, created_at").order("created_at", { ascending: false }).limit(1000),
    admin.from("entreprise").select("owner_id, nom"),
  ]);
  return NextResponse.json({
    comptes,
    garages: Object.fromEntries(((ents.data as { owner_id: string; nom: string | null }[]) || []).map((e) => [e.owner_id, e.nom])),
    soldes: soldes.data || [],
    achats: achats.data || [],
    envois: envois.data || [],
  });
}

export async function POST(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });
  if (!estAdminServeur(user.email)) return NextResponse.json({ error: "Réservé à l'éditeur." }, { status: 403 });
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante côté serveur." }, { status: 500 });

  let b: { ownerId?: string; jetons?: number; motif?: string; libelle?: string; achatId?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Corps invalide." }, { status: 400 }); }

  // Achat réglé autrement (virement) : on le marque payé et on crédite (idempotent).
  if (b.achatId) {
    const { data, error } = await admin.rpc("jetons_crediter_achat", { p_achat: b.achatId });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, solde: data, dejaCredite: data === null });
  }

  const n = Math.trunc(Number(b.jetons));
  if (!b.ownerId || !Number.isFinite(n) || n === 0 || Math.abs(n) > 10000) {
    return NextResponse.json({ error: "Garage et nombre de jetons (non nul) requis." }, { status: 400 });
  }
  const motif = b.motif === "ajustement" ? "ajustement" : "geste";
  const { data, error } = await admin.rpc("jetons_crediter", {
    p_owner: b.ownerId, p_n: n, p_motif: motif, p_libelle: (b.libelle || (n > 0 ? "Jetons offerts" : "Correction")).slice(0, 200),
    p_envoi: null, p_achat: null, p_auteur: user.email,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, solde: data });
}
