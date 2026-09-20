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

export type TypeCourrier = "relance" | "mise_en_demeure" | "mise_en_demeure_retrait" | "saisine_conciliateur" | "reclamation_assureur" | "requete_injonction" | "transmission_avocat" | "remise_commissaire" | "requete_vente_1903" | "attribution_gage";

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
    // v13.13 : un client avec SIREN est une entreprise (pénalités L441-10, tribunal de commerce).
    professionnel: Boolean((dossier.client_siren || "").trim()),
    email: dossier.client_email || null,
  };
}

/** Le cabinet d'expertise (relance du rapport définitif, information de la procédure). */
export function cibleExpert(dossier: Dossier): CibleCourrier {
  return {
    type: "tiers",
    nom: [dossier.cabinet_expert, dossier.expert_nom ? `à l'attention de ${dossier.expert_nom}` : ""].filter(Boolean).join("\n") || "Le cabinet d'expertise",
    adresse: dossier.cabinet_adresse || "",
    professionnel: true,
    email: dossier.expert_email || dossier.cabinet_email || null,
  };
}

/**
 * v13.13 — COMPLÈTE le dossier avec l'annuaire (clients, assureurs, experts)
 * quand une coordonnée manque sur la fiche : adresse, email, téléphone,
 * SIREN. Le dossier n'est pas modifié en base, seulement pour les courriers.
 */
export function completerDossierDepuisAnnuaire(
  dossier: Dossier,
  annuaire: { client?: Partial<ClientAnnuaire> | null; assureur?: Partial<AssureurAnnuaire> | null; expert?: Partial<ExpertAnnuaire> | null }
): Dossier {
  const d = { ...dossier };
  const c = annuaire.client;
  if (c) {
    if (!d.client_adresse && c.adresse) d.client_adresse = c.adresse;
    if (!d.client_code_postal && c.code_postal) d.client_code_postal = c.code_postal;
    if (!d.client_ville && c.ville) d.client_ville = c.ville;
    if (!d.client_email && c.email) d.client_email = c.email;
    if (!d.client_tel && c.telephone) d.client_tel = c.telephone;
    if (!d.client_siren && c.siren) d.client_siren = c.siren;
  }
  const a = annuaire.assureur;
  if (a) {
    if (!d.assureur_adresse && (a.adresse || a.ville)) d.assureur_adresse = [a.adresse, `${a.code_postal || ""} ${a.ville || ""}`.trim()].filter(Boolean).join("\n");
    if (!d.assureur_email && a.email) d.assureur_email = a.email;
    if (!d.assureur_tel && a.tel) d.assureur_tel = a.tel;
    if (!d.assureur_siren && a.siren) d.assureur_siren = a.siren;
  }
  const e = annuaire.expert;
  if (e) {
    if (!d.cabinet_adresse && (e.adresse || e.ville)) d.cabinet_adresse = [e.adresse, `${e.code_postal || ""} ${e.ville || ""}`.trim()].filter(Boolean).join("\n");
    if (!d.cabinet_email && e.email) d.cabinet_email = e.email;
    if (!d.cabinet_tel && e.tel) d.cabinet_tel = e.tel;
    if (!d.expert_nom && e.expert_nom) d.expert_nom = e.expert_nom;
    if (!d.expert_email && e.expert_email) d.expert_email = e.expert_email;
    if (!d.expert_tel && e.expert_tel) d.expert_tel = e.expert_tel;
  }
  return d;
}
type ClientAnnuaire = { adresse: string | null; code_postal: string | null; ville: string | null; email: string | null; telephone: string | null; siren?: string | null };
type AssureurAnnuaire = { adresse: string | null; code_postal: string | null; ville: string | null; email: string | null; tel: string | null; siren?: string | null };
type ExpertAnnuaire = { adresse: string | null; code_postal: string | null; ville: string | null; email: string | null; tel: string | null; expert_nom: string | null; expert_email: string | null; expert_tel: string | null };

/** Ville / code postal du débiteur (compétence territoriale : domicile ou siège du débiteur). */
export function lieuDebiteur(dossier: Dossier, cible: CibleCourrier): { ville: string; codePostal: string } {
  if (cible.type === "client") return { ville: (dossier.client_ville || "").trim(), codePostal: (dossier.client_code_postal || "").trim() };
  const adr = cible.adresse || "";
  const m = /(\d{5})\s+([^\n,]+)\s*$/.exec(adr.trim());
  return { ville: (m?.[2] || "").trim(), codePostal: m?.[1] || "" };
}

/**
 * v13.13 — Destinataire tiers PRÉ-REMPLI selon le courrier de procédure et le
 * lieu du débiteur (le tribunal / conciliateur compétent est celui du
 * domicile ou du siège du DÉBITEUR). L'adresse exacte reste à vérifier.
 */
