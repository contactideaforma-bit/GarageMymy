import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";

// Enregistre l'appareil courant pour les notifications push (v42).
// Le navigateur fournit un endpoint et deux clés de chiffrement ; sans
// elles, personne — pas même nous — ne peut lire la notification.

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante." }, { status: 500 });
  }

  let body: { endpoint?: string; p256dh?: string; auth?: string; appareil?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }

  const { endpoint, p256dh, auth } = body;
  // Garde-fou : un endpoint est toujours une URL https d'un service de push.
  if (!endpoint || !p256dh || !auth || !/^https:\/\//.test(endpoint) || endpoint.length > 2000) {
    return NextResponse.json({ error: "Abonnement incomplet ou invalide." }, { status: 400 });
  }

  // Un endpoint est unique au monde. `upsert` couvre le cas où l'appareil
  // change de compte (revente du téléphone, second garage) : la ligne est
  // réattribuée au propriétaire courant plutôt que dupliquée.
  const { error } = await admin
    .from("push_abonnements")
    .upsert(
      {
        endpoint,
        p256dh,
        auth,
        appareil: (body.appareil || "Appareil").slice(0, 60),
        actif: true,
        derniere_erreur: null,
        owner_id: user.id,
      },
      { onConflict: "endpoint" }
    );
  if (error) {
    console.error("push/abonner:", error.message);
    return NextResponse.json(
      { error: "Enregistrement impossible (migration v42 exécutée ?)." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
