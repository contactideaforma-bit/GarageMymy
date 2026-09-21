import { NextResponse } from "next/server";
import { ipDe, tropDeDemandes } from "@/lib/limiteur";
import type { ClausesOR } from "@/lib/types";
import { textesClauses } from "@/lib/garanties";
import { conditionsOR, AUTORISATION_OR } from "@/lib/atelier";
import { getAdminClient } from "@/lib/supabaseAdmin";

// SIGNATURE À DISTANCE : le client reçoit un lien /signer/<jeton> et signe
// depuis chez lui, sans compte. Le jeton (UUID unique, non devinable) est la
// seule clé d'accès ; tout passe par le serveur (service role), la base
// n'est jamais exposée. On ne renvoie qu'un résumé minimal du document.

export const runtime = "nodejs";

type Cible = {
  table: "ordres_reparation" | "cessions_creance" | "documents" | "transferts_garantie" | "flotte_mises_a_dispo";
  type: string;
  titre: string;
  id: string;
  dossier_id: string | null;
  dejaSigne: boolean;
  owner_id: string;
  /** v12.7 — contrat de flotte sans dossier : on décrit le véhicule et le conducteur directement. */
  vehicule?: string;
  client?: string;
  /** v13.15 — clauses de garantie de l'OR (texte à afficher, consentement gage requis). */
  clauses?: ClausesOR | null;
  montant_ht?: number | null;
  date_fin?: string | null;
  /** v13.22 — OR étoffé : de quoi bâtir les conditions générales affichées. */
  or?: { pieces_choix?: string | null; pieces_restituees?: boolean | null; kilometrage?: number | null; carburant?: string | null; etat_entree?: string | null; objets_bord?: string | null };
};

