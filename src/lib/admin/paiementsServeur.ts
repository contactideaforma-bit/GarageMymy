// ============================================================
//  SUIVI DES PAIEMENTS — côté SERVEUR (service role), v13.33.
//
//  • situation()            : impayés, à venir, encaissé, collaborateurs à payer
//  • lienPaiement()         : lien Qonto (CB / Apple Pay / PayPal) pour une mensualité
//  • verifierLiens()        : pointe automatiquement les mensualités payées par lien
//  • relancer()             : email de relance (palier 1..4) au garage + journal
//  • traiterQuotidien()     : cron — relances auto, suspension auto, réactivation, digest
//  v13.39 — PAIEMENT MENSUALISÉ :
//  • rattacherPaiementsVentes() : 1re échéance payée à la signature → 1re mensualité pointée
//  • prolongerMensualites()     : crée chaque mois la mensualité suivante (abonnements mensuels actifs)
//  • envoyerAppels()            : « appel de paiement » N jours AVANT l'échéance (lien Qonto + IBAN)
//
//  Paliers (jours APRÈS l'échéance, paramétrables) — cohérents avec l'art. 5
//  des CGV : suspension après 15 jours suivant une relance restée sans effet.
//    1 rappel · 2 relance · 3 avertissement (suspension dans N jours) · 4 suspension
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";
import { envoyerEmailServeur } from "@/lib/mailer";
import { comptesAdmin, emailsAdminServeur, tousLesComptes } from "@/lib/supportServeur";
import { definirEtat } from "@/lib/admin/comptesServeur";
import { Parametres, RelancesParams, fusionnerParametres } from "@/lib/admin/economie";
import { creerLienPaiement, qontoConfigure, statutLienPaiement } from "@/lib/qonto";
import { SOCIETE } from "@/components/vitrine/societe";

export const TVA_ABONNEMENT = 20;
const SITE = () => process.env.NEXT_PUBLIC_SITE_URL || "https://myeasyauto.fr";

export type Niveau = 1 | 2 | 3 | 4;
export const LIBELLE_NIVEAU: Record<number, string> = { 0: "—", 1: "Rappel", 2: "Relance", 3: "Avertissement", 4: "Suspension", 5: "Réactivation" };

export class ErreurPaiement extends Error {
  status: number;
  constructor(m: string, status = 400) { super(m); this.status = status; }
}

