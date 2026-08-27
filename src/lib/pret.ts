// ============================================================
//  CONTRAT DE VÉHICULE DE PRÊT (v54 / v9.9)
//
//  Le client repart avec un véhicule de la flotte pendant les réparations.
//  Le contrat formalise la mise à disposition : véhicule, durée, conditions
//  financières (frais pris en charge par l'assureur du client dans le cadre
//  du sinistre, à défaut à la charge du client), assurance, obligations,
//  restitution. Les tarifs viennent du profil du garage et restent
//  modifiables sur chaque contrat ; le texte des clauses aussi.
//
//  Cadre juridique rappelé dans le document : prêt à usage (art. 1875 et s.
//  du Code civil) quand la mise à disposition est gratuite, louage de chose
//  (art. 1709 et s.) quand elle est facturée ; désignation du conducteur en
//  cas d'infraction (art. L121-6 du Code de la route) ; information
//  précontractuelle et prix (art. L111-1 et L112-1 du Code de la
//  consommation) ; RGPD pour les données du conducteur.
// ============================================================

import { Dossier, Entreprise, TransfertGarantie } from "./types";
import { formatDate, formatEuros } from "./format";

export const PRISES_EN_CHARGE: Record<string, string> = {
  assurance: "Assureur du client (garantie véhicule de remplacement / sinistre)",
  client: "Client (emprunteur)",
};

/** Nombre de jours de prêt, bornes incluses (minimum 1). */
export function joursPret(debut: string | null | undefined, fin: string | null | undefined): number {
  if (!debut || !fin) return 0;
  const a = new Date(debut);
  const b = new Date(fin);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
}

/** Coût estimé HT du prêt (jours × tarif journalier). */
export function coutPretHt(t: Pick<TransfertGarantie, "date_debut" | "date_fin" | "tarif_jour">): number {
  const j = joursPret(t.date_debut, t.date_fin);
  return Math.round(j * (Number(t.tarif_jour) || 0) * 100) / 100;
}

/** Valeurs par défaut d'un contrat, à partir du profil et du dossier. */
export function defautsContrat(ent: Partial<Entreprise> | null, dossier: Dossier) {
  return {
    tarif_jour: ent?.pret_tarif_jour ?? null,
    tarif_horaire: ent?.pret_tarif_horaire ?? null,
    franchise: ent?.pret_franchise ?? null,
    km_jour: ent?.pret_km_jour ?? null,
    prix_km: ent?.pret_prix_km ?? null,
    conducteur_nom: dossier.client_nom || "",
    prise_en_charge: "assurance",
  };
}

const euro = (n: number | null | undefined) => formatEuros(Number(n) || 0);

/**
 * Texte des clauses, généré une fois puis MODIFIABLE par le garage (il est
 * enregistré tel quel sur le contrat). Chaque article commence par
 * « Article n — Titre » sur sa propre ligne : le PDF s'appuie dessus.
 */
