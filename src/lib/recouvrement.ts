// ============================================================
//  RECOUVREMENT — escalade automatique des impayés (v50)
//
//  Une relance isolée ne récupère rien : ce qui paie, c'est la RÉGULARITÉ
//  et la GRADATION. Trois paliers, comptés en jours de RETARD (pas en
//  jours depuis la dernière relance) :
//
//     J+15  relance courtoise      envoyée automatiquement
//     J+30  relance ferme          envoyée automatiquement
//     J+45  mise en demeure        JAMAIS automatique — c'est un acte
//                                  juridique, le garage doit le décider
//
//  Le compteur « récupéré grâce aux relances » (encaissements survenus
//  APRÈS une relance) sert à une seule chose : montrer noir sur blanc ce
//  que l'outil rapporte.
// ============================================================

import { Document, Dossier, Paiement, Relance } from "./types";
import { estSoldee, round2, totalPaye } from "./paiements";

export type Palier = {
  niveau: number;
  /** Jours de retard à partir desquels ce palier se déclenche. */
  jours: number;
  label: string;
  court: string;
  /** true = le garage doit valider lui-même (aucun envoi automatique). */
  manuel: boolean;
  badge: string;
};

export const PALIERS: Palier[] = [
  { niveau: 1, jours: 15, label: "Relance courtoise", court: "Relance 1", manuel: false, badge: "badge badge-info" },
  { niveau: 2, jours: 30, label: "Relance ferme", court: "Relance 2", manuel: false, badge: "badge badge-warn" },
  { niveau: 3, jours: 45, label: "Mise en demeure", court: "Mise en demeure", manuel: true, badge: "badge badge-danger" },
];

export const PALIER_CONTENTIEUX_JOURS = 60;

function jour(d: string | null | undefined): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  return isNaN(t) ? null : t;
}

/** Jours de retard d'une facture (0 si pas encore échue). */
export function joursDeRetard(facture: Document): number {
  const ech = jour(facture.date_echeance);
  if (ech === null) return 0;
  const j = Math.floor((Date.now() - ech) / 86400000);
  return j > 0 ? j : 0;
}

export type EtatRecouvrement = {
  reste: number;
  retard: number;
  /** Nombre de relances déjà envoyées sur cette facture. */
  faites: number;
  /** Palier atteint compte tenu du retard (null si rien à faire). */
  attendu: Palier | null;
  /** Palier à déclencher maintenant (null si à jour). */
  aFaire: Palier | null;
  /** Prochain palier et dans combien de jours. */
  prochain: Palier | null;
  joursAvantProchain: number | null;
  /** Impayé de plus de 60 jours après mise en demeure. */
  contentieux: boolean;
};

export function etatRecouvrement(
  facture: Document,
  paiements: Paiement[],
  relances: Relance[]
): EtatRecouvrement {
  const paye = totalPaye(paiements.filter((p) => p.document_id === facture.id));
  const reste = round2(Math.max(0, (Number(facture.total_ttc) || 0) - paye));
  const soldee = estSoldee(facture.total_ttc, paye);
  const retard = joursDeRetard(facture);
  const faites = relances.filter((r) => r.document_id === facture.id).length;

  if (soldee || reste <= 0.01 || retard === 0) {
    return {
      reste,
      retard,
      faites,
      attendu: null,
      aFaire: null,
      prochain: PALIERS[0],
      joursAvantProchain: null,
      contentieux: false,
    };
  }

  // Dernier palier dont le seuil est franchi.
  const atteints = PALIERS.filter((p) => retard >= p.jours);
  const attendu = atteints.length > 0 ? atteints[atteints.length - 1] : null;

  // Ce qu'il reste à faire : le premier palier franchi qui n'a pas encore
  // sa relance. `faites` sert de curseur — une relance = un palier.
  const aFaire = atteints.length > faites ? atteints[faites] : null;

  const suivant = PALIERS.find((p) => retard < p.jours) || null;

  return {
    reste,
    retard,
    faites,
    attendu,
    aFaire,
    prochain: suivant,
    joursAvantProchain: suivant ? suivant.jours - retard : null,
    contentieux: retard >= PALIER_CONTENTIEUX_JOURS && faites >= PALIERS.length,
  };
}

/* --------------------- Ce que les relances rapportent ---------------- */

