// ====================================================================
//  RECOURS DIRECT (v13.53, migration v103)
//
//  Le client n'est PAS responsable (constat amiable, PV…). Plutôt que de
//  passer par son propre assureur (franchise, malus, vétusté, délais de
//  la convention IRSA), le garage — mandaté par le client — réclame le
//  règlement des réparations DIRECTEMENT à l'assureur du responsable :
//  c'est l'ACTION DIRECTE de la victime contre l'assureur de l'auteur
//  (art. L. 124-3 du Code des assurances, loi Badinter du 5 juillet 1985
//  pour les accidents de la circulation).
//
//  Circuit (étapes, délais, courriers) :
//   1. mandat          — mandat de recouvrement signé par le client ;
//   2. recours_envoye  — lettre de recours direct à l'assureur adverse
//                        (mandat + constat + rapport + facture joints) ;
//                        rappel à J+15 ;
//   3. relance         — relance amiable à J+15 ; rappel à J+15 ;
//   4. mise_en_demeure — mise en demeure (LRAR) : L. 124-3, L. 211-9
//                        (offre sous 3 mois), intérêts 1231-6 C. civ.,
//                        préjudice d'immobilisation ; rappel à J+15 ;
//   5. mediateur       — Médiateur de l'assurance (2 mois sans réponse
//                        à la réclamation) ou injonction de payer ;
//   6. regle           — réglé : le mode est levé, l'historique conservé.
// ====================================================================

import type { Dossier } from "./types";

export type EtapeRecours = "mandat" | "recours_envoye" | "relance" | "mise_en_demeure" | "mediateur" | "injonction" | "regle";

export const ETAPES_RECOURS: { cle: EtapeRecours; label: string; court: string; delaiJours: number | null; conseil: string }[] = [
  { cle: "mandat", label: "Mandat signé par le client", court: "Mandat", delaiJours: null, conseil: "Faites signer le mandat de recouvrement au client (sur place ou à distance). Vérifiez que le constat amiable et le rapport d'expertise sont dans les pièces du dossier." },
  { cle: "recours_envoye", label: "Recours envoyé à l'assureur adverse", court: "Recours", delaiJours: 15, conseil: "Envoyez la lettre de recours direct avec le mandat, le constat, le rapport d'expertise et la facture. Par e-mail ET en recommandé pour faire courir les délais." },
  { cle: "relance", label: "Relance amiable", court: "Relance", delaiJours: 15, conseil: "Sans réponse à J+15 : relance courtoise, rappel des pièces, demande du n° de sinistre adverse et du nom du gestionnaire." },
  { cle: "mise_en_demeure", label: "Mise en demeure (recommandé AR)", court: "Mise en demeure", delaiJours: 15, conseil: "Sans règlement à J+30 : mise en demeure en LRAR. Elle fait courir les intérêts légaux et ouvre la voie du Médiateur." },
  { cle: "mediateur", label: "Médiateur de l'assurance", court: "Médiateur", delaiJours: 60, conseil: "Deux mois après la réclamation écrite restée sans réponse satisfaisante : saisine en ligne du Médiateur de l'assurance (mediation-assurance.org), au nom du client." },
  { cle: "injonction", label: "Injonction de payer", court: "Injonction", delaiJours: null, conseil: "Créance certaine (rapport d'expertise + facture) : requête en injonction de payer au tribunal judiciaire du siège de l'assureur, au nom du client ou du garage cessionnaire." },
  { cle: "regle", label: "Réglé par l'assureur adverse", court: "Réglé", delaiJours: null, conseil: "Règlement reçu : enregistrez le paiement, levez le recours. L'historique reste sur le dossier." },
];

export function etapeRecours(cle: string | null | undefined) {
  return ETAPES_RECOURS.find((e) => e.cle === cle) || ETAPES_RECOURS[0];
}
export function indexEtapeRecours(cle: string | null | undefined): number {
  const i = ETAPES_RECOURS.findIndex((e) => e.cle === cle);
  return i === -1 ? 0 : i;
}
export function etapeSuivante(cle: string | null | undefined): EtapeRecours | null {
  const i = indexEtapeRecours(cle);
  return ETAPES_RECOURS[i + 1]?.cle ?? null;
}

