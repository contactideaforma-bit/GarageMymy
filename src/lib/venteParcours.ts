// ============================================================
//  PARCOURS DE VENTE (v13.37) — logique PURE (client + serveur).
//
//  Du premier contact au paiement, la fiche client du commercial affiche
//  8 étapes. Chacune est « faite », « en cours » (la prochaine à faire)
//  ou « à venir », avec UNE action claire pour avancer. Rien n'est
//  bloquant : on peut toujours sauter une étape (ex. pas de RDV).
// ============================================================

import type { Prospect, ProspectDocument } from "@/lib/prospects";
import { STATUTS_PROSPECT } from "@/lib/prospects";
import { tauxRemplissage } from "@/lib/ficheBesoins";
import type { Vente } from "@/lib/admin/client";

export const TVA_VENTE = 20;

export type CleEtape =
  | "contact"
  | "rdv"
  | "besoins"
  | "devis"
  | "contrat"
  | "vente"
  | "paiement"
  | "compte";

export type EtatEtape = "fait" | "courant" | "a_venir";

export type EtapeParcours = {
  cle: CleEtape;
  numero: number;
  titre: string;
  /** Phrase courte affichée sous le titre (ce qui est fait / ce qu'il faut faire). */
  detail: string;
  etat: EtatEtape;
  /** Texte du bouton de l'action principale. */
  action: string;
  /** Explication en une phrase de ce que l'action déclenche. */
  aide: string;
};

/** Champs d'une vente utilisés par le parcours (colonnes v57 / v92 / v94). */
export type VenteParcours = Vente & {
  paiement_demande?: string | null;
  paiement_confirme_le?: string | null;
  paiement_valide_le?: string | null;
  compte_cree_le?: string | null;
  compte_cree_par?: string | null;
  qonto_link_id?: string | null;
  qonto_url?: string | null;
  qonto_statut?: string | null;
  paiement_envoye_le?: string | null;
  paiement_envoye_a?: string | null;
  paiement_envoye_mode?: string | null;
};

const arrondi = (n: number) => Math.round(n * 100) / 100;

/** Montant de la 1re échéance (mensualité ou année + mise en service), HT et TTC. */
export function premiereEcheance(v: Pick<Vente, "periodicite" | "montant_annuel_ht" | "prix_mensuel_ht" | "mise_en_service_ht">): { ht: number; tva: number; ttc: number } {
  const base = v.periodicite === "annuel" ? Number(v.montant_annuel_ht) || 0 : Number(v.prix_mensuel_ht) || 0;
  const ht = arrondi(base + (Number(v.mise_en_service_ht) || 0));
  const tva = arrondi(ht * (TVA_VENTE / 100));
  return { ht, tva, ttc: arrondi(ht + tva) };
}