/**
 * Somme des encaissements arrivés APRÈS une relance sur la même facture.
 * Approximation assumée et volontairement PRUDENTE : on ne compte que les
 * paiements postérieurs à la première relance, et jamais un paiement
 * antérieur. Le chiffre est donc un plancher.
 */
export function euroRecuperes(
  factures: Document[],
  paiements: Paiement[],
  relances: Relance[]
): { montant: number; factures: number } {
  let montant = 0;
  let nb = 0;
  for (const f of factures) {
    const rels = relances
      .filter((r) => r.document_id === f.id)
      .map((r) => jour(r.date_relance))
      .filter((t): t is number => t !== null);
    if (rels.length === 0) continue;
    const premiere = Math.min(...rels);

    const apres = paiements.filter((p) => {
      if (p.document_id !== f.id) return false;
      const t = jour(p.date_paiement);
      return t !== null && t >= premiere;
    });
    if (apres.length === 0) continue;
    montant = round2(montant + apres.reduce((s, p) => s + (Number(p.montant) || 0), 0));
    nb += 1;
  }
  return { montant, factures: nb };
}

/** Phrase courte pour l'écran : « Relance 2 à envoyer (32 j de retard) ». */
export function libelleEtat(e: EtatRecouvrement): string {
  if (e.reste <= 0.01) return "Soldée";
  if (e.retard === 0) return "Dans les délais";
  if (e.contentieux) return `Contentieux — ${e.retard} j de retard`;
  if (e.aFaire) return `${e.aFaire.label} à envoyer (${e.retard} j de retard)`;
  if (e.prochain && e.joursAvantProchain !== null) {
    return `${e.prochain.label} dans ${e.joursAvantProchain} j`;
  }
  return `${e.retard} j de retard`;
}

/* ====================================================================
   v12.7 — MODE « RETARD DE PAIEMENT » ASSISTÉ

   Le dossier passe en retard de paiement d'un clic (comme le litige). La
   fiche remonte alors la finance en haut de page et guide le garage,
   étape par étape, jusqu'à la saisie de la justice si rien ne rentre.

   Repères juridiques (droit français, état septembre 2026 — à vérifier
   avant toute action judiciaire, l'appli n'est ni avocat ni huissier) :
     · Mise en demeure : art. 1344 et 1231-6 du Code civil (fait courir
       les intérêts). Recommandé avec AR pour la preuve.
     · Débiteur PROFESSIONNEL (assurance, société) : pénalités de retard
       et indemnité forfaitaire de 40 € exigibles DE PLEIN DROIT, sans
       rappel — art. L441-10 et D441-5 du Code de commerce. Taux : celui
       des CGV (au moins 3 × le taux légal), sinon taux BCE + 10 points.
     · Débiteur PARTICULIER : intérêts au taux légal à compter de la mise
       en demeure ; pas d'indemnité de 40 €.
     · Avant le tribunal, pour une demande ≤ 5 000 € : tentative amiable
       obligatoire (conciliateur de justice — gratuit —, médiation ou
       procédure participative), art. 750-1 CPC. La Cour de cassation
       (25/09/2025) a précisé que l'INJONCTION DE PAYER en est dispensée.
     · Assurance qui traîne : médiateur de l'assurance possible après
       réclamation écrite restée sans réponse satisfaisante (2 mois).
     · Petites créances ≤ 5 000 € : procédure simplifiée par commissaire
       de justice (art. L125-1 CPCE) — le débiteur a 1 mois pour accepter ;
       en cas d'accord, titre exécutoire sans juge. Exclue entre
       commerçants.
     · Injonction de payer (art. 1405 s. CPC) : requête sans avocat,
       cerfa 12948 (tribunal judiciaire, débiteur particulier) ou 12946
       (tribunal de commerce, débiteur société/assureur). L'ordonnance
       doit être signifiée sous 3 MOIS (décret 2026-96) ; le débiteur a
       1 MOIS pour faire opposition (art. 1416 CPC).
     · Exécution forcée par commissaire de justice (ex-huissier) une fois
       le titre exécutoire obtenu (saisie sur compte, etc.).
     · PRESCRIPTION : 2 ans contre un particulier (art. L218-2 Code de la
       consommation), 5 ans entre professionnels (art. L110-4 Code de
       commerce) — à compter de la facture. Ne pas laisser passer.
==================================================================== */

