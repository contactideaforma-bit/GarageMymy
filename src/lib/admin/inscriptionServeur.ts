// ============================================================
//  INSCRIPTION EN LIGNE (v13.41) — côté SERVEUR (clé service).
//
//  Le garage s'abonne seul depuis /inscription : la vente est enregistrée
//  (table `ventes`, origine 'en_ligne', token secret), le contrat signé
//  est envoyé par email, puis le paiement :
//   • MENSUEL → Stripe Checkout (prélèvement automatique chaque mois) ;
//     le webhook `checkout.session.completed` confirme le paiement et
//     ACTIVE l'inscription ; `invoice.paid` pointe chaque mensualité.
//   • ANNUEL → lien Qonto unique (vérifié par le cron) ou virement
//     (confirmé par l'éditeur) ; payé → activation.
//  ACTIVER = créer l'abonnement + les mensualités (mêmes règles que la
//  validation d'une vente commerciale), créer le compte du garage et lui
//  envoyer l'email de bienvenue, pointer la 1re échéance.
//  RENOUVELLEMENT ANNUEL : 30 jours avant la date anniversaire, avis de
//  reconduction + lien de paiement ; payé → 12 mensualités suivantes.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { envoyerEmailServeur } from "@/lib/mailer";
import { comptesAdmin, emailsAdminServeur } from "@/lib/supportServeur";
import { SOCIETE } from "@/components/vitrine/societe";
import { Formule, Parametres, prixVente } from "@/lib/admin/economie";
import { creerCompteDepuisVente, lignesMensualites, lireParametresGrille, premierDuMois } from "@/lib/admin/compteGarageServeur";
import { lienPaiementVente } from "@/lib/admin/venteServeur";
import { rattacherPaiementsVentes } from "@/lib/admin/paiementsServeur";
import { ErreurQonto, creerLienPaiement, qontoConfigure, statutLienPaiement } from "@/lib/qonto";
import { abonnementDeFacture, creerSessionAbonnement, lireSession, stripeConfigure, type FactureStripe, type SessionCheckout } from "@/lib/stripe";
import { premiereEcheance, referenceVirement, type VenteParcours } from "@/lib/venteParcours";
import { OFFRE_LANCEMENT, finRemiseLancement, mensualiteLancement } from "@/lib/offreLancement";
import { libelleCreneau, libelleSource, type InscriptionPublique, type ModeEnLigne } from "@/lib/inscription";

export class ErreurInscription extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type VenteLigne = VenteParcours & {
  origine?: string | null;
  token?: string | null;
  source_connaissance?: string | null;
  source_detail?: string | null;
  formule_conseillee?: string | null;
  paiement_en_ligne_mode?: ModeEnLigne | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_checkout_id?: string | null;
  stripe_statut?: string | null;
  contrat_envoye_le?: string | null;
  activee_le?: string | null;
  abonnement_id?: string | null;
  signe_le?: string | null;
  contact_nom?: string | null;
  contact_tel?: string | null;
  garage_siret?: string | null;
  garage_ville?: string | null;
  code_apporteur?: string | null;
  collaborateur_id?: string | null;
  engagement_12?: boolean;
  remise_supp_pct?: number | null;
  created_at?: string;
  statut: string;
};

const eur = (n: number | null | undefined) =>
  `${(Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, " ")} €`;
const echapper = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);
const r2 = (n: number) => Math.round(n * 100) / 100;

export const nouveauToken = () => randomBytes(24).toString("base64url");

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || SOCIETE.site).replace(/\/$/, "");
}

export const libelleFormule = (f: string, p: Parametres) => p.formules[f as Formule]?.libelle || f;

export async function expediteurEditeur(admin: SupabaseClient): Promise<string | null> {
  return (await comptesAdmin(admin))[0]?.id || null;
}

export async function venteParToken(admin: SupabaseClient, token: string): Promise<VenteLigne | null> {
  if (!token || token.length < 16) return null;
  const { data } = await admin.from("ventes").select("*").eq("token", token).eq("origine", "en_ligne").maybeSingle();
  return (data as VenteLigne) || null;
}

/* ------------------------------------------------------------------
 *  Résumé public (page « merci », suivi par le garage)
 * ------------------------------------------------------------------ */
