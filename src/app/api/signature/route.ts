import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";

// SIGNATURE À DISTANCE : le client reçoit un lien /signer/<jeton> et signe
// depuis chez lui, sans compte. Le jeton (UUID unique, non devinable) est la
// seule clé d'accès ; tout passe par le serveur (service role), la base
// n'est jamais exposée. On ne renvoie qu'un résumé minimal du document.

export const runtime = "nodejs";

type Cible = {
  table: "ordres_reparation" | "cessions_creance" | "documents";
  type: string;
  titre: string;
  id: string;
  dossier_id: string;
  dejaSigne: boolean;
  owner_id: string;
};

async function trouverParToken(token: string): Promise<Cible | null> {
  const admin = getAdminClient();
  if (!admin) return null;

  const { data: or } = await admin
    .from("ordres_reparation").select("id,dossier_id,numero,signe_le,owner_id").eq("sign_token", token).maybeSingle();
  if (or) {
    return {
      table: "ordres_reparation", type: "Ordre de réparation",
      titre: or.numero || "Ordre de réparation",
      id: or.id, dossier_id: or.dossier_id, dejaSigne: Boolean(or.signe_le), owner_id: or.owner_id,
    };
  }
  const { data: cess } = await admin
    .from("cessions_creance").select("id,dossier_id,montant,signe_le,owner_id").eq("sign_token", token).maybeSingle();
  if (cess) {
    return {
      table: "cessions_creance", type: "Cession de créance",
      titre: cess.montant != null ? `Cession de créance — ${Number(cess.montant).toFixed(2)} € TTC` : "Cession de créance",
      id: cess.id, dossier_id: cess.dossier_id, dejaSigne: Boolean(cess.signe_le), owner_id: cess.owner_id,
    };
  }
  const { data: doc } = await admin
    .from("documents").select("id,dossier_id,type,numero,total_ttc,signe_le,owner_id").eq("sign_token", token).maybeSingle();
  if (doc) {
    const label = doc.type === "devis" ? "Devis" : "Facture";
    return {
      table: "documents", type: label,
      titre: `${label} ${doc.numero || ""}${doc.total_ttc != null ? ` — ${Number(doc.total_ttc).toFixed(2)} € TTC` : ""}`,
      id: doc.id, dossier_id: doc.dossier_id, dejaSigne: Boolean(doc.signe_le), owner_id: doc.owner_id,
    };
  }
  return null;
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
  }
  const cible = await trouverParToken(token);
  if (!cible) return NextResponse.json({ error: "Lien invalide ou document introuvable." }, { status: 404 });

  // Document déjà signé : réponse MINIMALE. Le lien circule par email et
  // reste techniquement valide — on n'expose plus indéfiniment le nom du
  // client, le véhicule et le n° de sinistre à qui détient l'URL.
  if (cible.dejaSigne) {
    return NextResponse.json({
      type: cible.type,
      titre: cible.titre,
      dejaSigne: true,
      garage: "",
      vehicule: "",
      client: "",
      sinistre: "",
    });
  }

  const admin = getAdminClient()!;
  const [{ data: dossier }, { data: ent }] = await Promise.all([
    admin.from("dossiers").select("client_nom,marque_modele,immatriculation,numero_sinistre").eq("id", cible.dossier_id).maybeSingle(),
    admin.from("entreprise").select("nom").eq("owner_id", cible.owner_id).limit(1).maybeSingle(),
  ]);

  return NextResponse.json({
    type: cible.type,
    titre: cible.titre,
    dejaSigne: cible.dejaSigne,
    garage: ent?.nom || "votre carrossier",
    vehicule: dossier ? `${dossier.marque_modele || ""}${dossier.immatriculation ? ` (${dossier.immatriculation})` : ""}`.trim() : "",
    client: dossier?.client_nom || "",
    sinistre: dossier?.numero_sinistre || "",
  });
}

export async function POST(req: Request) {
  let body: { token?: string; nom?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const token = body.token || "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
  }
  if (!body.nom?.trim() || !body.signature?.startsWith("data:image/png")) {
    return NextResponse.json({ error: "Nom et signature requis." }, { status: 400 });
  }
  if (body.nom.trim().length > 200) {
    return NextResponse.json({ error: "Nom trop long." }, { status: 400 });
  }
  if (body.signature.length > 300_000) {
    return NextResponse.json({ error: "Signature trop lourde, réessaie." }, { status: 413 });
  }

  const cible = await trouverParToken(token);
  if (!cible) return NextResponse.json({ error: "Lien invalide ou document introuvable." }, { status: 404 });
  if (cible.dejaSigne) return NextResponse.json({ error: "Ce document est déjà signé." }, { status: 409 });

  const admin = getAdminClient()!;
  const maj: Record<string, unknown> = {
    signataire_nom: body.nom.trim(),
    signature: body.signature,
    signe_le: new Date().toISOString(),
  };
  if (cible.table !== "documents") maj.statut = "signe";

  // Garde ATOMIQUE : l'update ne passe que si le document n'est pas déjà
  // signé (deux soumissions quasi simultanées passaient toutes deux le
  // contrôle ci-dessus, la seconde ÉCRASAIT la première signature).
  const { data: modifie, error } = await admin
    .from(cible.table)
    .update(maj)
    .eq("id", cible.id)
    .is("signe_le", null)
    .select("id");
  if (error) {
    console.error("signature: update en échec:", error.message);
    return NextResponse.json({ error: "Enregistrement impossible, réessaie." }, { status: 500 });
  }
  if (!modifie || modifie.length === 0) {
    return NextResponse.json({ error: "Ce document est déjà signé." }, { status: 409 });
  }

  // Historique du dossier (owner_id explicite : service role)
  const { error: eEvt } = await admin.from("evenements").insert({
    dossier_id: cible.dossier_id,
    titre: `${cible.type} signé à distance`,
    description: `${cible.titre} — signé par ${body.nom.trim()} via le lien de signature.`,
    date_evenement: new Date().toISOString(),
    categorie: "autre",
    owner_id: cible.owner_id,
  });
  if (eEvt) console.error("signature: événement non journalisé:", eEvt.message);

  return NextResponse.json({ ok: true });
}