async function trouverParToken(token: string): Promise<Cible | null> {
  const admin = getAdminClient();
  if (!admin) return null;

  let { data: or } = await admin
    .from("ordres_reparation").select("id,dossier_id,numero,signe_le,owner_id,clauses,montant_ht,date_fin,pieces_choix,pieces_restituees,kilometrage,carburant,etat_entree,objets_bord").eq("sign_token", token).maybeSingle();
  if (!or) {
    // Migration v86 pas encore jouée : colonnes absentes → sélection réduite.
    ({ data: or } = await admin
      .from("ordres_reparation").select("id,dossier_id,numero,signe_le,owner_id,clauses,montant_ht,date_fin").eq("sign_token", token).maybeSingle());
  }
  if (or) {
    const o = or as Record<string, unknown>;
    return {
      table: "ordres_reparation", type: "Ordre de réparation",
      titre: (o.numero as string) || "Ordre de réparation",
      id: o.id as string, dossier_id: o.dossier_id as string | null, dejaSigne: Boolean(o.signe_le), owner_id: o.owner_id as string,
      clauses: (o.clauses as ClausesOR | null) || null, montant_ht: o.montant_ht as number | null, date_fin: o.date_fin as string | null,
      or: { pieces_choix: o.pieces_choix as string | null, pieces_restituees: o.pieces_restituees as boolean | null, kilometrage: o.kilometrage as number | null, carburant: o.carburant as string | null, etat_entree: o.etat_entree as string | null, objets_bord: o.objets_bord as string | null },
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
  // v12.7 — contrat de prêt établi depuis un dossier sinistre
  const { data: pret } = await admin
    .from("transferts_garantie").select("id,dossier_id,vehicule_immat,vehicule_modele,signe_le,owner_id").eq("sign_token", token).maybeSingle();
  if (pret) {
    return {
      table: "transferts_garantie", type: "Contrat de prêt de véhicule",
      titre: `Contrat de prêt — ${pret.vehicule_modele || "véhicule"}${pret.vehicule_immat ? ` (${pret.vehicule_immat})` : ""}`,
      id: pret.id, dossier_id: pret.dossier_id, dejaSigne: Boolean(pret.signe_le), owner_id: pret.owner_id,
    };
  }
  // v12.7 — prêt ou location d'un véhicule de la flotte
  const { data: mad } = await admin
    .from("flotte_mises_a_dispo").select("id,dossier_id,vehicule_id,type,conducteur_nom,signe_le,owner_id").eq("sign_token", token).maybeSingle();
  if (mad) {
    const { data: v } = await admin.from("flotte_vehicules").select("immatriculation,marque_modele").eq("id", mad.vehicule_id).maybeSingle();
    const genre = mad.type === "location" ? "Contrat de location" : "Contrat de prêt";
    return {
      table: "flotte_mises_a_dispo", type: `${genre} de véhicule`,
      titre: `${genre} — ${v?.marque_modele || "véhicule"}${v?.immatriculation ? ` (${v.immatriculation})` : ""}`,
      id: mad.id, dossier_id: mad.dossier_id, dejaSigne: Boolean(mad.signe_le), owner_id: mad.owner_id,
      vehicule: `${v?.marque_modele || ""}${v?.immatriculation ? ` (${v.immatriculation})` : ""}`.trim(),
      client: mad.conducteur_nom || "",
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
    cible.dossier_id
      ? admin.from("dossiers").select("client_nom,marque_modele,immatriculation,numero_sinistre,numero_serie").eq("id", cible.dossier_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("entreprise").select("nom,ville,gard_tarif_jour").eq("owner_id", cible.owner_id).limit(1).maybeSingle(),
  ]);

  // v13.15 — clauses de garantie de l'OR, telles qu'imprimées : le client
  // les lit avant de signer ; la clause de gage exige une case distincte.
  const clauses = cible.table === "ordres_reparation" && cible.clauses
    ? textesClauses(cible.clauses, ent || {}, { immatriculation: dossier?.immatriculation || null, marque_modele: dossier?.marque_modele || null, numero_serie: dossier?.numero_serie || null }, { montant_ht: cible.montant_ht ?? null, date_fin: cible.date_fin ?? null })
    : [];

  // v13.22 — conditions générales de l'OR + état constaté : le client signe
  // en connaissance de cause (acceptation obligatoire, horodatée).
  const estOR = cible.table === "ordres_reparation";
  const conditions = estOR
    ? conditionsOR({ garage: ent?.nom, gardiennageJour: ent?.gard_tarif_jour ?? null, piecesChoix: cible.or?.pieces_choix, piecesRestituees: cible.or?.pieces_restituees, ville: ent?.ville })
    : [];
  const etat = estOR
    ? [
        cible.or?.kilometrage != null ? `Kilométrage : ${cible.or.kilometrage} km` : "",
        cible.or?.carburant ? `Carburant : ${cible.or.carburant}` : "",
        cible.or?.etat_entree ? `État constaté : ${cible.or.etat_entree}` : "",
        cible.or?.objets_bord ? `Objets à bord : ${cible.or.objets_bord}` : "",
      ].filter(Boolean)
    : [];

  return NextResponse.json({
    type: cible.type,
    titre: cible.titre,
    dejaSigne: cible.dejaSigne,
    conditions,
    etat,
    autorisation: estOR ? AUTORISATION_OR : null,
    consentementConditionsRequis: estOR,
    garage: ent?.nom || "votre carrossier",
    vehicule: cible.vehicule || (dossier ? `${dossier.marque_modele || ""}${dossier.immatriculation ? ` (${dossier.immatriculation})` : ""}`.trim() : ""),
    client: cible.client || dossier?.client_nom || "",
    sinistre: dossier?.numero_sinistre || "",
    clauses,
    consentementGageRequis: Boolean(cible.clauses?.gage),
  });
}

export async function POST(req: Request) {
  // Audit : 30 signatures / heure / IP suffisent largement ; freine un robot
  // qui tenterait des jetons au hasard ou inonderait la base.
  if (tropDeDemandes("signature", ipDe(req), 30)) {
    return NextResponse.json({ error: "Trop de tentatives, réessaie dans une heure." }, { status: 429 });
  }
  let body: { token?: string; nom?: string; signature?: string; consentGage?: boolean; consentConditions?: boolean };
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
  if (cible.table === "ordres_reparation" || cible.table === "cessions_creance") maj.statut = "signe";
  // v13.22 — conditions générales de l'OR : acceptation expresse obligatoire.
  if (cible.table === "ordres_reparation") {
    if (!body.consentConditions) {
      return NextResponse.json({ error: "Merci de cocher l'acceptation des conditions de l'ordre de réparation pour signer." }, { status: 400 });
    }
    maj.conditions_acceptees_le = new Date().toISOString();
  }
  // v13.15 — clause de gage : consentement EXPRÈS obligatoire, horodaté dans les clauses figées.
  if (cible.table === "ordres_reparation" && cible.clauses?.gage) {
    if (!body.consentGage) {
      return NextResponse.json({ error: "Merci de cocher l'acceptation expresse de la clause de gage pour signer cet ordre de réparation." }, { status: 400 });
    }
    maj.clauses = { ...cible.clauses, gage_consenti_le: new Date().toISOString(), gage_consenti_par: body.nom.trim() };
  }
  if (cible.table === "flotte_mises_a_dispo") maj.cg_acceptees = true;

  // Garde ATOMIQUE : l'update ne passe que si le document n'est pas déjà
  // signé (deux soumissions quasi simultanées passaient toutes deux le
  // contrôle ci-dessus, la seconde ÉCRASAIT la première signature).
  let { data: modifie, error } = await admin
    .from(cible.table)
    .update(maj)
    .eq("id", cible.id)
    .is("signe_le", null)
    .select("id");
  if (error && /conditions_acceptees_le/i.test(error.message || "")) {
    // Migration v86 pas encore jouée : on signe sans l'horodatage des conditions.
    delete maj.conditions_acceptees_le;
    ({ data: modifie, error } = await admin.from(cible.table).update(maj).eq("id", cible.id).is("signe_le", null).select("id"));
  }
  if (error) {
    console.error("signature: update en échec:", error.message);
    return NextResponse.json({ error: "Enregistrement impossible, réessaie." }, { status: 500 });
  }
  if (!modifie || modifie.length === 0) {
    return NextResponse.json({ error: "Ce document est déjà signé." }, { status: 409 });
  }

  // Historique du dossier (owner_id explicite : service role)
  const { error: eEvt } = cible.dossier_id
    ? await admin.from("evenements").insert({
    dossier_id: cible.dossier_id,
    titre: `${cible.type} signé à distance`,
    description: `${cible.titre} — signé par ${body.nom.trim()} via le lien de signature.`,
    date_evenement: new Date().toISOString(),
    categorie: "autre",
    owner_id: cible.owner_id,
  })
    : { error: null };
  if (eEvt) console.error("signature: événement non journalisé:", eEvt.message);

  return NextResponse.json({ ok: true });
}
