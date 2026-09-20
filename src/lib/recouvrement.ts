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
    code: "avocat",
    titre: "Avocat (si la voie sans avocat n'aboutit pas)",
    quand: "Opposition du débiteur à l'ordonnance, requête rejetée, pas d'accord en petites créances, ou créance contestée.",
    comment:
      "On confie le dossier à un avocat pour une assignation au fond (tribunal judiciaire ou de commerce) ou pour suivre l'opposition. L'appli prépare le dossier de transmission : récapitulatif de la créance, chronologie des démarches, liste des pièces. Les honoraires peuvent être réclamés au débiteur au titre de l'article 700 CPC.",
    textes: "Art. 1418 CPC (opposition) ; art. 750-1 et 700 CPC ; représentation obligatoire au-delà de 10 000 € devant le tribunal judiciaire (art. 761 CPC).",
    delaiJours: 30,
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

export type TypeCourrier = "relance" | "mise_en_demeure" | "saisine_conciliateur" | "reclamation_assureur" | "requete_injonction" | "transmission_avocat" | "remise_commissaire";

export type CibleCourrier = {
  /** client | assurance | tiers (conciliateur, tribunal, commissaire de justice) */
  type: "client" | "assurance" | "tiers";
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

// Espaces ORDINAIRES dans les montants (pas d'insécable fine U+202F : la
// police du PDF ne la connaît pas et le texte sortait de la page).
const eur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" })
    .format(Number(n) || 0)
    .replace(/[\u202F\u00A0]/g, " ");
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
  type: TypeCourrier;
  facture: Document;
  dossier: Dossier;
  cible: CibleCourrier;
  reste: number;
  niveau?: number;
  garage?: string | null;
  /** Débiteur (pour les courriers adressés à un tiers : conciliateur, tribunal…). */
  debiteur?: CibleCourrier;
  /** Étapes déjà réalisées (dates de la mise en demeure, du recommandé…). */
  etapes?: EtapesFaites | null;
}): ModeleCourrier {
  const { type, facture, dossier, cible, reste } = args;
  if (type === "saisine_conciliateur" || type === "reclamation_assureur" || type === "requete_injonction" || type === "transmission_avocat" || type === "remise_commissaire") {
    return modeleCourrierProcedure(args);
  }
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
  saisine_conciliateur: "Saisine du conciliateur de justice",
  reclamation_assureur: "Réclamation à l'assureur",
  requete_injonction: "Lettre d'accompagnement — requête en injonction de payer",
  transmission_avocat: "Dossier de transmission à l'avocat",
  remise_commissaire: "Remise du titre au commissaire de justice",
};

/* ===================== Étapes réalisées (v13.12) ====================== */

export type EtapeFaite = { fait_le: string; ref?: string | null; note?: string | null };
export type EtapesFaites = Record<string, EtapeFaite>;

/** Ce que l'appli demande pour marquer chaque étape comme faite. */
export const SAISIE_ETAPE: Record<string, { ref: string | null; aide: string }> = {
  amiable: { ref: null, aide: "Au moins une relance (email, courrier ou appel noté au journal)." },
  mise_en_demeure: { ref: "N° du recommandé", aide: "La mise en demeure est envoyée en recommandé AR : le n° de suivi sert de preuve." },
  amiable_judiciaire: { ref: "Référence (conciliateur / réclamation)", aide: "Date de saisine du conciliateur, ou de la réclamation à l'assureur — ou « dispensée » (injonction de payer)." },
  judiciaire: { ref: "N° de requête / d'ordonnance", aide: "Voie sans avocat : requête déposée (cerfa) ou petites créances engagées. Ordonnance obtenue → exécution ; opposition, rejet ou échec → avocat." },
  avocat: { ref: "Avocat (nom, cabinet) / n° RG", aide: "Dossier transmis à l'avocat ; jugement obtenu → exécution forcée." },
  execution: { ref: "Titre exécutoire (date / n°)", aide: "Ordonnance revêtue de la formule exécutoire ou accord homologué, remis au commissaire de justice." },
};

/* ======================= Voie judiciaire (v13.12) ===================== */

export type VoieJudiciaire = {
  code: "petites_creances" | "injonction_tj" | "injonction_tc";
  titre: string;
  pourquoi: string;
  /** Ce que le garage fait concrètement. */
  demarche: string;
  cerfa: string | null;
  lien: string;
  lienLabel: string;
};

