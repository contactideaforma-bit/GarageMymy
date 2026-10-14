// ============================================================
//  FORMULES — contenus partagés par la section de l'accueil et les pages
//  de détail /formules/<slug> (v13.26). Les PRIX ne sont pas ici : ils
//  viennent toujours de la grille (economie.ts, /api/tarifs).
// ============================================================

import type { Formule } from "@/lib/admin/economie";

export type FicheFormule = {
  formule: Formule;
  slug: string;
  nom: string;
  pourQui: string;
  /** 4 points courts pour la carte de l'accueil. */
  inclus: string[];
  /** Paragraphe d'introduction de la page de détail. */
  intro: string;
};

export const FICHES: FicheFormule[] = [
  {
    formule: "essentiel",
    slug: "essentiel",
    nom: "Essentiel",
    pourQui: "Vous gérez vos dossiers vous-même et voulez un outil qui fait le travail administratif à votre place.",
    inclus: [
      "L'application complète",
      "Import du rapport d'expertise par IA",
      "Devis, factures, OR et cessions de créance automatiques",
      "Signature électronique, relances et suivi des paiements",
    ],
    intro:
      "Toute l'application My Easy Auto, sans limite d'utilisateurs ni de dossiers. Vous gardez la main sur le suivi de vos sinistres, l'application prépare les documents, rappelle les échéances et relance pour vous. Le suivi des impayés (procédure guidée) et le suivi des litiges sont réservés aux formules Adhésion Service.",
  },
  {
    formule: "starter",
    slug: "plus",
    nom: "Adhésion Service Plus",
    pourQui: "Quelques dossiers bloqués, litiges ou impayés vous prennent du temps chaque mois.",
    inclus: [
      "Tout Essentiel",
      "Suivi des impayés et suivi des litiges dans l'appli (procédures guidées, courriers prêts à signer)",
      "Un chargé de mission pour vos dossiers compliqués",
      "Reprise des dossiers qui traînent",
      "Relances des assurances, des experts et des clients",
    ],
    intro:
      "L'application complète, plus 10 h / mois d'un chargé de mission spécialisé dans les dossiers de sinistres. Le bon point de départ pour sortir chaque mois les dossiers qui n'avancent plus.",
  },
  {
    formule: "confort",
    slug: "premium",
    nom: "Adhésion Service Premium",
    pourQui: "Vous voulez un suivi régulier, pas seulement le déblocage des urgences.",
    inclus: [
      "Tout Plus, avec deux fois plus d'heures",
      "Suivi des litiges et des impayés jusqu'à l'encaissement",
      "Création des dossiers depuis le rapport d'expertise",
      "Devis, factures et envoi en signature",
    ],
    intro:
      "L'application complète, plus 20 h / mois de chargé de mission. Assez de temps pour débloquer les dossiers difficiles et assurer un suivi régulier : relances, litiges, impayés, et si vous le souhaitez la création des dossiers.",
  },
  {
    formule: "serenite",
    slug: "ultimate",
    nom: "Adhésion Service Ultimate",
    pourQui: "Vous confiez le suivi administratif de vos sinistres et gardez les décisions.",
    inclus: [
      "Tout Premium, avec deux fois plus d'heures",
      "Suivi administratif des sinistres au quotidien",
      "Contrôle du chiffrage de l'expert",
      "Vous validez et signez tout ce qui engage le garage",
    ],
    intro:
      "L'application complète, plus 40 h / mois de chargé de mission. Vous confiez le suivi administratif de vos sinistres au quotidien et vous consacrez à l'atelier et à vos clients ; les décisions et les signatures restent les vôtres.",
  },
];

export const ficheParSlug = (slug: string) => FICHES.find((f) => f.slug === slug) || null;

/** Missions possibles, identiques dans les trois formules Adhésion Service. */
export const MISSIONS: string[] = [
  "Reprise des dossiers qui traînent depuis des semaines ou des mois",
  "Appels et relances aux assurances, aux experts et aux clients jusqu'au déblocage",
  "Suivi des litiges et des impayés, relances jusqu'à l'encaissement",
  "Si vous le souhaitez : création des dossiers à partir du rapport d'expertise",
  "Contrôle du chiffrage, devis et factures, envoi en signature",
];

/** Ce qui n'est jamais confié au chargé de mission. */
export const JAMAIS: string[] = [
  "La comptabilité, le bilan, les déclarations fiscales et de TVA",
  "La paie et la gestion du personnel",
  "Toute signature ou tout engagement juridique au nom du garage",
  "La négociation d'une responsabilité avec un assureur",
  "Le maniement de fonds ou d'espèces",
];

/** Ce que contient l'application, dans toutes les formules. */
export const APPLICATION: string[] = [
  "Import du rapport d'expertise par IA : dossier pré-rempli, chiffrage repris ligne à ligne",
  "Devis, factures, ordres de réparation, cessions de créance et PV de restitution à votre charte",
  "Signature électronique à l'atelier ou à distance par lien",
  "Relances graduées jusqu'à la mise en demeure, suivi des paiements et de la banque",
  "Planning des réparations, commandes de pièces, véhicules de prêt",
  "Envoi des documents depuis votre propre boîte mail",
  "Utilisateurs, dossiers, documents et stockage illimités",
];