export function resumePublic(v: VenteLigne, p: Parametres): InscriptionPublique {
  const m = premiereEcheance(v);
  const virement = v.paiement_en_ligne_mode === "virement" && p.iban
    ? { iban: p.iban, bic: p.bic || "", reference: referenceVirement(v), montant: m.ttc }
    : null;
  return {
    numero: v.numero || "",
    token: v.token || "",
    garage_nom: v.garage_nom,
    contact_email: v.contact_email,
    formule: v.formule as Formule,
    periodicite: v.periodicite as "mensuel" | "annuel",
    engagement_12: Boolean(v.engagement_12),
    prix_mensuel_ht: Number(v.prix_mensuel_ht) || 0,
    montant_annuel_ht: v.montant_annuel_ht == null ? null : Number(v.montant_annuel_ht),
    mise_en_service_ht: Number(v.mise_en_service_ht) || 0,
    lancement_pct: Number(v.lancement_pct) || 0,
    lancement_mois: Number(v.lancement_mois) || 0,
    paiement_en_ligne_mode: v.paiement_en_ligne_mode || null,
    paye: Boolean(v.paiement_confirme_le),
    activee: Boolean(v.activee_le),
    compte_cree: Boolean(v.compte_cree_le) || v.statut === "compte_cree",
    qonto_url: v.paiement_en_ligne_mode === "qonto" && !v.paiement_confirme_le ? v.qonto_url || null : null,
    stripe_statut: v.stripe_statut || null,
    virement,
    signe_le: v.signe_le || null,
  };
}

/* ------------------------------------------------------------------
 *  ACTIVATION : abonnement + mensualités + compte + bienvenue
 * ------------------------------------------------------------------ */
export async function activerInscription(admin: SupabaseClient, venteId: string): Promise<{ abonnementId: string; compte: boolean; emailEnvoye: boolean }> {
  const { data: v } = await admin.from("ventes").select("*").eq("id", venteId).maybeSingle();
  if (!v) throw new ErreurInscription("Inscription introuvable.", 404);
  const vente = v as VenteLigne;
  if (vente.statut === "refusee" || vente.statut === "perdue") throw new ErreurInscription("Inscription refusée ou perdue.", 409);
  const p = await lireParametresGrille(admin);

  let abonnementId = vente.abonnement_id || null;
  if (!abonnementId) {
    const formule = vente.formule as Formule;
    const engagement = Boolean(vente.engagement_12) || vente.periodicite === "annuel";
    const prix = prixVente(formule, { engagement12: engagement, periodicite: vente.periodicite as "mensuel" | "annuel", remiseSupp: 0, lancement: Number(vente.lancement_pct) > 0 }, p);
    const dateDebut = premierDuMois(new Date());
    // v13.44 — offre de lancement : en annuel le montant payé est celui enregistré sur la vente (déjà remisé) ;
    // en mensuel le prix reste le plein tarif, les N premières mensualités sont remisées (lancement_fin).
    const lancementPct = Number(vente.lancement_pct) || 0;
    const lancementMois = Number(vente.lancement_mois) || 0;
    const lancementFin = lancementPct > 0 && lancementMois > 0 && vente.periodicite === "mensuel" ? finRemiseLancement(dateDebut, lancementMois) : null;
    const montantAnnuel = prix.montantAnnuel != null ? (Number(vente.montant_annuel_ht) || prix.montantAnnuel) : null;
    const prixMensuel = montantAnnuel != null ? r2(montantAnnuel / 12) : prix.mensualite;
    const remisePct = r2(100 - (prixMensuel / p.formules[formule].prix) * 100);
    const d = new Date(dateDebut);
    const renouvellement = vente.periodicite === "annuel" ? premierDuMois(new Date(d.getFullYear() + 1, d.getMonth(), 1)) : null;
    const { data: abo, error } = await admin
      .from("abonnements")
      .insert({
        garage_nom: vente.garage_nom,
        garage_email: vente.contact_email,
        formule,
        prix_ht: prixMensuel,
        remise_pct: remisePct,
        periodicite: vente.periodicite,
        montant_annuel: montantAnnuel,
        heures: p.formules[formule].heures,
        lancement_pct: lancementPct,
        lancement_fin: lancementFin,
        lancement_code: Number(vente.lancement_pct) > 0 ? vente.lancement_code || OFFRE_LANCEMENT.code : null,
        date_signature: (vente.signe_le || vente.created_at || new Date().toISOString()).slice(0, 10),
        date_debut: dateDebut,
        engagement_12: engagement,
        statut: "actif",
        commercial_id: vente.collaborateur_id || null,
        origine: "en_ligne",
        stripe_customer_id: vente.stripe_customer_id || null,
        stripe_subscription_id: vente.stripe_subscription_id || null,
        date_renouvellement: renouvellement,
        notes: `Inscription en ligne ${vente.numero || ""} · paiement : ${vente.paiement_en_ligne_mode || vente.mode_paiement}${vente.source_connaissance ? ` · connu par : ${libelleSource(vente.source_connaissance)}` : ""}${Number(vente.lancement_pct) > 0 ? ` · offre de lancement −${vente.lancement_pct} % (${vente.periodicite === "annuel" ? "déduite du montant annuel" : `${lancementMois} premières mensualités`})` : ""}.`,
      })
      .select("id")
      .single();
    if (error || !abo) throw new ErreurInscription(error?.message || "Création de l'abonnement impossible.", 500);
    abonnementId = abo.id as string;
    const lignes = lignesMensualites(abonnementId, vente.periodicite as "mensuel" | "annuel", dateDebut, prixMensuel, montantAnnuel, { pct: lancementPct, fin: lancementFin });
    if (lignes.length) await admin.from("abonnement_mensualites").upsert(lignes, { onConflict: "abonnement_id,periode", ignoreDuplicates: true });
    await admin.from("ventes").update({ abonnement_id: abonnementId, statut: "validee", validee_le: new Date().toISOString() }).eq("id", vente.id);
  }

  // Compte du garage + email de bienvenue (ne refait rien si déjà créé).
  let compte = false;
  let emailEnvoye = false;
  if (!(vente.compte_cree_le || vente.statut === "compte_cree")) {
    const r = await creerCompteDepuisVente(admin, vente.id, { par: "editeur" });
    compte = true;
    emailEnvoye = r.emailEnvoye;
  }
  await admin.from("ventes").update({ activee_le: new Date().toISOString() }).eq("id", vente.id);
  // 1re échéance payée → mensualité(s) pointée(s) tout de suite.
  try { await rattacherPaiementsVentes(admin); } catch { /* le cron repassera */ }
  return { abonnementId, compte, emailEnvoye };
}

