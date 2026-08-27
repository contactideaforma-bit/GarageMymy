// Métier du garage : carrosserie ou vitrage (bris de glace).
// Le métier est porté par le profil entreprise (colonne `metier`, v27) et
// pilote le branding / vocabulaire de l'appli. Chaque compte est d'un seul métier.

// v10.2 : « commercial » = compte d'un apporteur d'affaires. Il dispose de
// l'appli carrosserie (démonstrations) PLUS l'espace Clients (/prospects).
export type Metier = "carrosserie" | "vitrage" | "commercial";

export const METIER_DEFAUT: Metier = "carrosserie";

export function normaliseMetier(v: string | null | undefined): Metier {
  return v === "vitrage" ? "vitrage" : v === "commercial" ? "commercial" : "carrosserie";
}

export type MetierInfo = {
  label: string; // "Carrosserie"
  espace: string; // "Espace Carrosserie"
  sousTitre: string; // affiché sous le logo dans la sidebar
  accroche: string; // phrase de présentation
  accent: "pink" | "teal"; // couleur d'accent dominante (classes accent-*)
  points: string[]; // atouts affichés sur la page d'accueil
};

export const METIER_INFOS: Record<Metier, MetierInfo> = {
  carrosserie: {
    label: "Carrosserie",
    espace: "Espace Carrosserie",
    sousTitre: "Gestion carrosserie",
    accroche:
      "Le suivi complet des dossiers de sinistres, de l'expertise à l'encaissement.",
    accent: "pink",
    points: [
      "Import du rapport d'expertise et pré-remplissage automatique",
      "Devis, facture et ordre de réparation en quelques clics",
      "Cession de créance et relances pour être payé plus vite",
      "Planning atelier, flotte de prêt et annuaire des assureurs",
    ],
  },
  vitrage: {
    label: "Vitrage",
    espace: "Espace Vitrage",
    sousTitre: "Gestion vitrage & pare-brise",
    accroche:
      "La gestion des interventions bris de glace : pare-brise, vitres et calibrage.",
    accent: "teal",
    points: [
      "Interventions rapides : réparation d'impact ou remplacement",
      "Prise en charge assurance directe (bris de glace, cession)",
      "Suivi du calibrage ADAS des aides à la conduite",
      "Devis, facture et encaissement adaptés au vitrage",
    ],
  },
  commercial: {
    label: "Commercial",
    espace: "Espace Commercial",
    sousTitre: "Espace commercial · apporteur d'affaires",
    accroche: "Vos clients garages, vos devis, vos contrats et vos ventes — depuis une tablette.",
    accent: "teal",
    points: [
      "Fiche client pré-remplie depuis le SIREN",
      "Questionnaire des besoins, devis et contrat générés",
      "Signature sur place, envoi au garage, suivi du paiement",
      "L'appli carrosserie complète pour vos démonstrations",
    ],
  },
};

/** Métiers proposés sur la page d'accueil (le commercial se connecte par l'espace Carrosserie). */
export const METIERS_PUBLICS: Metier[] = ["carrosserie", "vitrage"];

export function metierInfo(m: string | null | undefined): MetierInfo {
  return METIER_INFOS[normaliseMetier(m)];
}

// Vocabulaire adaptatif : mêmes concepts, mots différents selon le métier.
export type Termes = {
  dossiers: string; // libellé de la rubrique / liste
  dossier: string; // un dossier (au singulier, minuscule)
  numeroDossier: string; // en-tête de colonne "N° …"
  dateDossier: string; // en-tête "Date …"
  reparation: string; // "Réparation" / "Intervention"
  reparateur: string; // "Réparateur" / "Technicien"
  importer: string; // CTA d'import
  ajouter: string; // bouton "+ Ajouter …"
  rapport: string; // document importable
};

const TERMES: Record<Metier, Termes> = {
  carrosserie: {
    dossiers: "Sinistres",
    dossier: "dossier",
    numeroDossier: "N° sinistre",
    dateDossier: "Date sinistre",
    reparation: "Réparation",
    reparateur: "Réparateur",
    importer: "Importer un rapport",
    ajouter: "Ajouter un dossier",
    rapport: "Rapport d'expertise",
  },
  vitrage: {
    dossiers: "Bris de glace",
    dossier: "dossier",
    numeroDossier: "N° dossier",
    dateDossier: "Date du bris",
    reparation: "Intervention",
    reparateur: "Technicien",
    importer: "Importer une prise en charge",
    ajouter: "Nouveau bris de glace",
    rapport: "Document de prise en charge",
  },
  commercial: {
    dossiers: "Sinistres",
    dossier: "dossier",
    numeroDossier: "N° sinistre",
    dateDossier: "Date sinistre",
    reparation: "Réparation",
    reparateur: "Réparateur",
    importer: "Importer un rapport",
    ajouter: "Ajouter un dossier",
    rapport: "Rapport d'expertise",
  },
};

export function termes(m: string | null | undefined): Termes {
  return TERMES[normaliseMetier(m)];
}
