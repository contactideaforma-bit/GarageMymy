// MÉMOIRE DE L'ANALYSE — « l'IA apprend » (v7.7)
//
// PROBLÈME : l'analyse d'un rapport d'expertise se trompe toujours un peu au
// même endroit — un libellé mal recollé, une prestation rangée dans le mauvais
// tableau, un poste que le garage ne facture jamais. Le garage corrigeait la
// même chose à chaque dossier.
//
// PRINCIPE : on observe ce que le garage CORRIGE sur le devis/la facture
// générés. Une correction répétée (SEUIL_APPRENTISSAGE fois) devient une
// RÈGLE, qui est ensuite :
//   1. injectée dans le prompt d'analyse (le modèle la connaît à l'avance) ;
//   2. appliquée DÉTERMINISTEMENT aux lignes extraites — mais UNIQUEMENT pour
//      le libellé et le tableau d'affectation.
//
// ⚠ RÈGLE D'OR : on n'applique JAMAIS automatiquement une règle qui change de
// l'argent. Les heures et les taux horaires restent ceux du rapport (cf.
// mémoire projet « Facture — règles métier »). Un taux « habituel » appris ne
// sert que d'indication au modèle quand le rapport est illisible, et une ligne
// « à ignorer » n'est jamais supprimée en douce : elle est signalée au modèle.
//
// Ce module est PUR (aucun accès base, aucun import navigateur) : il est
// utilisé côté serveur (route d'extraction) ET côté navigateur.

import { IaRegle, TypeRegle } from "./types";

/** Nombre d'occurrences d'une même correction avant qu'elle devienne une règle. */
export const SEUIL_APPRENTISSAGE = 2;

export const LIBELLE_TYPE_REGLE: Record<TypeRegle, string> = {
  libelle: "Libellé",
  categorie: "Tableau",
  taux: "Taux horaire",
  ignorer: "Ligne ignorée",
  consigne: "Consigne libre",
};

/**
 * Clé de comparaison d'une désignation : minuscules, sans accent, sans
 * ponctuation. « PORTE AR.D (R+P) » et « porte ar d (r p) » donnent la même
 * clé — sinon la moindre variation de frappe empêchait de reconnaître une
 * correction déjà vue.
 */
export function normaliseCle(s: string | null | undefined): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/* ==================================================================
 *  1) APPLICATION DES RÈGLES aux lignes extraites du rapport
 * ================================================================== */

type LigneBrute = {
  designation?: string | null;
  quantite?: number | string | null;
  prix_unitaire?: number | string | null;
  remise?: number | string | null;
  categorie?: string | null;
};

const CATEGORIES_VALIDES = new Set(["piece", "mo", "autre"]);

/**
 * Applique les règles APPRISES aux lignes extraites.
 * Seuls le libellé et le tableau d'affectation sont réécrits : aucun montant,
 * aucune quantité n'est touché (cf. règle d'or en tête de fichier).
 */
export function appliquerRegles<T extends LigneBrute>(
  lignes: T[],
  regles: IaRegle[]
): { lignes: T[]; appliquees: number } {
  const actives = regles.filter((r) => r.actif);
  const libelles = new Map<string, string>();
  const categories = new Map<string, string>();
  for (const r of actives) {
    if (r.type === "libelle" && r.valeur) libelles.set(r.cle, r.valeur);
    if (r.type === "categorie" && CATEGORIES_VALIDES.has(r.valeur)) categories.set(r.cle, r.valeur);
  }
  if (libelles.size === 0 && categories.size === 0) return { lignes, appliquees: 0 };

  let appliquees = 0;
  const sortie = lignes.map((l) => {
    const cleAvant = normaliseCle(l.designation);
    let designation = l.designation ?? "";
    const nouveauLibelle = libelles.get(cleAvant);
    if (nouveauLibelle && nouveauLibelle !== designation) {
      designation = nouveauLibelle;
      appliquees++;
    }
    // La règle de tableau peut avoir été enregistrée sur l'ancien OU le
    // nouveau libellé : on regarde les deux clés.
    const categorie =
      categories.get(cleAvant) ?? categories.get(normaliseCle(designation)) ?? l.categorie;
    if (categorie && categorie !== l.categorie) appliquees++;
    return { ...l, designation, categorie } as T;
  });
  return { lignes: sortie, appliquees };
}

/* ==================================================================
 *  2) BLOC DE PROMPT — ce que le modèle doit savoir de ce garage
 * ================================================================== */

const MAX_REGLES_PROMPT = 40;

/**
 * Traduit les règles en consignes lisibles, ajoutées au prompt d'analyse.
 * Chaîne vide s'il n'y a rien à dire (on n'alourdit pas le prompt pour rien).
 */
