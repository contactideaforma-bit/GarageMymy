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
      "Toute l'application My Easy Auto, sans limite d'utilisateurs ni de dossiers. Vous gardez la main sur le suivi de vos sinistres, l'application prépare les documents, rappelle les échéances et relance pour vous.",
  },
  {
    formule: "starter",
    slug: "plus",
    nom: "Adhésion Service Plus",
    pourQui: "Quelques dossiers bloqués, litiges ou impayés vous prennent du temps chaque mois.",
    inclus: [
      "Tout Essentiel",
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
