import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { STATUTS_ORDRE, labelStatut, indexStatut, progressionDossier } from "@/lib/format";
import { Dossier, Entreprise, PhotoEtat } from "@/lib/types";

// ============================================================
//  PORTAIL DE SUIVI CLIENT — route PUBLIQUE (v48)
//
//  Le lien /suivi/<jeton> est ouvert : n'importe qui l'ayant reçu peut le
//  consulter. On ne renvoie donc QUE ce qui appartient au client :
//  l'avancement, son véhicule, les photos d'état, ce qu'il doit signer,
//  et de quoi joindre le garage.
//
//  JAMAIS : montants, assureur, expert, coordonnées d'autres personnes,
//  ni le moindre identifiant interne réutilisable.
// ============================================================

export const runtime = "nodejs";

/** Événements qu'on accepte de montrer au client (le reste est interne). */
const JALONS_VISIBLES = [
  "Véhicule pris en charge",
  "Ordre de réparation signé",
  "Véhicule restitué",
  "Intervention",
];

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Service indisponible." }, { status: 503 });
  }

  const { data: partage } = await admin
    .from("partages_suivi")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!partage || !partage.actif) {
    return NextResponse.json({ error: "Ce lien de suivi n'est plus valable." }, { status: 404 });
  }
  if (partage.expire_le && new Date(partage.expire_le).getTime() < Date.now()) {
    return NextResponse.json({ error: "Ce lien de suivi a expiré." }, { status: 410 });
  }

  const { data: d } = await admin
    .from("dossiers")
    .select("*")
    .eq("id", partage.dossier_id)
    .maybeSingle();
  if (!d) {
    return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  }
  const dossier = d as Dossier;

  // Profil du garage (celui du propriétaire du dossier, pas le premier venu).
  const { data: e } = await admin
    .from("entreprise")
    .select("nom,adresse,code_postal,ville,tel,email,logo_path,lien_avis")
    .eq("owner_id", partage.owner_id)
    .maybeSingle();
  const ent = (e || {}) as Partial<Entreprise>;
  const logoUrl = ent.logo_path
    ? admin.storage.from("entreprise").getPublicUrl(ent.logo_path).data.publicUrl
    : null;

  // Étapes du parcours, sans jargon interne.
  const courant = indexStatut(dossier.statut);
  const etapes = STATUTS_ORDRE.map((code, i) => ({
    code,
    label: labelStatut(code),
    faite: i <= courant,
    actuelle: i === courant,
  }));

  // Jalons : uniquement des événements « racontables ».
  const { data: evs } = await admin
    .from("evenements")
    .select("titre,date_evenement")
    .eq("dossier_id", dossier.id)
    .order("date_evenement", { ascending: true });
  const jalons = ((evs as { titre: string; date_evenement: string }[]) || [])
    .filter((ev) => JALONS_VISIBLES.some((j) => ev.titre.toLowerCase().includes(j.toLowerCase())))
    .slice(-8);

  // Photos d'état à l'entrée : la preuve rassure autant qu'elle protège.
  const { data: ph } = await admin
    .from("photos_etat")
    .select("angle,path,prise_le,moment")
    .eq("dossier_id", dossier.id)
    .order("prise_le", { ascending: true });
  const photos: { angle: string; url: string; prise_le: string; moment: string }[] = [];
  for (const p of ((ph as PhotoEtat[]) || []).slice(0, 22)) {
    const { data: signe } = await admin.storage.from("pieces").createSignedUrl(p.path, 3600);
    if (signe?.signedUrl) {
      photos.push({ angle: p.angle, url: signe.signedUrl, prise_le: p.prise_le, moment: p.moment });
    }
  }

  // Documents en attente de signature du client.
  const aSigner: { type: string; titre: string; token: string }[] = [];
  const { data: ors } = await admin
    .from("ordres_reparation")
    .select("numero,sign_token,signe_le")
    .eq("dossier_id", dossier.id);
  for (const o of (ors as { numero?: string; sign_token?: string; signe_le?: string }[]) || []) {
    if (!o.signe_le && o.sign_token) {
      aSigner.push({ type: "Ordre de réparation", titre: o.numero || "Ordre de réparation", token: o.sign_token });
    }
  }
  const { data: cess } = await admin
    .from("cessions_creance")
    .select("sign_token,signe_le")
    .eq("dossier_id", dossier.id);
  for (const c of (cess as { sign_token?: string; signe_le?: string }[]) || []) {
    if (!c.signe_le && c.sign_token) {
      aSigner.push({ type: "Cession de créance", titre: "Cession de créance", token: c.sign_token });
    }
  }

  // Compteur de consultations (utile au garage : le client a-t-il vu ?).
  await admin
    .from("partages_suivi")
    .update({ vues: (partage.vues || 0) + 1, derniere_vue: new Date().toISOString() })
    .eq("id", partage.id);

  const termine = dossier.statut === "rendu" || dossier.statut === "paye" || dossier.statut === "cloture";

  return NextResponse.json({
    garage: {
      nom: ent.nom || "Votre carrossier",
      tel: ent.tel || null,
      email: ent.email || null,
      ville: [ent.code_postal, ent.ville].filter(Boolean).join(" ") || null,
      adresse: ent.adresse || null,
      logoUrl,
      lienAvis: ent.lien_avis || null,
    },
    vehicule: {
      marque_modele: dossier.marque_modele || null,
      immatriculation: dossier.immatriculation || null,
    },
    client: { prenom_nom: dossier.client_nom || null },
    suivi: {
      statut: dossier.statut,
      statutLabel: labelStatut(dossier.statut),
      progression: progressionDossier(dossier.statut),
      auGarage: Boolean(dossier.au_garage),
      debut: dossier.reparation_debut || null,
      fin: dossier.reparation_fin || null,
      termine,
    },
    etapes,
    jalons,
    photos,
    aSigner,
  });
}