/* ---------------------------------------------------------------- dates */
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const aujourdhui = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const joursEntre = (a: string, b: Date) => Math.floor((b.getTime() - new Date(a + "T00:00:00").getTime()) / 86_400_000);
export function moisFr(periode: string): string {
  const d = new Date(periode + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}
const eur = (n: number) => `${(Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Échéance d'une mensualité : colonne `echeance`, sinon le N du mois de la période. */
export function echeanceDe(m: { periode: string; echeance?: string | null }, p: RelancesParams): string {
  if (m.echeance) return m.echeance;
  const d = new Date(m.periode + "T00:00:00");
  d.setDate(Math.max(1, Math.min(28, p.jourEcheance || 1)));
  return ymd(d);
}

/** Palier atteint au vu du retard (0 si pas encore de relance due). */
export function palierDu(joursRetard: number, p: RelancesParams): number {
  if (joursRetard >= p.suspension) return 4;
  if (joursRetard >= p.avertissement) return 3;
  if (joursRetard >= p.relance) return 2;
  if (joursRetard >= p.rappel) return 1;
  return 0;
}

/* ---------------------------------------------------------------- types */
export type MensualiteRow = {
  id: string; abonnement_id: string; periode: string; montant_ht: number; payee_le: string | null; notes: string | null;
  echeance?: string | null; relance_niveau?: number | null; relance_le?: string | null; appel_le?: string | null;
  qonto_link_id?: string | null; qonto_url?: string | null; qonto_statut?: string | null; mode_paiement?: string | null;
};
export type AbonnementRow = {
  id: string; garage_nom: string; garage_email: string | null; garage_owner_id: string | null; formule: string; statut: string;
  prix_ht: number; periodicite: string; commercial_id: string | null; secretaire_id: string | null;
  date_debut?: string | null; date_fin?: string | null;
};
export type LigneSuivi = {
  mensualite: MensualiteRow;
  abonnement: AbonnementRow;
  email: string | null;
  owner_id: string | null;
  echeance: string;
  joursRetard: number;      // négatif = pas encore échue
  palierDu: number;         // palier que le retard justifie
  etatCompte: string | null; // actif | suspendu | lecture_seule | ferme | null
  montantTtc: number;
};
export type Situation = {
  impayes: LigneSuivi[];
  aVenir: LigneSuivi[];       // non payées, échéance dans les 45 prochains jours (ou pas encore échues)
  encaisseMois: number;       // HT payé ce mois-ci (payee_le)
  aEncaisserMois: number;     // HT des mensualités du mois non payées
  enRetard: number;           // HT impayé échu
  collaborateurs: { id: string; nom: string; email: string | null; total: number; lignes: number; plusAncienne: string | null; enRetard: boolean }[];
  totalCollaborateurs: number;
  qonto: boolean;
  relances: RelancesParams;
  journal: { id: string; created_at: string; garage_nom: string | null; email: string | null; niveau: number; canal: string; auteur: string | null; ok: boolean; erreur: string | null }[];
};

export async function lireParametresPaiements(admin: SupabaseClient): Promise<Parametres> {
  const { data } = await admin.from("admin_parametres").select("valeur").eq("cle", "grille").maybeSingle();
  return fusionnerParametres((data?.valeur as Partial<Parametres>) || null);
}

/* ------------------------------------------------------------ situation */
export async function situation(admin: SupabaseClient): Promise<Situation> {
  const p = await lireParametresPaiements(admin);
  const rp = p.relances;
  const [abos, mens, etats, comptes, regs, collabs, journal] = await Promise.all([
    admin.from("abonnements").select("*"),
    admin.from("abonnement_mensualites").select("*").order("periode", { ascending: true }),
    admin.from("comptes_etat").select("owner_id,etat"),
    tousLesComptes(admin),
    admin.from("collaborateur_reglements").select("*").eq("statut", "a_payer"),
    admin.from("collaborateurs").select("id,nom,prenom,email"),
    admin.from("paiement_relances").select("*").order("created_at", { ascending: false }).limit(40),
  ]);
  const parAbo = new Map(((abos.data || []) as AbonnementRow[]).map((a) => [a.id, a]));
  const parEmail = new Map(comptes.map((c) => [c.email.toLowerCase(), c.id]));
  const etatDe = new Map(((etats.data || []) as { owner_id: string; etat: string }[]).map((e) => [e.owner_id, e.etat]));
  const today = aujourdhui();
  const moisCourant = ymd(today).slice(0, 7);

  const impayes: LigneSuivi[] = [];
  const aVenir: LigneSuivi[] = [];
  let encaisseMois = 0;
  let aEncaisserMois = 0;
  let enRetard = 0;
  for (const m of (mens.data || []) as MensualiteRow[]) {
    const a = parAbo.get(m.abonnement_id);
    if (!a) continue;
    if (m.payee_le) {
      if (m.payee_le.slice(0, 7) === moisCourant) encaisseMois += Number(m.montant_ht) || 0;
      continue;
    }
    if (a.statut === "resilie") continue;
    const email = (a.garage_email || "").toLowerCase() || null;
    const owner = a.garage_owner_id || (email ? parEmail.get(email) || null : null);
    const echeance = echeanceDe(m, rp);
    const joursRetard = joursEntre(echeance, today);
    const ligne: LigneSuivi = {
      mensualite: m, abonnement: a, email, owner_id: owner, echeance, joursRetard,
      palierDu: joursRetard >= 0 ? palierDu(joursRetard, rp) : 0,
      etatCompte: owner ? etatDe.get(owner) || "actif" : null,
      montantTtc: Math.round(Number(m.montant_ht) * (1 + TVA_ABONNEMENT / 100) * 100) / 100,
    };
    if (m.periode.slice(0, 7) === moisCourant) aEncaisserMois += Number(m.montant_ht) || 0;
    if (joursRetard > 0) { impayes.push(ligne); enRetard += Number(m.montant_ht) || 0; }
    else if (joursRetard >= -45) aVenir.push(ligne);
  }
  impayes.sort((x, y) => y.joursRetard - x.joursRetard);
  aVenir.sort((x, y) => x.echeance.localeCompare(y.echeance));

  // Collaborateurs à payer (lignes « à payer » des relevés)
  const parCollab = new Map(((collabs.data || []) as { id: string; nom: string; prenom: string | null; email: string | null }[]).map((c) => [c.id, c]));
  const agg = new Map<string, { total: number; lignes: number; plusAncienne: string | null }>();
  for (const r of (regs.data || []) as { collaborateur_id: string; montant: number; created_at: string }[]) {
    const cur = agg.get(r.collaborateur_id) || { total: 0, lignes: 0, plusAncienne: null };
    cur.total += Number(r.montant) || 0;
    cur.lignes += 1;
    if (!cur.plusAncienne || r.created_at < cur.plusAncienne) cur.plusAncienne = r.created_at;
    agg.set(r.collaborateur_id, cur);
  }
  const collaborateurs = Array.from(agg.entries()).map(([id, v]) => {
    const c = parCollab.get(id);
    return {
      id, nom: c ? [c.prenom, c.nom].filter(Boolean).join(" ") : "Collaborateur", email: c?.email || null,
      total: Math.round(v.total * 100) / 100, lignes: v.lignes, plusAncienne: v.plusAncienne,
      enRetard: Boolean(v.plusAncienne && joursEntre(v.plusAncienne.slice(0, 10), today) > rp.delaiCollaborateurs),
    };
  }).sort((x, y) => y.total - x.total);

  return {
    impayes, aVenir, encaisseMois, aEncaisserMois, enRetard,
    collaborateurs, totalCollaborateurs: collaborateurs.reduce((s, c) => s + c.total, 0),
    qonto: qontoConfigure(), relances: rp,
    journal: ((journal.data || []) as Situation["journal"]),
  };
}

/* ------------------------------------------------------- lien Qonto */
export async function lienPaiement(admin: SupabaseClient, mensualiteId: string): Promise<{ url: string; id: string }> {
  const { data: m } = await admin.from("abonnement_mensualites").select("*").eq("id", mensualiteId).maybeSingle();
  if (!m) throw new ErreurPaiement("Mensualité introuvable.", 404);
  if (m.payee_le) throw new ErreurPaiement("Cette mensualité est déjà encaissée.", 409);
  if (m.qonto_url && m.qonto_link_id && (m.qonto_statut || "open") === "open") return { url: m.qonto_url, id: m.qonto_link_id };
  const { data: a } = await admin.from("abonnements").select("*").eq("id", m.abonnement_id).maybeSingle();
  if (!a) throw new ErreurPaiement("Abonnement introuvable.", 404);
  const p = await lireParametresPaiements(admin);
  const lib = p.formules[a.formule as keyof typeof p.formules]?.libelle || a.formule;
  const lien = await creerLienPaiement({
    titre: `Abonnement ${SOCIETE.produit} — ${lib} — ${moisFr(m.periode)}`,
    description: `${a.garage_nom} — mensualité ${moisFr(m.periode)} — réf. ${String(m.id).slice(0, 8).toUpperCase()}`,
    prixHt: Number(m.montant_ht),
    tauxTva: TVA_ABONNEMENT,
  });
  await admin.from("abonnement_mensualites").update({ qonto_link_id: lien.id, qonto_url: lien.url, qonto_statut: lien.status || "open" }).eq("id", m.id);
  return { url: lien.url, id: lien.id };
}

/** Vérifie les liens ouverts ; une mensualité payée par lien est pointée et le compte réactivé si besoin. */
export async function verifierLiens(admin: SupabaseClient): Promise<{ verifies: number; payees: number }> {
  if (!qontoConfigure()) return { verifies: 0, payees: 0 };
  const { data: mens } = await admin.from("abonnement_mensualites").select("*").is("payee_le", null).not("qonto_link_id", "is", null);
  let verifies = 0;
  let payees = 0;
  for (const m of (mens || []) as MensualiteRow[]) {
    if (["paid", "expired", "canceled"].includes(m.qonto_statut || "")) continue;
    try {
      const st = await statutLienPaiement(m.qonto_link_id!);
      verifies += 1;
      if (st === "paid") {
        await admin.from("abonnement_mensualites").update({ payee_le: ymd(new Date()), qonto_statut: "paid", mode_paiement: "qonto", notes: [m.notes, "Payée par lien de paiement Qonto"].filter(Boolean).join(" · ") }).eq("id", m.id);
        payees += 1;
        await reactiverSiRegularise(admin, m.abonnement_id);
      } else if (st !== (m.qonto_statut || "open")) {
        await admin.from("abonnement_mensualites").update({ qonto_statut: st }).eq("id", m.id);
      }
    } catch {
      /* best-effort */
    }
  }
  return { verifies, payees };
}

/* ------------------------------------------------- suspension / réactivation */
async function ownerDeAbonnement(admin: SupabaseClient, a: AbonnementRow): Promise<string | null> {
  if (a.garage_owner_id) return a.garage_owner_id;
  const email = (a.garage_email || "").toLowerCase();
  if (!email) return null;
  return (await tousLesComptes(admin)).find((c) => c.email.toLowerCase() === email)?.id || null;
}

/** Plus aucune mensualité échue impayée sur cet abonnement → lève une suspension « impayé ». */
export async function reactiverSiRegularise(admin: SupabaseClient, abonnementId: string): Promise<boolean> {
  const { data: a } = await admin.from("abonnements").select("*").eq("id", abonnementId).maybeSingle();
  if (!a) return false;
  const owner = await ownerDeAbonnement(admin, a as AbonnementRow);
  if (!owner) return false;
  const { data: e } = await admin.from("comptes_etat").select("*").eq("owner_id", owner).maybeSingle();
  if (!e || e.etat !== "suspendu" || e.motif !== "impaye") return false;
  const p = await lireParametresPaiements(admin);
  const { data: mens } = await admin.from("abonnement_mensualites").select("*").eq("abonnement_id", abonnementId).is("payee_le", null);
  const today = aujourdhui();
  const encore = ((mens || []) as MensualiteRow[]).some((m) => joursEntre(echeanceDe(m, p.relances), today) > 0);
  if (encore) return false;
  await definirEtat(admin, { owner_id: owner, etat: "actif", motif: null, message: null, fin_le: null, purge_le: null });
  await admin.from("abonnement_mensualites").update({ relance_niveau: 0 }).eq("abonnement_id", abonnementId).is("payee_le", null);
  const expediteur = (await comptesAdmin(admin))[0];
  const email = (a.garage_email || "").toLowerCase();
  if (expediteur && email) {
    const r = await envoyerEmailServeur(
      { to: email, subject: `${SOCIETE.produit} — accès rétabli, merci pour votre règlement`, text: `Bonjour,\n\nNous avons bien reçu votre règlement : l'accès de ${a.garage_nom} à ${SOCIETE.produit} est rétabli immédiatement.\n\nMerci de votre confiance.\n${SOCIETE.editeur} — ${SOCIETE.email}` },
      expediteur.id
    );
    await admin.from("paiement_relances").insert({ abonnement_id: abonnementId, garage_nom: a.garage_nom, email, niveau: 5, canal: "auto", auteur: "systeme", sujet: "Accès rétabli", ok: r.ok, erreur: r.ok ? null : r.error || null });
  }
  return true;
}

