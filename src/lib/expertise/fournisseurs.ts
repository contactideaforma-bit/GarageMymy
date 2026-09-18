// MOTEUR DE RECHERCHE PIÈCES (mode expert, v13.5)
//
// Pas d'API fournisseur : on construit des recherches PRÉ-REMPLIES vers les
// catalogues du marché (neuf, occasion / réemploi, constructeur), que
// l'expert ouvre d'un clic — plus une estimation IA du prix (route
// /api/expert/pieces) mémorisée dans le dossier.

export type CategorieFournisseur = "neuf" | "occasion" | "constructeur" | "reference";

export type Fournisseur = {
  code: string;
  nom: string;
  categorie: CategorieFournisseur;
  description: string;
  url: (q: { designation: string; marque?: string | null; modele?: string | null; reference?: string | null; immatriculation?: string | null }) => string;
};

const enc = (s: string | null | undefined) => encodeURIComponent((s || "").trim());
const requete = (q: { designation: string; marque?: string | null; modele?: string | null; reference?: string | null }) =>
  [q.reference, q.marque, q.modele, q.designation].filter(Boolean).join(" ").trim();

export const FOURNISSEURS: Fournisseur[] = [
  // ----- Pièces neuves (adaptables et origine) -----
  {
    code: "oscaro", nom: "Oscaro", categorie: "neuf", description: "Pièces neuves, catalogue par véhicule",
    url: (q) => `https://www.oscaro.com/recherche?q=${enc(requete(q))}`,
  },
  {
    code: "autodoc", nom: "Autodoc", categorie: "neuf", description: "Pièces neuves, prix bas, livraison rapide",
    url: (q) => `https://www.autodoc.fr/search?keyword=${enc(requete(q))}`,
  },
  {
    code: "misterauto", nom: "Mister Auto", categorie: "neuf", description: "Pièces neuves (groupe PSA / Stellantis)",
    url: (q) => `https://www.mister-auto.com/recherche/?q=${enc(requete(q))}`,
  },
  {
    code: "yakarouler", nom: "Yakarouler", categorie: "neuf", description: "Pièces neuves et carrosserie",
    url: (q) => `https://www.yakarouler.com/recherche?q=${enc(requete(q))}`,
  },
  {
    code: "piecesauto24", nom: "Piecesauto24", categorie: "neuf", description: "Pièces de carrosserie neuves",
    url: (q) => `https://www.piecesauto24.com/recherche?q=${enc(requete(q))}`,
  },
  // ----- Réemploi / occasion (pièces de seconde main, code R) -----
  {
    code: "opisto", nom: "Opisto", categorie: "occasion", description: "Réemploi — réseau de centres VHU agréés",
    url: (q) => `https://www.opisto.fr/recherche?q=${enc(requete(q))}`,
  },
  {
    code: "reparcar", nom: "Reparcar", categorie: "occasion", description: "Réemploi — pièces contrôlées et garanties",
    url: (q) => `https://www.reparcar.fr/recherche?q=${enc(requete(q))}`,
  },
  {
    code: "gpa26", nom: "GPA (Groupe Pièces Auto)", categorie: "occasion", description: "Réemploi — plus gros démonteur de France",
    url: (q) => `https://www.gpa26.com/recherche?q=${enc(requete(q))}`,
  },
  {
    code: "ebay", nom: "eBay Pièces auto", categorie: "occasion", description: "Occasion & neuf — comparaison de prix",
    url: (q) => `https://www.ebay.fr/sch/i.html?_nkw=${enc(requete(q))}&_sacat=131090`,
  },
  {
    code: "leboncoin", nom: "Leboncoin", categorie: "occasion", description: "Occasion entre particuliers et pros",
    url: (q) => `https://www.leboncoin.fr/recherche?category=44&text=${enc(requete(q))}`,
  },
  // ----- Constructeur / origine (catalogues OEM, code O) -----
  {
    code: "partslink", nom: "PartsLink24", categorie: "constructeur", description: "Catalogues d'origine constructeur (accès pro)",
    url: () => `https://www.partslink24.com/`,
  },
  {
    code: "distrigo", nom: "Distrigo (Stellantis)", categorie: "constructeur", description: "Pièces d'origine Peugeot, Citroën, DS, Opel, Fiat…",
    url: () => `https://www.distrigo.fr/`,
  },
  {
    code: "renault", nom: "Renault Pièces d'origine", categorie: "constructeur", description: "Boutique pièces d'origine Renault / Dacia",
    url: (q) => `https://pieces-de-rechange.renault.fr/recherche?text=${enc(requete(q))}`,
  },
  {
    code: "mercedes", nom: "Mercedes-Benz Parts", categorie: "constructeur", description: "Pièces d'origine Mercedes-Benz",
    url: () => `https://www.mercedes-benz.fr/passengercars/services/genuine-parts.html`,
  },
  // ----- Références OEM -----
  {
    code: "7zap", nom: "7zap (catalogue OEM)", categorie: "reference", description: "Éclatés et références d'origine par VIN",
    url: (q) => `https://www.7zap.com/fr/?q=${enc(q.reference || requete(q))}`,
  },
  {
    code: "google", nom: "Google (référence)", categorie: "reference", description: "Recherche libre de la référence",
    url: (q) => `https://www.google.com/search?q=${enc(requete(q) + " prix pièce")}`,
  },
];

export const CATEGORIES: { code: CategorieFournisseur; label: string; hint: string }[] = [
  { code: "neuf", label: "Neuf", hint: "Adaptable ou origine, catalogue en ligne" },
  { code: "occasion", label: "Occasion / réemploi", hint: "Pièces de seconde main (code R)" },
  { code: "constructeur", label: "Constructeur", hint: "Pièces d'origine (code O)" },
  { code: "reference", label: "Référence OEM", hint: "Retrouver le numéro de pièce" },
];

/** Fournisseurs pertinents pour une marque (les constructeurs génériques filtrés). */
export function fournisseursPour(marque: string | null | undefined, categorie?: CategorieFournisseur): Fournisseur[] {
  const m = (marque || "").toLowerCase();
  return FOURNISSEURS.filter((f) => {
    if (categorie && f.categorie !== categorie) return false;
    if (f.code === "renault") return /renault|dacia|alpine/.test(m);
    if (f.code === "mercedes") return /mercedes|smart/.test(m);
    if (f.code === "distrigo") return /peugeot|citro|ds|opel|fiat|jeep|alfa|lancia|abarth|vauxhall/.test(m);
    return true;
  });
}

/** Résultat de l'estimation IA (route /api/expert/pieces). */
export type EstimationPiece = {
  designation: string;
  designation_normalisee: string | null;
  reference_oem: string | null;
  references_alternatives: string[];
  prix_origine: { min: number; max: number } | null;
  prix_neuf_adaptable: { min: number; max: number } | null;
  prix_occasion: { min: number; max: number } | null;
  prix_retenu: number | null;
  remarques: string | null;
  peinture_necessaire: boolean;
  temps_pose_heures: number | null;
};
