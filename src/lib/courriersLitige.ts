// ====================================================================
//  COURRIERS DE DÉBLOCAGE D'UN DOSSIER (mode litige, v13.18)
//
//  Quand l'assureur fait traîner (reconstitution demandée, expert qui
//  sursoit, aucune position sur le paiement), deux courriers à un clic :
//
//   · à l'EXPERT : demande d'accord de réparation et de conservation des
//     preuves — l'expert fige ses constatations (photos jointes), les pièces
//     sont conservées, et les travaux peuvent commencer sans compromettre
//     une éventuelle reconstitution.
//   · à l'ASSUREUR : mise en demeure de prendre position — art. L. 211-9 du
//     Code des assurances (offre d'indemnisation dans les 3 mois de la
//     demande), intérêts au taux légal après mise en demeure (art. 1231-6
//     C. civ.), préjudice d'immobilisation, Médiateur de l'assurance à
//     défaut de réponse sous 2 mois.
// ====================================================================

import { Dossier } from "./types";

export type TypeCourrierLitige = "accord_reparation_expert" | "position_assureur";

export const LIBELLE_COURRIER_LITIGE: Record<TypeCourrierLitige, string> = {
  accord_reparation_expert: "Demande d'accord de réparation et conservation des preuves",
  position_assureur: "Mise en demeure de prise de position (art. L. 211-9)",
};

export const DELAI_OFFRE_JOURS = 92; // trois mois (art. L. 211-9 C. assur.)

const dateFr = (d?: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "");
const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n) || 0).replace(/[  ]/g, " ");

/** Compteur des 3 mois : point de départ = date d'expertise (demande d'indemnisation), sinon date du sinistre. */
export function compteurOffre(dossier: Pick<Dossier, "date_expertise" | "date_sinistre">, aujourdHui = new Date()) {
  const base = dossier.date_expertise || dossier.date_sinistre || null;
  if (!base) return { base: null, echeance: null, joursRestants: null as number | null, depasse: false };
  const t = new Date(base).getTime();
  const echeance = new Date(t + DELAI_OFFRE_JOURS * 86400000);
  const restants = Math.ceil((echeance.getTime() - aujourdHui.getTime()) / 86400000);
  return { base, echeance: echeance.toISOString().slice(0, 10), joursRestants: restants, depasse: restants < 0 };
}

export function modeleCourrierLitige(args: {
  type: TypeCourrierLitige;
  dossier: Dossier;
  garage: string | null;
  montant: number | null;
  nbPhotos: number;
  joursImmobilisation: number | null;
  gardiennageJour: number | null;
}): { objet: string; corps: string; delaiJours: number } {
  const { type, dossier, montant } = args;
  const garage = args.garage || "Le garage";
  const veh = [dossier.marque_modele, dossier.immatriculation ? `immatriculé ${dossier.immatriculation}` : ""].filter(Boolean).join(" ") || "le véhicule";
  const ref = [dossier.numero_sinistre ? `sinistre n° ${dossier.numero_sinistre}` : "", dossier.date_sinistre ? `du ${dateFr(dossier.date_sinistre)}` : "", dossier.numero_police ? `police n° ${dossier.numero_police}` : ""].filter(Boolean).join(" — ");
  const client = dossier.client_nom || "notre client";
  const fin = `Nous restons à votre disposition pour tout complément.\n\n${garage}`;

  if (type === "accord_reparation_expert") {
    return {
      objet: `Demande d'accord de réparation et de conservation des preuves — ${veh} — ${ref}`,
      delaiJours: 8,
      corps:
        `Madame, Monsieur,\n\nVous avez procédé${dossier.date_expertise ? ` le ${dateFr(dossier.date_expertise)}` : ""} à l'expertise du véhicule ${veh}, appartenant à ${client}, dans le cadre du ${ref}. Ce véhicule est immobilisé dans nos locaux depuis lors, dans l'attente de votre accord pour la réparation${montant ? `, chiffrée à ${eur(montant)} HT conformément à votre rapport` : ""}.\n\n` +
        `Nous comprenons que la compagnie mandante souhaite procéder à des vérifications complémentaires (reconstitution des circonstances). Afin de concilier ces vérifications avec la remise en état, nous vous proposons de FIGER LES CONSTATATIONS : ${args.nbPhotos > 0 ? `vous trouverez ci-joint ${args.nbPhotos} photographie(s) d'état du véhicule prises avant tout démontage ; ` : ""}nous nous engageons à conserver, à votre disposition, l'ensemble des pièces déposées et remplacées, et à vous permettre tout examen complémentaire sur simple demande, y compris en cours de travaux.\n\n` +
        `Nous vous remercions en conséquence de bien vouloir, sous huit jours : soit nous confirmer par écrit votre accord pour le démarrage des travaux sous réserve de conservation des pièces, soit nous indiquer la date de votre visite complémentaire ou de la reconstitution, afin que nous puissions en informer ${client}.\n\n` +
        `À défaut de réponse, nous en aviserons la compagnie et l'assuré, l'immobilisation prolongée du véhicule${args.joursImmobilisation ? ` (${args.joursImmobilisation} jours à ce jour)` : ""} générant un préjudice (perte de jouissance, frais de gardiennage${args.gardiennageJour ? ` au tarif affiché de ${eur(args.gardiennageJour)} HT par jour` : ""}) dont il sera demandé réparation.\n\n${fin}`,
    };
  }
  const cpt = compteurOffre(dossier);
  return {
    objet: `MISE EN DEMEURE de prendre position — ${ref} — véhicule ${veh}`,
    delaiJours: 15,
    corps:
      `Madame, Monsieur,\n\nLe véhicule ${veh}, appartenant à votre ${dossier.mode_cession || dossier.mode_pec ? "assuré" : "assuré / lésé"} ${client}, a été endommagé lors du ${ref}. Il a été expertisé${dossier.date_expertise ? ` le ${dateFr(dossier.date_expertise)}` : ""} par ${dossier.cabinet_expert || "votre expert"}${montant ? ` ; les réparations ont été chiffrées à ${eur(montant)} HT` : ""}.\n\n` +
      `Depuis cette date, le véhicule est immobilisé${args.joursImmobilisation ? ` depuis ${args.joursImmobilisation} jours` : ""} et ${client} est privé de son usage, sans qu'aucune position ne nous ait été communiquée quant à la prise en charge des réparations et au règlement.\n\n` +
      `Nous vous rappelons qu'en application de l'article L. 211-9 du Code des assurances, l'assureur est tenu de présenter une offre d'indemnisation dans un délai de trois mois à compter de la demande${cpt.echeance ? `, soit au plus tard le ${dateFr(cpt.echeance)}` : ""}, et qu'à défaut les sommes dues portent intérêt (art. L. 211-13 du Code des assurances), sans préjudice de l'indemnisation du préjudice d'immobilisation (perte de jouissance, frais de gardiennage, véhicule de remplacement).\n\n` +
      `Par la présente, nous vous mettons en demeure de nous faire connaître, sous QUINZE (15) JOURS à compter de la réception de ce courrier, votre position écrite : accord de réparation et modalités de règlement, ou refus motivé, ou date des vérifications complémentaires que vous entendez diligenter. Nous vous demandons également de prendre en charge le préjudice d'immobilisation à compter de la date d'expertise.\n\n` +
      `À défaut de réponse satisfaisante, ${client} saisira le Médiateur de l'assurance et, si nécessaire, la juridiction compétente. La présente vaut mise en demeure au sens de l'article 1344 du Code civil.\n\n${fin}`,
  };
}
