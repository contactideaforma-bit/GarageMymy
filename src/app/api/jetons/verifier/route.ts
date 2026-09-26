import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { soldeJetons, verifierAchatsEnAttente } from "@/lib/jetonsServeur";

export const runtime = "nodejs";
export const maxDuration = 30;

// Vérifie les paiements en attente du garage connecté et renvoie son solde.
export async function POST(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante côté serveur." }, { status: 500 });
  const r = await verifierAchatsEnAttente(admin, user.id);
  return NextResponse.json({ ok: true, credites: r.credites, erreurs: r.erreurs, solde: await soldeJetons(admin, user.id) });
}