/** Cron : inscriptions payées (Qonto / virement confirmé) mais pas encore activées. */
export async function activerInscriptionsPayees(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin.from("ventes").select("id").eq("origine", "en_ligne").not("paiement_confirme_le", "is", null).is("activee_le", null).in("statut", ["declaree", "validee", "compte_cree"]);
  if (error) return 0; // migration v98 non exécutée
  let n = 0;
  for (const v of data || []) {
    try { await activerInscription(admin, v.id); n += 1; } catch (e) { console.error("[inscription] activation :", e instanceof Error ? e.message : e); }
  }
  return n;
}

/* ------------------------------------------------------------------
 *  PAIEMENT
 * ------------------------------------------------------------------ */
export async function demarrerStripe(admin: SupabaseClient, v: VenteLigne, p: Parametres): Promise<string> {
  if (!stripeConfigure()) throw new ErreurInscription("Le prélèvement automatique n'est pas disponible pour le moment : choisissez le virement.", 503);
  if (v.paiement_confirme_le) throw new ErreurInscription("Le paiement est déjà confirmé.", 409);
  const engage = Boolean(v.engagement_12);
  const base = siteUrl();
  const session = await creerSessionAbonnement({
    venteId: v.id,
    numero: v.numero || "",
    email: v.contact_email,
    garageNom: v.garage_nom,
    libelleOffre: `${libelleFormule(v.formule, p)}${engage ? " (engagement 12 mois)" : ""}`,
    formule: v.formule,
    mensualite: Number(v.prix_mensuel_ht) || 0,
    miseEnService: Number(v.mise_en_service_ht) || 0,
    engagement12: engage,
    lancement: Number(v.lancement_pct) > 0 ? { code: v.lancement_code || OFFRE_LANCEMENT.code, pct: Number(v.lancement_pct), mois: Number(v.lancement_mois) || OFFRE_LANCEMENT.mois, libelle: OFFRE_LANCEMENT.libelle } : null,
    successUrl: `${base}/inscription/merci?token=${encodeURIComponent(v.token || "")}&stripe=ok`,
    cancelUrl: `${base}/inscription/merci?token=${encodeURIComponent(v.token || "")}&stripe=annule`,
  });
  if (!session.url) throw new ErreurInscription("Stripe n'a pas renvoyé de page de paiement.", 502);
  await admin.from("ventes").update({ stripe_checkout_id: session.id, stripe_statut: "open", paiement_en_ligne_mode: "stripe", mode_paiement: "prelevement", paiement_demande: "cb", paiement_demande_le: new Date().toISOString() }).eq("id", v.id);
  return session.url;
}

