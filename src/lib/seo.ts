// ============================================================
//  SEO (v13.45) — une seule source pour l'adresse du site, les titres,
//  descriptions, canonical et aperçus réseaux sociaux des pages PUBLIQUES.
//
//  Adresse de référence : NEXT_PUBLIC_SITE_URL si elle est définie sur
//  Vercel, sinon https://www.myeasyauto.fr (adresse auditée). Elle doit
//  être l'adresse FINALE (celle qui ne redirige pas).
// ============================================================

import type { Metadata } from "next";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.myeasyauto.fr").replace(/\/+$/, "");

export const NOM_SITE = "My Easy Auto";

/** Image d'aperçu (WhatsApp, Facebook, LinkedIn…) — visuel du haut de page. */
export const IMAGE_PARTAGE = {
  url: "/hero-lancement.jpg",
  width: 911,
  height: 823,
  alt: "My Easy Auto, logiciel de gestion des sinistres pour carrosseries",
};

/**
 * Métadonnées complètes d'une page publique : title, description,
 * canonical, Open Graph et carte Twitter/X.
 * `titre` est le titre COMPLET affiché dans Google (30 à 60 caractères).
 */
export function metaPage({
  titre,
  description,
  chemin,
}: {
  titre: string;
  description: string;
  chemin: string;
}): Metadata {
  return {
    title: { absolute: titre },
    description,
    alternates: { canonical: chemin },
    openGraph: {
      type: "website",
      locale: "fr_FR",
      siteName: NOM_SITE,
      url: chemin,
      title: titre,
      description,
      images: [IMAGE_PARTAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: titre,
      description,
      images: [IMAGE_PARTAGE.url],
    },
  };
}

/** Pages réservées (appli connectée, liens à jeton) : jamais indexées. */
export const ROUTES_PRIVEES = [
  "/api/",
  "/admin",
  "/agenda",
  "/alliance",
  "/annuaire",
  "/archives",
  "/banque",
  "/clients",
  "/compta",
  "/conversation",
  "/courriers",
  "/devis",
  "/emails",
  "/etat",
  "/expert",
  "/extranets",
  "/factures",
  "/finance",
  "/flotte",
  "/historique",
  "/import",
  "/inscription/merci",
  "/planning",
  "/profil",
  "/prospects",
  "/reinitialisation",
  "/rentabilite",
  "/reponse-garage/",
  "/sauvegarde",
  "/signer/",
  "/sinistres",
  "/suivi/",
  "/support",
  "/vehicules",
  "/vente",
];
