import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { estAdminServeur, comptesAdmin, emailsAdminServeur } from "@/lib/supportServeur";
import { envoyerEmailServeur } from "@/lib/mailer";
import { FORMULES, Formule, Parametres, fusionnerParametres, prixVente, primeVente } from "@/lib/admin/economie";
import type { ParametresPublics } from "@/lib/admin/ventePublic";

// ============================================================
//  ESPACE COMMERCIAL (v10.2) — route AUTHENTIFIÉE.
//  Le compte commercial (app_metadata.metier = 'commercial') est rattaché
//  à sa fiche collaborateur par collaborateurs.owner_id. L'éditeur (ADMIN)
//  utilise les mêmes actions depuis son propre compte.
//
//  GET                          → { collaborateur, estAdmin, parametres }
//  POST { action: "declarer_vente", prospect_id, offre, ... }
//  POST { action: "paiement", vente_id, paiement_demande?, reference?, confirme? }
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 20;

function parametresPublics(p: Parametres): ParametresPublics {
  const formules = {} as Parametres["formules"];
  for (const f of FORMULES) formules[f] = { ...p.formules[f] };
  return {
    formules,
    remiseEngagement: p.remiseEngagement,
    bonusAnnuelMensualites: p.bonusAnnuelMensualites,
    bonusAnnuelEuros: p.bonusAnnuelEuros,
    miseEnService: p.miseEnService,
    heureHorsForfait: p.heureHorsForfait,
    iban: p.iban,
    bic: p.bic,
    lienPaiementCb: p.lienPaiementCb,
    primeMensualiteAvecEngagement: p.primeMensualiteAvecEngagement,
    primeMensualiteSansEngagement: p.primeMensualiteSansEngagement,
    mensualitesReprise: p.mensualitesReprise,
  };
}

async function contexte(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return { erreur: NextResponse.json(REPONSE_401, { status: 401 }) };
  const admin = getAdminClient();
  if (!admin) return { erreur: NextResponse.json({ error: "Service non configuré." }, { status: 500 }) };
  const estAdmin = estAdminServeur(user.email);
  const { data: collab } = await admin.from("collaborateurs").select("*").eq("owner_id", user.id).maybeSingle();
  if (!collab && !estAdmin) return { erreur: NextResponse.json({ error: "Ce compte n'est rattaché à aucune fiche commerciale (Espace éditeur → Collaborateurs → Compte)." }, { status: 403 }) };
  const { data: params } = await admin.from("admin_parametres").select("valeur").eq("cle", "grille").maybeSingle();
  const p = fusionnerParametres((params?.valeur as Partial<Parametres>) || null);
  return { user, admin, estAdmin, collab, p };
}

export async function GET(req: Request) {
  const c = await contexte(req);
  if ("erreur" in c) return c.erreur;
  const collab = c.collab
    ? { id: c.collab.id, nom: c.collab.nom, prenom: c.collab.prenom, code_apporteur: c.collab.code_apporteur, zone: c.collab.zone, portefeuille: c.collab.portefeuille, signature: c.collab.signature, statut: c.collab.statut }
    : null;
  return NextResponse.json({ collaborateur: collab, estAdmin: c.estAdmin, parametres: parametresPublics(c.p) });
}

