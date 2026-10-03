// ============================================================
//  PAIEMENT D'UNE VENTE (v13.37) — côté SERVEUR uniquement.
//
//  1re échéance d'un nouveau garage, encaissée par IDEAFORMA :
//   • LIEN DE PAIEMENT Qonto à usage unique (carte, Apple Pay…), créé à la
//     demande et réutilisé tant qu'il est ouvert ; repli sur le lien CB
//     fixe des paramètres si Qonto n'est pas configuré ;
//   • VIREMENT : IBAN / BIC / montant TTC / référence envoyés au garage.
//  Le statut du lien est vérifié à la demande (« Vérifier ») et chaque
//  matin par le cron /api/relances-auto : payé → vente marquée payée ET
//  vérifiée (le paiement est constaté par la banque), commercial et
//  éditeur prévenus.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { ErreurQonto, creerLienPaiement, qontoConfigure, statutLienPaiement } from "@/lib/qonto";
import { envoyerEmailServeur } from "@/lib/mailer";
import { comptesAdmin, emailsAdminServeur } from "@/lib/supportServeur";
import type { Parametres } from "@/lib/admin/economie";
import { SOCIETE } from "@/components/vitrine/societe";
import { TVA_VENTE, VenteParcours, premiereEcheance, referenceVirement } from "@/lib/venteParcours";

export class ErreurVente extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const eur = (n: number) =>
  `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, " ")} €`;

function libelleOffre(v: VenteParcours, p: Parametres): string {
  const lib = p.formules[v.formule as keyof Parametres["formules"]]?.libelle || v.formule;
  return v.periodicite === "annuel" ? `${lib} — année` : `${lib} — 1re mensualité`;
}

export type LienVente = { url: string; qonto: boolean; statut: string | null };

/** Lien de paiement de la 1re échéance (créé une fois, réutilisé tant qu'il est ouvert). */
export async function lienPaiementVente(admin: SupabaseClient, v: VenteParcours, p: Parametres): Promise<LienVente> {
  if (v.paiement_confirme_le) throw new ErreurVente("Le paiement de cette vente est déjà confirmé.", 409);
  if (!qontoConfigure()) {
    if (p.lienPaiementCb) return { url: p.lienPaiementCb, qonto: false, statut: null };
    throw new ErreurVente("Aucun moyen de paiement en ligne n'est configuré par IDEAFORMA : propose le virement.", 503);
  }
  if (v.qonto_url && v.qonto_link_id && ["open", "processing", null, undefined, ""].includes(v.qonto_statut as string)) {
    return { url: v.qonto_url, qonto: true, statut: v.qonto_statut || "open" };
  }
  const m = premiereEcheance(v);
  let lien: Awaited<ReturnType<typeof creerLienPaiement>>;
  try {
    lien = await creerLienPaiement({
      titre: `${SOCIETE.produit} — ${libelleOffre(v, p)}`,
      description: `${v.garage_nom} — vente ${v.numero}${Number(v.mise_en_service_ht) ? " (mise en service incluse)" : ""}`,
      prixHt: m.ht,
      tauxTva: TVA_VENTE,
    });
  } catch (e) {
    // v13.38 : Qonto pas (encore) connecté → repli sur le lien CB fixe s'il existe.
    if (e instanceof ErreurQonto && e.status === 503 && p.lienPaiementCb) return { url: p.lienPaiementCb, qonto: false, statut: null };
    throw e;
  }
  await admin.from("ventes").update({ qonto_link_id: lien.id, qonto_url: lien.url, qonto_statut: lien.status || "open", paiement_demande: "cb", mode_paiement: "cb" }).eq("id", v.id);
  return { url: lien.url, qonto: true, statut: lien.status || "open" };
}

/** Vérifie le lien Qonto d'une vente ; payé → vente payée + vérifiée. */
export async function verifierPaiementVente(admin: SupabaseClient, v: VenteParcours, opts: { notifier?: boolean } = {}): Promise<{ statut: string | null; paye: boolean }> {
  if (v.paiement_confirme_le) return { statut: v.qonto_statut || "paid", paye: true };
  if (!v.qonto_link_id || !qontoConfigure()) return { statut: v.qonto_statut || null, paye: false };
  const st = await statutLienPaiement(v.qonto_link_id);
  if (st === "paid") {
    const m = premiereEcheance(v);
    const maintenant = new Date().toISOString();
    await admin
      .from("ventes")
      .update({
        qonto_statut: "paid",
        paiement_confirme_le: maintenant,
        paiement_valide_le: maintenant,
        paiement_reference: v.paiement_reference || `Lien Qonto ${String(v.qonto_link_id).slice(0, 8).toUpperCase()}`,
        paiement_montant: m.ttc,
        mode_paiement: "cb",
      })
      .eq("id", v.id);
    if (opts.notifier !== false) await notifierPaiement(admin, v, m.ttc);
    return { statut: "paid", paye: true };
  }
  if (st !== (v.qonto_statut || "open")) await admin.from("ventes").update({ qonto_statut: st }).eq("id", v.id);
  return { statut: st, paye: false };
}

