// ====================================================================
//  JETONS COURRIERS LA POSTE (v13.28) — grille et calculs partagés
//  (navigateur ET serveur). Les prix se changent ICI uniquement.
//
//  Compte Maileva commun : chaque garage prépaie ses envois en jetons.
//  Exception assumée au principe « tout inclus » : un courrier papier a
//  un coût externe réel (timbre + impression), payé à l'envoi.
// ====================================================================

export const TVA_JETONS = 0.2;

export type PackJetons = { id: string; libelle: string; jetons: number; prixHt: number; mention?: string };

/** Packs vendus. Prix HT ; le TTC est calculé (TVA 20 %). */
export const PACKS_JETONS: PackJetons[] = [
  { id: "decouverte", libelle: "Pack Découverte", jetons: 10, prixHt: 24 },
  { id: "garage", libelle: "Pack Garage", jetons: 50, prixHt: 110, mention: "Le plus choisi" },
  { id: "pro", libelle: "Pack Pro", jetons: 100, prixHt: 200, mention: "Meilleur prix" },
];

export const JETONS_PAR_ENVOI = {
  simple: 1,
  lrar: 5,
  /** Supplément quand le pli dépasse 20 g (plus de 3 feuilles, page adresse comprise). */
  supplementLourd: 1,
} as const;

/** Au-delà de ce nombre de feuilles, le pli dépasse 20 g (tranche postale suivante). */
export const FEUILLES_TRANCHE_1 = 3;
/** Limite Maileva : 45 feuilles par pli. */
export const FEUILLES_MAX = 45;

export const ttc = (ht: number) => Math.round(ht * (1 + TVA_JETONS) * 100) / 100;
export const prixUnitaireHt = (p: PackJetons) => Math.round((p.prixHt / p.jetons) * 100) / 100;

/**
 * Nombre de pages d'un PDF, à partir de son contenu « binaire » (chaîne
 * latin1 côté serveur, atob côté navigateur). Compte les objets /Type /Page
 * (pas /Pages). Suffisant pour estimer le poids d'un pli.
 */
export function compterPagesPdf(binaire: string): number {
  const n = (binaire.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
  return Math.max(1, n);
}

/** Feuilles imprimées : pages (recto verso ou non) + la page porte-adresse ajoutée par Maileva. */
export function feuillesPli(pages: number, rectoVerso: boolean): number {
  return (rectoVerso ? Math.ceil(pages / 2) : pages) + 1;
}

/** Coût d'un envoi en jetons. */
export function coutJetons(type: "simple" | "lrar", feuilles: number): number {
  const base = type === "lrar" ? JETONS_PAR_ENVOI.lrar : JETONS_PAR_ENVOI.simple;
  return base + (feuilles > FEUILLES_TRANCHE_1 ? JETONS_PAR_ENVOI.supplementLourd : 0);
}

export type MouvementJetons = {
  id: string;
  created_at: string;
  delta: number;
  motif: "achat" | "envoi" | "remboursement" | "geste" | "ajustement";
  libelle: string | null;
  envoi_id: string | null;
  achat_id: string | null;
  solde_apres: number | null;
};

export type AchatJetons = {
  id: string;
  created_at: string;
  pack: string;
  jetons: number;
  montant_ht: number;
  montant_ttc: number;
  statut: "en_attente" | "paye" | "expire" | "annule";
  qonto_url: string | null;
  credite: boolean;
  paye_le: string | null;
};

export const LIBELLE_MOTIF: Record<MouvementJetons["motif"], string> = {
  achat: "Achat",
  envoi: "Envoi",
  remboursement: "Remboursement",
  geste: "Offert",
  ajustement: "Ajustement",
};