/** Étapes de la procédure de recouvrement, dans l'ordre. */
export type EtapeProcedure = {
  code: string;
  titre: string;
  /** Quand y passer. */
  quand: string;
  /** Ce qu'on fait concrètement (et où). */
  comment: string;
  /** Textes de référence. */
  textes: string;
  /** Délai indicatif avant l'étape suivante (jours). */
  delaiJours: number;
};

export const ETAPES_PROCEDURE: EtapeProcedure[] = [
  {
    code: "amiable",
    titre: "Relance amiable",
    quand: "Dès l'échéance dépassée.",
    comment:
      "Appel téléphonique (à noter dans le journal), email de relance, puis courrier de relance. On demande la date de mise en paiement et on garde une trace de chaque échange.",
    textes: "Aucune forme imposée. Délai de paiement entre pros : 30 jours par défaut, 60 jours maximum (art. L441-10 C. com.).",
    delaiJours: 8,
  },
  {
    code: "mise_en_demeure",
    titre: "Mise en demeure",
    quand: "Après une ou deux relances sans effet (≈ J+30 à J+45 de retard).",
    comment:
      "Courrier généré ici, à signer et à envoyer en RECOMMANDÉ AVEC ACCUSÉ DE RÉCEPTION (ou par email si le destinataire répond par ce canal, mais l'AR reste la preuve). Délai de 8 jours. C'est l'acte qui fait courir les intérêts et qui sera exigé par le juge.",
    textes: "Art. 1344 et 1231-6 C. civ. ; pénalités et indemnité de 40 € : art. L441-10 et D441-5 C. com. (débiteur professionnel).",
    delaiJours: 8,
  },
  {
    code: "amiable_judiciaire",
    titre: "Tentative amiable (conciliateur / médiateur)",
    quand: "Mise en demeure restée sans effet.",
    comment:
      "≤ 5 000 € : saisir le conciliateur de justice (gratuit, en mairie ou au tribunal — conciliateurs.fr) ou un médiateur : c'est OBLIGATOIRE avant une assignation classique. Face à une ASSURANCE : réclamation écrite au service réclamations, puis le Médiateur de l'assurance (mediation-assurance.org) si pas de réponse satisfaisante sous 2 mois. Sinon, passer directement à l'injonction de payer (dispensée de cette étape).",
    textes: "Art. 750-1 CPC (décret 2023-357) ; Cass. 2e civ. 25/09/2025 : l'injonction de payer est dispensée.",
    delaiJours: 30,
  },
  {
    code: "judiciaire",
    titre: "Injonction de payer / petites créances",
    quand: "Toujours rien après la mise en demeure et la tentative amiable.",
    comment:
      "Deux voies sans avocat : (1) PETITES CRÉANCES ≤ 5 000 € — un commissaire de justice invite le débiteur à s'accorder sous 1 mois ; si accord, titre exécutoire sans juge (exclu entre commerçants). (2) INJONCTION DE PAYER — requête cerfa 12948 au tribunal judiciaire (débiteur particulier) ou cerfa 12946 au tribunal de commerce (société, assureur), avec facture, devis/OR signé, relances, mise en demeure + AR. L'ordonnance doit être signifiée sous 3 mois ; le débiteur a 1 mois pour s'opposer.",
    textes: "Art. L125-1 CPCE (petites créances) ; art. 1405 à 1425 CPC (injonction) ; décret 2026-96 (signification 3 mois) ; art. 1416 CPC (opposition 1 mois).",
    delaiJours: 60,
  },
  {
    code: "execution",
    titre: "Exécution forcée",
    quand: "Titre exécutoire obtenu (ordonnance non contestée ou accord homologué).",
    comment:
      "Remettre le titre à un commissaire de justice (ex-huissier) : saisie sur compte bancaire, saisie-vente… Les frais d'exécution sont en principe à la charge du débiteur.",
    textes: "Code des procédures civiles d'exécution. Pensez à la prescription : 2 ans (particulier, L218-2 C. conso) / 5 ans (professionnel, L110-4 C. com.).",
    delaiJours: 30,
  },
];

export function etapeProcedure(code: string | null | undefined): EtapeProcedure {
  return ETAPES_PROCEDURE.find((e) => e.code === code) || ETAPES_PROCEDURE[0];
}