export function cibleTiersPourCourrier(type: TypeCourrier, dossier: Dossier, debiteur: CibleCourrier, reste: number): CibleCourrier {
  const { ville, codePostal } = lieuDebiteur(dossier, debiteur);
  const ou = ville ? ` de ${ville}` : "";
  const ligneVille = [codePostal, ville].filter(Boolean).join(" ");
  switch (type) {
    case "saisine_conciliateur":
      return cibleTiers(`Conciliateur de justice${ou}`, [ville ? `Tribunal judiciaire / Mairie${ou}` : "Tribunal judiciaire", ligneVille].filter(Boolean).join("\n"));
    case "requete_injonction": {
      const voie = voieJudiciaire(reste, debiteur.professionnel);
      if (voie.code === "petites_creances") return cibleTiers(`Commissaire de justice${ou}`, ligneVille);
      if (voie.code === "injonction_tc") return cibleTiers(`Greffe du tribunal de commerce${ou}`, ligneVille);
      return cibleTiers(`Greffe du tribunal judiciaire${ou}`, ligneVille);
    }
    case "transmission_avocat":
      return cibleTiers("Maître", ligneVille);
    case "remise_commissaire":
    case "requete_vente_1903":
      return cibleTiers(`Commissaire de justice${ou}`, ligneVille);
    default:
      return cibleTiers("", "");
  }
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
  /** v13.13 — coordonnées bancaires et contact du garage, pour dire OÙ payer. */
  banque?: { iban?: string | null; bic?: string | null; tel?: string | null; email?: string | null } | null;
  /** v13.15 — données de la garantie véhicule (gardiennage, OR, gage, expertise). */
  garantie?: InfosGarantie | null;
}): ModeleCourrier {
  const { type, facture, dossier, cible, reste } = args;
  const ouPayer = args.banque?.iban
    ? `par virement sur notre compte IBAN ${args.banque.iban}${args.banque.bic ? ` (BIC ${args.banque.bic})` : ""}, en rappelant la référence ${facture.numero || "de la facture"}`
    : "par virement sur le compte dont les coordonnées figurent sur la facture";
  const contact = [args.banque?.tel ? `au ${args.banque.tel}` : "", args.banque?.email ? `par email à ${args.banque.email}` : ""].filter(Boolean).join(" ou ");
  if (type === "saisine_conciliateur" || type === "reclamation_assureur" || type === "requete_injonction" || type === "transmission_avocat" || type === "remise_commissaire") {
    return modeleCourrierProcedure(args);
  }
  if (type === "mise_en_demeure_retrait" || type === "requete_vente_1903" || type === "attribution_gage") {
    return modeleCourrierGarantie(args);
  }
  const ref =
    `facture n° ${facture.numero || "—"}` +
    (dossier.numero_sinistre ? ` — sinistre n° ${dossier.numero_sinistre}` : "") +
    (dossier.immatriculation ? ` — véhicule ${dossier.marque_modele ? dossier.marque_modele + " " : ""}${dossier.immatriculation}` : "");
  const echeance = facture.date_echeance ? `, payable au ${dateFr(facture.date_echeance)}` : "";
  const total = eur(Number(facture.total_ttc) || 0);
  const du = eur(reste);
  const civilite = cible.type === "assurance" ? "Madame, Monsieur," : "Madame, Monsieur,";
  const signature = `Nous restons à votre disposition pour tout renseignement${contact ? ` ${contact}` : ""}.\n\n${args.garage || "Le garage"}`;

  if (type === "relance") {
    const niveau = args.niveau || 1;
    if (niveau <= 1) {
      return {
        objet: `Relance — ${ref}`,
        delaiJours: 8,
        corps:
          `${civilite}\n\nSauf erreur ou omission de notre part, la ${ref}, d'un montant de ${total} TTC${echeance}, reste à ce jour impayée pour un solde de ${du}.\n\n` +
          `Nous vous remercions de bien vouloir procéder à son règlement sous 8 jours ${ouPayer}, ou de nous indiquer la date de mise en paiement prévue. Si ce règlement a été effectué entre-temps, merci de ne pas tenir compte de ce courrier.\n\n` +
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
      `Par la présente, nous vous mettons en demeure de nous régler la somme de ${du} TTC dans un délai de HUIT (8) JOURS à compter de la réception de ce courrier, ${ouPayer}.\n\n` +
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
  mise_en_demeure_retrait: "Mise en demeure de payer et de retirer le véhicule",
  requete_vente_1903: "Demande de vente aux enchères (loi de 1903)",
  attribution_gage: "Notification du transfert de propriété (gage)",
  remise_commissaire: "Remise du titre au commissaire de justice",
};

/* ===================== Étapes réalisées (v13.12) ====================== */

export type EtapeFaite = { fait_le: string; ref?: string | null; note?: string | null; montant?: number | null; frais?: number | null };
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

/* ================ Courriers de garantie véhicule (v13.15) ============= */

export type InfosGarantie = {
  vehicule: string;
  dispoDepuis: string | null;
  gardiennageJours: number;
  gardiennageMontant: number;
  gardiennageJour: number | null;
  gageDelai: number | null;
  gageMontant: number | null;
  numeroOR: string | null;
  dateOR: string | null;
  dateSignatureOR: string | null;
  /** Réalisation du gage : évaluation et calcul. */
  valeurExpert?: number | null;
  expert?: string | null;
  frais?: number | null;
  aRestituer?: number | null;
  resteDu?: number | null;
};

function modeleCourrierGarantie(args: {
  type: TypeCourrier;
  facture: Document;
  dossier: Dossier;
  cible: CibleCourrier;
  reste: number;
  garage?: string | null;
  debiteur?: CibleCourrier;
  etapes?: EtapesFaites | null;
  banque?: { iban?: string | null; bic?: string | null; tel?: string | null; email?: string | null } | null;
  garantie?: InfosGarantie | null;
}): ModeleCourrier {
  const { type, facture, dossier, reste } = args;
  const g = args.garantie;
  const deb = args.debiteur || cibleParDefaut(dossier);
  const garage = args.garage || "Le garage";
  const veh = g?.vehicule || [dossier.marque_modele, dossier.immatriculation].filter(Boolean).join(" ") || "votre véhicule";
  const ref = `facture n° ${facture.numero || "—"}` + (dossier.numero_sinistre ? ` (sinistre n° ${dossier.numero_sinistre})` : "");
  const ouPayer = args.banque?.iban ? `par virement sur notre compte IBAN ${args.banque.iban}${args.banque.bic ? ` (BIC ${args.banque.bic})` : ""}` : "par virement sur le compte indiqué sur la facture";
  const gard = g && g.gardiennageJours > 0 && g.gardiennageJour ? ` Des frais de gardiennage courent depuis le ${dateFr(g.dispoDepuis)} au tarif affiché de ${eur(g.gardiennageJour)} HT par jour, soit ${eur(g.gardiennageMontant)} HT à ce jour.` : "";
  const fin = `Nous restons à votre disposition pour tout renseignement.\n\n${garage}`;

  if (type === "mise_en_demeure_retrait") {
    const or = g?.numeroOR ? `l'ordre de réparation n° ${g.numeroOR}${g.dateSignatureOR ? ` signé le ${dateFr(g.dateSignatureOR)}` : ""}` : "l'ordre de réparation signé";
    const gage = g?.gageDelai
      ? `\n\nNous vous rappelons qu'en application de la clause de gage et de pacte commissoire que vous avez expressément acceptée dans ${or} (article 2348 du Code civil), à défaut de paiement intégral dans un délai de ${g.gageDelai} jours à compter de la réception de la présente, la propriété du véhicule nous sera transférée. Sa valeur sera alors fixée par un expert automobile au jour du transfert ; si elle excède les sommes dues, la différence vous sera restituée.`
      : "";
    return {
      objet: `MISE EN DEMEURE de payer et de retirer le véhicule ${veh} — ${ref}`,
      delaiJours: 8,
      corps:
        `Madame, Monsieur,\n\nLes réparations de ${veh}, réalisées conformément à ${or}, sont achevées${g?.dispoDepuis ? ` depuis le ${dateFr(g.dispoDepuis)}` : ""} et le véhicule est à votre disposition dans nos locaux. La ${ref}, d'un montant de ${eur(Number(facture.total_ttc) || 0)} TTC, demeure impayée pour un solde de ${eur(reste)}.${gard}\n\n` +
        `Par la présente, nous vous mettons en demeure de régler la somme de ${eur(reste)} TTC ${ouPayer}, et de retirer votre véhicule, dans un délai de HUIT (8) JOURS à compter de la réception de ce courrier. Conformément aux articles 2286 et 1948 du Code civil, le véhicule est conservé jusqu'au paiement intégral des sommes dues, frais de gardiennage compris.\n\n` +
        `À défaut, et si le véhicule n'est ni payé ni retiré dans un délai de trois mois à compter de sa mise à disposition, nous solliciterons du tribunal judiciaire, par l'intermédiaire d'un commissaire de justice, l'autorisation de le vendre aux enchères publiques en application de la loi du 31 décembre 1903 ; le prix de vente sera affecté aux frais puis à notre créance, l'excédent étant consigné à la Caisse des dépôts et consignations à votre disposition.${gage}\n\n` +
        `La présente vaut mise en demeure au sens des articles 1344 et suivants du Code civil. Si le règlement est intervenu entre-temps, veuillez considérer ce courrier comme sans objet.\n\n${fin}`,
    };
  }
  if (type === "requete_vente_1903") {
    const med = args.etapes?.gar_med_retrait;
    return {
      objet: `Demande de vente aux enchères d'un véhicule non retiré — loi du 31 décembre 1903 — ${veh}`,
      delaiJours: 30,
      corps:
        `Maître,\n\nNous vous demandons de bien vouloir présenter au tribunal judiciaire une requête aux fins d'autorisation de vente aux enchères publiques, en application de la loi du 31 décembre 1903 relative à la vente de certains objets abandonnés, du véhicule suivant :\n\n` +
        `• Véhicule : ${veh}${dossier.numero_serie ? ` — VIN ${dossier.numero_serie}` : ""}\n` +
        `• Propriétaire : ${deb.nom}${deb.adresse ? `, ${deb.adresse.replace(/\n/g, ", ")}` : ""}\n` +
        `• Remis pour réparation le ${dateFr(g?.dateOR || dossier.reparation_debut)} (ordre de réparation ${g?.numeroOR ? `n° ${g.numeroOR}` : ""}${g?.dateSignatureOR ? ` signé le ${dateFr(g.dateSignatureOR)}` : ""})\n` +
        `• À disposition depuis le ${dateFr(g?.dispoDepuis)} — soit ${g?.gardiennageJours ?? "—"} jours\n` +
        `• Créance : ${ref} — solde ${eur(reste)} TTC${g?.gardiennageMontant ? ` ; frais de gardiennage ${eur(g.gardiennageMontant)} HT` : ""}\n` +
        `• Mise en demeure de payer et de retirer le véhicule${med ? ` adressée le ${dateFr(med.fait_le)}${med.ref ? ` (recommandé n° ${med.ref})` : ""}` : ""}, restée sans effet.\n\n` +
        `Nous joignons l'ordre de réparation signé, la facture, les relances, la mise en demeure et son accusé de réception, ainsi que la copie de la carte grise. Nous vous demandons de nous indiquer vos frais et la date de vente qui sera fixée.\n\n${fin}`,
    };
  }
  // attribution_gage
  const tot = (Number(reste) || 0) + (Number(g?.frais) || 0);
  return {
    objet: `Notification du transfert de propriété du véhicule ${veh} — pacte commissoire (art. 2348 C. civ.)`,
    delaiJours: 15,
    corps:
      `Madame, Monsieur,\n\nMalgré notre mise en demeure${args.etapes?.gar_med_retrait ? ` du ${dateFr(args.etapes.gar_med_retrait.fait_le)}` : ""}, la ${ref} demeure impayée pour un solde de ${eur(reste)} TTC. Le délai de ${g?.gageDelai || 30} jours prévu par la clause de gage et de pacte commissoire que vous avez expressément acceptée dans l'ordre de réparation${g?.numeroOR ? ` n° ${g.numeroOR}` : ""} est expiré.\n\n` +
      `En application de l'article 2348 du Code civil, nous vous notifions le transfert à notre profit de la propriété du véhicule ${veh}${dossier.numero_serie ? ` (VIN ${dossier.numero_serie})` : ""}, à la date de la présente.\n\n` +
      `La valeur du véhicule a été fixée par ${g?.expert ? `l'expert ${g.expert}` : "expert automobile"} à ${eur(Number(g?.valeurExpert) || 0)}. Les sommes dues s'élèvent à ${eur(tot)} (solde de la facture ${eur(reste)}${g?.frais ? ` et frais de gardiennage et d'expertise ${eur(g.frais)}` : ""}).\n` +
      ((g?.aRestituer || 0) > 0
        ? `La valeur du véhicule excédant les sommes dues, nous vous restituerons la différence, soit ${eur(g!.aRestituer!)}, dans les quinze jours, par virement sur le compte dont vous voudrez bien nous communiquer les coordonnées.\n\n`
        : (g?.resteDu || 0) > 0
          ? `La valeur du véhicule étant inférieure aux sommes dues, un solde de ${eur(g!.resteDu!)} reste à votre charge.\n\n`
          : `Les sommes dues sont ainsi intégralement réglées.\n\n`) +
      `Nous procéderons à la déclaration de cession du véhicule auprès de l'administration ; nous vous remercions de nous remettre le certificat d'immatriculation et les clés en votre possession. Une copie du rapport d'expertise est jointe.\n\n${fin}`,
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
