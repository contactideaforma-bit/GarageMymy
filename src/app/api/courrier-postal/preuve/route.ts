import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { identifiantsMaileva, telechargerPreuve, ErreurMaileva } from "@/lib/maileva";

export const runtime = "nodejs";
export const maxDuration = 30;

// Téléchargement d'une preuve Maileva : avis de réception scanné (ar),
// preuve de dépôt (depot) ou archive du courrier imprimé (archive).

export async function GET(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante côté serveur." }, { status: 500 });

  const url = new URL(req.url);
  const envoiId = url.searchParams.get("id") || "";
  const quoi = (["ar", "depot", "archive"] as const).find((q) => q === url.searchParams.get("quoi")) || "archive";

  const { data: e } = await admin
    .from("envois_postaux")
    .select("type,maileva_sending_id,maileva_recipient_id")
    .eq("id", envoiId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!e?.maileva_sending_id || !e.maileva_recipient_id) {
    return NextResponse.json({ error: "Envoi introuvable ou pas encore transmis à Maileva." }, { status: 404 });
  }
  const id = await identifiantsMaileva(user.id);
  if (!id) return NextResponse.json({ error: "Maileva n'est pas configuré." }, { status: 400 });

  try {
    const f = await telechargerPreuve(id, e.type === "lrar" ? "lrar" : "simple", e.maileva_sending_id, e.maileva_recipient_id, quoi);
    return new Response(f.contenu, {
      headers: {
        "Content-Type": f.contentType,
        "Content-Disposition": `inline; filename="${quoi === "ar" ? "avis-de-reception" : quoi === "depot" ? "preuve-de-depot" : "courrier"}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const x = err as ErreurMaileva;
    return NextResponse.json({ error: x.message }, { status: x.status || 502 });
  }
}