export async function suspendrePourImpaye(admin: SupabaseClient, abonnementId: string, auteur: string): Promise<{ ok: boolean; message: string }> {
  const { data: a } = await admin.from("abonnements").select("*").eq("id", abonnementId).maybeSingle();
  if (!a) throw new ErreurPaiement("Abonnement introuvable.", 404);
  const owner = await ownerDeAbonnement(admin, a as AbonnementRow);
  if (!owner) throw new ErreurPaiement("Aucun compte de connexion rattaché à cet abonnement : impossible de suspendre.");
  await definirEtat(admin, {
    owner_id: owner, etat: "suspendu", motif: "impaye",
    message: "Votre abonnement est suspendu pour défaut de paiement (conditions générales, article 5). L'accès sera rétabli dès régularisation ; les mensualités continuent de courir pendant la suspension.",
    fin_le: null, purge_le: null,
  });
  await admin.from("paiement_relances").insert({ abonnement_id: abonnementId, garage_nom: a.garage_nom, email: a.garage_email, niveau: 4, canal: auteur === "cron" ? "auto" : "manuel", auteur, sujet: "Compte suspendu pour impayé", ok: true });
  return { ok: true, message: `Compte de ${a.garage_nom} suspendu.` };
}

/* ------------------------------------------------------------- relances */
function texteRelance(niveau: number, ctx: { garage: string; mois: string; montantTtc: string; echeance: string; joursRetard: number; lien: string | null; iban: string; bic: string; joursAvantSuspension: number }): { sujet: string; texte: string } {
  const paiement = [
    ctx.lien ? `Payer en ligne (carte, Apple Pay, PayPal) : ${ctx.lien}` : "",
    ctx.iban ? `Ou par virement : IBAN ${ctx.iban}${ctx.bic ? ` · BIC ${ctx.bic}` : ""} — référence « MEA ${ctx.garage.slice(0, 20)} ${ctx.mois} »` : "",
  ].filter(Boolean).join("\n");
  const pied = `\n\nSi le règlement est déjà parti, merci de ne pas tenir compte de ce message.\n${SOCIETE.editeur} — ${SOCIETE.email}`;
  const echeanceFr = new Date(ctx.echeance + "T00:00:00").toLocaleDateString("fr-FR");
  if (niveau === 1) return {
    sujet: `${SOCIETE.produit} — rappel : mensualité de ${ctx.mois} (${ctx.montantTtc} TTC)`,
    texte: `Bonjour,\n\nPetit rappel : la mensualité ${SOCIETE.produit} de ${ctx.garage} pour ${ctx.mois}, d'un montant de ${ctx.montantTtc} TTC, était attendue le ${echeanceFr}.\n\n${paiement}${pied}`,
  };
  if (niveau === 2) return {
    sujet: `${SOCIETE.produit} — relance : mensualité de ${ctx.mois} impayée (${ctx.montantTtc} TTC)`,
    texte: `Bonjour,\n\nSauf erreur de notre part, la mensualité ${SOCIETE.produit} de ${ctx.garage} pour ${ctx.mois} (${ctx.montantTtc} TTC, échéance le ${echeanceFr}) reste impayée à ce jour (${ctx.joursRetard} jours de retard).\n\nMerci de régulariser sous 15 jours. Conformément à l'article 5 des conditions générales, à défaut de paiement dans ce délai, l'accès à l'application et au service pourra être suspendu jusqu'à régularisation.\n\n${paiement}${pied}`,
  };
  if (niveau === 3) return {
    sujet: `${SOCIETE.produit} — DERNIER AVERTISSEMENT avant suspension : mensualité de ${ctx.mois}`,
    texte: `Bonjour,\n\nMalgré notre relance, la mensualité ${SOCIETE.produit} de ${ctx.garage} pour ${ctx.mois} (${ctx.montantTtc} TTC) est toujours impayée (${ctx.joursRetard} jours de retard).\n\nSans règlement sous ${Math.max(1, ctx.joursAvantSuspension)} jour(s), l'accès de votre garage à l'application et au service sera SUSPENDU automatiquement (conditions générales, article 5). Vos dossiers restent conservés et l'accès est rétabli dès réception du paiement. Des pénalités de retard et l'indemnité forfaitaire de 40 € (art. L441-10 C. com.) peuvent s'appliquer.\n\n${paiement}${pied}`,
  };
  return {
    sujet: `${SOCIETE.produit} — accès suspendu pour défaut de paiement (mensualité de ${ctx.mois})`,
    texte: `Bonjour,\n\nL'accès de ${ctx.garage} à ${SOCIETE.produit} est suspendu ce jour pour défaut de paiement de la mensualité de ${ctx.mois} (${ctx.montantTtc} TTC, ${ctx.joursRetard} jours de retard), conformément à l'article 5 des conditions générales.\n\nVos données sont conservées. L'accès est rétabli automatiquement dès réception du règlement ; les mensualités continuent de courir pendant la suspension. Après trente jours d'impayé, le contrat peut être résilié à vos torts.\n\n${paiement}${pied}`,
  };
}

