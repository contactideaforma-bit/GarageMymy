import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { FORMULES, Formule, Parametres, fusionnerParametres, prixVente } from "@/lib/admin/economie";
import type { ParametresPublics } from "@/lib/admin/ventePublic";
import { recommanderFormule, SOURCES_CONNAISSANCE, CRENEAUX_RAPPEL, type Besoins, type ModeEnLigne } from "@/lib/inscription";
import { qontoConfigure } from "@/lib/qonto";
import { stripeConfigure } from "@/lib/stripe";
import {
  ErreurInscription, VenteLigne, demarrerQonto, demarrerStripe, enregistrerDemandeRappel, envoyerConfirmationInscription,
  notifierEditeurInscription, nouveauToken, resumePublic, venteParToken, verifierPaiementInscription,
} from "@/lib/admin/inscriptionServeur";

// ============================================================
//  INSCRIPTION EN LIGNE (v13.41) — route PUBLIQUE, sans compte.
//
//  GET                      → grille publique + moyens de paiement disponibles
//  GET  ?token=…            → résumé public d'une inscription (page « merci »)
//  POST { action: "inscrire", … }   → enregistre l'inscription (contrat signé),
//                                     envoie les emails, démarre le paiement
//  POST { action: "rappel", … }     → demande de rappel (à toute étape)
//  POST { action: "verifier", token } → vérifie le paiement, active si payé
//  POST { action: "payer", token }    → (re)crée la page de paiement
//
//  Les prix sont RECALCULÉS ici depuis la grille de l'éditeur (le
//  navigateur ne fait pas foi). Aucune remise exceptionnelle en ligne.
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_PAR_HEURE = 30;
const compteurs = new Map<string, { n: number; depuis: number }>();
function tropDeDemandes(ip: string): boolean {
  const maintenant = Date.now();
  const c = compteurs.get(ip);
  if (!c || maintenant - c.depuis > 3_600_000) {
    compteurs.set(ip, { n: 1, depuis: maintenant });
    return false;
  }
  c.n += 1;
  return c.n > MAX_PAR_HEURE;
}
const texte = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function parametresPublics(p: Parametres): ParametresPublics {
  const formules = {} as Parametres["formules"];
  for (const f of FORMULES) formules[f] = { ...p.formules[f] };
  return {
    formules, remiseEngagement: p.remiseEngagement, bonusAnnuelMensualites: p.bonusAnnuelMensualites, bonusAnnuelEuros: p.bonusAnnuelEuros,
    miseEnService: p.miseEnService, heureHorsForfait: p.heureHorsForfait, iban: p.iban, bic: p.bic, lienPaiementCb: p.lienPaiementCb,
    primeMensualiteAvecEngagement: p.primeMensualiteAvecEngagement, primeMensualiteSansEngagement: p.primeMensualiteSansEngagement, mensualitesReprise: p.mensualitesReprise,
  };
}
async function lireParametres(admin: NonNullable<ReturnType<typeof getAdminClient>>): Promise<Parametres> {
  const { data } = await admin.from("admin_parametres").select("valeur").eq("cle", "grille").maybeSingle();
  return fusionnerParametres((data?.valeur as Partial<Parametres>) || null);
}
function dispo(p: Parametres) {
  return { stripe: stripeConfigure(), qonto: qontoConfigure() || Boolean(p.lienPaiementCb) };
}
const ipDe = (req: Request) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "inconnue";

export async function GET(req: Request) {
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "Service non configuré." }, { status: 500 });
  const token = texte(new URL(req.url).searchParams.get("token"), 80);
  const p = await lireParametres(admin);
  if (!token) return NextResponse.json({ parametres: parametresPublics(p), dispo: dispo(p) });
  if (tropDeDemandes(ipDe(req))) return NextResponse.json({ error: "Trop de tentatives, réessayez dans une heure." }, { status: 429 });
  const v = await venteParToken(admin, token);
  if (!v) return NextResponse.json({ error: "Inscription introuvable." }, { status: 404 });
  return NextResponse.json({ inscription: resumePublic(v, p), parametres: parametresPublics(p), dispo: dispo(p) });
}

