// ====================================================================
//  PÉRIMÈTRE DES MISSIONS DE LA SECRÉTAIRE (v11.3)
//
//  Ce catalogue sert à DEUX choses :
//   1. le questionnaire rempli AVEC la collaboratrice quand on édite
//      son contrat (session éditeur) — on coche ce qui entre dans son
//      périmètre ;
//   2. l'annexe 2 du contrat, qui fait foi : ce qui n'est pas coché
//      n'entre pas dans la mission, et elle peut le refuser sans que
//      cela constitue une faute (article « Périmètre convenu »).
//
//  RÈGLE MÉTIER : toutes les tâches sont liées à la plateforme My Easy
//  Auto ET au métier de la carrosserie. La liste HORS_PERIMETRE est
//  aussi importante que le reste : elle protège la collaboratrice ET
//  l\'éditeur (une secrétaire qui tient la comptabilité d\'un garage ou
//  engage sa signature sort du cadre et crée un risque pour tous).
// ====================================================================

export type TacheSecretaire = {
  cle: string;
  libelle: string;
  /** Précision affichée en petit dans le questionnaire et l\'annexe. */
  detail?: string;
};
export type FamilleTaches = { cle: string; titre: string; taches: TacheSecretaire[] };

export const FAMILLES_TACHES: FamilleTaches[] = [
  {
    cle: "dossiers",
    titre: "Dossiers de sinistres",
    taches: [
      { cle: "creation_dossier", libelle: "Créer le dossier à réception du rapport d\'expertise", detail: "import du PDF, contrôle de l\'analyse automatique, saisie du véhicule et du client" },
      { cle: "controle_chiffrage", libelle: "Contrôler le chiffrage lu dans le rapport", detail: "vérifier postes, heures et taux ; signaler les écarts au garage (sans jamais les corriger d\'autorité)" },
      { cle: "mentions_rapport", libelle: "Signaler les mentions particulières du rapport", detail: "expertise conservatoire, sursis à travaux, VGE, absence de règlement direct" },
      { cle: "suivi_pipeline", libelle: "Faire avancer le dossier dans le pipeline", detail: "tenir les statuts et la fiche à jour au fil de l\'eau" },
      { cle: "photos_etat", libelle: "Enregistrer les photos d\'état entrée / sortie", detail: "à partir des photos transmises par l\'atelier" },
      { cle: "note_dossier", libelle: "Tenir la note et l\'historique du dossier" },
    ],
  },
  {
    cle: "documents",
    titre: "Devis, factures et documents",
    taches: [
      { cle: "devis", libelle: "Établir les devis à partir du rapport" },
      { cle: "facture", libelle: "Établir les factures conformes au rapport" },
      { cle: "ordre_reparation", libelle: "Éditer les ordres de réparation" },
      { cle: "envoi_signature", libelle: "Envoyer les documents en signature électronique et en assurer le suivi" },
      { cle: "cession_creance", libelle: "Préparer les cessions de créance" },
      { cle: "pret_gardiennage", libelle: "Préparer les contrats de prêt et les factures de gardiennage" },
      { cle: "pv_restitution", libelle: "Préparer les PV de restitution" },
    ],
  },
  {
    cle: "relations",
    titre: "Relations experts, assurances et clients",
    taches: [
      { cle: "relance_expert", libelle: "Relancer les experts et cabinets d\'expertise" },
      { cle: "relance_assurance", libelle: "Relancer les compagnies d\'assurance", detail: "accords, règlements directs, prises en charge" },
      { cle: "relance_client", libelle: "Relancer les clients du garage" },
      { cle: "accueil_tel", libelle: "Assurer l\'accueil téléphonique du garage", detail: "aux plages convenues à l\'annexe 3" },
      { cle: "prise_rdv", libelle: "Prendre et confirmer les rendez-vous (agenda, planning)" },
      { cle: "portail_client", libelle: "Partager le suivi au client via le portail" },
    ],
  },
  {
    cle: "finance",
    titre: "Encaissement et suivi financier",
    taches: [
      { cle: "suivi_paiements", libelle: "Suivre les paiements et pointer les factures réglées" },
      { cle: "relances_impayes", libelle: "Relancer les impayés selon la procédure du garage" },
      { cle: "echeancier", libelle: "Mettre en place et suivre les échéanciers" },
      { cle: "rapprochement", libelle: "Rapprocher les relevés bancaires importés (CSV)" },
      { cle: "tableau_bord", libelle: "Produire le point mensuel d\'activité du garage" },
    ],
  },
  {
    cle: "atelier",
    titre: "Atelier et logistique",
    taches: [
      { cle: "planning_atelier", libelle: "Tenir le planning de l\'atelier" },
      { cle: "commandes_pieces", libelle: "Passer et suivre les commandes de pièces" },
      { cle: "suivi_vehicules", libelle: "Tenir à jour les véhicules présents au garage" },
    ],
  },
  {
    cle: "administratif",
    titre: "Administratif",
    taches: [
      { cle: "courrier_electronique", libelle: "Traiter la boîte email du garage", detail: "tri, réponses aux demandes courantes, classement dans les dossiers" },
      { cle: "annuaire", libelle: "Tenir à jour l\'annuaire (clients, experts, assureurs)" },
      { cle: "archivage", libelle: "Classer et archiver les pièces des dossiers" },
    ],
  },
];

