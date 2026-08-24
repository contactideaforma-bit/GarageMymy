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

// TABLEAU DES POSTES — liste FERMÉE (v7.5, exigence du garage) :
// UNIQUEMENT T1, T2, T3, Peinture et Ingrédients de peinture. Tout le reste
// (main d'œuvre générique, tôlerie, forfaits…) part dans « Autres éléments ».
//
// ⚠️ v8.8 — RECONNAISSANCE ANCRÉE AU DÉBUT DU LIBELLÉ.
// L'ancienne version cherchait le mot n'importe où : « BAGUETTE PEINTURE »
// ou « SUPPORT T2 » (des PIÈCES) atterrissaient dans le tableau des postes,
// qui se retrouvait avec autre chose que les cinq postes autorisés. Un poste
// de main d'œuvre commence TOUJOURS par son nom, éventuellement précédé de
// « MO », « M.O. », « main d'œuvre » ou « forfait ».
// Le préfixe doit être SUIVI d'un séparateur : sans ce garde-fou, « MOULURE »
// perdait son « MO » et « MOTEUR » aussi. Couvre « MO », « M.O. »,
// « main d'œuvre » et « forfait ».
const RE_PREFIXE_MO =
  /^\s*(?:mo|m\.\s*o\.?|main\s*d.?\s*(?:œ|oe)uvre|forfait)(?=[\s:.\-–])[\s:.\-–]*/;

/** Retire le préfixe « MO / main d'œuvre / forfait » d'un libellé. */
function sansPrefixeMo(designation: string | null | undefined): string {
  return (designation || "").trim().toLowerCase().replace(RE_PREFIXE_MO, "").trim();
}

const RE_T123 = /^t\s*-?\s*[123]\b/;
// « Ingr.(MV) » est l'abréviation réellement imprimée par certains cabinets
// (Adenes/Roadia) : la reconnaissance doit accepter la forme abrégée.
const RE_INGREDIENTS = /^ingr(?:[ée]d|\.|\s|$)/;
const RE_PEINTURE = /^peinture\b/;

export function estPosteMo(designation: string | null | undefined): boolean {
  const d = sansPrefixeMo(designation);
  if (!d) return false;
  // Ingrédients AVANT peinture : « Ingrédients de peinture » est un poste
  // distinct, il ne doit pas être pris pour la ligne « Peinture ».
  return RE_INGREDIENTS.test(d) || RE_T123.test(d) || RE_PEINTURE.test(d);
}

export function categoriseLigne(designation: string | null | undefined): CategorieLigne {
  const d = (designation || "").trim().toLowerCase();
  if (!d) return "piece";
  if (estPosteMo(d)) return "mo";
  if (/main\s*d.?\s*(œ|oe)uvre|t[ôo]lerie|tolerie|m[ée]canique|d[ée]montage|remontage/.test(d)) {
    return "autre";
  }
  if (RE_AUTRE.test(d)) return "autre";
  return "piece";
}

// Ordre d'affichage imposé dans le tableau des postes :
// T1, T2, T3, Peinture, Ingrédients de peinture, puis le reste.
export function rangPosteMo(designation: string | null | undefined): number {
  const d = sansPrefixeMo(designation);
  if (RE_INGREDIENTS.test(d)) return 5;
  if (/^t\s*-?\s*1\b/.test(d)) return 1;
  if (/^t\s*-?\s*2\b/.test(d)) return 2;
  if (/^t\s*-?\s*3\b/.test(d)) return 3;
  if (RE_PEINTURE.test(d)) return 4;
  return 6;
}

/**
 * La ligne « Peinture » du tableau des postes — celle dont les ingrédients
 * recopient le temps. Elle DOIT être un poste (v8.8) : sans ça, une pièce
 * intitulée « baguette peinture » servait de référence à la recopie.
 */
export function estLignePeinture(designation: string | null | undefined): boolean {
  return estPosteMo(designation) && RE_PEINTURE.test(sansPrefixeMo(designation));
}

/**
 * La ligne « Ingrédients de peinture ». Ancrée elle aussi (v8.8) : la recopie
 * automatique du temps ne doit jamais écraser la quantité d'une pièce dont le
 * libellé contiendrait le mot « ingrédients ».
 */