/** Envoie la relance de palier `niveau` pour une mensualité (crée le lien Qonto si possible). */
export async function relancer(admin: SupabaseClient, mensualiteId: string, niveau: Niveau, auteur: string): Promise<{ ok: boolean; email: string; erreur: string | null; suspendu: boolean }> {
  const { data: m } = await admin.from("abonnement_mensualites").select("*").eq("id", mensualiteId).maybeSingle();
  if (!m) throw new ErreurPaiement("Mensualité introuvable.", 404);
  if (m.payee_le) throw new ErreurPaiement("Cette mensualité est déjà encaissée.", 409);
  const { data: a } = await admin.from("abonnements").select("*").eq("id", m.abonnement_id).maybeSingle();
  if (!a) throw new ErreurPaiement("Abonnement introuvable.", 404);
  const email = (a.garage_email || "").toLowerCase();
  if (!email) throw new ErreurPaiement("Aucun email de garage sur cet abonnement.");
  const p = await lireParametresPaiements(admin);
  const rp = p.relances;
  let lien: string | null = m.qonto_url || null;
  if (!lien && qontoConfigure()) {
    try { lien = (await lienPaiement(admin, m.id)).url; } catch { lien = null; }
  }
  if (!lien && p.lienPaiementCb) lien = p.lienPaiementCb;
  const echeance = echeanceDe(m, rp);
  const joursRetard = Math.max(0, joursEntre(echeance, aujourdhui()));
  const { sujet, texte } = texteRelance(niveau, {
    garage: a.garage_nom, mois: moisFr(m.periode), montantTtc: eur(Number(m.montant_ht) * (1 + TVA_ABONNEMENT / 100)), echeance, joursRetard,
    lien, iban: p.iban, bic: p.bic, joursAvantSuspension: rp.suspension - joursRetard,
  });
  const expediteur = (await comptesAdmin(admin))[0];
  if (!expediteur) throw new ErreurPaiement("Aucun compte éditeur pour expédier l'email (ADMIN_EMAILS).", 500);
  const r = await envoyerEmailServeur({ to: email, bcc: emailsAdminServeur().join(","), subject: sujet, text: texte }, expediteur.id);
  await admin.from("paiement_relances").insert({
    mensualite_id: m.id, abonnement_id: a.id, garage_nom: a.garage_nom, email, niveau, canal: auteur === "cron" ? "auto" : "email", auteur, sujet, ok: r.ok, erreur: r.ok ? null : r.error || null,
  });
  if (r.ok) await admin.from("abonnement_mensualites").update({ relance_niveau: Math.max(Number(m.relance_niveau) || 0, niveau), relance_le: new Date().toISOString() }).eq("id", m.id);
  let suspendu = false;
  if (niveau === 4 && r.ok) {
    try { await suspendrePourImpaye(admin, a.id, auteur); suspendu = true; } catch { suspendu = false; }
  }
  return { ok: r.ok, email, erreur: r.ok ? null : r.error || "Envoi impossible.", suspendu };
}

