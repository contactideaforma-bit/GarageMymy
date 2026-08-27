import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { estAdminServeur } from "@/lib/supportServeur";
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
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 30;

const TABLES = ["collaborateurs", "abonnements", "abonnement_mensualites", "collaborateur_reglements", "collaborateur_demandes", "ventes"] as const;
type Table = (typeof TABLES)[number];
const ORDRE: Record<Table, { col: string; asc: boolean }> = {
  collaborateurs: { col: "nom", asc: true },
  abonnements: { col: "date_signature", asc: false },
  abonnement_mensualites: { col: "periode", asc: true },
  collaborateur_reglements: { col: "created_at", asc: false },
  collaborateur_demandes: { col: "created_at", asc: false },
  ventes: { col: "created_at", asc: false },
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

  // ---- VALIDATION D'UNE VENTE (v10.0) : crée l'abonnement + mensualités,
  //      rattache le commercial, passe la vente en « validée ».
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
    return NextResponse.json({ ok: true, row: data });
  }
  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}