/**
 * HORS PÉRIMÈTRE — jamais confié, même contre rémunération.
 * Ces lignes sont reproduites telles quelles dans l\'annexe 2 du contrat
 * et fondent le DROIT DE REFUS de la collaboratrice.
 */
export const HORS_PERIMETRE: string[] = [
  "Tenue de la comptabilité du garage, établissement du bilan, des déclarations fiscales ou de TVA.",
  "Paie, déclarations sociales et gestion du personnel du garage.",
  "Signature ou engagement juridique au nom du garage : contrats, reconnaissance de responsabilité, transaction, désistement.",
  "Négociation d\'une responsabilité, d\'une garantie ou d\'une indemnité avec un assureur ou un tiers.",
  "Manipulation de fonds, encaissement d\'espèces, détention des moyens de paiement du garage.",
  "Démarchage commercial ou prospection pour le compte du garage.",
  "Toute tâche relevant d\'une profession réglementée (juridique, comptable, médicale, expertise).",
  "Tâches personnelles du dirigeant ou sans lien avec l\'activité de carrosserie.",
  "Toute tâche réalisée hors de la plateforme My Easy Auto et non prévue à l\'annexe 2.",
];

/** Moyens que la collaboratrice déclare posséder (ce sont LES SIENS). */
export const MATERIELS: { cle: string; libelle: string }[] = [
  { cle: "ordinateur", libelle: "Ordinateur" },
  { cle: "second_ecran", libelle: "Second écran" },
  { cle: "telephone", libelle: "Téléphone mobile" },
  { cle: "ligne_dediee", libelle: "Ligne téléphonique dédiée" },
  { cle: "tablette", libelle: "Tablette" },
  { cle: "imprimante", libelle: "Imprimante / scanner" },
  { cle: "internet", libelle: "Connexion internet haut débit" },
  { cle: "casque", libelle: "Casque téléphonique" },
  { cle: "sauvegarde", libelle: "Sauvegarde et antivirus à jour" },
];

/* ------------------------------ Profil ------------------------------ */

export type ProfilPrestation = {
  /** Clés de tâches cochées. */
  taches?: string[];
  /** Clés de matériel déclaré. */
  materiel?: string[];
  /** Matériel libre (« imprimante A3 »). */
  materiel_autre?: string | null;
  /** Disponibilités annoncées PAR ELLE (jamais un horaire imposé). */
  disponibilites?: string | null;
  /** Limites qu\'elle pose (volume max, pas de week-end…). */
  limites?: string | null;
  /** Contraintes à connaître (délai de réponse, congés prévus…). */
  contraintes?: string | null;
  /** Volume mensuel maximum qu\'elle accepte, toutes affectations confondues. */
  heures_max_mois?: number | null;
  /** Régime social : voir REGIMES (remuneration.ts). */
  regime?: string | null;
  /** Assurance RC professionnelle. */
  rc_pro?: string | null;
  /** Date de l\'attestation de vigilance URSSAF la plus récente. */
  vigilance_le?: string | null;
};

export const PROFIL_VIDE: ProfilPrestation = {
  taches: [], materiel: [], materiel_autre: "", disponibilites: "", limites: "",
  contraintes: "", heures_max_mois: null, regime: "bic", rc_pro: "", vigilance_le: "",
};

export function lireProfil(brut: unknown): ProfilPrestation {
  if (!brut || typeof brut !== "object") return { ...PROFIL_VIDE };
  const p = brut as Record<string, unknown>;
  const liste = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  const txt = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    taches: liste(p.taches),
    materiel: liste(p.materiel),
    materiel_autre: txt(p.materiel_autre),
    disponibilites: txt(p.disponibilites),
    limites: txt(p.limites),
    contraintes: txt(p.contraintes),
    heures_max_mois: typeof p.heures_max_mois === "number" ? p.heures_max_mois : null,
    regime: txt(p.regime) || "bic",
    rc_pro: txt(p.rc_pro),
    vigilance_le: txt(p.vigilance_le),
  };
}

/** Toutes les tâches, à plat. */
export function toutesLesTaches(): TacheSecretaire[] {
  return FAMILLES_TACHES.flatMap((f) => f.taches);
}
export function tacheParCle(cle: string): TacheSecretaire | null {
  return toutesLesTaches().find((t) => t.cle === cle) || null;
}
/** Périmètre convenu, groupé par famille, pour l\'annexe 2 du contrat. */
export function perimetreConvenu(profil: ProfilPrestation): { titre: string; lignes: string[] }[] {
  const coche = new Set(profil.taches || []);
  return FAMILLES_TACHES.map((f) => ({
    titre: f.titre,
    lignes: f.taches.filter((t) => coche.has(t.cle)).map((t) => (t.detail ? `${t.libelle} (${t.detail})` : t.libelle)),
  })).filter((f) => f.lignes.length > 0);
}
export function libellesMateriel(profil: ProfilPrestation): string[] {
  const coche = new Set(profil.materiel || []);
  const l = MATERIELS.filter((m) => coche.has(m.cle)).map((m) => m.libelle);
  if (profil.materiel_autre && profil.materiel_autre.trim()) l.push(profil.materiel_autre.trim());
  return l;
}