/* ------------------------------------------------------------ digest éditeur */
export async function digestEditeur(admin: SupabaseClient, s?: Situation): Promise<boolean> {
  const sit = s || (await situation(admin));
  const expediteur = (await comptesAdmin(admin))[0];
  const to = emailsAdminServeur().join(",");
  if (!expediteur || !to) return false;
  if (!sit.impayes.length && !sit.collaborateurs.some((c) => c.enRetard) && !sit.aVenir.some((l) => l.joursRetard >= -7)) return false;
  const lignes: string[] = [];
  lignes.push(`Encaissé ce mois : ${eur(sit.encaisseMois)} HT · reste à encaisser ce mois : ${eur(sit.aEncaisserMois)} HT`);
  if (sit.impayes.length) {
    lignes.push("", `🔴 IMPAYÉS (${sit.impayes.length}) — ${eur(sit.enRetard)} HT :`);
    for (const l of sit.impayes) lignes.push(`  • ${l.abonnement.garage_nom} — ${moisFr(l.mensualite.periode)} — ${eur(l.montantTtc)} TTC — ${l.joursRetard} j de retard — dernier palier envoyé : ${LIBELLE_NIVEAU[Number(l.mensualite.relance_niveau) || 0]}${l.etatCompte === "suspendu" ? " — COMPTE SUSPENDU" : ""}`);
  }
  const proches = sit.aVenir.filter((l) => l.joursRetard >= -7);
  if (proches.length) {
    lignes.push("", `🟠 À ENCAISSER SOUS 7 JOURS (${proches.length}) :`);
    for (const l of proches) lignes.push(`  • ${l.abonnement.garage_nom} — ${moisFr(l.mensualite.periode)} — ${eur(l.montantTtc)} TTC — échéance ${new Date(l.echeance + "T00:00:00").toLocaleDateString("fr-FR")}`);
  }
  if (sit.collaborateurs.length) {
    lignes.push("", `🟣 À PAYER À VOS COLLABORATEURS — ${eur(sit.totalCollaborateurs)} :`);
    for (const c of sit.collaborateurs) lignes.push(`  • ${c.nom} — ${eur(c.total)} (${c.lignes} ligne(s))${c.enRetard ? " — ⚠️ EN ATTENTE DEPUIS PLUS DE " + sit.relances.delaiCollaborateurs + " JOURS" : ""}`);
  }
  lignes.push("", `Suivi des paiements : ${SITE()}/admin/paiements`);
  const r = await envoyerEmailServeur({ to, subject: `[Paiements] ${sit.impayes.length} impayé(s) · ${proches.length} à venir · ${sit.collaborateurs.length} collaborateur(s) à payer`, text: lignes.join("\n") }, expediteur.id);
  return r.ok;
}

