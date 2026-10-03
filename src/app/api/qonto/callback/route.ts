import { NextResponse } from "next/server";
import { finaliserConnexionQonto } from "@/lib/qonto";

// ============================================================
//  RETOUR DE QONTO après autorisation (OAuth 2.0) — v13.38.
//  Qonto redirige ici avec ?code=…&state=… ; on échange le code contre
//  les jetons puis on renvoie l'éditeur sur la page Paiements.
//  Pas d'en-tête d'auth possible (redirection navigateur) : la sécurité
//  repose sur le « state » aléatoire à usage unique, valable 15 min.
//  ⚠️ L'adresse de cette route doit être déclarée À L'IDENTIQUE dans le
//  portail développeur Qonto (redirect URI).
// ============================================================

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const retour = new URL("/admin/paiements", url.origin);
  const erreurQonto = url.searchParams.get("error");
  if (erreurQonto) {
    retour.searchParams.set("qonto", "erreur");
    retour.searchParams.set("detail", url.searchParams.get("error_description") || erreurQonto);
    return NextResponse.redirect(retour);
  }
  const code = url.searchParams.get("code") || "";
  const etat = url.searchParams.get("state") || "";
  if (!code || !etat) {
    retour.searchParams.set("qonto", "erreur");
    retour.searchParams.set("detail", "Réponse de Qonto incomplète.");
    return NextResponse.redirect(retour);
  }
  try {
    await finaliserConnexionQonto(code, etat);
    retour.searchParams.set("qonto", "ok");
  } catch (e) {
    retour.searchParams.set("qonto", "erreur");
    retour.searchParams.set("detail", e instanceof Error ? e.message : "Connexion impossible.");
  }
  return NextResponse.redirect(retour);
}