/** Cron quotidien : pointe les ventes payées par lien. */
export async function verifierLiensVentes(admin: SupabaseClient): Promise<{ verifies: number; payees: number }> {
  if (!qontoConfigure()) return { verifies: 0, payees: 0 };
  const { data } = await admin.from("ventes").select("*").not("qonto_link_id", "is", null).is("paiement_confirme_le", null);
  let verifies = 0;
  let payees = 0;
  for (const v of (data || []) as VenteParcours[]) {
    if (["paid", "expired", "canceled"].includes(v.qonto_statut || "")) continue;
    try {
      const r = await verifierPaiementVente(admin, v);
      verifies += 1;
      if (r.paye) payees += 1;
    } catch {
      /* best-effort */
    }
  }
  return { verifies, payees };
}

async function notifierPaiement(admin: SupabaseClient, v: VenteParcours, ttc: number) {
  try {
    const expediteur = (await comptesAdmin(admin))[0];
    if (!expediteur) return;
    const destinataires = [...emailsAdminServeur()];
    if (v.owner_id) {
      const { data } = await admin.auth.admin.getUserById(v.owner_id);
      const mail = data?.user?.email;
      if (mail && !destinataires.includes(mail)) destinataires.push(mail);
    }
    await envoyerEmailServeur(
      {
        to: destinataires.join(","),
        subject: `[Paiement reçu] ${v.garage_nom} — ${eur(ttc)} TTC (${v.numero})`,
        text: [
          `Le garage ${v.garage_nom} a payé la 1re échéance de la vente ${v.numero} par lien de paiement : ${eur(ttc)} TTC.`,
          v.statut === "compte_cree" || v.compte_cree_le ? "Son compte My Easy Auto est déjà créé." : "Étape suivante : créer le compte du garage depuis la fiche client (onglet Vente & paiement).",
        ].join("\n"),
      },
      expediteur.id
    );
  } catch {
    /* ignore */
  }
}

/** Email au garage : lien de paiement OU coordonnées de virement. */
export async function envoyerDemandePaiement(
  admin: SupabaseClient,
  v: VenteParcours,
  p: Parametres,
  args: { mode: "lien" | "virement"; to: string; commercialNom: string; commercialEmail: string | null; url?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const to = args.to.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new ErreurVente("Adresse email du garage invalide.");
  if (args.mode === "virement" && !p.iban) throw new ErreurVente("L'IBAN d'IDEAFORMA n'est pas renseigné dans les paramètres : impossible d'envoyer les coordonnées de virement.", 503);
  if (args.mode === "lien" && !args.url) throw new ErreurVente("Lien de paiement manquant.");
  const expediteur = (await comptesAdmin(admin))[0];
  if (!expediteur) throw new ErreurVente("Messagerie IDEAFORMA non configurée.", 503);
  const m = premiereEcheance(v);
  const ref = referenceVirement(v);
  const bonjour = `Bonjour${v.contact_nom ? ` ${v.contact_nom}` : ""},`;
  const recap = [
    `Offre : ${libelleOffre(v, p)}${v.engagement_12 ? " (engagement 12 mois)" : ""}`,
    `Montant : ${eur(m.ht)} HT + TVA ${TVA_VENTE} % (${eur(m.tva)}) = ${eur(m.ttc)} TTC`,
  ];
  const corps =
    args.mode === "lien"
      ? [
          bonjour,
          "",
          `Merci pour votre confiance ! Pour démarrer ${SOCIETE.produit}, voici le lien de paiement sécurisé de votre première échéance :`,
          "",
          args.url!,
          "",
          ...recap,
          "",
          "Le paiement se fait par carte bancaire en quelques secondes. Votre compte est activé dès réception.",
        ]
      : [
          bonjour,
          "",
          `Merci pour votre confiance ! Pour démarrer ${SOCIETE.produit}, voici les coordonnées pour régler votre première échéance par virement :`,
          "",
          `Bénéficiaire : ${SOCIETE.editeur}`,
          `IBAN : ${p.iban}`,
          p.bic ? `BIC : ${p.bic}` : "",
          `Montant : ${eur(m.ttc)} TTC`,
          `Référence à indiquer : ${ref}`,
          "",
          ...recap,
          "",
          "Merci d'indiquer la référence ci-dessus : elle nous permet de rattacher votre règlement sans délai.",
        ];
  const texte = [
    ...corps,
    "",
    `Une question ? Répondez simplement à cet email ou contactez ${args.commercialNom}${args.commercialEmail ? ` (${args.commercialEmail})` : ""}.`,
    "",
    "Cordialement,",
    `${args.commercialNom} — ${SOCIETE.signature}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
  const r = await envoyerEmailServeur(
    {
      to,
      bcc: [args.commercialEmail, ...emailsAdminServeur()].filter(Boolean).join(","),
      replyTo: args.commercialEmail || undefined,
      subject: `${SOCIETE.produit} — ${args.mode === "lien" ? "votre lien de paiement" : "coordonnées de virement"} (${v.garage_nom})`,
      text: texte,
    },
    expediteur.id
  );
  if (r.ok) {
    await admin
      .from("ventes")
      .update({
        paiement_envoye_le: new Date().toISOString(),
        paiement_envoye_a: to,
        paiement_envoye_mode: args.mode,
        paiement_demande: args.mode === "lien" ? "cb" : "virement",
        paiement_demande_le: new Date().toISOString(),
        mode_paiement: args.mode === "lien" ? "cb" : "virement",
      })
      .eq("id", v.id);
  }
  return { ok: r.ok, error: r.error };
}