/* ============================================================
   COMPARATEUR DES OFFRES (v13.42) — ce qui est disponible ou non
   dans chaque formule. `true` = inclus, `false` = non disponible,
   une chaîne = valeur affichée (ex. « 10 h »). Les prix ne sont pas
   ici (grille). L'ordre des colonnes suit FORMULES_ORDRE.
   ============================================================ */

export const FORMULES_ORDRE: Formule[] = ["essentiel", "starter", "confort", "serenite"];
export const NOM_COURT: Record<Formule, string> = { essentiel: "Essentiel", starter: "Plus", confort: "Premium", serenite: "Ultimate" };

export type ValeurComparatif = boolean | string;
export type LigneComparatif = { libelle: string; aide?: string; valeurs: Record<Formule, ValeurComparatif> };
export type GroupeComparatif = { titre: string; sousTitre?: string; lignes: LigneComparatif[] };

const TOUS = (v: ValeurComparatif = true): Record<Formule, ValeurComparatif> => ({ essentiel: v, starter: v, confort: v, serenite: v });
const SERVICE = (): Record<Formule, ValeurComparatif> => ({ essentiel: false, starter: true, confort: true, serenite: true });

export const COMPARATIF: GroupeComparatif[] = [
  {
    titre: "L'application",
    sousTitre: "Identique dans toutes les formules, sans limite d'utilisateurs ni de dossiers.",
    lignes: [
      { libelle: "Import du rapport d'expertise par IA, dossier pré-rempli", valeurs: TOUS() },
      { libelle: "Devis, factures, ordres de réparation, cessions de créance, PV de restitution", valeurs: TOUS() },
      { libelle: "Signature électronique à l'atelier ou par lien", valeurs: TOUS() },
      { libelle: "Relances graduées, suivi des paiements et de la banque", valeurs: TOUS() },
      { libelle: "Planning des réparations, commandes de pièces, véhicules de prêt", valeurs: TOUS() },
      { libelle: "Envoi des documents depuis votre propre boîte mail", valeurs: TOUS() },
      { libelle: "Photos d'état, pièces du dossier, archives, sauvegarde", valeurs: TOUS() },
      { libelle: "Utilisateurs, dossiers, documents et stockage", valeurs: TOUS("Illimités") },
    ],
  },
  {
    titre: "Dossiers bloqués",
    sousTitre: "Les outils de l'application pour sortir les impayés et les litiges, avec l'appui du chargé de mission.",
    lignes: [
      { libelle: "Suivi des impayés : procédure guidée (relance, mise en demeure, conciliateur, injonction de payer, droit de rétention)", valeurs: SERVICE() },
      { libelle: "Courriers prêts à signer, journal des appels, rappels automatiques", valeurs: SERVICE() },
      { libelle: "Suivi des litiges : plan de déblocage, courriers à l'expert et à l'assureur, délais légaux", valeurs: SERVICE() },
      { libelle: "Recommandés : circuit guidé (impression, n° de suivi, accusé de réception rangé dans le dossier)", valeurs: SERVICE() },
    ],
  },
  {
    titre: "Chargé de mission",
    sousTitre: "Spécialisé dans les dossiers de sinistres, à distance, aux horaires ouvrés. Les missions sont les mêmes : seul le temps change.",
    lignes: [
      { libelle: "Temps par mois", valeurs: { essentiel: false, starter: "10 h", confort: "20 h", serenite: "40 h" } },
      { libelle: "Reprise des dossiers qui traînent", valeurs: SERVICE() },
      { libelle: "Appels et relances aux assurances, aux experts et aux clients", valeurs: SERVICE() },
      { libelle: "Suivi des litiges et des impayés jusqu'à l'encaissement", valeurs: { essentiel: false, starter: "Ponctuel", confort: true, serenite: true } },
      { libelle: "Création des dossiers depuis le rapport d'expertise", valeurs: { essentiel: false, starter: false, confort: true, serenite: true } },
      { libelle: "Suivi administratif des sinistres au quotidien, contrôle du chiffrage", valeurs: { essentiel: false, starter: false, confort: false, serenite: true } },
      { libelle: "Heures non consommées reportables à 50 %", valeurs: SERVICE() },
    ],
  },
  {
    titre: "Conditions",
    lignes: [
      { libelle: "Sans engagement (un mois de préavis) ou engagement de 12 mois", valeurs: TOUS() },
      { libelle: "Mise en service offerte avec l'engagement de 12 mois", valeurs: TOUS() },
      { libelle: "Passage à une formule supérieure à tout moment", valeurs: TOUS() },
      { libelle: "Prix nets, TVA non applicable (art. 293 B du CGI)", valeurs: TOUS() },
    ],
  },
];
