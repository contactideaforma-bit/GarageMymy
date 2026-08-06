import { DocumentLigne, DocumentType, Dossier } from "./types";
import { round2 } from "./paiements";

/* ==================================================================
 *  Catégories de lignes — structurent la facture en 3 tableaux (v34)
 *   - piece : tableau principal (Désignation / Qté / PU HT / Remise / Total HT)
 *   - mo    : tableau des postes T1, T2, T3, Peinture, Ingr. de peinture
 *   - autre : tableau des autres éléments retenus au rapport
 * ================================================================== */

export type CategorieLigne = "piece" | "mo" | "autre";

export const CATEGORIES_LIGNE: Record<CategorieLigne, string> = {
  piece: "Pièces & fournitures",
  mo: "Main d'œuvre & peinture",
  autre: "Autres éléments",
};

// Éléments annexes du rapport (ni pièce, ni temps de main d'œuvre)
const RE_AUTRE =
  /(forfait|petites?\s+fournitures?|consommables?|frais|gestion|recyclage|d[ée]placement|remorquage|gardiennage|contr[ôo]le|calibrage|adas|g[ée]om[ée]trie|parall[ée]lisme|nettoyage|lustrage|location|v[ée]hicule\s+de\s+(pr[êe]t|remplacement)|mise\s+[àa]\s+disposition|expertise|environnement)/;

// Postes de main d'œuvre : T1 / T2 / T3, peinture et ses ingrédients
const RE_T123 = /(^|[^a-z0-9])(mo\s*)?t\s*-?\s*[123]([^0-9]|$)/;
const RE_MO = /main\s*d.?\s*(œ|oe)uvre|tolerie|t[ôo]lerie|m[ée]canique|d[ée]montage|remontage/;

export function categoriseLigne(designation: string | null | undefined): CategorieLigne {
  const d = (designation || "").trim().toLowerCase();
  if (!d) return "piece";
  if (RE_T123.test(d)) return "mo";
  if (/ingr[ée]d/.test(d)) return "mo";
  if (/peinture/.test(d)) return "mo";
  if (RE_MO.test(d)) return "mo";
  if (RE_AUTRE.test(d)) return "autre";
  return "piece";
}

// Ordre d'affichage imposé dans le tableau des postes :
// T1, T2, T3, Peinture, Ingrédients de peinture, puis le reste.
export function rangPosteMo(designation: string | null | undefined): number {
  const d = (designation || "").toLowerCase();
  if (/ingr[ée]d/.test(d)) return 5;
  if (/(^|[^a-z0-9])(mo\s*)?t\s*-?\s*1([^0-9]|$)/.test(d)) return 1;
  if (/(^|[^a-z0-9])(mo\s*)?t\s*-?\s*2([^0-9]|$)/.test(d)) return 2;
  if (/(^|[^a-z0-9])(mo\s*)?t\s*-?\s*3([^0-9]|$)/.test(d)) return 3;
  if (/peinture/.test(d)) return 4;
  return 6;
}

export function estLignePeinture(designation: string | null | undefined): boolean {
  const d = (designation || "").toLowerCase();
  return /peinture/.test(d) && !/ingr[ée]d/.test(d);
}

export function estLigneIngredients(designation: string | null | undefined): boolean {
  return /ingr[ée]d/.test((designation || "").toLowerCase());
}

type LigneBase = {
  designation?: string | null;
  quantite?: number | string | null;
  prix_unitaire?: number | string | null;
  remise?: number | string | null;
  categorie?: string | null;
};

export function categorieDe(l: LigneBase): CategorieLigne {
  const c = (l.categorie || "").toString();
  if (c === "piece" || c === "mo" || c === "autre") return c;
  return categoriseLigne(l.designation);
}

// Répartit les lignes dans les 3 tableaux de la facture.
export function groupeLignes<T extends LigneBase>(lignes: T[]) {
  const pieces = lignes.filter((l) => categorieDe(l) === "piece");
  const mo = lignes
    .filter((l) => categorieDe(l) === "mo")
    .slice()
    .sort((a, b) => rangPosteMo(a.designation) - rangPosteMo(b.designation));
  const autres = lignes.filter((l) => categorieDe(l) === "autre");
  return { pieces, mo, autres };
}