/* ------------------------------------------- v13.39 : paiement mensualisé */

const moisSuivant = (periode: string) => {
  const d = new Date(periode + "T00:00:00");
  d.setMonth(d.getMonth() + 1);
  return ymd(new Date(d.getFullYear(), d.getMonth(), 1));
};

/**
 * 1re échéance payée à la signature (vente) → pointée sur l'abonnement :
 * mensuel = la 1re mensualité ; annuel = les 12 mois du forfait. Une seule
 * fois par vente (ventes.premiere_echeance_pointee). Sans abonnement ni
 * mensualités encore créés, on réessaie le lendemain.
 */
export async function rattacherPaiementsVentes(admin: SupabaseClient): Promise<number> {
  const { data: ventes, error } = await admin
    .from("ventes")
    .select("id,numero,abonnement_id,contact_email,periodicite,paiement_confirme_le,paiement_reference,mode_paiement,qonto_link_id")
    .not("paiement_confirme_le", "is", null)
    .is("premiere_echeance_pointee", null);
  if (error) return 0; // migration v96 non exécutée
  let n = 0;
  for (const v of (ventes || []) as { id: string; numero: string; abonnement_id: string | null; contact_email: string | null; periodicite: string; paiement_confirme_le: string; paiement_reference: string | null; mode_paiement: string | null; qonto_link_id: string | null }[]) {
    let aboId = v.abonnement_id;
    if (!aboId && v.contact_email) {
      const { data: a } = await admin.from("abonnements").select("id").eq("garage_email", v.contact_email.toLowerCase()).neq("statut", "resilie").order("created_at", { ascending: false }).limit(1).maybeSingle();
      aboId = a?.id || null;
    }
    if (!aboId) continue;
    const { data: mens } = await admin.from("abonnement_mensualites").select("id,periode,payee_le,notes").eq("abonnement_id", aboId).order("periode", { ascending: true });
    const liste = (mens || []) as { id: string; periode: string; payee_le: string | null; notes: string | null }[];
    if (!liste.length) continue;
    const cibles = v.periodicite === "annuel" ? liste.slice(0, 12) : liste.slice(0, 1);
    const mode = v.qonto_link_id ? "qonto" : v.mode_paiement === "cb" ? "qonto" : v.mode_paiement || "virement";
    const jour = v.paiement_confirme_le.slice(0, 10);
    for (const m of cibles) {
      if (m.payee_le) continue;
      await admin.from("abonnement_mensualites").update({
        payee_le: jour,
        mode_paiement: mode,
        notes: [m.notes, `Payée à la signature (vente ${v.numero}${v.paiement_reference ? `, réf. ${v.paiement_reference}` : ""})`].filter(Boolean).join(" · "),
      }).eq("id", m.id);
    }
    await admin.from("ventes").update({ premiere_echeance_pointee: new Date().toISOString(), abonnement_id: aboId }).eq("id", v.id);
    n += 1;
  }
  return n;
}

/**
 * Abonnements MENSUELS actifs : crée les mensualités suivantes jusqu'au mois
 * dont l'échéance tombe dans la fenêtre d'appel (+ 1 mois de visibilité).
 * On ne prolonge qu'à partir de la DERNIÈRE mensualité existante (jamais de
 * rattrapage de mois passés oubliés) et jamais au-delà de date_fin.
 */