const texte = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  const c = await contexte(req);
  if ("erreur" in c) return c.erreur;
  const { user, admin, estAdmin, collab, p } = c;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  // ---- signature du commercial (mémorisée sur sa fiche)
  if (body.action === "signature") {
    if (!collab) return NextResponse.json({ error: "Pas de fiche commerciale." }, { status: 400 });
    const sig = typeof body.signature === "string" && body.signature.startsWith("data:image/png;base64,") ? body.signature.slice(0, 300_000) : null;
    await admin.from("collaborateurs").update({ signature: sig }).eq("id", collab.id);
    return NextResponse.json({ ok: true });
  }

  // ---- déclaration d'une vente depuis une fiche prospect
  if (body.action === "declarer_vente") {
    const prospectId = texte(body.prospect_id, 40);
    let q = admin.from("prospects").select("*").eq("id", prospectId);
    if (!estAdmin) q = q.eq("owner_id", user.id);
    const { data: pr } = await q.maybeSingle();
    if (!pr) return NextResponse.json({ error: "Fiche client introuvable." }, { status: 404 });
    const offre = (body.offre || {}) as Record<string, unknown>;
    const formule = texte(offre.formule, 20) as Formule;
    if (!FORMULES.includes(formule)) return NextResponse.json({ error: "Formule inconnue." }, { status: 400 });
    if (!pr.email) return NextResponse.json({ error: "Renseigne l'email du garage : c'est l'identifiant de son futur compte." }, { status: 400 });
    const signature = typeof body.signature === "string" && body.signature.startsWith("data:image/png;base64,") ? body.signature.slice(0, 400_000) : null;
    if (!signature) return NextResponse.json({ error: "La signature du garage est obligatoire." }, { status: 400 });
    const periodicite = offre.periodicite === "annuel" ? "annuel" : "mensuel";
    const engagement_12 = periodicite === "annuel" || Boolean(offre.engagement_12);
    const remise_supp_pct = Math.min(30, Math.max(0, Number(offre.remise_supp_pct) || 0));
    const prix = prixVente(formule, { engagement12: engagement_12, periodicite, remiseSupp: remise_supp_pct }, p);
    const mode = texte(offre.mode_paiement, 20);
    const d = new Date();
    const numero = `V-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}-${String(Date.now()).slice(-5)}`;
    const paiementDemande = body.paiement_demande === "cb" ? "cb" : body.paiement_demande === "virement" ? "virement" : null;
    const ligne = {
      numero,
      code_apporteur: collab?.code_apporteur || (estAdmin ? "EDITEUR" : "—"),
      collaborateur_id: collab?.id || null,
      owner_id: user.id,
      prospect_id: pr.id,
      garage_nom: pr.nom,
      garage_siret: pr.siret || pr.siren || null,
      garage_adresse: pr.adresse,
      garage_cp: pr.cp,
      garage_ville: pr.ville,
      contact_nom: pr.contact_nom || pr.gerant,
      contact_fonction: pr.contact_fonction,
      contact_tel: pr.tel,
      contact_email: String(pr.email).toLowerCase(),
      formule,
      engagement_12,
      periodicite,
      remise_supp_pct,
      prix_mensuel_ht: prix.mensualite,
      montant_annuel_ht: prix.montantAnnuel,
      mise_en_service_ht: prix.miseEnService,
      date_debut_souhaitee: texte(offre.date_debut_souhaitee, 10) || null,
      mode_paiement: ["virement", "prelevement", "cheque", "especes", "cb"].includes(mode) ? mode : paiementDemande === "cb" ? "cb" : "virement",
      paiement_sur_place: false,
      paiement_demande: paiementDemande,
      paiement_demande_le: paiementDemande ? new Date().toISOString() : null,
      besoins: pr.besoins,
      cgv_acceptees: true,
      signataire_nom: texte(body.signataire_nom, 120) || pr.contact_nom || pr.gerant || null,
      signataire_qualite: texte(body.signataire_qualite, 80) || pr.contact_fonction || null,
      signature,
      signe_le: new Date().toISOString(),
      statut: "declaree",
      ip: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null,
      user_agent: (req.headers.get("user-agent") || "").slice(0, 300),
    };
    const { data, error } = await admin.from("ventes").insert(ligne).select("id,numero").single();
    if (error) return NextResponse.json({ error: `Enregistrement impossible (migrations v55/v57 ?) : ${error.message}` }, { status: 500 });
    await admin.from("prospects").update({ statut: "signe", maj_le: new Date().toISOString() }).eq("id", pr.id);

    // Email à l'éditeur (best-effort)
    try {
      const comptes = await comptesAdmin(admin);
      const expediteurId = comptes[0]?.id;
      if (expediteurId) {
        const prime = collab ? primeVente(formule, { engagement12: engagement_12, periodicite, mensualiteFacturee: prix.montantAnnuel != null ? prix.montantAnnuel / 12 : prix.mensualite }, p) : null;
        const qui = collab ? `${[collab.prenom, collab.nom].filter(Boolean).join(" ")} (code ${collab.code_apporteur || "—"})` : "l'éditeur";
        await envoyerEmailServeur(
          {
            to: emailsAdminServeur().join(","),
            subject: `[Vente] ${pr.nom} — ${p.formules[formule].libelle} (${numero})`,
            text: [
              `Vente ${numero} déclarée par ${qui} depuis l'espace clients.`,
              `Garage : ${pr.nom} · ${pr.ville || ""} · ${pr.contact_nom || pr.gerant || ""} ${pr.tel || ""} ${pr.email}`,
              `Formule : ${p.formules[formule].libelle} · ${engagement_12 ? "engagement 12 mois" : "sans engagement"} · ${periodicite === "annuel" ? `année ${prix.montantAnnuel} € HT` : `${prix.mensualite} € HT / mois`}${remise_supp_pct ? ` · remise supp. ${remise_supp_pct} % À VALIDER` : ""}`,
              `Paiement demandé : ${paiementDemande || "—"} · mode : ${ligne.mode_paiement}`,
              prime ? `Prime prévue : ${prime.total} € (acquise à la ${prime.mensualiteEcheance}e mensualité encaissée).` : "",
              `À valider : ${process.env.NEXT_PUBLIC_SITE_URL || "https://myeasyauto.fr"}/admin/ventes`,
            ].filter(Boolean).join("\n"),
          },
          expediteurId
        );
      }
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: true, id: data.id, numero: data.numero });
  }

  // ---- paiement : demande (virement / CB) puis confirmation par le commercial
  if (body.action === "paiement") {
    const venteId = texte(body.vente_id, 40);
    let q = admin.from("ventes").select("id,owner_id,paiement_demande").eq("id", venteId);
    if (!estAdmin) q = q.eq("owner_id", user.id);
    const { data: v } = await q.maybeSingle();
    if (!v) return NextResponse.json({ error: "Vente introuvable." }, { status: 404 });
    const patch: Record<string, unknown> = {};
    if (body.paiement_demande === "virement" || body.paiement_demande === "cb") {
      patch.paiement_demande = body.paiement_demande;
      patch.paiement_demande_le = new Date().toISOString();
      patch.mode_paiement = body.paiement_demande;
    }
    if (typeof body.reference === "string") patch.paiement_reference = texte(body.reference, 120) || null;
    if (body.confirme === true) {
      patch.paiement_confirme_le = new Date().toISOString();
      patch.paiement_sur_place = true;
      if (body.montant != null) patch.paiement_montant = Number(body.montant) || null;
    }
    if (body.confirme === false) {
      patch.paiement_confirme_le = null;
      patch.paiement_sur_place = false;
    }
    const { error } = await admin.from("ventes").update(patch).eq("id", venteId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}