export function estLigneIngredients(designation: string | null | undefined): boolean {
  return RE_INGREDIENTS.test(sansPrefixeMo(designation));
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
  // Le tableau des postes est VERROUILLÉ sur T1/T2/T3/Peinture/Ingrédients :
  // même si une ligne a été rangée à la main dans « mo », elle n'y reste que
  // si son libellé correspond réellement à l'un de ces postes.
  const estPoste = (l: LigneBase) => categorieDe(l) === "mo" && estPosteMo(l.designation);
  const pieces = lignes.filter((l) => categorieDe(l) === "piece");
  const mo = lignes
    .filter(estPoste)
    .slice()
    .sort((a, b) => rangPosteMo(a.designation) - rangPosteMo(b.designation));
  const autres = lignes.filter(
    (l) => categorieDe(l) === "autre" || (categorieDe(l) === "mo" && !estPosteMo(l.designation))
  );
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
  caution: "Chèque de caution",
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
 *  COHÉRENCE AVEC LE RAPPORT D'EXPERTISE (v7.5)
 *  Le net à payer doit correspondre au rapport. Sinon on ALERTE : c'est
 *  une saisie à reprendre à la main, jamais une correction automatique.
 * ================================================================== */

// Tolérance : 1 € (arrondis de l'expert d'une ligne à l'autre).
export const TOLERANCE_RAPPORT = 1;

export type ControleRapport = {
  /** Montant HT retenu au rapport d'expertise (null si inconnu). */
  montantRapport: number | null;
  totalHt: number;
  ecart: number;
  coherent: boolean;
  message: string | null;
};

export function controlerRapport(
  totalHt: number,
  montantRapport: number | null | undefined
): ControleRapport {
  const ref = Number(montantRapport);
  if (!Number.isFinite(ref) || ref <= 0) {
    return { montantRapport: null, totalHt, ecart: 0, coherent: true, message: null };
  }
  const ecart = round2(totalHt - ref);
  const coherent = Math.abs(ecart) <= TOLERANCE_RAPPORT;
  const euros = (n: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
  return {
    montantRapport: ref,
    totalHt,
    ecart,
    coherent,
    message: coherent
      ? null
      : `Incohérence avec le rapport d'expertise : la facture totalise ${euros(totalHt)} HT alors que le rapport retient ${euros(ref)} HT (écart de ${euros(Math.abs(ecart))} ${ecart > 0 ? "en trop" : "en moins"}). Vérifie les heures, les taux horaires et les pièces, puis corrige à la main.`,
  };
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
  /**
   * v8.1 — Temps saisi À LA MAIN sur une ligne « ingrédients de peinture » :
   * la recopie automatique du temps de peinture est débrayée pour cette ligne.
   * Champ d'interface uniquement (jamais enregistré en base) : à la réouverture
   * du document il est redéduit de l'écart entre les deux temps.
   */
  tempsLibre?: boolean;
};

export function ligneVide(categorie: CategorieLigne = "piece"): LigneSaisie {
  return { designation: "", quantite: "1", prix_unitaire: "0", remise: "0", categorie };
}

// Les ingrédients de peinture reprennent PAR DÉFAUT la quantité (le temps) de
// la ligne Peinture. Exception (v8.1) : une ligne dont le temps a été saisi à
// la main (`tempsLibre`) n'est plus écrasée — certains rapports retiennent pour
// les ingrédients un nombre d'heures différent de celui de la peinture.
export function syncIngredientsPeinture(items: LigneSaisie[]): LigneSaisie[] {
  const peinture = items.find((l) => estLignePeinture(l.designation));
  if (!peinture) return items;
  return items.map((l) =>
    estLigneIngredients(l.designation) && !l.tempsLibre
      ? { ...l, quantite: peinture.quantite }
      : l
  );
}

// À l'ouverture d'un document existant : si le temps des ingrédients diffère
// déjà de celui de la peinture, c'est qu'il a été fixé volontairement — on le
// marque libre pour ne pas l'écraser dès la première frappe dans l'éditeur.
export function marquerTempsLibre(items: LigneSaisie[]): LigneSaisie[] {
  const peinture = items.find((l) => estLignePeinture(l.designation));
  if (!peinture) return items;
  const ref = Number(peinture.quantite) || 0;
  return items.map((l) =>
    estLigneIngredients(l.designation) && (Number(l.quantite) || 0) !== ref
      ? { ...l, tempsLibre: true }
      : l
  );
}

// Y a-t-il une ligne d'ingrédients désolidarisée du temps de peinture ?
export function ingredientsDesynchronises(items: LigneSaisie[]): boolean {
  return (
    items.some((l) => estLignePeinture(l.designation)) &&
    items.some((l) => estLigneIngredients(l.designation) && l.tempsLibre)
  );
}

// Remet les ingrédients de peinture sur le temps de la ligne Peinture.
export function resynchroniserIngredients(items: LigneSaisie[]): LigneSaisie[] {
  return syncIngredientsPeinture(
    items.map((l) => (estLigneIngredients(l.designation) ? { ...l, tempsLibre: false } : l))
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

/* ==================================================================
 *  CHIFFRAGE DU RAPPORT (v50) — source de vérité régénérable
 *
 *  Les lignes lues dans le rapport sont rangées sur `dossiers.chiffrage`.
 *  Elles servent à REGÉNÉRER un devis ou une facture à l'identique, y
 *  compris après suppression : le bouton « + Facture » ne repart plus
 *  jamais d'une page blanche quand le dossier a été analysé.
 *
 *  ⚠️ Les lignes SANS PRIX sont conservées telles quelles : au rapport,
 *  ce sont des opérations comprises dans la main d'œuvre (D/R/P/G), et le
 *  garage veut les voir sur la facture. Ne jamais les filtrer.
 * ================================================================== */

/** Une ligne du chiffrage telle qu'elle est rangée sur le dossier. */
export type LigneChiffrage = {
  designation: string;
  quantite: number;
  prix_unitaire: number;
  remise: number;
  categorie: CategorieLigne;
};

/** Lignes prêtes à pré-remplir l'éditeur — lecture TOLÉRANTE du JSON. */
export function lignesDepuisChiffrage(chiffrage: unknown): LigneChiffrage[] {
  if (!Array.isArray(chiffrage)) return [];
  return chiffrage
    .filter((l): l is Record<string, unknown> => Boolean(l) && typeof l === "object")
    .map((l) => ({
      designation: String(l.designation ?? "").trim(),
      quantite: Number(l.quantite) || 0,
      prix_unitaire: Number(l.prix_unitaire) || 0,
      remise: tauxRemise(l.remise as number),
      categorie: categorieDe(l as LigneBase),
    }))
    .filter((l) => l.designation !== "");
}

/** Total HT d'un chiffrage — sert à vérifier qu'on retombe sur le rapport. */
export function totalChiffrage(lignes: LigneChiffrage[]): number {
  return sousTotal(lignes);
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