/** Session Checkout terminée (webhook ou retour sur la page merci) → vente payée + activée. */
export async function confirmerStripe(admin: SupabaseClient, session: SessionCheckout): Promise<boolean> {
  const venteId = session.metadata?.vente_id || (session as { client_reference_id?: string | null }).client_reference_id || null;
  if (!venteId) return false;
  // SEPA : la session est « complete » mais le paiement reste « unpaid » quelques jours →
  // on attend checkout.session.async_payment_succeeded (ou la vérification à la demande).
  const paye = session.payment_status === "paid" || (session.status === "complete" && session.payment_status !== "unpaid");
  if (!paye) return false;
  const { data: v } = await admin.from("ventes").select("*").eq("id", venteId).maybeSingle();
  if (!v) return false;
  const vente = v as VenteLigne;
  const maj: Record<string, unknown> = {
    stripe_statut: "complete",
    stripe_checkout_id: session.id,
    stripe_customer_id: typeof session.customer === "string" ? session.customer : vente.stripe_customer_id || null,
    stripe_subscription_id: typeof session.subscription === "string" ? session.subscription : vente.stripe_subscription_id || null,
  };
  if (!vente.paiement_confirme_le) {
    const m = premiereEcheance(vente);
    Object.assign(maj, { paiement_confirme_le: new Date().toISOString(), paiement_valide_le: new Date().toISOString(), paiement_montant: m.ttc, paiement_reference: `Stripe ${session.id}`, mode_paiement: "prelevement", paiement_en_ligne_mode: "stripe" });
  }
  await admin.from("ventes").update(maj).eq("id", venteId);
  if (vente.stripe_subscription_id || maj.stripe_subscription_id) {
    // Abonnement déjà créé (activation antérieure) → on recopie l'identifiant Stripe.
    if (vente.abonnement_id) await admin.from("abonnements").update({ stripe_subscription_id: maj.stripe_subscription_id, stripe_customer_id: maj.stripe_customer_id }).eq("id", vente.abonnement_id);
  }
  if (!vente.activee_le) {
    await activerInscription(admin, venteId);
    await notifierEditeurPaiement(admin, { ...vente, ...maj } as VenteLigne, "prélèvement Stripe");
  }
  return true;
}

/** Facture Stripe payée → la mensualité du mois correspondant est pointée (créée si besoin). */
export async function traiterFactureStripe(admin: SupabaseClient, f: FactureStripe, payee: boolean): Promise<string> {
  const subId = abonnementDeFacture(f);
  if (!subId) return "facture sans abonnement";
  const { data: abo } = await admin.from("abonnements").select("id,garage_nom,prix_ht,statut,garage_email").eq("stripe_subscription_id", subId).maybeSingle();
  if (!abo) return `abonnement Stripe ${subId} inconnu`;
  // Ligne récurrente (ancien format `price.recurring`, nouveau format `parent.subscription_item_details`).
  const ligne = f.lines?.data?.find((l) => l.price?.recurring || l.parent?.subscription_item_details) || f.lines?.data?.[0];
  const debut = new Date((ligne?.period?.start || f.period_start) * 1000);
  const periode = premierDuMois(new Date(debut.getFullYear(), debut.getMonth(), 1));
  const { data: m } = await admin.from("abonnement_mensualites").select("id,payee_le,notes").eq("abonnement_id", abo.id).eq("periode", periode).maybeSingle();
  const jour = new Date().toISOString().slice(0, 10);
  if (payee) {
    if (m) {
      if (!m.payee_le) await admin.from("abonnement_mensualites").update({ payee_le: jour, mode_paiement: "stripe", stripe_invoice_id: f.id, notes: [m.notes, `Prélèvement Stripe ${f.id}`].filter(Boolean).join(" · ") }).eq("id", m.id);
    } else {
      await admin.from("abonnement_mensualites").insert({ abonnement_id: abo.id, periode, montant_ht: r2(f.amount_paid / 100) || abo.prix_ht, payee_le: jour, mode_paiement: "stripe", stripe_invoice_id: f.id, notes: `Prélèvement Stripe ${f.id}` });
    }
    // Un garage suspendu pour impayé qui repaie est réactivé par le cron (reactiverSiRegularise).
    return `mensualité ${periode} pointée (${abo.garage_nom})`;
  }
  // Échec de prélèvement : on note, les relances graduées prennent le relais.
  if (m) await admin.from("abonnement_mensualites").update({ notes: [m.notes, `Échec de prélèvement Stripe ${f.id} le ${jour}`].filter(Boolean).join(" · ") }).eq("id", m.id);
  try {
    const exp = await expediteurEditeur(admin);
    if (exp) await envoyerEmailServeur({ to: emailsAdminServeur().join(","), subject: `[Prélèvement refusé] ${abo.garage_nom} — ${periode.slice(0, 7)}`, text: `Le prélèvement Stripe de la mensualité ${periode.slice(0, 7)} de ${abo.garage_nom} a échoué (facture ${f.id}). Stripe réessaie automatiquement ; les relances graduées s'appliquent si le garage ne régularise pas.${f.hosted_invoice_url ? `\n${f.hosted_invoice_url}` : ""}` }, exp);
  } catch { /* best-effort */ }
  return `échec de prélèvement noté (${abo.garage_nom})`;
}

