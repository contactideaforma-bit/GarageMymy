import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { estAdminServeur } from "@/lib/supportServeur";
import { lireDocPack } from "@/lib/admin/packDocsServeur";
import { DOCS_COMMERCIAL, nomFichierDoc } from "@/lib/admin/packDocs";

// ============================================================
//  PACK DOC — COMMERCIAL (v10.6) : le commercial connecté (fiche
//  collaborateur rattachée à son compte) télécharge sa documentation
//  depuis « Mes documents ». Liste blanche : DOCS_COMMERCIAL seulement.
//  GET ?cle=<cle>  →  PDF.
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });
  if (!estAdminServeur(user.email)) {
    const admin = getAdminClient();
    if (!admin) return NextResponse.json({ error: "Service non configuré." }, { status: 500 });
    const { data: collab } = await admin.from("collaborateurs").select("id").eq("owner_id", user.id).maybeSingle();
    if (!collab) return NextResponse.json({ error: "Ce compte n'est rattaché à aucune fiche commerciale." }, { status: 403 });
  }
  const cle = new URL(req.url).searchParams.get("cle") || "";
  if (!DOCS_COMMERCIAL.some((d) => d.cle === cle)) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  const r = await lireDocPack(cle);
  if (!r) return NextResponse.json({ error: "Document indisponible." }, { status: 404 });
  return new NextResponse(new Uint8Array(r.contenu), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nomFichierDoc(r.doc)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