/** Référence à porter sur le virement : courte, sans accents, retrouvable. */
export function referenceVirement(v: Pick<Vente, "numero" | "garage_nom">): string {
  const nom = (v.garage_nom || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .toUpperCase()
    .slice(0, 18);
  return `MEA ${v.numero || ""} ${nom}`.replace(/\s+/g, " ").trim();
}

export function estPaye(v: VenteParcours | null | undefined): boolean {
  return Boolean(v && (v.paiement_confirme_le || v.paiement_valide_le || v.qonto_statut === "paid"));
}

export function compteCree(v: VenteParcours | null | undefined): boolean {
  return Boolean(v && (v.statut === "compte_cree" || v.statut === "fidelisee" || v.compte_cree_le));
}

/** Calcule les 8 étapes à partir de la fiche, de ses documents et de la vente. */
export function calculerParcours(p: Prospect, docs: ProspectDocument[], vente: VenteParcours | null): EtapeParcours[] {
  const ordre = STATUTS_PROSPECT[p.statut]?.ordre ?? 0;
  const contrat = docs.find((d) => d.type === "contrat" && d.signature_client);
  const contratNonSigne = docs.find((d) => d.type === "contrat" && !d.signature_client);
  const devis = docs.find((d) => d.type === "devis");
  const taux = tauxRemplissage(p.besoins);
  const manquants = [!p.tel && "téléphone", !p.email && "email", !(p.siret || p.siren) && "SIRET"].filter(Boolean) as string[];
  const paye = estPaye(vente);

  const faits: Record<CleEtape, boolean> = {
    contact: manquants.length === 0,
    rdv: ordre >= 1 && p.statut !== "perdu",
    besoins: taux >= 50,
    devis: Boolean(devis) || Boolean(contrat),
    contrat: Boolean(contrat),
    vente: Boolean(vente),
    paiement: paye,
    compte: compteCree(vente),
  };

  const base: Omit<EtapeParcours, "etat" | "numero">[] = [
    {
      cle: "contact",
      titre: "Premier contact",
      detail: faits.contact ? `${p.contact_nom || p.gerant || "Interlocuteur"} · ${p.tel || ""}` : `À compléter : ${manquants.join(", ")}`,
      action: "Compléter la fiche du garage",
      aide: "Le téléphone et l'email servent pour la suite ; l'email deviendra l'identifiant du compte.",
    },
    {
      cle: "rdv",
      titre: "Rendez-vous",
      detail: faits.rdv ? (p.prochaine_date && p.statut === "rdv" ? `RDV le ${p.prochaine_date.split("-").reverse().join("/")}` : "RDV fait ou étape passée") : "Proposer un rendez-vous au garage",
      action: "Confirmer un rendez-vous par email",
      aide: "Un email de confirmation part au garage et un rappel est programmé pour toi.",
    },
    {
      cle: "besoins",
      titre: "Besoins du garage",
      detail: taux > 0 ? `Questionnaire rempli à ${taux} %` : "Questionnaire à remplir pendant le RDV",
      action: "Remplir le questionnaire",
      aide: "10 minutes avec le garage : volume de dossiers, assureurs, agréments, demandes particulières.",
    },
    {
      cle: "devis",
      titre: "Offre et devis",
      detail: devis ? `Devis ${devis.numero || ""}${devis.envoye_le ? " envoyé" : " prêt"}` : "Choisir la formule et générer le devis",
      action: "Préparer l'offre",
      aide: "Formule, engagement, remise : le devis PDF se génère en un clic et s'envoie par email.",
    },
    {
      cle: "contrat",
      titre: "Contrat signé",
      detail: contrat ? `Contrat ${contrat.numero || ""} signé${contrat.signataire_client ? ` par ${contrat.signataire_client}` : ""}` : contratNonSigne ? `Contrat ${contratNonSigne.numero || ""} à faire signer` : "Générer le contrat puis le faire signer",
      action: contratNonSigne ? "Faire signer le contrat" : "Générer le contrat",
      aide: "Signature du garage sur ton téléphone ou ta tablette, directement sur place.",
    },
    {
      cle: "vente",
      titre: "Vente déclarée",
      detail: vente ? `Vente ${vente.numero} déclarée` : "Transmettre la vente à IDEAFORMA",
      action: "Déclarer la vente",
      aide: "IDEAFORMA est prévenue tout de suite ; tu passes ensuite au paiement.",
    },
    {
      cle: "paiement",
      titre: "Paiement",
      detail: paye
        ? `Payé${vente?.paiement_reference ? ` (réf. ${vente.paiement_reference})` : ""}`
        : vente?.paiement_envoye_le
          ? `${vente.paiement_envoye_mode === "virement" ? "Coordonnées de virement" : "Lien de paiement"} envoyé — en attente`
          : "Envoyer un lien de paiement ou les coordonnées de virement",
      action: "Encaisser la 1re échéance",
      aide: "Lien de paiement par carte (à ouvrir sur place ou envoyé par email/SMS) ou virement avec référence.",
    },
    {
      cle: "compte",
      titre: "Compte du garage",
      detail: compteCree(vente) ? "Compte créé — email de bienvenue envoyé" : "Créer le compte My Easy Auto du garage",
      action: "Créer le compte du garage",
      aide: "Le garage reçoit son identifiant et un mot de passe provisoire par email.",
    },
  ];

  // L'étape « courante » = la première non faite (en ignorant les étapes
  // facultatives déjà dépassées : un contrat signé vaut RDV et devis faits).
  let dernierFait = -1;
  base.forEach((e, i) => {
    if (faits[e.cle]) dernierFait = i;
  });
  const premiereNonFaite = base.findIndex((e, i) => !faits[e.cle] && i > dernierFait);
  const indexCourant = premiereNonFaite === -1 ? base.findIndex((e) => !faits[e.cle]) : premiereNonFaite;

  return base.map((e, i) => ({
    ...e,
    numero: i + 1,
    etat: faits[e.cle] || (i < dernierFait && e.cle !== "contact") ? "fait" : i === indexCourant ? "courant" : "a_venir",
  }));
}

/** Avancement global en % (pour la liste « Mes clients »). */
export function avancement(etapes: EtapeParcours[]): number {
  return Math.round((etapes.filter((e) => e.etat === "fait").length / etapes.length) * 100);
}