export function blocRegles(regles: IaRegle[]): string {
  const actives = regles
    .filter((r) => r.actif)
    .slice()
    .sort((a, b) => (b.occurrences || 0) - (a.occurrences || 0))
    .slice(0, MAX_REGLES_PROMPT);
  if (actives.length === 0) return "";

  const lignes: string[] = [];
  for (const r of actives) {
    switch (r.type) {
      case "libelle":
        lignes.push(`- Écris « ${r.valeur} » plutôt que « ${r.cle} ».`);
        break;
      case "categorie":
        lignes.push(
          `- « ${r.cle} » se range en categorie "${
            r.valeur === "mo" ? "m" : r.valeur === "autre" ? "a" : "p"
          }".`
        );
        break;
      case "taux":
        lignes.push(
          `- Taux horaire habituel de « ${r.cle} » dans ce garage : ${r.valeur} €/h — à n'utiliser QUE si ce taux est illisible dans le rapport ; sinon recopie TOUJOURS celui du rapport.`
        );
        break;
      case "ignorer":
        lignes.push(
          `- Le garage ne facture jamais « ${r.cle} » : ne l'extrais pas, SAUF si le total HT du rapport ne tombe plus juste sans elle.`
        );
        break;
      case "consigne":
        lignes.push(`- ${r.valeur}`);
        break;
    }
  }

  return `

RÈGLES PROPRES À CE GARAGE (apprises de ses corrections précédentes) — elles PRIMENT sur tes habitudes, mais JAMAIS sur les chiffres du rapport :
${lignes.join("\n")}`;
}

/* ==================================================================
 *  3) DÉTECTION DES CORRECTIONS (diff « ce que l'IA a produit » →
 *     « ce que le garage a validé »)
 * ================================================================== */

export type LigneComparable = {
  designation: string;
  quantite: number;
  prix_unitaire: number;
  categorie: string;
};

export type CorrectionDetectee = {
  type: TypeRegle;
  cle: string;
  valeur: string;
  exemple: string;
};

const memesChiffres = (a: LigneComparable, b: LigneComparable) =>
  Math.abs(a.quantite - b.quantite) < 0.001 && Math.abs(a.prix_unitaire - b.prix_unitaire) < 0.001;

/**
 * Compare les lignes AVANT (telles que générées) et APRÈS (telles que le
 * garage les a enregistrées) et en déduit des corrections réutilisables.
 *
 * Trois passes, de la plus sûre à la plus incertaine :
 *   A. mêmes désignations → on regarde le tableau et le taux horaire ;
 *   B. lignes restantes aux chiffres identiques → c'est un renommage ;
 *   C. lignes de départ jamais retrouvées → le garage les a supprimées.
 */
export function detecterCorrections(
  avant: LigneComparable[],
  apres: LigneComparable[]
): CorrectionDetectee[] {
  const out: CorrectionDetectee[] = [];
  const clesA = avant.map((l) => normaliseCle(l.designation));
  const clesB = apres.map((l) => normaliseCle(l.designation));
  const prisA = new Set<number>();
  const prisB = new Set<number>();

  // --- A. appariement par désignation identique
  clesA.forEach((k, i) => {
    if (!k) { prisA.add(i); return; }
    const j = clesB.findIndex((kb, idx) => kb === k && !prisB.has(idx));
    if (j === -1) return;
    prisA.add(i);
    prisB.add(j);
    const a = avant[i];
    const b = apres[j];
    if (a.categorie !== b.categorie && CATEGORIES_VALIDES.has(b.categorie)) {
      out.push({
        type: "categorie",
        cle: k,
        valeur: b.categorie,
        exemple: `${b.designation} : tableau « ${a.categorie} » → « ${b.categorie} »`,
      });
    }
    // Taux horaire : uniquement sur les POSTES (T1/T2/T3/peinture/ingrédients).
    // Sur une pièce, le prix change à chaque rapport — ce serait du bruit.
    if (
      b.categorie === "mo" &&
      b.prix_unitaire > 0 &&
      Math.abs(a.prix_unitaire - b.prix_unitaire) >= 0.01
    ) {
      out.push({
        type: "taux",
        cle: k,
        valeur: String(b.prix_unitaire),
        exemple: `${b.designation} : ${a.prix_unitaire} → ${b.prix_unitaire} €/h`,
      });
    }
  });

  // --- B. renommages : chiffres identiques, libellé différent
  avant.forEach((a, i) => {
    if (prisA.has(i)) return;
    const j = apres.findIndex(
      (b, idx) => !prisB.has(idx) && memesChiffres(a, b) && normaliseCle(b.designation)
    );
    if (j === -1) return;
    prisA.add(i);
    prisB.add(j);
    const b = apres[j];
    out.push({
      type: "libelle",
      cle: clesA[i],
      valeur: b.designation.trim(),
      exemple: `« ${a.designation} » → « ${b.designation} »`,
    });
    if (a.categorie !== b.categorie && CATEGORIES_VALIDES.has(b.categorie)) {
      out.push({
        type: "categorie",
        cle: normaliseCle(b.designation),
        valeur: b.categorie,
        exemple: `${b.designation} : tableau « ${a.categorie} » → « ${b.categorie} »`,
      });
    }
  });

  // --- C. lignes supprimées par le garage
  avant.forEach((a, i) => {
    if (prisA.has(i) || !clesA[i]) return;
    out.push({
      type: "ignorer",
      cle: clesA[i],
      valeur: "",
      exemple: `Ligne retirée : « ${a.designation} »`,
    });
  });

  // Dédoublonnage (une même correction ne compte qu'une fois par document).
  const vues = new Set<string>();
  return out.filter((c) => {
    const k = `${c.type}|${c.cle}|${c.valeur}`;
    if (vues.has(k)) return false;
    vues.add(k);
    return true;
  });
}