/** Jours écoulés depuis une date ISO (0 si absente). */
export function joursDepuis(iso: string | null | undefined, aujourdHui = new Date()): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((aujourdHui.getTime() - new Date(iso).getTime()) / 86400000));
}

// ---------- Ce que doit l'assureur adverse ----------
export type CalculRecours = {
  base: number;            // montant TTC des réparations (facture, sinon chiffrage)
  partClient: number;      // % de responsabilité du client
  partAssureur: number;    // % réclamé à l'assureur adverse
  vetuste: number;         // abattement de vétusté (déduit par l'assureur)
  duAssureur: number;      // ce que doit l'assureur adverse
  resteClient: number;     // ce que le client paie au garage
  tortsPartages: boolean;
};

export function calculerRecours(dossier: Pick<Dossier, "recours_part_responsabilite" | "recours_vetuste">, montantTtc: number): CalculRecours {
  const partClient = Math.min(100, Math.max(0, Number(dossier.recours_part_responsabilite ?? 0)));
  const partAssureur = 100 - partClient;
  const vetuste = Math.max(0, Number(dossier.recours_vetuste ?? 0));
  const base = Math.max(0, Number(montantTtc) || 0);
  // La vétusté est déduite de la base, puis la part du responsable s'applique.
  const du = Math.round(Math.max(0, (base - vetuste) * (partAssureur / 100)) * 100) / 100;
  return { base, partClient, partAssureur, vetuste, duAssureur: du, resteClient: Math.round((base - du) * 100) / 100, tortsPartages: partClient > 0 && partClient < 100 };
}

// ---------- Cible : l'assureur adverse ----------
export function cibleAssureurAdverse(dossier: Dossier): { nom: string; adresse: string; email: string | null } {
  return {
    nom: dossier.recours_tiers_assureur || "L'assureur du responsable",
    adresse: dossier.recours_tiers_assureur_adresse || "",
    email: dossier.recours_tiers_assureur_email || null,
  };
}

// ---------- Textes des courriers ----------
export type TypeCourrierRecours = "mandat_recours" | "recours_direct" | "relance_recours" | "mise_en_demeure_recours";

export const LIBELLE_COURRIER_RECOURS: Record<TypeCourrierRecours, string> = {
  mandat_recours: "Mandat de recouvrement (signé par le client)",
  recours_direct: "Lettre de recours direct à l'assureur du responsable",
  relance_recours: "Relance de recours direct",
  mise_en_demeure_recours: "Mise en demeure de régler (art. L. 124-3)",
};

/** L'étape du dossier atteinte quand un courrier de ce type est envoyé. */
export const ETAPE_PAR_COURRIER: Record<TypeCourrierRecours, EtapeRecours> = {
  mandat_recours: "mandat",
  recours_direct: "recours_envoye",
  relance_recours: "relance",
  mise_en_demeure_recours: "mise_en_demeure",
};

const dateFr = (d?: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "");
const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n) || 0).replace(/[  ]/g, " ");

