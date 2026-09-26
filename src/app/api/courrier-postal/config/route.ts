import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { chiffrer } from "@/lib/coffre";
import { identifiantsMaileva, testerConnexion, ErreurMaileva } from "@/lib/maileva";

export const runtime = "nodejs";

// Configuration Maileva DU GARAGE CONNECTÉ. Les secrets (mot de passe,
// client_secret) sont chiffrés au repos et ne sont JAMAIS renvoyés.

export async function GET(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante côté serveur." }, { status: 500 });

  const { data, error } = await admin.from("maileva_config").select("*").eq("owner_id", user.id).limit(1).maybeSingle();
  if (error && !/maileva_config/.test(error.message)) {
    return NextResponse.json({ error: "Lecture de la configuration impossible." }, { status: 500 });
  }
  if (error) return NextResponse.json({ configured: false, migration: false });

  const { data: ent } = await admin.from("entreprise").select("nom,adresse,code_postal,ville").eq("owner_id", user.id).limit(1).maybeSingle();
  const viaEnv = !data && Boolean(await identifiantsMaileva(user.id));
  return NextResponse.json({
    migration: true,
    configured: viaEnv || Boolean(data?.login && data?.password && data?.client_id && data?.client_secret),
    viaEnv,
    environnement: viaEnv ? (process.env.MAILEVA_ENV === "production" ? "production" : "sandbox") : data?.environnement || "sandbox",
    login: data?.login || "",
    client_id: data?.client_id || "",
    notification_email: data?.notification_email || "",
    couleur: data?.couleur ?? false,
    recto_verso: data?.recto_verso ?? true,
    hasPassword: Boolean(data?.password),
    hasSecret: Boolean(data?.client_secret),
    expediteur: ent ? { nom: ent.nom, adresse: ent.adresse, code_postal: ent.code_postal, ville: ent.ville } : null,
  });
}

export async function POST(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante côté serveur." }, { status: 500 });

  let body: {
    environnement?: string;
    login?: string;
    password?: string;
    client_id?: string;
    client_secret?: string;
    notification_email?: string;
    couleur?: boolean;
    recto_verso?: boolean;
    tester?: boolean;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Corps invalide." }, { status: 400 }); }

  // Test de connexion seul (bouton « Tester ») : on tente d'obtenir un jeton.
  if (body.tester) {
    const id = await identifiantsMaileva(user.id);
    if (!id) return NextResponse.json({ error: "Identifiants Maileva incomplets." }, { status: 400 });
    try {
      // Aucun envoi n'est créé : on demande seulement un jeton à Maileva.
      await testerConnexion(id);
      return NextResponse.json({ ok: true, environnement: id.environnement });
    } catch (e) {
      const err = e as ErreurMaileva;
      return NextResponse.json({ error: err.message || "Connexion impossible." }, { status: err.status || 502 });
    }
  }

  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.environnement !== undefined) fields.environnement = body.environnement === "production" ? "production" : "sandbox";
  if (body.login !== undefined) fields.login = body.login.trim() || null;
  if (body.client_id !== undefined) fields.client_id = body.client_id.trim() || null;
  if (body.notification_email !== undefined) fields.notification_email = body.notification_email.trim() || null;
  if (body.couleur !== undefined) fields.couleur = Boolean(body.couleur);
  if (body.recto_verso !== undefined) fields.recto_verso = Boolean(body.recto_verso);
  for (const [cle, val] of [["password", body.password], ["client_secret", body.client_secret]] as const) {
    if (val && val.length > 0) {
      const c = chiffrer(val);
      if (!c) return NextResponse.json({ error: "Chiffrement indisponible côté serveur : secret non enregistré." }, { status: 500 });
      fields[cle] = c;
    }
  }

  const { data: existant, error: eLecture } = await admin.from("maileva_config").select("id").eq("owner_id", user.id).limit(1).maybeSingle();
  if (eLecture) return NextResponse.json({ error: "Table maileva_config absente : exécute supabase/migration_v89.sql." }, { status: 500 });
  const { error } = existant
    ? await admin.from("maileva_config").update(fields).eq("id", existant.id)
    : await admin.from("maileva_config").insert({ ...fields, owner_id: user.id });
  if (error) return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