/**
 * Choisit la voie sans avocat adaptée au montant et au débiteur :
 *  · ≤ 5 000 € et débiteur particulier → petites créances (commissaire de justice)
 *  · débiteur particulier → injonction de payer au tribunal judiciaire (cerfa 12948)
 *  · débiteur société / assureur → injonction de payer au tribunal de commerce (cerfa 12946)
 */
export function voieJudiciaire(reste: number, debiteurProfessionnel: boolean): VoieJudiciaire {
  if (!debiteurProfessionnel && reste <= 5000) {
    return {
      code: "petites_creances",
      titre: "Procédure simplifiée de recouvrement des petites créances",
      pourquoi: `Créance de ${eur(reste)} (≤ 5 000 €) contre un particulier : un commissaire de justice invite le débiteur à s'accorder sous 1 mois ; en cas d'accord, titre exécutoire sans passer devant le juge.`,
      demarche: "Saisir un commissaire de justice (ex-huissier) en ligne ou près du domicile du débiteur, avec la facture, l'ordre de réparation signé, les relances et la mise en demeure + AR. Frais fixes modestes, à la charge du créancier.",
      cerfa: null,
      lien: "https://www.petitescreances.fr",
      lienLabel: "petitescreances.fr (commissaires de justice)",
    };
  }
  if (!debiteurProfessionnel) {
    return {
      code: "injonction_tj",
      titre: "Injonction de payer — tribunal judiciaire",
      pourquoi: `Créance de ${eur(reste)} contre un particulier : requête au tribunal judiciaire du domicile du débiteur, sans avocat.`,
      demarche: "Remplir le cerfa 12948, joindre les pièces (facture, OR signé, relances, mise en demeure + AR), déposer ou envoyer au greffe. L'ordonnance doit être signifiée sous 3 mois ; le débiteur a 1 mois pour s'opposer.",
      cerfa: "12948",
      lien: "https://www.service-public.fr/particuliers/vosdroits/R14895",
      lienLabel: "Cerfa 12948 — service-public.fr",
    };
  }
  return {
    code: "injonction_tc",
    titre: "Injonction de payer — tribunal de commerce",
    pourquoi: `Créance de ${eur(reste)} contre une société (assureur, entreprise) : requête au tribunal de commerce du siège du débiteur, sans avocat.`,
    demarche: "Remplir le cerfa 12946 (ou déposer en ligne sur tribunaldigital.fr), joindre les pièces (facture, OR signé, relances, mise en demeure + AR, cession de créance ou accord de prise en charge le cas échéant). Signification sous 3 mois ; opposition possible sous 1 mois.",
    cerfa: "12946",
    lien: "https://www.tribunaldigital.fr",
    lienLabel: "tribunaldigital.fr (dépôt en ligne) — cerfa 12946",
  };
}

/** Pièces attendues au dossier pour la voie judiciaire. */
export type PieceProcedure = { code: string; label: string; ok: boolean; detail: string };

export function piecesProcedure(args: {
  facture: Document | null;
  ordreSigne: boolean;
  nbRelances: number;
  miseEnDemeure: { envoyee: boolean; lrar: boolean; numero_suivi?: string | null };
  cession: boolean;
}): PieceProcedure[] {
  return [
    { code: "facture", label: "Facture impayée", ok: Boolean(args.facture), detail: args.facture ? `N° ${args.facture.numero || "—"}` : "Aucune facture sur le dossier" },
    { code: "or", label: "Ordre de réparation / devis signé", ok: args.ordreSigne, detail: args.ordreSigne ? "Signé" : "Non signé — preuve de l'accord sur les travaux" },
    { code: "relances", label: "Relances", ok: args.nbRelances > 0, detail: args.nbRelances ? `${args.nbRelances} relance(s) au journal` : "Aucune relance enregistrée" },
    {
      code: "med",
      label: "Mise en demeure + accusé de réception",
      ok: args.miseEnDemeure.envoyee && args.miseEnDemeure.lrar,
      detail: !args.miseEnDemeure.envoyee ? "Non envoyée" : args.miseEnDemeure.lrar ? `Recommandé${args.miseEnDemeure.numero_suivi ? ` n° ${args.miseEnDemeure.numero_suivi}` : ""}` : "Envoyée mais pas en recommandé AR",
    },
    ...(args.cession ? [{ code: "cession", label: "Cession de créance / accord de prise en charge", ok: true, detail: "Présent au dossier" }] : []),
  ];
}