export function etapeSuivante(code: string | null | undefined): EtapeProcedure | null {
  const i = ETAPES_PROCEDURE.findIndex((e) => e.code === code);
  return ETAPES_PROCEDURE[i + 1] || null;
}

/* --------------------- Pénalités : estimation indicative -------------- */

/** Taux d'intérêt légal (professionnel créancier / « autres cas »), 2e semestre 2026. */
export const TAUX_LEGAL = 2.75;
/** Taux supplétif entre professionnels : BCE + 10 points (2e semestre 2026). */
export const TAUX_PENALITES_PRO = 12.4;
/** Indemnité forfaitaire de recouvrement (art. D441-5 C. com.). */
export const INDEMNITE_FORFAITAIRE = 40;
export const PERIODE_TAUX = "2e semestre 2026";

export type EstimationPenalites = {
  taux: number;
  interets: number;
  indemnite: number;
  total: number;
  jours: number;
};

/**
 * Estimation INDICATIVE des sommes accessoires — sert à informer, pas à
 * facturer : le garage vérifie ses CGV et les taux du semestre en cours.
 */
export function estimerPenalites(reste: number, joursRetard: number, professionnel: boolean): EstimationPenalites {
  const taux = professionnel ? TAUX_PENALITES_PRO : TAUX_LEGAL;
  const interets = round2((reste * (taux / 100) * Math.max(0, joursRetard)) / 365);
  const indemnite = professionnel && reste > 0 ? INDEMNITE_FORFAITAIRE : 0;
  return { taux, interets, indemnite, total: round2(interets + indemnite), jours: joursRetard };
}

/* --------------------- Modèles de courriers ---------------------------- */

export type CibleCourrier = {
  /** client | assurance */
  type: "client" | "assurance";
  nom: string;
  adresse: string;
  professionnel: boolean;
  email?: string | null;
};

export type ModeleCourrier = {
  objet: string;
  corps: string;
  delaiJours: number;
};

const eur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
const dateFr = (d?: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "");

/** Destinataire par défaut d'un courrier : l'assurance si elle doit payer (cession / PEC), sinon le client. */
export function cibleParDefaut(dossier: Dossier): CibleCourrier {
  const versAssurance = Boolean(dossier.mode_cession || dossier.mode_pec);
  if (versAssurance) return cibleAssurance(dossier);
  return cibleClient(dossier);
}

export function cibleClient(dossier: Dossier): CibleCourrier {
  return {
    type: "client",
    nom: dossier.client_nom || "Le client",
    adresse: [dossier.client_adresse, `${dossier.client_code_postal || ""} ${dossier.client_ville || ""}`.trim()]
      .filter(Boolean)
      .join("\n"),
    professionnel: false,
    email: dossier.client_email || null,
  };
}

export function cibleAssurance(dossier: Dossier): CibleCourrier {
  return {
    type: "assurance",
    nom: dossier.assureur || "L'assureur",
    adresse: dossier.assureur_adresse || "",
    professionnel: true,
    email: dossier.assureur_email || null,
  };
}

/**
 * Texte proposé pour un courrier — le garage peut TOUT modifier avant de
 * signer. `niveau` = nombre de relances déjà faites + 1 (pour la relance).
 */
