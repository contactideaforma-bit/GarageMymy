import { NextResponse } from "next/server";
import { finRemiseLancement } from "@/lib/offreLancement";
import { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { estAdminServeur, tousLesComptes, comptesAdmin } from "@/lib/supportServeur";
import { envoyerEmailServeur } from "@/lib/mailer";
import { randomBytes } from "crypto";
import { ErreurCompte, SaisieCompteManuel, creerCompteDepuisAbonnement, creerCompteDepuisVente, creerCompteManuel, lignesMensualites, renvoyerBienvenueDepuisAbonnement, renvoyerBienvenueDepuisVente } from "@/lib/admin/compteGarageServeur";
import { emailBienvenueCommercialHtml, emailBienvenueCommercialTexte, sujetBienvenueCommercial, emailDocsCollaborateurHtml, emailDocsCollaborateurTexte, sujetDocsCollaborateur } from "@/lib/admin/emailCollaborateur";
import { lireDocPack } from "@/lib/admin/packDocsServeur";
import { docsPour, nomFichierDoc } from "@/lib/admin/packDocs";
import type { MailAttachment } from "@/lib/mailer";
import { appliquerFinsDeContrat, comptesAPurger, definirEtat, purgerCompte, EtatCompteRow } from "@/lib/admin/comptesServeur";
import { reactiverSiRegularise } from "@/lib/admin/paiementsServeur";
import { ErreurInscription, activerInscription } from "@/lib/admin/inscriptionServeur";
import { Formule, fusionnerParametres, lignesDues, Parametres, prixVente } from "@/lib/admin/economie";
import { consoliderAssureurs, consoliderExperts } from "@/lib/admin/annuaireMutualise";
import type { Assureur, Expert } from "@/lib/types";

// ============================================================
//  ESPACE ÉDITEUR — accès aux données d'administration (v53).
//
//  Toutes les tables de l'espace admin ont la RLS activée SANS politique :
//  elles n'existent pas pour le navigateur. Cette route est le SEUL chemin,
//  après vérification que l'appelant fait partie de ADMIN_EMAILS.
//
//  GET  ?table=<t>                    → lignes de la table (liste blanche)
//  GET  ?table=parametres             → paramètres du simulateur (fusionnés)
//  POST { action: "upsert", table, row }        → création / modification
//  POST { action: "delete", table, id }         → suppression
//  POST { action: "parametres", valeur }        → enregistre les paramètres
//  POST { action: "generer_mensualites", abonnement_id } → crée les mois manquants
//  POST { action: "generer_releve" }            → lignes dues manquantes
//  POST { action: "creer_compte_garage", vente_id } → compte Auth + email de bienvenue
//  POST { action: "creer_compte_manuel", saisie }   → compte garage de A à Z (v13.31)
//  POST { action: "renvoyer_bienvenue", vente_id | abonnement_id } → nouveau mot de passe provisoire + email
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 30;

const TABLES = ["collaborateurs", "abonnements", "abonnement_mensualites", "collaborateur_reglements", "collaborateur_demandes", "collaborateur_documents", "ventes", "comptes_etat", "comptes_purges", "prospects", "prospect_documents", "prospect_interactions", "demandes_rappel", "mutualise_experts", "mutualise_assureurs"] as const;
type Table = (typeof TABLES)[number];
const ORDRE: Record<Table, { col: string; asc: boolean }> = {
  collaborateurs: { col: "nom", asc: true },
  abonnements: { col: "date_signature", asc: false },
  abonnement_mensualites: { col: "periode", asc: true },
  collaborateur_reglements: { col: "created_at", asc: false },
  collaborateur_demandes: { col: "created_at", asc: false },
  collaborateur_documents: { col: "created_at", asc: false },
  ventes: { col: "created_at", asc: false },
  comptes_etat: { col: "maj_le", asc: false },
  comptes_purges: { col: "purge_le", asc: false },
  prospects: { col: "maj_le", asc: false },
  prospect_documents: { col: "created_at", asc: false },
  // v13.1 — journal des contacts, lu par /admin/prospection (suivi éditeur)
  prospect_interactions: { col: "created_at", asc: false },
  // v13.41 — demandes de rappel du parcours d'inscription en ligne
  demandes_rappel: { col: "created_at", asc: false },
  // v13.51 — base mutualisée experts & assureurs (consolidée depuis tous les garages)
  mutualise_experts: { col: "garages", asc: false },
  mutualise_assureurs: { col: "garages", asc: false },
};

type Garde = { erreur: NextResponse; admin: null } | { erreur: null; admin: SupabaseClient };
async function garde(req: Request): Promise<Garde> {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return { erreur: NextResponse.json(REPONSE_401, { status: 401 }), admin: null };
  if (!estAdminServeur(user.email)) {
    return { erreur: NextResponse.json({ error: "Accès réservé à l'éditeur de l'application." }, { status: 403 }), admin: null };
  }
  const admin = getAdminClient();
  if (!admin) return { erreur: NextResponse.json({ error: "Service non configuré (SUPABASE_SERVICE_ROLE_KEY)." }, { status: 500 }), admin: null };
  return { erreur: null, admin };
}

async function lireParametres(admin: SupabaseClient): Promise<Parametres> {
  const { data } = await admin.from("admin_parametres").select("valeur").eq("cle", "grille").maybeSingle();
  return fusionnerParametres((data?.valeur as Partial<Parametres>) || null);
}

export async function GET(req: Request) {
  const g = await garde(req);
  if (g.erreur) return g.erreur;
  const { admin } = g;
  const table = new URL(req.url).searchParams.get("table") || "";
  if (table === "parametres") return NextResponse.json({ parametres: await lireParametres(admin) });
  // Comptes Auth (id + email) : pour rattacher un abonnement à un compte garage.
  if (table === "comptes") return NextResponse.json({ rows: await tousLesComptes(admin) });
  if (table === "a_purger") return NextResponse.json({ rows: await comptesAPurger(admin) });
  if (!TABLES.includes(table as Table)) return NextResponse.json({ error: "Table inconnue." }, { status: 400 });
  const o = ORDRE[table as Table];
  const { data, error } = await admin.from(table).select("*").order(o.col, { ascending: o.asc });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data || [] });
}