/* ================ Courriers de procédure (v13.12) ==================== */

function modeleCourrierProcedure(args: {
  type: TypeCourrier;
  facture: Document;
  dossier: Dossier;
  cible: CibleCourrier;
  reste: number;
  garage?: string | null;
  debiteur?: CibleCourrier;
  etapes?: EtapesFaites | null;
}): ModeleCourrier {
  const { type, facture, dossier, reste } = args;
  const deb = args.debiteur || cibleParDefaut(dossier);
  const ref = `facture n° ${facture.numero || "—"} du ${dateFr(facture.date_document || facture.created_at)}` +
    (dossier.numero_sinistre ? ` (sinistre n° ${dossier.numero_sinistre}` + (dossier.immatriculation ? `, véhicule ${dossier.immatriculation}` : "") + ")" : "");
  const med = args.etapes?.mise_en_demeure;
  const medTxt = med ? `mise en demeure du ${dateFr(med.fait_le)}${med.ref ? ` (recommandé n° ${med.ref})` : ""} restée sans effet` : "mise en demeure restée sans effet";
  const garage = args.garage || "Le garage";
  const fin = `Nous restons à votre disposition pour toute pièce complémentaire.\n\n${garage}`;

  if (type === "saisine_conciliateur") {
    return {
      objet: `Demande de conciliation — ${ref}`,
      delaiJours: 30,
      corps:
        `Madame, Monsieur le Conciliateur de justice,\n\nNous sollicitons votre intervention en vue d'une conciliation avec ${deb.nom}${deb.adresse ? `, ${deb.adresse.replace(/\n/g, ", ")}` : ""}.\n\n` +
        `Nous avons réalisé pour ce dernier des travaux de réparation automobile ayant donné lieu à la ${ref}, d'un montant de ${eur(Number(facture.total_ttc) || 0)} TTC, dont un solde de ${eur(reste)} demeure impayé malgré nos relances et une ${medTxt}.\n\n` +
        `Nous demandons le paiement de cette somme, majorée des intérêts légaux. Nous joignons la facture, l'ordre de réparation signé, nos relances et la mise en demeure avec son accusé de réception.\n\n` +
        `Nous sommes disponibles pour une réunion de conciliation aux dates que vous voudrez bien nous proposer.\n\n${fin}`,
    };
  }
  if (type === "reclamation_assureur") {
    return {
      objet: `RÉCLAMATION — ${ref}`,
      delaiJours: 60,
      corps:
        `Madame, Monsieur,\n\nNous saisissons votre service réclamations au sujet de la ${ref}, relative aux réparations du véhicule de votre assuré${dossier.client_nom ? ` ${dossier.client_nom}` : ""}${dossier.mode_cession ? ", pour laquelle une cession de créance nous a été consentie" : dossier.mode_pec ? ", prise en charge acceptée par vos services" : ""}.\n\n` +
        `Un solde de ${eur(reste)} demeure impayé malgré nos relances et une ${medTxt}.\n\n` +
        `Nous vous demandons le règlement de cette somme sous deux mois, majorée des pénalités de retard et de l'indemnité forfaitaire de recouvrement (art. L441-10 et D441-5 du Code de commerce). À défaut de réponse satisfaisante dans ce délai, nous saisirons le Médiateur de l'assurance, puis, si nécessaire, le tribunal de commerce par voie d'injonction de payer.\n\n${fin}`,
    };
  }
  if (type === "requete_injonction") {
    const voie = voieJudiciaire(reste, deb.professionnel);
    return {
      objet: `Requête en injonction de payer — ${ref}`,
      delaiJours: 60,
      corps:
        `Madame, Monsieur le Greffier en chef,\n\nVeuillez trouver ci-joint notre requête en injonction de payer${voie.cerfa ? ` (cerfa ${voie.cerfa})` : ""} à l'encontre de ${deb.nom}${deb.adresse ? `, ${deb.adresse.replace(/\n/g, ", ")}` : ""}, pour un montant en principal de ${eur(reste)} au titre de la ${ref}, outre les intérêts et l'indemnité forfaitaire de recouvrement le cas échéant.\n\n` +
        `Pièces jointes :\n1. Facture n° ${facture.numero || "—"}\n2. Ordre de réparation / devis signé\n3. Relances\n4. Mise en demeure${med?.ref ? ` (recommandé n° ${med.ref})` : ""} et accusé de réception${dossier.mode_cession ? "\n5. Cession de créance" : dossier.mode_pec ? "\n5. Accord de prise en charge" : ""}\n\n` +
        `Nous vous remercions de bien vouloir nous adresser l'ordonnance à intervenir.\n\n${fin}`,
    };
  }
  if (type === "transmission_avocat") {
    const et = args.etapes || {};
    const chrono = [
      ["Facture", `${dateFr(facture.date_document || facture.created_at)} — ${eur(Number(facture.total_ttc) || 0)} TTC${facture.date_echeance ? `, échéance ${dateFr(facture.date_echeance)}` : ""}`],
      ["Relances amiables", et.amiable ? `faites (${dateFr(et.amiable.fait_le)})` : "voir journal des échanges"],
      ["Mise en demeure", et.mise_en_demeure ? `${dateFr(et.mise_en_demeure.fait_le)}${et.mise_en_demeure.ref ? `, recommandé n° ${et.mise_en_demeure.ref}` : ""}` : "—"],
      ["Tentative amiable", et.amiable_judiciaire ? `${dateFr(et.amiable_judiciaire.fait_le)}${et.amiable_judiciaire.ref ? ` — ${et.amiable_judiciaire.ref}` : ""}` : "—"],
      ["Voie sans avocat", et.judiciaire ? `${dateFr(et.judiciaire.fait_le)}${et.judiciaire.ref ? ` — ${et.judiciaire.ref}` : ""}${et.judiciaire.note ? ` — ${et.judiciaire.note}` : ""}` : "—"],
    ].map(([l, v]) => `• ${l} : ${v}`).join("\n");
    return {
      objet: `Transmission d'un dossier de recouvrement — ${ref}`,
      delaiJours: 30,
      corps:
        `Maître,\n\nNous vous confions le recouvrement d'une créance de ${eur(reste)} en principal (${ref}) à l'encontre de ${deb.nom}${deb.adresse ? `, ${deb.adresse.replace(/\n/g, ", ")}` : ""}, ${deb.professionnel ? "société" : "particulier"}.\n\n` +
        `Chronologie des démarches :\n${chrono}\n\n` +
        `La voie sans avocat n'ayant pas abouti, nous souhaitons engager une assignation au fond (ou suivre l'opposition formée), avec demande au titre de l'article 700 du Code de procédure civile.\n\n` +
        `Pièces jointes : facture, ordre de réparation signé, relances, mise en demeure et accusé de réception, courriers de procédure, ${dossier.mode_cession ? "cession de créance, " : dossier.mode_pec ? "accord de prise en charge, " : ""}journal des échanges.\n\n` +
        `Merci de nous indiquer vos honoraires et la suite que vous proposez.\n\n${fin}`,
    };
  }
  // remise_commissaire
  const titre = args.etapes?.execution?.ref ? ` (${args.etapes.execution.ref})` : "";
  return {
    objet: `Remise d'un titre exécutoire pour exécution — ${ref}`,
    delaiJours: 30,
    corps:
      `Maître,\n\nNous vous remettons ci-joint, pour exécution, le titre exécutoire${titre} obtenu à l'encontre de ${deb.nom}${deb.adresse ? `, ${deb.adresse.replace(/\n/g, ", ")}` : ""}, portant sur la somme de ${eur(reste)} en principal au titre de la ${ref}, outre intérêts et frais.\n\n` +
      `Nous vous prions de bien vouloir procéder à la signification puis aux mesures d'exécution que vous jugerez utiles (saisie-attribution sur compte bancaire, saisie-vente…), les frais étant à la charge du débiteur.\n\n` +
      `Pièces jointes : titre exécutoire, facture, mise en demeure et accusé de réception.\n\n${fin}`,
  };
}

/** Destinataire « tiers » vierge (conciliateur, greffe, commissaire de justice). */
export function cibleTiers(nom: string, adresse = ""): CibleCourrier {
  return { type: "tiers", nom, adresse, professionnel: true, email: null };
}
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