export async function POST(req: Request) {
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "Service non configuré." }, { status: 500 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (texte(body.site, 10)) return NextResponse.json({ ok: true }); // piège à robots
  const ip = ipDe(req);
  if (tropDeDemandes(ip)) return NextResponse.json({ error: "Trop d'envois, réessayez dans une heure." }, { status: 429 });
  const action = texte(body.action, 20) || "inscrire";
  const p = await lireParametres(admin);

  try {
    /* ---------------- Demande de rappel ---------------- */
    if (action === "rappel") {
      const tel = texte(body.tel, 40);
      if (tel.replace(/\D/g, "").length < 9) return NextResponse.json({ error: "Indiquez un numéro de téléphone valide." }, { status: 400 });
      const creneau = texte(body.creneau, 20);
      const ok = await enregistrerDemandeRappel(admin, {
        vente_id: null,
        garage_nom: texte(body.garage_nom, 160) || null,
        contact_nom: texte(body.contact_nom, 120) || null,
        tel,
        email: texte(body.email, 160).toLowerCase() || null,
        creneau: CRENEAUX_RAPPEL.some((c) => c.cle === creneau) ? creneau : null,
        message: texte(body.message, 1000) || null,
        etape: texte(body.etape, 40) || null,
        source_connaissance: texte(body.source_connaissance, 40) || null,
        formule_conseillee: texte(body.formule_conseillee, 20) || null,
        ip,
      });
      if (!ok) return NextResponse.json({ error: "Enregistrement impossible (migration v98 exécutée ?)." }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    /* ---------------- Vérifier / payer (page merci) ---------------- */
    if (action === "verifier" || action === "payer") {
      const v = await venteParToken(admin, texte(body.token, 80));
      if (!v) return NextResponse.json({ error: "Inscription introuvable." }, { status: 404 });
      if (action === "verifier") {
        await verifierPaiementInscription(admin, v);
        const maj = await venteParToken(admin, v.token || "");
        return NextResponse.json({ inscription: resumePublic(maj || v, p) });
      }
      if (v.paiement_confirme_le) return NextResponse.json({ error: "Le paiement est déjà confirmé." }, { status: 409 });
      const mode = (texte(body.mode, 20) || v.paiement_en_ligne_mode || "") as ModeEnLigne;
      let url: string | null = null;
      if (mode === "stripe" && v.periodicite === "mensuel") url = await demarrerStripe(admin, v, p);
      else if (mode === "qonto") url = await demarrerQonto(admin, v, p);
      else await admin.from("ventes").update({ paiement_en_ligne_mode: "virement", mode_paiement: "virement", paiement_demande: "virement", paiement_demande_le: new Date().toISOString() }).eq("id", v.id);
      const maj = await venteParToken(admin, v.token || "");
      return NextResponse.json({ url, inscription: resumePublic(maj || v, p) });
    }

    /* ---------------- Inscription ---------------- */
    const garage_nom = texte(body.garage_nom, 160);
    const contact_email = texte(body.contact_email, 160).toLowerCase();
    const contact_tel = texte(body.contact_tel, 40);
    const formule = texte(body.formule, 20) as Formule;
    if (!garage_nom || !contact_email || !FORMULES.includes(formule)) return NextResponse.json({ error: "Le nom du garage, l'email et la formule sont obligatoires." }, { status: 400 });
    if (!EMAIL_RE.test(contact_email)) return NextResponse.json({ error: "L'adresse email semble incorrecte." }, { status: 400 });
    if (contact_tel.replace(/\D/g, "").length < 9) return NextResponse.json({ error: "Indiquez un numéro de téléphone valide." }, { status: 400 });
    if (!body.cgv_acceptees) return NextResponse.json({ error: "Vous devez accepter les conditions générales de vente." }, { status: 400 });
    if (!body.cgu_acceptees) return NextResponse.json({ error: "Vous devez accepter les conditions générales d'utilisation." }, { status: 400 });
    if (!body.autorisation_sous_traitance) return NextResponse.json({ error: "Vous devez autoriser l'intervention d'un collaborateur externe (RGPD)." }, { status: 400 });
    const signature = typeof body.signature === "string" && body.signature.startsWith("data:image/png;base64,") ? body.signature.slice(0, 400_000) : null;
    if (!signature) return NextResponse.json({ error: "Votre signature est obligatoire." }, { status: 400 });
    const signataire_nom = texte(body.signataire_nom, 120);
    if (!signataire_nom) return NextResponse.json({ error: "Indiquez le nom du signataire." }, { status: 400 });
    const contrat_pdf = typeof body.contrat_pdf === "string" && body.contrat_pdf.length < 6_000_000 ? body.contrat_pdf.replace(/^data:application\/pdf;(filename=[^;]*;)?base64,/, "") : null;

    // Un garage qui a déjà une inscription en cours ne doit pas en recréer une.
    const { data: existante } = await admin.from("ventes").select("token,numero,paiement_confirme_le").eq("origine", "en_ligne").eq("contact_email", contact_email).in("statut", ["declaree", "validee", "compte_cree"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existante?.paiement_confirme_le) return NextResponse.json({ error: `Une inscription payée existe déjà pour ${contact_email} (n° ${existante.numero}). Connectez-vous à votre compte ou écrivez-nous.` }, { status: 409 });

    const periodicite = body.periodicite === "annuel" ? "annuel" : "mensuel";
    const engagement_12 = periodicite === "annuel" || Boolean(body.engagement_12);
    const prix = prixVente(formule, { engagement12: engagement_12, periodicite, remiseSupp: 0 }, p);
    const d = dispo(p);
    let mode = texte(body.paiement_en_ligne_mode, 20) as ModeEnLigne;
    if (periodicite === "mensuel") mode = mode === "stripe" && d.stripe ? "stripe" : "virement";
    else mode = mode === "qonto" && d.qonto ? "qonto" : "virement";

    const besoins: Besoins | null = body.besoins && typeof body.besoins === "object" ? (body.besoins as Besoins) : null;
    if (besoins && JSON.stringify(besoins).length > 100_000) return NextResponse.json({ error: "Fiche de besoins trop volumineuse." }, { status: 413 });
    const conseil = besoins ? recommanderFormule(besoins).formule : null;

    // Code apporteur FACULTATIF : s'il est valide, la vente est rattachée au commercial (prime).
    let code_apporteur: string | null = null;
    let collaborateur_id: string | null = null;
    const codeBrut = texte(body.code_apporteur, 20).toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (codeBrut.length >= 3) {
      const { data: c } = await admin.from("collaborateurs").select("id,type,statut,code_apporteur").ilike("code_apporteur", codeBrut).limit(1).maybeSingle();
      if (c && c.type === "commercial" && c.statut === "actif") { code_apporteur = codeBrut; collaborateur_id = c.id; }
    }
    const source = texte(body.source_connaissance, 40);
    const source_connaissance = SOURCES_CONNAISSANCE.some((s) => s.cle === source) ? source : source ? "autre" : null;

    const now = new Date();
    const numero = `W-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${String(Date.now()).slice(-5)}`;
    const token = nouveauToken();
    const ligne = {
      numero,
      origine: "en_ligne",
      token,
      code_apporteur,
      collaborateur_id,
      garage_nom,
      garage_siret: texte(body.garage_siret, 20) || null,
      garage_adresse: texte(body.garage_adresse, 200) || null,
      garage_cp: texte(body.garage_cp, 10) || null,
      garage_ville: texte(body.garage_ville, 100) || null,
      contact_nom: texte(body.contact_nom, 120) || null,
      contact_fonction: texte(body.contact_fonction, 80) || null,
      contact_tel,
      contact_email,
      formule,
      formule_conseillee: conseil,
      engagement_12,
      periodicite,
      remise_supp_pct: 0,
      prix_mensuel_ht: prix.mensualite,
      montant_annuel_ht: prix.montantAnnuel,
      mise_en_service_ht: prix.miseEnService,
      date_debut_souhaitee: texte(body.date_debut_souhaitee, 10) || null,
      mode_paiement: mode === "stripe" ? "prelevement" : mode === "qonto" ? "cb" : "virement",
      paiement_en_ligne_mode: mode,
      paiement_sur_place: false,
      besoins,
      source_connaissance,
      source_detail: texte(body.source_detail, 200) || null,
      cgv_acceptees: true,
      cgu_acceptees: true,
      version_cgu: texte(body.version_cgu, 40) || null,
      autorisation_sous_traitance: true,
      version_dpa: texte(body.version_dpa, 40) || null,
      signataire_nom,
      signataire_qualite: texte(body.signataire_qualite, 80) || null,
      signature,
      signe_le: now.toISOString(),
      statut: "declaree",
      ip,
      user_agent: (req.headers.get("user-agent") || "").slice(0, 300),
    };
    const { data, error } = await admin.from("ventes").insert(ligne).select("*").single();
    if (error || !data) {
      console.error("[inscription] enregistrement impossible :", error?.message);
      return NextResponse.json({ error: "Enregistrement impossible (migration v98 exécutée ?)." }, { status: 500 });
    }
    const v = data as VenteLigne;

    // Demande de rappel jointe à l'inscription (facultative).
    const rappelTel = texte(body.rappel_tel, 40) || contact_tel;
    const rappel = body.rappel_souhaite
      ? { tel: rappelTel, creneau: texte(body.rappel_creneau, 20), message: texte(body.rappel_message, 1000) }
      : null;
    if (rappel) {
      await enregistrerDemandeRappel(admin, {
        vente_id: v.id, garage_nom, contact_nom: ligne.contact_nom, tel: rappel.tel, email: contact_email,
        creneau: CRENEAUX_RAPPEL.some((c) => c.cle === rappel.creneau) ? rappel.creneau : null, message: rappel.message || null,
        etape: "contrat signé", source_connaissance, formule_conseillee: conseil, ip,
      }).catch(() => false);
    }

    // Paiement : page Stripe / lien Qonto créés tout de suite (best-effort : le garage pourra réessayer depuis la page merci).
    let url: string | null = null;
    let erreurPaiement: string | null = null;
    try {
      if (mode === "stripe") url = await demarrerStripe(admin, v, p);
      else if (mode === "qonto") url = await demarrerQonto(admin, v, p);
      else await admin.from("ventes").update({ paiement_demande: "virement", paiement_demande_le: now.toISOString() }).eq("id", v.id);
    } catch (e) {
      erreurPaiement = e instanceof Error ? e.message : "Paiement indisponible.";
      console.error("[inscription] paiement :", erreurPaiement);
    }

    const maj = (await venteParToken(admin, token)) || v;
    await envoyerConfirmationInscription(admin, maj, p, contrat_pdf, url).catch(() => false);
    await notifierEditeurInscription(admin, maj, p, rappel && rappel.tel ? rappel : null);

    return NextResponse.json({ ok: true, numero, token, url, erreurPaiement, inscription: resumePublic(maj, p) });
  } catch (e) {
    if (e instanceof ErreurInscription) return NextResponse.json({ error: e.message }, { status: e.status });
    const msg = e instanceof Error ? e.message : "Erreur inattendue.";
    console.error("[inscription]", msg);
    return NextResponse.json({ error: msg }, { status: (e as { status?: number })?.status || 500 });
  }
}