/* ==================================================================
 *  Calculs — le total HT d'une ligne tient compte de la remise en %
 *  Total HT = PU HT × (1 − remise/100) × Qté
 * ================================================================== */

export function tauxRemise(remise: number | string | null | undefined): number {
  const r = Number(remise) || 0;
  return Math.min(100, Math.max(0, r));
}

export function totalLigne(l: LigneBase): number {
  const q = Number(l.quantite) || 0;
  const pu = Number(l.prix_unitaire) || 0;
  return round2(q * pu * (1 - tauxRemise(l.remise) / 100));
}

// Montant de la remise accordée sur la ligne (en euros HT)
export function montantRemiseLigne(l: LigneBase): number {
  const q = Number(l.quantite) || 0;
  const pu = Number(l.prix_unitaire) || 0;
  return round2(q * pu * (tauxRemise(l.remise) / 100));
}

export function sousTotal(lignes: LigneBase[]): number {
  return round2(lignes.reduce((s, l) => s + totalLigne(l), 0));
}

export function computeTotaux(lignes: LigneBase[], tva: number | string | null) {
  // Arrondi au centime à CHAQUE étape : le total imprimé est exactement la
  // somme des totaux de lignes imprimés (facture vérifiable à l'euro près),
  // et le TTC stocké est payable au centime près (cf. estSoldee).
  const htR = sousTotal(lignes);
  const taux = Number(tva) || 0;
  const montantTva = round2(htR * (taux / 100));
  return { ht: htR, tva: montantTva, ttc: round2(htR + montantTva) };
}

/* ==================================================================
 *  Mode de règlement (choisi au moment de générer la facture)
 * ================================================================== */

export const MODES_REGLEMENT: Record<string, string> = {
  virement: "Virement bancaire",
  cheque: "Chèque",
  cb: "Carte bancaire",
  especes: "Espèces",
  prelevement: "Prélèvement SEPA",
  assurance: "Règlement direct par l'assurance",
  multiple: "Plusieurs moyens de paiement",
  autre: "Autre",
};

export function labelModeReglement(m: string | null | undefined): string {
  return (m && MODES_REGLEMENT[m]) || "Virement bancaire";
}

// Mode proposé par défaut : paiement direct par l'assureur en cession de
// créance ou en prise en charge, virement sinon.
export function modeParDefaut(
  doc: { mode_paiement?: string | null } | null | undefined,
  dossier: { mode_cession?: boolean | null; mode_pec?: boolean | null } | null | undefined
): string {
  if (doc?.mode_paiement && MODES_REGLEMENT[doc.mode_paiement]) return doc.mode_paiement;
  if (dossier?.mode_cession || dossier?.mode_pec) return "assurance";
  return "virement";
}

/* ==================================================================
 *  Durée d'immobilisation (jours de réparation) — imprimée en en-tête
 * ================================================================== */

export function joursReparation(
  debut: string | null | undefined,
  fin: string | null | undefined
): number | null {
  if (!debut || !fin) return null;
  const d = new Date(debut);
  const f = new Date(fin);
  if (isNaN(d.getTime()) || isNaN(f.getTime())) return null;
  const jours = Math.round((f.getTime() - d.getTime()) / 86400000) + 1;
  return jours > 0 ? jours : null;
}

// Durée retenue sur le document : valeur saisie si présente, sinon calcul
// depuis le planning de réparation du dossier.
export function joursFacture(
  doc: { jours_reparation?: number | null } | null | undefined,
  dossier: Pick<Dossier, "reparation_debut" | "reparation_fin"> | null | undefined
): number | null {
  if (doc?.jours_reparation != null && Number(doc.jours_reparation) > 0) {
    return Number(doc.jours_reparation);
  }
  return joursReparation(dossier?.reparation_debut, dossier?.reparation_fin);
}

/* ==================================================================
 *  Saisie / persistance
 * ================================================================== */

export type LigneSaisie = {
  designation: string;
  quantite: string;
  prix_unitaire: string;
  remise: string;
  categorie: CategorieLigne;
};

