import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { chiffrer } from "@/lib/coffre";

// Config SMTP DU GARAGE CONNECTÉ (owner_id = utilisateur authentifié).
// Renvoyée SANS le mot de passe (juste un booléen hasPassword).

export async function GET(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY manquante côté serveur." },
      { status: 500 }
    );
  }
  const { data, error } = await admin
    .from("mail_config")
    .select("*")
    .eq("owner_id", user.id)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("mail-config:", error.message);
    return NextResponse.json({ error: "Lecture de la configuration impossible." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ configured: false });
  }
  return NextResponse.json({
    configured: Boolean(data.smtp_host && data.smtp_user && data.smtp_pass),
    smtp_host: data.smtp_host ?? "",
    smtp_port: data.smtp_port ?? 587,
    smtp_secure: data.smtp_secure ?? false,
    smtp_user: data.smtp_user ?? "",
    from_name: data.from_name ?? "",
    from_email: data.from_email ?? "",
    hasPassword: Boolean(data.smtp_pass),
  });
}

// Crée / met à jour la config du garage connecté.
// Le mot de passe n'est mis à jour que s'il est fourni.
export async function POST(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY manquante côté serveur." },
      { status: 500 }
    );
  }

  let body: {
    smtp_host?: string;
    smtp_port?: number | string;
    smtp_secure?: boolean;
    smtp_user?: string;
    smtp_pass?: string;
    from_name?: string;
    from_email?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  // Seuls les champs PRÉSENTS dans le body sont modifiés : un POST partiel
  // (ex. juste from_name) n'écrase plus toute la config à null.
  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.smtp_host !== undefined) fields.smtp_host = body.smtp_host?.trim() || null;
  if (body.smtp_port !== undefined) fields.smtp_port = Number(body.smtp_port) || 587;
  if (body.smtp_secure !== undefined) fields.smtp_secure = Boolean(body.smtp_secure);
  if (body.smtp_user !== undefined) fields.smtp_user = body.smtp_user?.trim() || null;
  if (body.from_name !== undefined) fields.from_name = body.from_name?.trim() || null;
  if (body.from_email !== undefined) fields.from_email = body.from_email?.trim() || null;
  if (body.smtp_pass && body.smtp_pass.length > 0) {
    // Chiffré au repos (AES-256-GCM). Si la clé serveur manque, on REFUSE
    // (l'ancien repli stockait silencieusement le mot de passe EN CLAIR —
    // incohérent avec la route extranets qui renvoie une erreur).
    const chiffre = chiffrer(body.smtp_pass);
    if (!chiffre) {
      return NextResponse.json(
        { error: "Chiffrement indisponible côté serveur : mot de passe non enregistré." },
        { status: 500 }
      );
    }
    fields.smtp_pass = chiffre;
  }

  const { data: existing } = await admin
    .from("mail_config")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await admin.from("mail_config").update(fields).eq("id", existing.id);
    if (error) {
      console.error("mail-config update:", error.message);
      return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });
    }
  } else {
    const { error } = await admin.from("mail_config").insert({ ...fields, owner_id: user.id });
    if (error) {
      console.error("mail-config insert:", error.message);
      return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