/** Abonnement Stripe terminé (résiliation / impayés définitifs) → abonnement résilié chez nous. */
export async function traiterAbonnementStripeTermine(admin: SupabaseClient, subscriptionId: string): Promise<string> {
  const { data: abo } = await admin.from("abonnements").select("id,garage_nom,statut").eq("stripe_subscription_id", subscriptionId).maybeSingle();
  if (!abo) return `abonnement Stripe ${subscriptionId} inconnu`;
  if (abo.statut === "resilie") return "déjà résilié";
  await admin.from("abonnements").update({ statut: "resilie", date_fin: new Date().toISOString().slice(0, 10) }).eq("id", abo.id);
  try {
    const exp = await expediteurEditeur(admin);
    if (exp) await envoyerEmailServeur({ to: emailsAdminServeur().join(","), subject: `[Abonnement Stripe terminé] ${abo.garage_nom}`, text: `L'abonnement Stripe de ${abo.garage_nom} est terminé (résiliation ou échecs de prélèvement répétés). L'abonnement est passé en « résilié » dans l'espace éditeur : vérifie la situation (engagement en cours ? indemnité ?).` }, exp);
  } catch { /* best-effort */ }
  return `abonnement ${abo.garage_nom} résilié`;
}

/** Lien Qonto pour l'année en une fois (réutilise la logique des ventes commerciales). */
export async function demarrerQonto(admin: SupabaseClient, v: VenteLigne, p: Parametres): Promise<string> {
  const lien = await lienPaiementVente(admin, v, p);
  await admin.from("ventes").update({ paiement_en_ligne_mode: "qonto", paiement_demande: "cb", paiement_demande_le: new Date().toISOString() }).eq("id", v.id);
  return lien.url;
}

/** Vérification à la demande (page merci) : Stripe ou Qonto → payé → activation. */
export async function verifierPaiementInscription(admin: SupabaseClient, v: VenteLigne): Promise<{ paye: boolean }> {
  if (v.paiement_confirme_le) {
    if (!v.activee_le) await activerInscription(admin, v.id);
    return { paye: true };
  }
  if (v.paiement_en_ligne_mode === "stripe" && v.stripe_checkout_id && stripeConfigure()) {
    try {
      const s = await lireSession(v.stripe_checkout_id);
      if (await confirmerStripe(admin, s)) return { paye: true };
    } catch { /* on réessaiera */ }
    return { paye: false };
  }
  if (v.paiement_en_ligne_mode === "qonto" && v.qonto_link_id && qontoConfigure()) {
    try {
      const statut = await statutLienPaiement(v.qonto_link_id);
      await admin.from("ventes").update({ qonto_statut: statut }).eq("id", v.id);
      if (statut === "paid") {
        const m = premiereEcheance(v);
        await admin.from("ventes").update({ paiement_confirme_le: new Date().toISOString(), paiement_valide_le: new Date().toISOString(), paiement_montant: m.ttc, paiement_reference: `Qonto ${v.qonto_link_id}` }).eq("id", v.id);
        await activerInscription(admin, v.id);
        await notifierEditeurPaiement(admin, v, "lien de paiement");
        return { paye: true };
      }
    } catch { /* ignore */ }
  }
  return { paye: false };
}

async function notifierEditeurPaiement(admin: SupabaseClient, v: VenteLigne, mode: string) {
  try {
    const exp = await expediteurEditeur(admin);
    if (!exp) return;
    const m = premiereEcheance(v);
    await envoyerEmailServeur(
      { to: emailsAdminServeur().join(","), subject: `[Inscription payée] ${v.garage_nom} — ${eur(m.ttc)} (${v.numero})`, text: `Le garage ${v.garage_nom} (inscription en ligne ${v.numero}) a payé sa première échéance par ${mode} : ${eur(m.ttc)}.\nSon abonnement et son compte My Easy Auto ont été créés automatiquement ; l'email de bienvenue est parti à ${v.contact_email}.\n\nEspace éditeur → Ventes : ${siteUrl()}/admin/ventes` },
      exp
    );
  } catch { /* best-effort */ }
}

/* ------------------------------------------------------------------
 *  EMAILS : confirmation d'inscription (contrat en PJ) + éditeur + rappel
 * ------------------------------------------------------------------ */
