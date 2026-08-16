import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { envoyerPush } from "@/lib/pushServeur";

// Notification de test (v42) : le garage vérifie que son téléphone sonne
// sans attendre le résumé du lendemain matin.

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante." }, { status: 500 });
  }

  const res = await envoyerPush(admin, user.id, {
    titre: "My Easy Auto",
    corps: "Notification de test — tout fonctionne 👍",
    url: "/",
    tag: "test",
  });

  if (res.erreur) return NextResponse.json({ error: res.erreur }, { status: 500 });
  return NextResponse.json({ ok: true, envoyes: res.envoyes, retires: res.retires });
}
