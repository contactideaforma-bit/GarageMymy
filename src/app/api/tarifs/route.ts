import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { FORMULES, Parametres, fusionnerParametres } from "@/lib/admin/economie";

// ============================================================
//  GRILLE TARIFAIRE PUBLIQUE (v13.26) — lue par la page d'accueil.
//
//  Ne renvoie QUE ce qu'un visiteur doit voir : prix, heures, remises
//  d'engagement, avantage « année payée en une fois », mise en service,
//  heure hors forfait. Jamais les primes des commerciaux, l'IBAN ni les
//  coûts internes. Si la base est injoignable, la page garde la grille
//  par défaut du code (même source que le contrat).
// ============================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let p: Parametres = fusionnerParametres(null);
  const admin = getAdminClient();
  if (admin) {
    try {
      const { data } = await admin.from("admin_parametres").select("valeur").eq("cle", "grille").maybeSingle();
      p = fusionnerParametres((data?.valeur as Partial<Parametres>) || null);
    } catch {
      /* grille par défaut */
    }
  }
  const formules: Record<string, { prix: number; heures: number }> = {};
  for (const f of FORMULES) formules[f] = { prix: p.formules[f].prix, heures: p.formules[f].heures };
  return NextResponse.json(
    {
      formules,
      remiseEngagement: p.remiseEngagement,
      bonusAnnuelMensualites: p.bonusAnnuelMensualites,
      bonusAnnuelEuros: p.bonusAnnuelEuros,
      miseEnService: p.miseEnService,
      heureHorsForfait: p.heureHorsForfait,
    },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