export async function envoyerConfirmationInscription(admin: SupabaseClient, v: VenteLigne, p: Parametres, contratPdfBase64: string | null, urlPaiement: string | null): Promise<boolean> {
  const exp = await expediteurEditeur(admin);
  if (!exp) return false;
  const m = premiereEcheance(v);
  const lib = libelleFormule(v.formule, p);
  const suivi = `${siteUrl()}/inscription/merci?token=${encodeURIComponent(v.token || "")}`;
  const modeTxt =
    v.paiement_en_ligne_mode === "stripe"
      ? `Prélèvement automatique chaque mois de ${eur(v.prix_mensuel_ht)}${Number(v.lancement_pct) > 0 && v.periodicite === "mensuel" ? ` (offre de lancement : ${eur(mensualiteLancement(Number(v.prix_mensuel_ht) || 0, Number(v.lancement_pct)))} les ${Number(v.lancement_mois) || OFFRE_LANCEMENT.mois} premiers mois)` : ""}${Number(v.mise_en_service_ht) ? ` (+ ${eur(v.mise_en_service_ht)} de mise en service, une seule fois)` : ""}.`
      : v.paiement_en_ligne_mode === "qonto"
      ? `Paiement en ligne sécurisé de ${eur(m.ttc)} (année complète${Number(v.mise_en_service_ht) ? " + mise en service" : ""}).`
      : `Virement de ${eur(m.ttc)} — IBAN ${p.iban || "(voir facture)"}${p.bic ? ` · BIC ${p.bic}` : ""} · référence « ${referenceVirement(v)} ».`;
  const lignes = [
    `Bonjour ${v.contact_nom || ""},`,
    ``,
    `Merci pour votre inscription à ${SOCIETE.produit} (n° ${v.numero}). Vous trouverez ci-joint votre contrat d'abonnement signé électroniquement le ${v.signe_le ? new Date(v.signe_le).toLocaleString("fr-FR") : ""}.`,
    ``,
    `Votre formule : ${lib} — ${v.periodicite === "annuel" ? `année en une fois ${eur(v.montant_annuel_ht)}` : `${eur(v.prix_mensuel_ht)} par mois`}${v.engagement_12 ? " · engagement 12 mois" : " · sans engagement"}. TVA non applicable, art. 293 B du CGI.`,
    Number(v.lancement_pct) > 0 ? `Offre de lancement : −${v.lancement_pct} % ${v.periodicite === "annuel" ? "déjà déduits du montant annuel" : `sur vos ${Number(v.lancement_mois) || OFFRE_LANCEMENT.mois} premières mensualités`}, appliquée automatiquement.` : "",
    `Paiement : ${modeTxt}`,
    urlPaiement && !v.paiement_confirme_le ? `Pour régler maintenant : ${urlPaiement}` : "",
    ``,
    `Dès que votre paiement est confirmé, votre compte est créé automatiquement et vous recevez vos identifiants par email. Vous pouvez suivre votre inscription ici : ${suivi}`,
    ``,
    `Une question ? Répondez simplement à cet email ou écrivez à ${SOCIETE.email}.`,
    ``,
    `${SOCIETE.signature}`,
  ].filter((l) => l !== null);
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6;color:#1e2233;max-width:620px">${lignes
    .map((l) => (l ? `<p style="margin:6px 0">${echapper(l).replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>')}</p>` : "<br>"))
    .join("")}</div>`;
  const r = await envoyerEmailServeur(
    {
      to: v.contact_email,
      bcc: emailsAdminServeur().join(","),
      subject: `Votre inscription ${SOCIETE.produit} — contrat n° ${v.numero}`,
      html,
      text: lignes.join("\n"),
      replyTo: SOCIETE.email,
      attachments: contratPdfBase64 ? [{ filename: `Contrat-MyEasyAuto-${v.numero}.pdf`, content: contratPdfBase64 }] : undefined,
    },
    exp
  );
  if (r.ok) await admin.from("ventes").update({ contrat_envoye_le: new Date().toISOString() }).eq("id", v.id);
  return r.ok;
}

export async function notifierEditeurInscription(admin: SupabaseClient, v: VenteLigne, p: Parametres, rappel: { tel: string; creneau: string; message: string } | null) {
  try {
    const exp = await expediteurEditeur(admin);
    if (!exp) return;
    const m = premiereEcheance(v);
    const lignes = [
      `Nouvelle inscription EN LIGNE ${v.numero} — ${v.garage_nom}${v.garage_ville ? ` (${v.garage_ville})` : ""}`,
      `Contact : ${v.contact_nom || "—"} · ${v.contact_tel || "—"} · ${v.contact_email}`,
      `Formule choisie : ${libelleFormule(v.formule, p)}${v.formule_conseillee && v.formule_conseillee !== v.formule ? ` (conseillée : ${libelleFormule(v.formule_conseillee, p)})` : " (= formule conseillée)"} · ${v.periodicite === "annuel" ? `année en une fois ${eur(v.montant_annuel_ht)}` : `${eur(v.prix_mensuel_ht)} / mois`}${v.engagement_12 ? " · engagement 12 mois" : " · sans engagement"}`,
      `Première échéance : ${eur(m.ttc)} · paiement : ${v.paiement_en_ligne_mode || v.mode_paiement}`,
      `Connu par : ${libelleSource(v.source_connaissance)}${v.source_detail ? ` — ${v.source_detail}` : ""}${v.code_apporteur ? ` · code apporteur ${v.code_apporteur}` : ""}`,
      rappel ? `📞 DEMANDE DE RAPPEL : ${rappel.tel} — ${libelleCreneau(rappel.creneau)}${rappel.message ? ` — « ${rappel.message} »` : ""}` : "Pas de demande de rappel.",
      `Contrat signé en ligne le ${v.signe_le ? new Date(v.signe_le).toLocaleString("fr-FR") : "—"}.`,
    ];
    const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6;color:#1e2233"><h2>Inscription en ligne — ${echapper(v.numero || "")}</h2>${lignes.map((l) => `<p style="margin:4px 0">${echapper(l)}</p>`).join("")}<p><a href="${siteUrl()}/admin/ventes">Ouvrir l'espace éditeur → Ventes</a></p></div>`;
    await envoyerEmailServeur({ to: emailsAdminServeur().join(","), subject: `[Inscription en ligne] ${v.garage_nom} — ${libelleFormule(v.formule, p)} (${v.numero})`, html, text: lignes.join("\n"), replyTo: v.contact_email }, exp);
  } catch (e) {
    console.error("[inscription] notification éditeur :", e instanceof Error ? e.message : e);
  }
}