function premierDuMois(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function POST(req: Request) {
  const g = await garde(req);
  if (g.erreur) return g.erreur;
  const { admin } = g;
  let body: {
    action?: string; table?: string; row?: Record<string, unknown>; id?: string; valeur?: unknown; abonnement_id?: string;
    vente_id?: string; date_debut?: string; secretaire_id?: string | null; remise_acceptee?: boolean; reference?: string;
    metier?: string; owner_id?: string; etat?: EtatCompteRow["etat"]; message?: string | null; motif?: string | null; fin_le?: string | null; purge_le?: string | null; confirmation?: string;
    collaborateur_id?: string; email?: string; cles?: string[]; contrat_pdf?: string | null; contrat_nom?: string | null;
    saisie?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  // ---- paramètres du simulateur
  if (body.action === "parametres") {
    const valeur = fusionnerParametres((body.valeur as Partial<Parametres>) || null);
    const { error } = await admin.from("admin_parametres").upsert({ cle: "grille", valeur, maj_le: new Date().toISOString() });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, parametres: valeur });
  }

  // ---- mensualités manquantes d'un abonnement (du 1er mois à aujourd'hui, ou à la fin)
  if (body.action === "generer_mensualites") {
    const { data: a, error } = await admin.from("abonnements").select("*").eq("id", body.abonnement_id || "").maybeSingle();
    if (error || !a) return NextResponse.json({ error: "Abonnement introuvable." }, { status: 404 });
    const debut = new Date(a.date_debut);
    const lignes: { abonnement_id: string; periode: string; montant_ht: number; notes?: string }[] = [];
    const d = new Date(debut.getFullYear(), debut.getMonth(), 1);
    if (a.periodicite === "annuel") {
      // FORFAIT ANNUEL payé en une fois : 12 mois créés d'avance, chacun
      // valant un douzième (le dernier absorbe l'arrondi). Le pointage du
      // paiement annuel coche les 12 d'un coup (côté interface).
      const total = Number(a.montant_annuel) || Number(a.prix_ht) * 12;
      const part = Math.floor((total / 12) * 100) / 100;
      for (let i = 0; i < 12; i++) {
        lignes.push({ abonnement_id: a.id, periode: premierDuMois(d), montant_ht: i === 11 ? Math.round((total - part * 11) * 100) / 100 : part, notes: "Forfait annuel" });
        d.setMonth(d.getMonth() + 1);
      }
    } else {
      const fin = a.date_fin ? new Date(a.date_fin) : new Date();
      while (d <= fin) {
        lignes.push({ abonnement_id: a.id, periode: premierDuMois(d), montant_ht: Number(a.prix_ht) });
        d.setMonth(d.getMonth() + 1);
      }
    }
    if (!lignes.length) return NextResponse.json({ ok: true, ajoutees: 0 });
    const { error: e2 } = await admin.from("abonnement_mensualites").upsert(lignes, { onConflict: "abonnement_id,periode", ignoreDuplicates: true });
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    return NextResponse.json({ ok: true, ajoutees: lignes.length });
  }

  // ---- MÉTIER D'UN COMPTE (v10.2) : carrosserie | vitrage | commercial.
  //      Remplace l'UPDATE SQL sur auth.users (interdit depuis l'éditeur SQL
  //      quand il tourne en rôle « authenticated ») : ici la clé service role
  //      écrit app_metadata, que le client ne peut pas modifier.
  if (body.action === "definir_metier") {
    const metier = body.metier;
    if (!body.owner_id || (metier !== "carrosserie" && metier !== "vitrage" && metier !== "commercial")) {
      return NextResponse.json({ error: "Compte ou métier manquant." }, { status: 400 });
    }
    const { data: u } = await admin.auth.admin.getUserById(body.owner_id);
    if (!u?.user) return NextResponse.json({ error: "Compte introuvable." }, { status: 404 });
    const { error } = await admin.auth.admin.updateUserById(body.owner_id, { app_metadata: { ...(u.user.app_metadata || {}), metier } });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, metier });
  }

  // ---- ÉTAT D'UN COMPTE GARAGE (v10.1) : suspendre / lecture seule / réactiver
  if (body.action === "etat_compte") {
    if (!body.owner_id || !body.etat) return NextResponse.json({ error: "Compte ou état manquant." }, { status: 400 });
    try {
      await definirEtat(admin, {
        owner_id: body.owner_id,
        etat: body.etat,
        motif: body.motif ?? null,
        message: body.message ?? null,
        fin_le: body.fin_le ?? null,
        purge_le: body.etat === "actif" ? null : (body.purge_le ?? null),
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Enregistrement impossible (migration v56 ?)." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }
  // ---- applique les fins de contrat maintenant (sans attendre le cron)
  if (body.action === "appliquer_fins") {
    try {
      return NextResponse.json({ ok: true, ...(await appliquerFinsDeContrat(admin)) });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Impossible." }, { status: 500 });
    }
  }
  // ---- PURGE d'un compte : irréversible, confirmation par le mot PURGER
  if (body.action === "purger_compte") {
    if (!body.owner_id) return NextResponse.json({ error: "Compte manquant." }, { status: 400 });
    if (body.confirmation !== "PURGER") return NextResponse.json({ error: "Confirmation manquante." }, { status: 400 });
    try {
      const r = await purgerCompte(admin, body.owner_id, "Purge manuelle depuis l'espace éditeur");
      return NextResponse.json({ ok: true, ...r });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Purge impossible." }, { status: 500 });
    }
  }

  // ---- VALIDATION D'UNE VENTE (v10.0) : crée l'abonnement + mensualités,
  //      rattache le commercial, passe la vente en « validée ».
  // ---- CRÉATION DU COMPTE DU GARAGE + EMAIL DE BIENVENUE (v10.5) ----
  // Remplace la création manuelle dans Supabase : crée l'utilisateur Auth
  // avec un mot de passe provisoire, rattache l'abonnement, passe la vente
  // en « compte créé » et envoie l'email de bienvenue aux couleurs de
  // l'appli (SMTP du compte admin, repli Resend).
  if (body.action === "creer_compte_garage") {
    try {
      const r = body.abonnement_id
        ? await creerCompteDepuisAbonnement(admin, body.abonnement_id)
        : await creerCompteDepuisVente(admin, body.vente_id || "", { par: "editeur" });
      return NextResponse.json(r);
    } catch (e) {
      const status = e instanceof ErreurCompte ? e.status : 500;
      return NextResponse.json({ error: e instanceof Error ? e.message : "Création impossible." }, { status });
    }
  }

  // ---- CRÉATION D'UN COMPTE GARAGE DE A À Z (v13.31) ----
  // Sans vente ni commercial : l'éditeur saisit le garage et l'offre, on
  // crée l'abonnement (+ mensualités), le compte Auth, le profil pré-rempli
  // et on envoie l'email de bienvenue. Logique partagée : compteGarageServeur.
  if (body.action === "creer_compte_manuel") {
    try {
      const r = await creerCompteManuel(admin, (body.saisie || {}) as SaisieCompteManuel);
      return NextResponse.json(r);
    } catch (e) {
      const status = e instanceof ErreurCompte ? e.status : 500;
      return NextResponse.json({ error: e instanceof Error ? e.message : "Création impossible." }, { status });
    }
  }

  // ---- RENVOI DE L'EMAIL DE BIENVENUE (v13.31) : nouveau mot de passe provisoire
  if (body.action === "renvoyer_bienvenue") {
    try {
      const r = body.abonnement_id
        ? await renvoyerBienvenueDepuisAbonnement(admin, body.abonnement_id)
        : await renvoyerBienvenueDepuisVente(admin, body.vente_id || "", {});
      return NextResponse.json(r);
    } catch (e) {
      const status = e instanceof ErreurCompte ? e.status : 500;
      return NextResponse.json({ error: e instanceof Error ? e.message : "Renvoi impossible." }, { status });
    }
  }

  // ---- CRÉATION DU COMPTE DU COMMERCIAL (v10.6) ----
  // Depuis la fiche collaborateur : email perso → compte Auth (mot de passe
  // provisoire, métier « commercial » posé en app_metadata), rattachement
  // collaborateurs.owner_id, email de bienvenue à la charte. Plus besoin de
  // passer par Supabase → Authentication.
  if (body.action === "creer_compte_collaborateur") {
    const { data: collab } = await admin.from("collaborateurs").select("*").eq("id", body.collaborateur_id || "").maybeSingle();
    if (!collab) return NextResponse.json({ error: "Collaborateur introuvable." }, { status: 404 });
    if (collab.type !== "commercial") {
      return NextResponse.json({ error: "Seuls les commerciaux ont un compte dédié : le chargé de mission utilise le compte du garage de son portefeuille." }, { status: 400 });
    }
    if (collab.owner_id) return NextResponse.json({ error: "Un compte est déjà rattaché à cette fiche." }, { status: 409 });
    const email = String(body.email || collab.email || "").trim().toLowerCase();
    if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email)) {
      return NextResponse.json({ error: "Email du commercial manquant ou invalide." }, { status: 400 });
    }

    const nom = [collab.prenom, collab.nom].filter(Boolean).join(" ");
    const comptes = await tousLesComptes(admin);
    const existant = comptes.find((c) => c.email.toLowerCase() === email);
    let ownerId = existant?.id || null;
    let motDePasse: string | null = null;

    if (!existant) {
      const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
      const brut = randomBytes(12);
      motDePasse = Array.from(brut, (b) => alphabet[b % alphabet.length]).join("");
      const { data: cree, error: eUser } = await admin.auth.admin.createUser({
        email,
        password: motDePasse,
        email_confirm: true,
        user_metadata: { nom },
        app_metadata: { metier: "commercial" },
      });
      if (eUser || !cree?.user) {
        return NextResponse.json({ error: `Création du compte impossible : ${eUser?.message || "erreur Auth"}` }, { status: 500 });
      }
      ownerId = cree.user.id;
    } else {
      // Compte existant : on le rattache et on pose le métier commercial.
      const { data: u } = await admin.auth.admin.getUserById(existant.id);
      await admin.auth.admin.updateUserById(existant.id, { app_metadata: { ...(u?.user?.app_metadata || {}), metier: "commercial" } });
    }

    await admin.from("collaborateurs").update({ owner_id: ownerId, email }).eq("id", collab.id);

    // Email de bienvenue (uniquement si le compte vient d'être créé).
    let emailEnvoye = false;
    let erreurEmail: string | null = null;
    if (motDePasse) {
      const b = {
        nom: nom || email,
        email,
        motDePasse,
        codeApporteur: collab.code_apporteur || null,
        zone: collab.zone || null,
        url: process.env.NEXT_PUBLIC_SITE_URL || "https://myeasyauto.fr",
      };
      const expediteur = (await comptesAdmin(admin))[0];
      const res = await envoyerEmailServeur(
        { to: email, subject: sujetBienvenueCommercial(), html: emailBienvenueCommercialHtml(b), text: emailBienvenueCommercialTexte(b) },
        expediteur?.id || ownerId || ""
      );
      emailEnvoye = res.ok;
      if (!res.ok) erreurEmail = res.error || "Envoi impossible.";
    }

    return NextResponse.json({
      ok: true,
      owner_id: ownerId,
      dejaExistant: Boolean(existant),
      emailEnvoye,
      erreurEmail,
      // Si l'email n'est pas parti, l'éditeur transmet lui-même le mot de passe.
      motDePasse: motDePasse && !emailEnvoye ? motDePasse : undefined,
    });
  }

  // ---- ENVOI DE LA DOCUMENTATION PAR EMAIL (v10.6) ----
  // Depuis la fiche collaborateur : documents d'information du pack
  // (liste blanche packDocs) + éventuel contrat de collaboration PDF
  // généré côté navigateur (base64). Pensé pour le chargé de mission (pas de
  // compte dédié), utilisable aussi pour un commercial.
  if (body.action === "envoyer_docs_collaborateur") {
    const { data: collab } = await admin.from("collaborateurs").select("*").eq("id", body.collaborateur_id || "").maybeSingle();
    if (!collab) return NextResponse.json({ error: "Collaborateur introuvable." }, { status: 404 });
    const email = String(body.email || collab.email || "").trim().toLowerCase();
    if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email)) {
      return NextResponse.json({ error: "Email du collaborateur manquant ou invalide (complète la fiche)." }, { status: 400 });
    }
    const type = collab.type === "commercial" ? ("commercial" as const) : ("secretaire" as const);
    const autorises = docsPour(type);
    const cles = Array.isArray(body.cles) ? body.cles.filter((c): c is string => typeof c === "string") : [];
    const attachments: MailAttachment[] = [];
    const titres: string[] = [];
    for (const cle of cles.slice(0, 12)) {
      if (!autorises.some((d) => d.cle === cle)) continue;
      const r = await lireDocPack(cle);
      if (!r) continue;
      attachments.push({ filename: nomFichierDoc(r.doc), content: r.contenu.toString("base64") });
      titres.push(r.doc.titre);
    }
    // Contrat généré dans le navigateur (dataURL ou base64 brut), ≤ 4 Mo.
    const contratJoint = typeof body.contrat_pdf === "string" && body.contrat_pdf.length > 0;
    if (contratJoint) {
      const base64 = String(body.contrat_pdf).replace(/^data:application\/pdf;(?:filename=[^;]*;)?base64,/, "");
      if (base64.length > 4 * 1024 * 1024 * 1.4) return NextResponse.json({ error: "Contrat trop volumineux pour un email." }, { status: 413 });
      attachments.unshift({ filename: String(body.contrat_nom || "contrat-collaboration.pdf"), content: base64 });
    }
    if (!attachments.length) return NextResponse.json({ error: "Aucun document à envoyer." }, { status: 400 });

    const i = { nom: [collab.prenom, collab.nom].filter(Boolean).join(" ") || email, type, titres, contratJoint };
    const expediteur = (await comptesAdmin(admin))[0];
    const res = await envoyerEmailServeur(
      { to: email, subject: sujetDocsCollaborateur(i), html: emailDocsCollaborateurHtml(i), text: emailDocsCollaborateurTexte(i), attachments },
      expediteur?.id || ""
    );
    if (!res.ok) return NextResponse.json({ error: res.error || "Envoi impossible." }, { status: 500 });
    return NextResponse.json({ ok: true, envoyes: attachments.length, a: email });
  }

  // v13.41 — INSCRIPTION EN LIGNE : l'éditeur constate le virement (ou force
  // l'activation) → vente payée + abonnement + compte + bienvenue, d'un coup.
  if (body.action === "activer_inscription") {
    const { data: v } = await admin.from("ventes").select("id,origine,paiement_confirme_le,prix_mensuel_ht,montant_annuel_ht,mise_en_service_ht,periodicite").eq("id", body.vente_id || "").maybeSingle();
    if (!v) return NextResponse.json({ error: "Inscription introuvable." }, { status: 404 });
    if (!v.paiement_confirme_le) {
      const base = v.periodicite === "annuel" ? Number(v.montant_annuel_ht) || 0 : Number(v.prix_mensuel_ht) || 0;
      await admin.from("ventes").update({
        paiement_confirme_le: new Date().toISOString(), paiement_valide_le: new Date().toISOString(),
        paiement_montant: Math.round((base + (Number(v.mise_en_service_ht) || 0)) * 100) / 100,
        paiement_reference: typeof body.reference === "string" && body.reference.trim() ? body.reference.trim().slice(0, 120) : "Confirmé par l'éditeur",
      }).eq("id", v.id);
    }
    try {
      const r = await activerInscription(admin, v.id);
      return NextResponse.json({ ok: true, ...r });
    } catch (e) {
      if (e instanceof ErreurInscription) return NextResponse.json({ error: e.message }, { status: e.status });
      return NextResponse.json({ error: e instanceof Error ? e.message : "Activation impossible." }, { status: 500 });
    }
  }

  if (body.action === "valider_vente") {
    const { data: v, error } = await admin.from("ventes").select("*").eq("id", body.vente_id || "").maybeSingle();
    if (error || !v) return NextResponse.json({ error: "Vente introuvable." }, { status: 404 });
    if (v.abonnement_id) return NextResponse.json({ error: "Cette vente est déjà rattachée à un abonnement." }, { status: 409 });
    const p = await lireParametres(admin);
    const formule = v.formule as Formule;
    const engagement = Boolean(v.engagement_12) || v.periodicite === "annuel";
    // Remise exceptionnelle : appliquée seulement si l'éditeur l'accepte.
    const remiseSupp = body.remise_acceptee ? Number(v.remise_supp_pct) || 0 : 0;
    // v13.44 — l'offre de lancement est celle ENREGISTRÉE sur la vente à la signature (pas la date de validation).
    const lancementVente = Number(v.lancement_pct) > 0;
    const prix = prixVente(formule, { engagement12: engagement, periodicite: v.periodicite, remiseSupp, lancement: lancementVente }, p);
    const dateDebut = body.date_debut || v.date_debut_souhaitee || premierDuMois(new Date());
    const lancementPct = Number(v.lancement_pct) || 0;
    const lancementMois = Number(v.lancement_mois) || 0;
    const lancementFin = lancementPct > 0 && lancementMois > 0 && v.periodicite === "mensuel" ? finRemiseLancement(dateDebut, lancementMois) : null;
    const prixMensuel = prix.montantAnnuel != null ? Math.round((prix.montantAnnuel / 12) * 100) / 100 : prix.mensualite;
    const remisePct = Math.round((100 - (prixMensuel / p.formules[formule].prix) * 100) * 100) / 100;
    const { data: abo, error: eAbo } = await admin
      .from("abonnements")
      .insert({
        garage_nom: v.garage_nom,
        garage_email: v.contact_email,
        formule,
        prix_ht: prixMensuel,
        remise_pct: remisePct,
        periodicite: v.periodicite,
        montant_annuel: prix.montantAnnuel,
        heures: p.formules[formule].heures,
        lancement_pct: lancementPct,
        lancement_fin: lancementFin,
        lancement_code: lancementVente ? v.lancement_code || null : null,
        date_signature: (v.signe_le || v.created_at).slice(0, 10),
        date_debut: dateDebut,
        engagement_12: engagement,
        statut: "actif",
        commercial_id: v.collaborateur_id,
        secretaire_id: body.secretaire_id || null,
        notes: `Vente ${v.numero || ""} déclarée par le code ${v.code_apporteur}. Paiement : ${v.mode_paiement}${v.paiement_sur_place ? ` — reçu sur place ${v.paiement_montant ?? ""} € (réf. ${v.paiement_reference || "—"})` : ""}.`,
      })
      .select("id")
      .single();
    if (eAbo || !abo) return NextResponse.json({ error: eAbo?.message || "Création de l'abonnement impossible." }, { status: 500 });
    // Mensualités (même logique que generer_mensualites) — v13.44 : remisées pendant l'offre de lancement.
    const lignes = lignesMensualites(abo.id, v.periodicite, dateDebut, prixMensuel, prix.montantAnnuel, { pct: lancementPct, fin: lancementFin });
    if (lignes.length) await admin.from("abonnement_mensualites").upsert(lignes, { onConflict: "abonnement_id,periode", ignoreDuplicates: true });
    // v13.31 — le commercial a pu créer le compte AVANT la validation : on
    // garde le statut « compte créé » et on rattache l'abonnement au compte.
    const dejaCree = v.statut === "compte_cree";
    if (dejaCree) {
      const email = String(v.contact_email || "").toLowerCase();
      const compte = (await tousLesComptes(admin)).find((c) => c.email.toLowerCase() === email);
      if (compte) await admin.from("abonnements").update({ garage_owner_id: compte.id }).eq("id", abo.id);
    }
    await admin
      .from("ventes")
      .update({ statut: dejaCree ? "compte_cree" : "validee", abonnement_id: abo.id, validee_le: new Date().toISOString(), remise_supp_pct: remiseSupp })
      .eq("id", v.id);
    return NextResponse.json({ ok: true, abonnement_id: abo.id });
  }

  // ---- relevé : toutes les lignes dues qui n'existent pas encore
  if (body.action === "generer_releve") {
    const p = await lireParametres(admin);
    const [abos, mens, collabs] = await Promise.all([
      admin.from("abonnements").select("*"),
      admin.from("abonnement_mensualites").select("*"),
      admin.from("collaborateurs").select("id,type,taux_retrocession"),
    ]);
    if (abos.error || mens.error || collabs.error) {
      return NextResponse.json({ error: (abos.error || mens.error || collabs.error)?.message }, { status: 500 });
    }
    const dues = lignesDues(abos.data || [], mens.data || [], collabs.data || [], p);
    if (!dues.length) return NextResponse.json({ ok: true, ajoutees: 0, total: 0 });
    const { data: existantes } = await admin.from("collaborateur_reglements").select("cle").in("cle", dues.map((l) => l.cle));
    const deja = new Set((existantes || []).map((e) => e.cle));
    const nouvelles = dues.filter((l) => !deja.has(l.cle));
    if (nouvelles.length) {
      const { error } = await admin.from("collaborateur_reglements").insert(nouvelles.map((l) => ({ ...l, statut: "a_payer" })));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, ajoutees: nouvelles.length, total: dues.length });
  }

  // ---- BASE MUTUALISÉE (v13.51) : relire experts + assureurs de TOUS les
  //      garages (service role, hors RLS), fusionner les doublons, compter
  //      les garages, et mettre à jour les tables mutualisées SANS écraser
  //      ce que l'éditeur a corrigé (notes, vérifié, partagé — non envoyés
  //      dans l'upsert, donc conservés). Les clients
  //      ne sont jamais lus.
  if (body.action === "consolider_annuaire") {
    const [ex, as] = await Promise.all([
      admin.from("experts").select("*"),
      admin.from("assureurs").select("*"),
    ]);
    if (ex.error) return NextResponse.json({ error: ex.error.message }, { status: 500 });
    if (as.error) return NextResponse.json({ error: as.error.message }, { status: 500 });
    const experts = consoliderExperts((ex.data || []) as (Expert & { owner_id?: string | null })[]);
    const assureurs = consoliderAssureurs((as.data || []) as (Assureur & { owner_id?: string | null })[]);
    const maj_le = new Date().toISOString();
    // Une ligne cochée « vérifié » par l'éditeur n'est plus écrasée par les
    // données des garages (seul son compteur de garages est rafraîchi).
    const [vE, vA] = await Promise.all([
      admin.from("mutualise_experts").select("cle").eq("verifie", true),
      admin.from("mutualise_assureurs").select("cle").eq("verifie", true),
    ]);
    const verifE = new Set((vE.data || []).map((r) => r.cle as string));
    const verifA = new Set((vA.data || []).map((r) => r.cle as string));
    for (const r of experts.filter((x) => verifE.has(x.cle))) await admin.from("mutualise_experts").update({ garages: r.garages, maj_le }).eq("cle", r.cle);
    for (const r of assureurs.filter((x) => verifA.has(x.cle))) await admin.from("mutualise_assureurs").update({ garages: r.garages, maj_le }).eq("cle", r.cle);
    const expertsAEcrire = experts.filter((x) => !verifE.has(x.cle));
    const assureursAEcrire = assureurs.filter((x) => !verifA.has(x.cle));
    let erreur: string | null = null;
    if (expertsAEcrire.length) {
      const { error } = await admin.from("mutualise_experts").upsert(expertsAEcrire.map(({ notes: _n, ...r }) => ({ ...r, maj_le })), { onConflict: "cle" });
      if (error) erreur = error.message;
    }
    if (!erreur && assureursAEcrire.length) {
      const { error } = await admin.from("mutualise_assureurs").upsert(assureursAEcrire.map(({ notes: _n, ...r }) => ({ ...r, maj_le })), { onConflict: "cle" });
      if (error) erreur = error.message;
    }
    if (erreur) return NextResponse.json({ error: erreur }, { status: 500 });
    return NextResponse.json({ ok: true, experts: experts.length, assureurs: assureurs.length, lus: { experts: ex.data?.length || 0, assureurs: as.data?.length || 0 } });
  }

  // ---- CRUD générique sur la liste blanche
  const table = body.table || "";
  if (!TABLES.includes(table as Table)) return NextResponse.json({ error: "Table inconnue." }, { status: 400 });

  if (body.action === "delete") {
    if (!body.id) return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
    const { error } = await admin.from(table).delete().eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "upsert") {
    const row = body.row || {};
    // Les chaînes vides deviennent NULL (dates, numériques, clés étrangères).
    const propre: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) propre[k] = v === "" ? null : v;
    if (!propre.id) delete propre.id;
    const { data, error } = await admin.from(table).upsert(propre).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // v13.33 — mensualité pointée « payée » : un compte suspendu pour impayé
    // est réactivé dès que plus rien n'est en retard sur l'abonnement.
    if (table === "abonnement_mensualites" && propre.payee_le && typeof data?.abonnement_id === "string") {
      try { await reactiverSiRegularise(admin, data.abonnement_id); } catch { /* best-effort */ }
    }
    // FICHE COMMERCIALE rattachée à un compte (v10.2) : le compte devient
    // automatiquement « commercial » (app_metadata) — pas besoin du bouton.
    let metierPose: string | null = null;
    if (table === "collaborateurs" && propre.type === "commercial" && typeof propre.owner_id === "string" && propre.owner_id) {
      const { data: u } = await admin.auth.admin.getUserById(propre.owner_id);
      if (u?.user && u.user.app_metadata?.metier !== "commercial") {
        const { error: eM } = await admin.auth.admin.updateUserById(propre.owner_id, { app_metadata: { ...(u.user.app_metadata || {}), metier: "commercial" } });
        if (!eM) metierPose = "commercial";
      }
    }
    return NextResponse.json({ ok: true, row: data, metierPose });
  }
  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}