export function modeleCourrier(args: {
  type: "relance" | "mise_en_demeure";
  facture: Document;
  dossier: Dossier;
  cible: CibleCourrier;
  reste: number;
  niveau?: number;
  garage?: string | null;
}): ModeleCourrier {
  const { type, facture, dossier, cible, reste } = args;
  const ref =
    `facture n° ${facture.numero || "—"}` +
    (dossier.numero_sinistre ? ` — sinistre n° ${dossier.numero_sinistre}` : "") +
    (dossier.immatriculation ? ` — véhicule ${dossier.marque_modele ? dossier.marque_modele + " " : ""}${dossier.immatriculation}` : "");
  const echeance = facture.date_echeance ? `, payable au ${dateFr(facture.date_echeance)}` : "";
  const total = eur(Number(facture.total_ttc) || 0);
  const du = eur(reste);
  const civilite = cible.type === "assurance" ? "Madame, Monsieur," : "Madame, Monsieur,";
  const signature = `Nous restons à votre disposition pour tout renseignement.\n\n${args.garage || "Le garage"}`;

  if (type === "relance") {
    const niveau = args.niveau || 1;
    if (niveau <= 1) {
      return {
        objet: `Relance — ${ref}`,
        delaiJours: 8,
        corps:
          `${civilite}\n\nSauf erreur ou omission de notre part, la ${ref}, d'un montant de ${total} TTC${echeance}, reste à ce jour impayée pour un solde de ${du}.\n\n` +
          `Nous vous remercions de bien vouloir procéder à son règlement sous 8 jours, ou de nous indiquer la date de mise en paiement prévue. Si ce règlement a été effectué entre-temps, merci de ne pas tenir compte de ce courrier.\n\n` +
          signature,
      };
    }
    return {
      objet: `Relance n° ${niveau} — ${ref}`,
      delaiJours: 8,
      corps:
        `${civilite}\n\nMalgré notre précédente relance, la ${ref}, d'un montant de ${total} TTC${echeance}, demeure impayée pour un solde de ${du}.\n\n` +
        `Nous vous demandons de procéder à son règlement sous 8 jours, ou de nous communiquer par retour le motif du blocage et la date de mise en paiement.\n\n` +
        (cible.professionnel
          ? `Nous vous rappelons qu'en application de l'article L441-10 du Code de commerce, tout retard de paiement entraîne de plein droit l'exigibilité de pénalités de retard ainsi que de l'indemnité forfaitaire de recouvrement de 40 € (art. D441-5).\n\n`
          : "") +
        `À défaut de réponse, nous serons contraints de vous adresser une mise en demeure.\n\n` +
        signature,
    };
  }

  const consequences = cible.professionnel
    ? `À défaut de règlement dans ce délai, seront exigibles de plein droit les pénalités de retard prévues à l'article L441-10 du Code de commerce (calculées depuis l'échéance, au taux de la Banque centrale européenne majoré de dix points, sauf taux prévu dans nos conditions générales), ainsi que l'indemnité forfaitaire de recouvrement de 40 € (art. D441-5 du Code de commerce). Nous engagerons en outre, sans nouvel avis, toute procédure de recouvrement, y compris judiciaire (injonction de payer), les frais en résultant restant à votre charge.`
    : `À défaut de règlement dans ce délai, les sommes dues porteront intérêt au taux légal à compter de la réception de la présente (art. 1231-6 du Code civil), et nous engagerons, sans nouvel avis, toute procédure de recouvrement, y compris judiciaire (injonction de payer ou procédure simplifiée de recouvrement par commissaire de justice).`;

  return {
    objet: `MISE EN DEMEURE DE PAYER — ${ref}`,
    delaiJours: 8,
    corps:
      `${civilite}\n\nMalgré nos relances restées sans effet, la ${ref}, d'un montant de ${total} TTC${echeance}, demeure impayée à ce jour pour un solde de ${du}.\n\n` +
      `Par la présente, nous vous mettons en demeure de nous régler la somme de ${du} TTC dans un délai de HUIT (8) JOURS à compter de la réception de ce courrier, par virement sur le compte dont les coordonnées figurent sur la facture.\n\n` +
      `${consequences}\n\n` +
      `La présente vaut mise en demeure au sens des articles 1344 et suivants du Code civil. Si le règlement a été effectué entre-temps, nous vous prions de considérer ce courrier comme sans objet.\n\n` +
      signature,
  };
}

/** Libellés d'écran. */
export const LIBELLE_TYPE_COURRIER: Record<string, string> = {
  relance: "Courrier de relance",
  mise_en_demeure: "Mise en demeure de payer",
};
export const INTERLOCUTEURS: { code: string; label: string }[] = [
  { code: "client", label: "Client" },
  { code: "assurance", label: "Assurance" },
  { code: "expert", label: "Expert" },
  { code: "autre", label: "Autre" },
];
export const CANAUX_CONTACT: { code: string; label: string }[] = [
  { code: "telephone", label: "Téléphone" },
  { code: "email", label: "Email" },
  { code: "courrier", label: "Courrier" },
  { code: "autre", label: "Autre" },
];

/** Échéance ISO du prochain rappel : dans `jours` jours, à 9 h 00 (heure locale). */
export function echeanceRappel(jours: number): string {
  const d = new Date();
  d.setDate(d.getDate() + jours);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}