export async function notifierDemandeRappel(admin: SupabaseClient, d: { garage_nom: string | null; contact_nom: string | null; tel: string; email: string | null; creneau: string | null; message: string | null; etape: string | null; formule_conseillee: string | null }) {
  try {
    const exp = await expediteurEditeur(admin);
    if (!exp) return;
    const lignes = [
      `${d.garage_nom || "Un garage"} souhaite être rappelé.`,
      `Contact : ${d.contact_nom || "—"} · ${d.tel} · ${d.email || "—"}`,
      `Créneau : ${libelleCreneau(d.creneau)}`,
      d.message ? `Message : ${d.message}` : "",
      d.etape ? `Demande faite à l'étape « ${d.etape} » du parcours d'inscription.` : "",
      d.formule_conseillee ? `Formule conseillée par le parcours : ${d.formule_conseillee}.` : "",
    ].filter(Boolean);
    await envoyerEmailServeur({ to: emailsAdminServeur().join(","), subject: `[À rappeler] ${d.garage_nom || d.contact_nom || d.tel} — ${libelleCreneau(d.creneau)}`, text: lignes.join("\n") + `\n\nEspace éditeur → Ventes → Demandes de rappel : ${siteUrl()}/admin/ventes`, replyTo: d.email || undefined }, exp);
  } catch { /* best-effort */ }
}

/* ------------------------------------------------------------------
 *  RENOUVELLEMENT ANNUEL (tacite reconduction, avis 30 jours avant)
 * ------------------------------------------------------------------ */
type AboAnnuel = { id: string; garage_nom: string; garage_email: string | null; formule: string; prix_ht: number; montant_annuel: number | null; date_debut: string; date_renouvellement: string | null; renouvellement_avise_le: string | null; renouvellement_qonto_link_id: string | null; renouvellement_qonto_url: string | null; renouvellement_qonto_statut: string | null; statut: string };