export async function prolongerMensualites(admin: SupabaseClient): Promise<number> {
  const { data: abos } = await admin.from("abonnements").select("*").eq("statut", "actif").neq("periodicite", "annuel");
  const horizon = new Date(aujourdhui());
  horizon.setDate(horizon.getDate() + 40);
  const limite = ymd(new Date(horizon.getFullYear(), horizon.getMonth(), 1));
  let ajoutees = 0;
  for (const a of (abos || []) as AbonnementRow[]) {
    const { data: der } = await admin.from("abonnement_mensualites").select("periode").eq("abonnement_id", a.id).order("periode", { ascending: false }).limit(1).maybeSingle();
    if (!der?.periode) continue; // abonnement pas encore initialisé : l'éditeur génère la 1re mensualité
    const fin = a.date_fin ? String(a.date_fin).slice(0, 10) : null;
    const lignes: { abonnement_id: string; periode: string; montant_ht: number }[] = [];
    let p = moisSuivant(der.periode);
    while (p <= limite && (!fin || p <= fin) && lignes.length < 3) {
      lignes.push({ abonnement_id: a.id, periode: p, montant_ht: Number(a.prix_ht) || 0 });
      p = moisSuivant(p);
    }
    if (!lignes.length) continue;
    const { error } = await admin.from("abonnement_mensualites").upsert(lignes, { onConflict: "abonnement_id,periode", ignoreDuplicates: true });
    if (!error) ajoutees += lignes.length;
  }
  return ajoutees;
}

/** Email « votre mensualité arrive » — envoyé avant l'échéance, ton neutre. */
export async function envoyerAppel(admin: SupabaseClient, mensualiteId: string, auteur: string): Promise<{ ok: boolean; email: string; erreur: string | null }> {
  const { data: m } = await admin.from("abonnement_mensualites").select("*").eq("id", mensualiteId).maybeSingle();
  if (!m) throw new ErreurPaiement("Mensualité introuvable.", 404);
  if (m.payee_le) throw new ErreurPaiement("Cette mensualité est déjà encaissée.", 409);
  const { data: a } = await admin.from("abonnements").select("*").eq("id", m.abonnement_id).maybeSingle();
  if (!a) throw new ErreurPaiement("Abonnement introuvable.", 404);
  const email = (a.garage_email || "").toLowerCase();
  if (!email) throw new ErreurPaiement("Aucun email de garage sur cet abonnement.");
  const p = await lireParametresPaiements(admin);
  let lien: string | null = m.qonto_url || null;
  if (!lien && qontoConfigure()) {
    try { lien = (await lienPaiement(admin, m.id)).url; } catch { lien = null; }
  }
  if (!lien && p.lienPaiementCb) lien = p.lienPaiementCb;
  const mois = moisFr(m.periode);
  const montantTtc = eur(Number(m.montant_ht) * (1 + TVA_ABONNEMENT / 100));
  const echeanceFr = new Date(echeanceDe(m, p.relances) + "T00:00:00").toLocaleDateString("fr-FR");
  const texte = [
    "Bonjour,",
    "",
    `Votre mensualité ${SOCIETE.produit} de ${mois} pour ${a.garage_nom} arrive à échéance le ${echeanceFr} : ${montantTtc} TTC (${eur(Number(m.montant_ht))} HT + TVA ${TVA_ABONNEMENT} %).`,
    "",
    lien ? `👉 Payer en quelques secondes (carte bancaire, Apple Pay) : ${lien}` : "",
    p.iban ? `Ou par virement : IBAN ${p.iban}${p.bic ? ` · BIC ${p.bic}` : ""} — référence « MEA ${a.garage_nom.slice(0, 20)} ${mois} »` : "",
    "",
    "Le paiement est enregistré automatiquement : vous n'avez rien d'autre à faire.",
    "",
    "Merci de votre confiance,",
    `${SOCIETE.editeur} — ${SOCIETE.email}`,
  ].filter((l, i, t) => !(l === "" && t[i - 1] === "")).join("\n");
  const expediteur = (await comptesAdmin(admin))[0];
  if (!expediteur) throw new ErreurPaiement("Aucun compte éditeur pour expédier l'email (ADMIN_EMAILS).", 500);
  const sujet = `${SOCIETE.produit} — votre mensualité de ${mois} (${montantTtc} TTC)`;
  const r = await envoyerEmailServeur({ to: email, subject: sujet, text: texte }, expediteur.id);
  await admin.from("paiement_relances").insert({
    mensualite_id: m.id, abonnement_id: a.id, garage_nom: a.garage_nom, email, niveau: 0, canal: auteur === "cron" ? "appel_auto" : "appel", auteur, sujet, ok: r.ok, erreur: r.ok ? null : r.error || null,
  });
  if (r.ok) await admin.from("abonnement_mensualites").update({ appel_le: new Date().toISOString() }).eq("id", m.id);
  return { ok: r.ok, email, erreur: r.ok ? null : r.error || "Envoi impossible." };
}

