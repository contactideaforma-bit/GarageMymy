import { NextResponse } from "next/server";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { estAdminServeur } from "@/lib/supportServeur";
import { ErreurQonto, deconnecterQonto, etatConnexionQonto, noterConnecteurQonto, urlAutorisationQonto } from "@/lib/qonto";

// ============================================================
//  CONNEXION QONTO (OAuth 2.0) — v13.38. Réservé à l'éditeur (ADMIN_EMAILS).
//  GET    → état de la connexion
//  POST   → URL d'autorisation Qonto (le navigateur s'y rend)
//  DELETE → déconnexion (jetons effacés)
// ============================================================

export const runtime = "nodejs";

async function garde(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return { erreur: NextResponse.json(REPONSE_401, { status: 401 }) };
  if (!estAdminServeur(user.email)) return { erreur: NextResponse.json({ error: "Accès réservé à l'éditeur." }, { status: 403 }) };
  return { user };
}

export async function GET(req: Request) {
  const g = await garde(req);
  if ("erreur" in g) return g.erreur;
  return NextResponse.json(await etatConnexionQonto());
}

export async function POST(req: Request) {
  const g = await garde(req);
  if ("erreur" in g) return g.erreur;
  try {
    const url = await urlAutorisationQonto();
    await noterConnecteurQonto(g.user.email || null);
    return NextResponse.json({ url });
  } catch (e) {
    const status = e instanceof ErreurQonto ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Connexion impossible." }, { status });
  }
}

export async function DELETE(req: Request) {
  const g = await garde(req);
  if ("erreur" in g) return g.erreur;
  await deconnecterQonto();
  return NextResponse.json({ ok: true });
}
