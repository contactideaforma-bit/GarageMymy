import { NextResponse } from "next/server";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { estAdminServeur } from "@/lib/supportServeur";
import { lireDocPack } from "@/lib/admin/packDocsServeur";
import { nomFichierDoc } from "@/lib/admin/packDocs";

// ============================================================
//  PACK DOC — ÉDITEUR (v10.6) : télécharge un document d'information
//  du pack commercial depuis la fiche d'un collaborateur.
//  GET ?cle=<cle>  →  PDF (liste blanche packDocs.ts, accès ADMIN_EMAILS).
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });
  if (!estAdminServeur(user.email)) return NextResponse.json({ error: "Accès réservé à l'éditeur." }, { status: 403 });
  const cle = new URL(req.url).searchParams.get("cle") || "";
  const r = await lireDocPack(cle);
  if (!r) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  return new NextResponse(new Uint8Array(r.contenu), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nomFichierDoc(r.doc)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
