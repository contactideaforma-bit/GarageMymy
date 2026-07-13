import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { chiffrer, dechiffrer } from "@/lib/coffre";

// ESPACES EXTRANET DES EXPERTS — accès sécurisés (BCA, Alliance, IDEA…).
// La table acces_extranets est RLS sans policy : TOUT passe par cette route
// (service role), scopée à l'utilisateur connecté. Le mot de passe est
// chiffré AES-256-GCM au stockage et n'est renvoyé en clair QUE sur demande
// explicite (?reveal=<id>).

function adminOu500() {
  const admin = getAdminClient();
  if (!admin) {
    return {
      admin: null,
      erreur: NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY manquante côté serveur." },
        { status: 500 }
      ),
    };
  }
  return { admin, erreur: null };
}

// GET → liste SANS mot de passe (hasPassword bool).
// GET ?reveal=<id> → { password } déchiffré pour CET accès.
export async function GET(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });
  const { admin, erreur } = adminOu500();
  if (!admin) return erreur;

  const reveal = new URL(req.url).searchParams.get("reveal");

  if (reveal) {
    const { data, error } = await admin
      .from("acces_extranets")
      .select("id, pass_chiffre")
      .eq("owner_id", user.id)
      .eq("id", reveal)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Accès introuvable." }, { status: 404 });
    if (!data.pass_chiffre) return NextResponse.json({ password: "" });
    const clair = dechiffrer(data.pass_chiffre);
    if (clair === null) {
      return NextResponse.json(
        { error: "Déchiffrement impossible (clé serveur changée ?). Ressaisis le mot de passe." },
        { status: 500 }
      );
    }
    return NextResponse.json({ password: clair });
  }

  const { data, error } = await admin
    .from("acces_extranets")
    .select("id, nom, url, identifiant, notes, pass_chiffre, created_at, updated_at")
    .eq("owner_id", user.id)
    .order("nom", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    acces: (data || []).map((a) => ({
      id: a.id,
      nom: a.nom,
      url: a.url ?? "",
      identifiant: a.identifiant ?? "",
      notes: a.notes ?? "",
      hasPassword: Boolean(a.pass_chiffre),
    })),
  });
}

// POST → crée (sans id) ou met à jour (avec id). Le mot de passe n'est
// modifié que s'il est fourni non vide.
export async function POST(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });
  const { admin, erreur } = adminOu500();
  if (!admin) return erreur;

  let body: {
    id?: string;
    nom?: string;
    url?: string;
    identifiant?: string;
    password?: string;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const nom = body.nom?.trim();
  if (!nom) return NextResponse.json({ error: "Le nom de l'expert est requis." }, { status: 400 });

  const fields: Record<string, unknown> = {
    nom,
    url: body.url?.trim() || null,
    identifiant: body.identifiant?.trim() || null,
    notes: body.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (body.password && body.password.length > 0) {
    const chiffre = chiffrer(body.password);
    if (!chiffre) {
      return NextResponse.json(
        { error: "Clé de chiffrement manquante côté serveur (EXTRANET_SECRET ou SUPABASE_SERVICE_ROLE_KEY)." },
        { status: 500 }
      );
    }
    fields.pass_chiffre = chiffre;
  }

  if (body.id) {
    // Mise à jour, scopée owner_id (jamais l'accès d'un autre garage).
    const { error } = await admin
      .from("acces_extranets")
      .update(fields)
      .eq("id", body.id)
      .eq("owner_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    // Insertion service role : owner_id EXPLICITE (pas d'auth.uid() ici).
    const { error } = await admin
      .from("acces_extranets")
      .insert({ ...fields, owner_id: user.id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE ?id=<id> → supprime l'accès (scopé owner).
export async function DELETE(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });
  const { admin, erreur } = adminOu500();
  if (!admin) return erreur;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id manquant." }, { status: 400 });

  const { error } = await admin
    .from("acces_extranets")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
