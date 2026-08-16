import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";

// Coupe les notifications sur UN appareil (v42). Les autres appareils du
// garage continuent de recevoir : on filtre sur endpoint ET owner_id.

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante." }, { status: 500 });
  }

  let body: { endpoint?: string; id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }
  if (!body.endpoint && !body.id) {
    return NextResponse.json({ error: "Appareil non précisé." }, { status: 400 });
  }

  let q = admin.from("push_abonnements").delete().eq("owner_id", user.id);
  q = body.id ? q.eq("id", body.id) : q.eq("endpoint", body.endpoint as string);
  const { error } = await q;
  if (error) {
    console.error("push/desabonner:", error.message);
    return NextResponse.json({ error: "Suppression impossible." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
