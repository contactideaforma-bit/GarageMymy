import { NextRequest, NextResponse } from "next/server";
import { ErreurInfosPlaque, obtenirInfosPlaque } from "@/lib/infosPlaqueServeur";
import { INFOS_PLAQUE_ACTIF } from "@/lib/infosPlaque";

// INFOS PLAQUE (v13.47) : GET /api/infos-plaque?immat=AA-123-BC[&force=1]
// → { infos, depuis_cache, consulte_le, fournisseur }. Réservé aux comptes
// connectés (les requêtes au fournisseur sont payantes) ; cache partagé 180 j.

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!INFOS_PLAQUE_ACTIF) return NextResponse.json({ error: "Fonction non activée." }, { status: 404 });
  const { utilisateurDepuisRequete, REPONSE_401 } = await import("@/lib/apiAuth");
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });

  const immat = req.nextUrl.searchParams.get("immat") || "";
  const forcer = req.nextUrl.searchParams.get("force") === "1";
  try {
    const r = await obtenirInfosPlaque({ immat, ownerId: user.id, forcer });
    return NextResponse.json(r);
  } catch (err) {
    if (err instanceof ErreurInfosPlaque) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message || "Erreur." }, { status: 500 });
  }
}