export function clausesParDefaut(
  t: Partial<TransfertGarantie>,
  dossier: Dossier,
  ent: Partial<Entreprise> | null
): string {
  const gratuit = !(Number(t.tarif_jour) > 0 || Number(t.tarif_horaire) > 0);
  const garage = ent?.nom || "le garage";
  const jours = joursPret(t.date_debut, t.date_fin);
  const assurance = t.prise_en_charge !== "client";

  const conditions = gratuit
    ? `Le véhicule est mis à disposition à titre gratuit, dans le cadre de la réparation du véhicule de l'emprunteur (sinistre n° ${dossier.numero_sinistre || "—"}). Il s'agit d'un prêt à usage régi par les articles 1875 et suivants du Code civil.`
    : `La mise à disposition est consentie au tarif de ${euro(t.tarif_jour)} HT par jour${
        Number(t.tarif_horaire) > 0 ? ` (ou ${euro(t.tarif_horaire)} HT par heure pour une mise à disposition inférieure à une journée)` : ""
      }, TVA en sus au taux en vigueur, soit une estimation de ${euro(coutPretHt(t as TransfertGarantie))} HT pour ${jours} jour(s). Toute journée commencée est due. Il s'agit d'un contrat de louage de chose régi par les articles 1709 et suivants du Code civil.` +
      (assurance
        ? `\nLes frais de mise à disposition sont pris en charge par l'assureur de l'emprunteur (${dossier.assureur || "assureur"}${
            dossier.numero_police ? `, contrat n° ${dossier.numero_police}` : ""
          }) au titre du sinistre n° ${dossier.numero_sinistre || "—"} et de la garantie « véhicule de remplacement » ou de l'indemnisation du préjudice d'immobilisation. ${garage} adresse directement sa facture à l'assureur. En cas de refus total ou partiel de prise en charge, la somme restant due est réglée par l'emprunteur dans les 30 jours suivant la présentation de la facture.`
        : `\nLes frais de mise à disposition sont à la charge de l'emprunteur et réglés à la restitution du véhicule.`);

  const km =
    Number(t.km_jour) > 0
      ? `Le contrat inclut ${t.km_jour} km par jour ; au-delà, chaque kilomètre supplémentaire est facturé ${euro(t.prix_km)} HT.`
      : "Le kilométrage est libre, dans le cadre d'un usage normal et privé du véhicule.";

  return [
    `Article 1 — Objet\n${garage} met à la disposition de l'emprunteur le véhicule désigné ci-dessus, en remplacement de son véhicule immobilisé pour réparation. Le véhicule est remis en bon état de marche, propre, avec ses papiers de bord (copie du certificat d'immatriculation et attestation d'assurance).`,
    `Article 2 — Durée\nLa mise à disposition court du ${formatDate(t.date_debut)} au ${formatDate(t.date_fin)}${
      jours ? ` (${jours} jour(s))` : ""
    }. Elle prend fin de plein droit à la restitution du véhicule réparé. Toute prolongation doit être acceptée par écrit par ${garage}.`,
    `Article 3 — Conditions financières\n${conditions}`,
    `Article 4 — Conducteur\nLe véhicule ne peut être conduit que par l'emprunteur ou le(s) conducteur(s) désigné(s) au contrat, titulaires d'un permis de conduire en cours de validité depuis plus de 3 ans. Toute sous-location, cession ou prêt à un tiers est interdit.`,
    `Article 5 — Assurance et franchise\nLe véhicule est assuré par ${garage} (ou par transfert des garanties du contrat de l'emprunteur, accepté par son assureur). En cas de sinistre responsable, de vol ou de dommages non couverts, une franchise de ${euro(t.franchise)} reste à la charge de l'emprunteur, ainsi que le montant des dommages non pris en charge par l'assurance. L'emprunteur déclare tout accident à ${garage} sous 48 heures et remplit un constat amiable.`,
    `Article 6 — Utilisation\nL'emprunteur s'engage à utiliser le véhicule en bon père de famille, à respecter le Code de la route, à ne pas conduire sous l'emprise de l'alcool ou de stupéfiants, à ne pas l'utiliser pour le transport de marchandises, la compétition, l'apprentissage de la conduite ou hors du territoire national sans accord écrit. ${km}`,
    `Article 7 — Infractions\nLes contraventions et amendes commises pendant la mise à disposition sont à la charge de l'emprunteur. Conformément à l'article L121-6 du Code de la route, ${garage} désignera l'emprunteur (ou le conducteur déclaré) comme conducteur responsable auprès des autorités.`,
    `Article 8 — Carburant et entretien\nLe véhicule est remis avec un niveau de carburant de ${t.carburant || "—"} et restitué au même niveau ; à défaut, le carburant manquant est facturé au prix en vigueur majoré d'un forfait de service. L'emprunteur veille aux niveaux (huile, liquide de refroidissement) et signale sans délai tout voyant ou anomalie.`,
    `Article 9 — Restitution et état des lieux\nLe véhicule est restitué à l'adresse de ${garage} à la date convenue, dans l'état où il a été remis (état des lieux contradictoire et photos au départ et au retour). Les dommages constatés au retour, non signalés au départ, sont facturés à l'emprunteur sur la base du devis de remise en état, sous réserve de l'application de l'article 5. Kilométrage au départ : ${
      t.km_depart != null ? `${Number(t.km_depart).toLocaleString("fr-FR")} km` : "—"
    }.`,
    `Article 10 — Données personnelles\nLes informations recueillies (identité, permis, coordonnées) sont nécessaires à l'exécution du contrat et à la désignation du conducteur en cas d'infraction. Elles sont conservées par ${garage} pendant la durée légale et l'emprunteur dispose d'un droit d'accès, de rectification et d'effacement (RGPD).`,
    `Article 11 — Litiges\nLe présent contrat est soumis au droit français. En cas de litige, les parties recherchent une solution amiable ; l'emprunteur consommateur peut recourir gratuitement au médiateur de la consommation dont relève ${garage}. À défaut, les tribunaux compétents sont ceux du ressort du siège de ${garage}.`,
  ].join("\n\n");
}
