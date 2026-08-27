import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { estAdminServeur, tousLesComptes, comptesAdmin } from "@/lib/supportServeur";
import { envoyerEmailServeur } from "@/lib/mailer";
import { emailBienvenueHtml, emailBienvenueTexte, sujetBienvenue } from "@/lib/admin/emailBienvenue";
import { randomBytes } from "crypto";
import { appliquerFinsDeContrat, comptesAPurger, definirEtat, purgerCompte, EtatCompteRow } from "@/lib/admin/comptesServeur";
import { Formule, fusionnerParametres, lignesDues, Parametres, prixVente } from "@/lib/admin/economie";

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
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 30;

const TABLES = ["collaborateurs", "abonnements", "abonnement_mensualites", "collaborateur_reglements", "collaborateur_demandes", "ventes", "comptes_etat", "comptes_purges", "prospects", "prospect_documents"] as const;
type Table = (typeof TABLES)[number];
const ORDRE: Record<Table, { col: string; asc: boolean }> = {
  collaborateurs: { col: "nom", asc: true },
  abonnements: { col: "date_signature", asc: false },
  abonnement_mensualites: { col: "periode", asc: true },
  collaborateur_reglements: { col: "created_at", asc: false },
  collaborateur_demandes: { col: "created_at", asc: false },
  ventes: { col: "created_at", asc: false },
  comptes_etat: { col: "maj_le", asc: false },
  comptes_purges: { col: "purge_le", asc: false },
  prospects: { col: "maj_le", asc: false },
  prospect_documents: { col: "created_at", asc: false },
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
    vente_id?: string; date_debut?: string; secretaire_id?: string | null; remise_acceptee?: boolean;
    metier?: string; owner_id?: string; etat?: EtatCompteRow["etat"]; message?: string | null; motif?: string | null; fin_le?: string | null; purge_le?: string | null; confirmation?: string;
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
    const { data: v } = await admin.from("ventes").select("*").eq("id", body.vente_id || "").maybeSingle();
    if (!v) return NextResponse.json({ error: "Vente introuvable." }, { status: 404 });
    const email = String(v.contact_email || "").trim().toLowerCase();
    if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email)) {
      return NextResponse.json({ error: "Email du garage manquant ou invalide sur la vente." }, { status: 400 });
    }

    // Compte déjà existant ? On rattache sans toucher au mot de passe.
    const comptes = await tousLesComptes(admin);
    const existant = comptes.find((c) => c.email.toLowerCase() === email);
    let ownerId = existant?.id || null;
    let motDePasse: string | null = null;

    if (!existant) {
      // Mot de passe provisoire : 12 caractères lisibles (sans ambigus).
      const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
      const brut = randomBytes(12);
      motDePasse = Array.from(brut, (b) => alphabet[b % alphabet.length]).join("");
      const { data: cree, error: eUser } = await admin.auth.admin.createUser({
        email,
        password: motDePasse,
        email_confirm: true,
        user_metadata: { garage: v.garage_nom },
      });
      if (eUser || !cree?.user) {
        return NextResponse.json({ error: `Création du compte impossible : ${eUser?.message || "erreur Auth"}` }, { status: 500 });
      }
      ownerId = cree.user.id;
    }

    // Rattachements : abonnement → owner, vente → compte créé.
    if (v.abonnement_id && ownerId) {
      await admin.from("abonnements").update({ garage_owner_id: ownerId, garage_email: email }).eq("id", v.abonnement_id);
    }
    await admin.from("ventes").update({ statut: "compte_cree" }).eq("id", v.id);

    // Email de bienvenue (seulement si on vient de créer le compte : un
    // compte existant a déjà son mot de passe).
    let emailEnvoye = false;
    let erreurEmail: string | null = null;
    if (motDePasse) {
      const p = await lireParametres(admin);
      const f = p.formules[v.formule as Formule];
      let secretaireNom: string | null = null;
      let commercialNom: string | null = null;
      const ids = [v.collaborateur_id].filter(Boolean);
      if (v.abonnement_id) {
        const { data: abo } = await admin.from("abonnements").select("secretaire_id").eq("id", v.abonnement_id).maybeSingle();
        if (abo?.secretaire_id) ids.push(abo.secretaire_id);
      }
      if (ids.length) {
        const { data: cs } = await admin.from("collaborateurs").select("id,prenom,nom,type").in("id", ids);
        for (const c of cs || []) {
          const nomC = [c.prenom, c.nom].filter(Boolean).join(" ");
          if (c.type === "secretaire") secretaireNom = nomC;
          else if (c.id === v.collaborateur_id) commercialNom = nomC;
        }
      }
      const b = {
        garageNom: v.garage_nom as string,
        contactNom: (v.contact_nom as string) || null,
        email,
        motDePasse,
        formule: f ? f.libelle : null,
        heures: f?.heures || null,
        secretaireNom,
        commercialNom,
        url: process.env.NEXT_PUBLIC_SITE_URL || "https://myeasyauto.fr",
      };
      const expediteur = (await comptesAdmin(admin))[0];
      const res = await envoyerEmailServeur(
        { to: email, subject: sujetBienvenue(v.garage_nom), html: emailBienvenueHtml(b), text: emailBienvenueTexte(b) },
        expediteur?.id || ownerId || ""
      );
      emailEnvoye = res.ok;
      if (!res.ok) erreurEmail = res.error || "Envoi impossible.";
    }

    return NextResponse.json({
      ok: true,
      dejaExistant: Boolean(existant),
      emailEnvoye,
      erreurEmail,
      // Si l'email n'est pas parti, l'éditeur doit pouvoir transmettre le
      // mot de passe provisoire lui-même : on ne le renvoie QUE dans ce cas.
      motDePasse: motDePasse && !emailEnvoye ? motDePasse : undefined,
    });
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
    const prix = prixVente(formule, { engagement12: engagement, periodicite: v.periodicite, remiseSupp }, p);
    const dateDebut = body.date_debut || v.date_debut_souhaitee || premierDuMois(new Date());
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
    // Mensualités (même logique que generer_mensualites)
    const d = new Date(dateDebut);
    const m0 = new Date(d.getFullYear(), d.getMonth(), 1);
    const lignes: { abonnement_id: string; periode: string; montant_ht: number; notes?: string }[] = [];
    if (v.periodicite === "annuel") {
      const total = Number(prix.montantAnnuel) || prixMensuel * 12;
      const part = Math.floor((total / 12) * 100) / 100;
      for (let i = 0; i < 12; i++) {
        lignes.push({ abonnement_id: abo.id, periode: premierDuMois(m0), montant_ht: i === 11 ? Math.round((total - part * 11) * 100) / 100 : part, notes: "Forfait annuel" });
        m0.setMonth(m0.getMonth() + 1);
      }
    } else {
      const fin = new Date();
      if (m0 > fin) lignes.push({ abonnement_id: abo.id, periode: premierDuMois(m0), montant_ht: prixMensuel });
      while (m0 <= fin) {
        lignes.push({ abonnement_id: abo.id, periode: premierDuMois(m0), montant_ht: prixMensuel });
        m0.setMonth(m0.getMonth() + 1);
      }
    }
    if (lignes.length) await admin.from("abonnement_mensualites").upsert(lignes, { onConflict: "abonnement_id,periode", ignoreDuplicates: true });
    await admin
      .from("ventes")
      .update({ statut: "validee", abonnement_id: abo.id, validee_le: new Date().toISOString(), remise_supp_pct: remiseSupp })
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