export function modeleCourrierRecours(args: {
  type: TypeCourrierRecours;
  dossier: Dossier;
  garage: { nom: string | null; adresse?: string | null; siret?: string | null } | null;
  calcul: CalculRecours;
  numeroFacture: string | null;
  dateRecours: string | null;      // date d'envoi du recours initial (pour relance / MED)
  joursImmobilisation: number | null;
  piecesJointes: string[];
}): { objet: string; corps: string; delaiJours: number } {
  const { type, dossier, calcul } = args;
  const garage = args.garage?.nom || "Le garage";
  const client = dossier.client_nom || "notre client";
  const veh = [dossier.marque_modele, dossier.immatriculation ? `immatriculé ${dossier.immatriculation}` : ""].filter(Boolean).join(" ") || "le véhicule";
  const tiers = [dossier.recours_tiers_nom ? `conduit par ${dossier.recours_tiers_nom}` : "", dossier.recours_tiers_immat ? `immatriculé ${dossier.recours_tiers_immat}` : ""].filter(Boolean).join(", ");
  const refAdverse = [dossier.recours_tiers_police ? `police n° ${dossier.recours_tiers_police}` : "", dossier.recours_sinistre_adverse ? `votre sinistre n° ${dossier.recours_sinistre_adverse}` : ""].filter(Boolean).join(" — ");
  const sinistre = `accident du ${dateFr(dossier.recours_date_constat || dossier.date_sinistre) || "(date à préciser)"}`;
  const montantTxt = `${eur(calcul.duAssureur)} TTC${calcul.tortsPartages ? ` (soit ${calcul.partAssureur} % des réparations, torts partagés)` : ""}${calcul.vetuste ? `, vétusté de ${eur(calcul.vetuste)} déjà déduite` : ""}`;
  const pj = args.piecesJointes.length ? `\n\nPièces jointes : ${args.piecesJointes.join(" ; ")}.` : "";
  const fin = `Nous restons à votre disposition pour tout complément.\n\n${garage}`;

  if (type === "mandat_recours") {
    return {
      objet: `Mandat de recouvrement — ${veh} — ${sinistre}`,
      delaiJours: 0,
      corps:
        `Je soussigné(e) ${client}, propriétaire du véhicule ${veh}, victime de l'${sinistre} impliquant le véhicule ${tiers || "tiers responsable"}, donne mandat à ${garage}${args.garage?.adresse ? `, ${args.garage.adresse}` : ""}${args.garage?.siret ? ` (SIRET ${args.garage.siret})` : ""}, pour :\n\n` +
        `— réclamer en mon nom et pour mon compte à ${dossier.recours_tiers_assureur || "l'assureur du responsable"}, assureur du véhicule responsable, le règlement des réparations de mon véhicule, conformément à l'article L. 124-3 du Code des assurances (action directe de la victime contre l'assureur du responsable) ;\n` +
        `— lui transmettre toutes pièces utiles (constat amiable, rapport d'expertise, devis, facture, photographies) ;\n` +
        `— recevoir directement le règlement correspondant, à hauteur du montant de la facture de réparation${calcul.tortsPartages ? `, dans la limite de la part incombant au responsable (${calcul.partAssureur} %)` : ""} ;\n` +
        `— effectuer toute relance, mise en demeure et saisine du Médiateur de l'assurance nécessaires au recouvrement.\n\n` +
        `Je conserve l'entière propriété de ma créance et reste redevable envers ${garage} de toute somme non réglée par l'assureur (part de responsabilité, vétusté, franchise éventuelle). Le présent mandat prend fin au règlement complet des réparations ou sur révocation écrite.\n\n` +
        `Fait à ____________________, le ${dateFr(new Date().toISOString())}.\n\nSignature du mandant, précédée de la mention « Bon pour mandat » :`,
    };
  }

  if (type === "recours_direct") {
    return {
      objet: `Recours direct — ${sinistre} — véhicule ${veh}${refAdverse ? ` — ${refAdverse}` : ""}`,
      delaiJours: 15,
      corps:
        `Madame, Monsieur,\n\nLe véhicule ${veh}, appartenant à ${client}, a été endommagé lors de l'${sinistre}, dans lequel est impliqué le véhicule ${tiers || "assuré auprès de votre compagnie"}${dossier.recours_tiers_police ? ` (police n° ${dossier.recours_tiers_police})` : ""}. Le constat amiable joint établit la responsabilité ${calcul.tortsPartages ? `partagée (${calcul.partAssureur} % à la charge de votre assuré)` : "entière"} de votre assuré.\n\n` +
        `En application de l'article L. 124-3 du Code des assurances, la victime dispose d'une action directe contre l'assureur du responsable. ${client} nous a mandatés (mandat joint) pour réclamer en son nom le règlement des réparations.\n\n` +
        `Le véhicule a été expertisé${dossier.date_expertise ? ` le ${dateFr(dossier.date_expertise)}` : ""}${dossier.cabinet_expert ? ` par ${dossier.cabinet_expert}` : ""} ; les réparations ont été chiffrées et réalisées conformément au rapport d'expertise joint. Nous vous demandons en conséquence le règlement de ${montantTxt}, correspondant à notre facture${args.numeroFacture ? ` n° ${args.numeroFacture}` : ""} jointe, par virement sur le compte indiqué sur la facture, dans un délai de quinze jours.\n\n` +
        `Nous vous remercions de nous communiquer par retour votre numéro de sinistre et le nom du gestionnaire en charge du dossier.${args.joursImmobilisation ? `\n\nNous vous signalons que le véhicule a été immobilisé ${args.joursImmobilisation} jours ; ${client} se réserve le droit de demander l'indemnisation de son préjudice d'immobilisation (loi du 5 juillet 1985).` : ""}${pj}\n\n${fin}`,
    };
  }

  if (type === "relance_recours") {
    return {
      objet: `Relance — recours direct — ${sinistre} — véhicule ${veh}${refAdverse ? ` — ${refAdverse}` : ""}`,
      delaiJours: 15,
      corps:
        `Madame, Monsieur,\n\nPar courrier du ${dateFr(args.dateRecours) || "(date)"}, nous vous avons adressé, au nom de ${client} et en vertu du mandat joint, une demande de règlement des réparations du véhicule ${veh} endommagé lors de l'${sinistre} par votre assuré${tiers ? ` (véhicule ${tiers})` : ""}.\n\n` +
        `Sauf erreur de notre part, cette demande est restée sans réponse. Nous vous remercions de bien vouloir procéder au règlement de ${montantTxt} sous huit jours, ou de nous indiquer les pièces qui vous manqueraient ainsi que votre numéro de sinistre et le nom du gestionnaire.\n\n` +
        `À défaut, nous serions contraints de vous adresser une mise en demeure, qui fera courir les intérêts au taux légal.${pj}\n\n${fin}`,
    };
  }

  return {
    objet: `MISE EN DEMEURE de régler — recours direct — ${sinistre} — véhicule ${veh}${refAdverse ? ` — ${refAdverse}` : ""}`,
    delaiJours: 15,
    corps:
      `Madame, Monsieur,\n\nMalgré notre demande du ${dateFr(args.dateRecours) || "(date)"} et notre relance, vous n'avez pas réglé les réparations du véhicule ${veh} appartenant à ${client}, endommagé lors de l'${sinistre} par votre assuré${tiers ? ` (véhicule ${tiers})` : ""}, dont la responsabilité est établie par le constat amiable.\n\n` +
      `Nous vous rappelons qu'en application de l'article L. 124-3 du Code des assurances, la victime et son mandataire peuvent agir directement contre vous, et qu'en application de l'article L. 211-9 du même code vous êtes tenus de présenter une offre d'indemnisation dans les trois mois de la demande. Le montant réclamé, ${montantTxt}, est justifié par le rapport d'expertise et la facture déjà transmis.\n\n` +
      `Par la présente, nous vous mettons en demeure de régler cette somme sous QUINZE (15) JOURS à compter de la réception de ce courrier. Passé ce délai, elle portera intérêts au taux légal (art. 1231-6 du Code civil) et ${client} saisira le Médiateur de l'assurance puis, si nécessaire, la juridiction compétente par voie d'injonction de payer, sans préjudice de l'indemnisation de son préjudice d'immobilisation${args.joursImmobilisation ? ` (${args.joursImmobilisation} jours)` : ""}.\n\n` +
      `La présente vaut mise en demeure au sens de l'article 1344 du Code civil.${pj}\n\n${fin}`,
  };
}