/** Cron : appels de paiement des mensualités dont l'échéance tombe dans les N prochains jours. */
export async function envoyerAppels(admin: SupabaseClient, sit: Situation): Promise<string[]> {
  const rp = sit.relances;
  const rapport: string[] = [];
  if (!rp.appelAuto) return rapport;
  for (const l of sit.aVenir) {
    const m = l.mensualite;
    if (m.appel_le || (Number(m.relance_niveau) || 0) > 0) continue;
    if (l.abonnement.statut !== "actif" || !l.email) continue;
    if (-l.joursRetard > Math.max(0, rp.appelJours)) continue; // pas encore dans la fenêtre
    try {
      const r = await envoyerAppel(admin, m.id, "cron");
      rapport.push(`Appel de paiement → ${l.abonnement.garage_nom} (${moisFr(m.periode)}) : ${r.ok ? "ok" : r.erreur}`);
    } catch (e) {
      rapport.push(`Appel ${l.abonnement.garage_nom} : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }
  return rapport;
}

/* ------------------------------------------------------------- cron quotidien */
export async function traiterQuotidien(admin: SupabaseClient): Promise<string[]> {
  const rapport: string[] = [];
  try {
    const v = await verifierLiens(admin);
    if (v.verifies) rapport.push(`Liens Qonto vérifiés : ${v.verifies}, payés : ${v.payees}.`);
  } catch (e) { rapport.push(`Liens Qonto : ${e instanceof Error ? e.message : "erreur"}`); }

  // v13.39 — paiement mensualisé : 1re échéance de la vente → abonnement,
  // mensualités suivantes créées toutes seules, appels avant l'échéance.
  try { const n = await rattacherPaiementsVentes(admin); if (n) rapport.push(`1re échéance payée à la signature reportée sur ${n} abonnement(s).`); } catch (e) { rapport.push(`Rattachement des ventes : ${e instanceof Error ? e.message : "erreur"}`); }
  try { const n = await prolongerMensualites(admin); if (n) rapport.push(`${n} mensualité(s) créée(s) pour les mois à venir.`); } catch (e) { rapport.push(`Mensualités à venir : ${e instanceof Error ? e.message : "erreur"}`); }

  const sit = await situation(admin);
  const rp = sit.relances;
  try { rapport.push(...(await envoyerAppels(admin, sit))); } catch (e) { rapport.push(`Appels de paiement : ${e instanceof Error ? e.message : "erreur"}`); }
  if (rp.auto) {
    // Une seule relance par abonnement et par jour : la mensualité la plus ancienne porte le palier.
    const vus = new Set<string>();
    for (const l of sit.impayes) {
      if (vus.has(l.abonnement.id)) continue;
      vus.add(l.abonnement.id);
      const dernier = Number(l.mensualite.relance_niveau) || 0;
      const du = l.palierDu;
      if (du <= dernier) continue;
      if (du === 4 && !rp.suspensionAuto) {
        // Pas de suspension automatique : on s'arrête à l'avertissement.
        if (dernier < 3) { try { const r = await relancer(admin, l.mensualite.id, 3, "cron"); rapport.push(`Avertissement → ${l.abonnement.garage_nom} (${r.ok ? "ok" : r.erreur})`); } catch (e) { rapport.push(`Relance ${l.abonnement.garage_nom} : ${e instanceof Error ? e.message : "erreur"}`); } }
        continue;
      }
      if (du === 4 && l.etatCompte === "suspendu") continue;
      try {
        const r = await relancer(admin, l.mensualite.id, du as Niveau, "cron");
        rapport.push(`${LIBELLE_NIVEAU[du]} → ${l.abonnement.garage_nom} (${r.ok ? "ok" : r.erreur}${r.suspendu ? ", compte suspendu" : ""})`);
      } catch (e) { rapport.push(`Relance ${l.abonnement.garage_nom} : ${e instanceof Error ? e.message : "erreur"}`); }
    }
  }
  // Réactivation des comptes régularisés (pointage manuel entre deux crons)
  const abosSuspendus = new Set(sit.impayes.filter((l) => l.etatCompte === "suspendu").map((l) => l.abonnement.id));
  const { data: etats } = await admin.from("comptes_etat").select("owner_id").eq("etat", "suspendu").eq("motif", "impaye");
  for (const e of (etats || []) as { owner_id: string }[]) {
    const { data: abo } = await admin.from("abonnements").select("id").eq("garage_owner_id", e.owner_id).maybeSingle();
    if (abo && !abosSuspendus.has(abo.id)) { if (await reactiverSiRegularise(admin, abo.id)) rapport.push(`Compte réactivé (régularisé) : ${e.owner_id}`); }
  }
  if (rp.digestEditeur) {
    try { if (await digestEditeur(admin)) rapport.push("Digest envoyé à l'éditeur."); } catch { /* best-effort */ }
  }
  return rapport;
}