export async function aviserRenouvellements(admin: SupabaseClient, joursAvant = 30): Promise<string[]> {
  const journal: string[] = [];
  const { data, error } = await admin.from("abonnements").select("*").eq("statut", "actif").eq("periodicite", "annuel");
  if (error) return journal;
  const p = await lireParametresGrille(admin);
  const exp = await expediteurEditeur(admin);
  const aujourdhui = new Date();
  for (const a of (data || []) as AboAnnuel[]) {
    // Date de reconduction : colonne, sinon date_debut + 12 mois.
    let renouvellement = a.date_renouvellement;
    if (!renouvellement) {
      const d = new Date(a.date_debut);
      renouvellement = premierDuMois(new Date(d.getFullYear() + 1, d.getMonth(), 1));
      await admin.from("abonnements").update({ date_renouvellement: renouvellement }).eq("id", a.id);
    }
    const dr = new Date(renouvellement);
    const joursRestants = Math.round((dr.getTime() - aujourdhui.getTime()) / 86_400_000);

    // 1) Lien de renouvellement payé ? → 12 mensualités suivantes, date +1 an.
    if (a.renouvellement_qonto_link_id && a.renouvellement_qonto_statut !== "paid" && qontoConfigure()) {
      try {
        const statut = await statutLienPaiement(a.renouvellement_qonto_link_id);
        if (statut !== a.renouvellement_qonto_statut) await admin.from("abonnements").update({ renouvellement_qonto_statut: statut }).eq("id", a.id);
        if (statut === "paid") {
          const montant = Number(a.montant_annuel) || Number(a.prix_ht) * 12;
          const lignes = lignesMensualites(a.id, "annuel", renouvellement, r2(montant / 12), montant).map((l) => ({ ...l, payee_le: new Date().toISOString().slice(0, 10), mode_paiement: "qonto", notes: `Renouvellement annuel payé (lien ${a.renouvellement_qonto_link_id})` }));
          await admin.from("abonnement_mensualites").upsert(lignes, { onConflict: "abonnement_id,periode", ignoreDuplicates: true });
          const suivant = premierDuMois(new Date(dr.getFullYear() + 1, dr.getMonth(), 1));
          await admin.from("abonnements").update({ date_renouvellement: suivant, renouvellement_avise_le: null, renouvellement_qonto_link_id: null, renouvellement_qonto_url: null, renouvellement_qonto_statut: null }).eq("id", a.id);
          journal.push(`Renouvellement payé : ${a.garage_nom} (jusqu'au ${suivant})`);
          continue;
        }
      } catch { /* on réessaiera demain */ }
    }

    // 2) Avis de reconduction 30 jours avant (une seule fois par échéance).
    if (!a.renouvellement_avise_le && joursRestants <= joursAvant && a.garage_email && exp) {
      const montant = Number(a.montant_annuel) || Number(a.prix_ht) * 12;
      let url: string | null = null;
      if (qontoConfigure()) {
        try {
          const lien = await creerLienPaiement({ titre: `${SOCIETE.produit} — renouvellement annuel ${libelleFormule(a.formule, p)}`, description: `${a.garage_nom} — du ${dr.toLocaleDateString("fr-FR")} pour 12 mois`, prixHt: montant, tauxTva: 0 });
          url = lien.url;
          await admin.from("abonnements").update({ renouvellement_qonto_link_id: lien.id, renouvellement_qonto_url: lien.url, renouvellement_qonto_statut: lien.status || "open" }).eq("id", a.id);
        } catch (e) {
          if (!(e instanceof ErreurQonto)) throw e;
        }
      }
      const texte = [
        `Bonjour,`,
        ``,
        `Votre abonnement ${SOCIETE.produit} (${libelleFormule(a.formule, p)}, année payée en une fois) arrive à son terme le ${dr.toLocaleDateString("fr-FR")}.`,
        `Conformément à votre contrat, il est reconduit tacitement pour une nouvelle période de douze mois au même tarif : ${eur(montant)} (TVA non applicable, art. 293 B du CGI).`,
        ``,
        `• Pour continuer, rien à faire d'autre que régler la nouvelle année avant le ${dr.toLocaleDateString("fr-FR")} :${url ? `\n  paiement en ligne sécurisé : ${url}` : ""}${p.iban ? `\n  ou par virement — IBAN ${p.iban}${p.bic ? ` · BIC ${p.bic}` : ""} · référence « RENOUV ${a.garage_nom.slice(0, 18).toUpperCase()} »` : ""}`,
        `• Pour ne pas reconduire, il vous suffit de nous l'indiquer par email à ${SOCIETE.email} avant cette date (sans frais). Vos données restent exportables 90 jours après la fin du contrat.`,
        ``,
        `Merci de votre confiance,`,
        SOCIETE.signature,
      ].join("\n");
      const r = await envoyerEmailServeur({ to: a.garage_email, bcc: emailsAdminServeur().join(","), subject: `Votre abonnement ${SOCIETE.produit} se renouvelle le ${dr.toLocaleDateString("fr-FR")}`, text: texte, replyTo: SOCIETE.email }, exp);
      if (r.ok) {
        await admin.from("abonnements").update({ renouvellement_avise_le: new Date().toISOString() }).eq("id", a.id);
        journal.push(`Avis de renouvellement envoyé : ${a.garage_nom} (échéance ${renouvellement})`);
      }
    }
  }
  return journal;
}

/* ------------------------------------------------------------------
 *  Demande de rappel (table demandes_rappel)
 * ------------------------------------------------------------------ */
export async function enregistrerDemandeRappel(
  admin: SupabaseClient,
  d: { vente_id?: string | null; garage_nom: string | null; contact_nom: string | null; tel: string; email: string | null; creneau: string | null; message: string | null; etape: string | null; source_connaissance: string | null; formule_conseillee: string | null; ip: string }
): Promise<boolean> {
  const { error } = await admin.from("demandes_rappel").insert(d);
  if (error) {
    console.error("[inscription] demande de rappel :", error.message);
    return false;
  }
  await notifierDemandeRappel(admin, d);
  return true;
}