export function ligneVide(categorie: CategorieLigne = "piece"): LigneSaisie {
  return { designation: "", quantite: "1", prix_unitaire: "0", remise: "0", categorie };
}

// Les ingrédients de peinture suivent TOUJOURS la quantité (le temps) de la
// ligne Peinture : on la recopie à chaque modification.
export function syncIngredientsPeinture(items: LigneSaisie[]): LigneSaisie[] {
  const peinture = items.find((l) => estLignePeinture(l.designation));
  if (!peinture) return items;
  return items.map((l) =>
    estLigneIngredients(l.designation) ? { ...l, quantite: peinture.quantite } : l
  );
}

export function genNumero(type: DocumentType): string {
  const d = new Date();
  const prefix = type === "devis" ? "DEV" : "FAC";
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  // Suffixe : timestamp (7 chiffres ≈ cycle de 115 jours) + 2 chiffres aléatoires.
  // L'ancien slice(-5) bouclait toutes les 100 secondes → doublons possibles.
  const alea = String(Math.floor(Math.random() * 100)).padStart(2, "0");
  return `${prefix}-${ym}-${String(Date.now()).slice(-7)}${alea}`;
}

export const STATUTS_DOC: Record<string, { label: string; badge: string }> = {
  brouillon: { label: "Généré", badge: "bg-slate-100 text-slate-700" },
  envoye: { label: "Envoyé", badge: "bg-blue-100 text-blue-700" },
  accepte: { label: "Accepté", badge: "bg-emerald-100 text-emerald-700" },
  refuse: { label: "Refusé", badge: "bg-rose-100 text-rose-700" },
  paye: { label: "Payé", badge: "bg-emerald-100 text-emerald-700" },
};

export function labelStatutDoc(s: string): string {
  return STATUTS_DOC[s]?.label || s;
}
export function badgeStatutDoc(s: string): string {
  return STATUTS_DOC[s]?.badge || "bg-slate-100 text-slate-700";
}

export type LigneExtraite = {
  designation?: string | null;
  quantite?: number | string | null;
  prix_unitaire?: number | string | null;
  remise?: number | string | null;
  categorie?: string | null;
};

export type LigneNum = {
  designation: string;
  quantite: number;
  prix_unitaire: number;
  remise: number;
  categorie: CategorieLigne;
};

// Normalise les lignes extraites du rapport ; fallback sur une ligne unique au montant global.
export function normaliseLignes(
  lignes: LigneExtraite[] | undefined | null,
  montant?: number | null
): LigneNum[] {
  const arr = (lignes || [])
    .filter((l) => l && (l.designation || l.prix_unitaire))
    .map((l) => ({
      designation: String(l.designation || "Prestation"),
      quantite: Number(l.quantite) || 1,
      prix_unitaire: Number(l.prix_unitaire) || 0,
      remise: tauxRemise(l.remise),
      categorie: categorieDe(l),
    }));
  // Les ingrédients de peinture reprennent le temps de la ligne Peinture.
  const peinture = arr.find((l) => estLignePeinture(l.designation));
  const normalisees = peinture
    ? arr.map((l) => (estLigneIngredients(l.designation) ? { ...l, quantite: peinture.quantite } : l))
    : arr;
  if (normalisees.length === 0 && montant && montant > 0) {
    return [
      {
        designation: "Réparations selon rapport d'expertise",
        quantite: 1,
        prix_unitaire: montant,
        remise: 0,
        categorie: "piece" as CategorieLigne,
      },
    ];
  }
  return normalisees;
}

export function lignesToDb(lignes: LigneSaisie[]): Omit<DocumentLigne, "id" | "document_id">[] {
  return lignes
    .filter((l) => l.designation.trim() !== "")
    .map((l, i) => ({
      designation: l.designation,
      quantite: Number(l.quantite) || 0,
      prix_unitaire: Number(l.prix_unitaire) || 0,
      remise: tauxRemise(l.remise),
      categorie: l.categorie || categoriseLigne(l.designation),
      ordre: i,
    }));
}
