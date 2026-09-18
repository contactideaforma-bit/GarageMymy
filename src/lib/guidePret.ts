// ============================================================
//  GUIDE « VÉHICULE DE PRÊT » — conditions des assureurs (v13.2 / migration v74)
//
//  Avant d'attribuer un véhicule de prêt, le garage vérifie ce que
//  l'assurance du client prend en charge (garantie incluse ou en option,
//  durée par événement, plafond, conditions). Les fiches viennent de la
//  table `guide_pret_assureurs` : fiches COMMUNES de l'éditeur (owner_id
//  null) + fiches PERSONNELLES du garage (ajouts ou copies personnalisées
//  d'une fiche commune via base_id, qui prennent le pas).
//
//  Ce module ne touche pas à la base : recherche du bon assureur à partir
//  du nom libre saisi sur le dossier, durée applicable selon l'événement,
//  libellés, cadre juridique commun.
// ============================================================

import { GuidePretAssureur } from "./types";

/* ------------------------------ Libellés ------------------------------ */

export const INCLUSIONS: Record<string, { label: string; badge: string }> = {
  inclus: { label: "Inclus", badge: "badge-ok" },
  option: { label: "En option", badge: "badge-warn" },
  selon_formule: { label: "Selon la formule", badge: "badge-info" },
  inconnu: { label: "À vérifier", badge: "badge-neutral" },
};

export const GARAGES_AGREES: Record<string, { label: string; detail: string; badge: string }> = {
  obligatoire: {
    label: "Garage agréé exigé",
    detail: "Le véhicule de remplacement n'est fourni que si la réparation est faite dans le réseau de l'assureur (ou avec son accord préalable).",
    badge: "badge-danger",
  },
  avantage: {
    label: "Prêt gratuit réservé au réseau",
    detail: "Le prêt gratuit par le garage est un avantage du réseau partenaire ; le véhicule de remplacement d'assistance reste dû hors réseau, aux conditions du contrat.",
    badge: "badge-warn",
  },
  non: { label: "Sans condition de réseau", detail: "Aucune obligation de réparateur agréé trouvée.", badge: "badge-ok" },
  inconnu: { label: "Réseau : à vérifier", detail: "Condition de réparateur agréé non trouvée dans les sources.", badge: "badge-neutral" },
};

export const FIABILITES: Record<string, { label: string; detail: string; badge: string }> = {
  cg: { label: "Conditions générales", detail: "Chiffres lus dans les conditions générales de l'assureur.", badge: "badge-ok" },
  site: { label: "Site de l'assureur", detail: "Chiffres des pages produits officielles ; les CG n'ont pas pu être lues en entier.", badge: "badge-info" },
  comparateur: { label: "Comparateur — à confirmer", detail: "Chiffres de comparateurs : CG non publiées. Demander les conditions particulières au client.", badge: "badge-warn" },
};

/** Événements à l'origine de l'immobilisation, tels qu'on les choisit au moment du prêt. */
export const EVENEMENTS_PRET: { key: string; label: string; champ: keyof GuidePretAssureur | null }[] = [
  { key: "accident_non_resp", label: "Accident non responsable", champ: "duree_accident" },
  { key: "accident_resp", label: "Accident responsable", champ: "duree_accident" },
  { key: "vol", label: "Vol / tentative de vol", champ: "duree_vol" },
  { key: "incendie", label: "Incendie", champ: "duree_incendie" },
  { key: "panne", label: "Panne", champ: "duree_panne" },
  { key: "bris_de_glace", label: "Bris de glace seul", champ: null },
];

/* ------------------------------ Recherche ------------------------------ */

/** Minuscules, sans accents ni ponctuation, sans les mots vides « assurance(s) », « mutuelle »… */
export function normaliserNomAssureur(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[''’`]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(assurances?|mutuelles?|iard|sa|s a|france|groupe|societe|compagnie|d)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Toutes les graphies connues d'une fiche (nom + alias), normalisées, de la plus longue à la plus courte. */
function graphies(f: GuidePretAssureur): string[] {
  const base = f.nom || "";
  // « Pacifica (Crédit Agricole) » → « Pacifica », « Crédit Agricole »
  const morceaux = base.split(/[()\/]/).map((x) => x.trim()).filter(Boolean);
  const alias = (f.alias || "").split(",").map((x) => x.trim()).filter(Boolean);
  return Array.from(new Set([base, ...morceaux, ...alias].map(normaliserNomAssureur).filter((x) => x.length >= 3))).sort(
    (a, b) => b.length - a.length
  );
}

/**
 * Fusion des fiches : une copie personnalisée (base_id) remplace la fiche
 * commune correspondante ; les fiches inactives sont écartées.
 */
export function fusionnerFiches(fiches: GuidePretAssureur[]): GuidePretAssureur[] {
  const remplacees = new Set(fiches.filter((f) => f.base_id).map((f) => f.base_id as string));
  return fiches
    .filter((f) => f.actif !== false && !remplacees.has(f.id))
    .sort((a, b) => (a.nom || "").localeCompare(b.nom || "", "fr"));
}

/** Retrouve la fiche de l'assureur à partir du nom libre du dossier (« AXA France IARD » → AXA). */
export function trouverFicheAssureur(nom: string | null | undefined, fiches: GuidePretAssureur[]): GuidePretAssureur | null {
  const n = normaliserNomAssureur(nom);
  if (!n) return null;
  let meilleure: { fiche: GuidePretAssureur; score: number } | null = null;
  for (const f of fusionnerFiches(fiches)) {
    for (const g of graphies(f)) {
      const exact = n === g;
      const contient = ` ${n} `.includes(` ${g} `);
      if (!exact && !contient) continue;
      const score = (exact ? 1000 : 0) + g.length + (f.owner_id ? 1 : 0);
      if (!meilleure || score > meilleure.score) meilleure = { fiche: f, score };
      break;
    }
  }
  return meilleure?.fiche || null;
}

/* ------------------------------ Durées ------------------------------ */

export type DureeApplicable = { jours: number | null; libelle: string; note: string | null };

/** Durée indicative de prise en charge pour un événement donné, avec la nuance utile. */
export function dureePourEvenement(f: GuidePretAssureur, evenement: string): DureeApplicable {
  const evt = EVENEMENTS_PRET.find((e) => e.key === evenement);
  if (!evt) return { jours: null, libelle: "—", note: null };
  if (!evt.champ) {
    return {
      jours: null,
      libelle: "Non couvert en général",
      note: "Le bris de glace seul n'ouvre pas droit à un véhicule de remplacement chez la plupart des assureurs (véhicule roulant).",
    };
  }
  const jours = f[evt.champ] as number | null;
  const note =
    evenement === "accident_non_resp"
      ? "Non responsable : au-delà de la garantie du client, le préjudice d'immobilisation est récupérable auprès de l'assureur du responsable (facturer la location, joindre le rapport d'expertise)."
      : evenement === "accident_resp"
      ? "Responsable : seule la garantie du contrat du client joue. Orienter le client vers son assisteur dès le remorquage."
      : evenement === "panne"
      ? "La panne est presque toujours une option distincte (assistance panne 0 km) : vérifier qu'elle est souscrite."
      : null;
  return {
    jours,
    libelle: jours != null ? `${jours} jour${jours > 1 ? "s" : ""}` : "Non trouvé",
    note,
  };
}

/** Résumé d'une ligne (liste du guide / encart du prêt). */
export function resumeDurees(f: GuidePretAssureur): string {
  const parts: string[] = [];
  if (f.duree_panne != null) parts.push(`panne ${f.duree_panne} j`);
  if (f.duree_accident != null) parts.push(`accident ${f.duree_accident} j`);
  if (f.duree_incendie != null && f.duree_incendie !== f.duree_accident) parts.push(`incendie ${f.duree_incendie} j`);
  if (f.duree_vol != null) parts.push(`vol ${f.duree_vol} j`);
  return parts.length ? parts.join(" · ") : "durées non trouvées";
}

export function sourcesListe(f: GuidePretAssureur): string[] {
  return (f.sources || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s));
}

/* ------------------------------ Cadre commun ------------------------------ */

export const CADRE_COMMUN: { titre: string; texte: string }[] = [
  {
    titre: "Accident non responsable : le prêt se facture",
    texte:
      "La victime a droit à la réparation intégrale de son préjudice (loi Badinter du 5 juillet 1985, art. 1240 du Code civil), y compris la privation de jouissance de son véhicule. Une location réelle est indemnisée sur facture, sans abattement ; à défaut, les assureurs proposent un forfait (souvent 15 à 30 € par jour, sans barème officiel). Établir un contrat de LOCATION au client (même à tarif modéré) avec facture nominative, dates alignées sur l'immobilisation justifiée par l'expertise, puis réclamer à l'assureur du responsable (recours via l'assureur du client, ou action directe art. L124-3 du Code des assurances). Un prêt gratuit n'est pas indemnisable : facturer, ne pas prêter, si l'on veut être remboursé. Réclamer seulement les jours non couverts par un véhicule déjà fourni par l'assisteur.",
  },
  {
    titre: "Convention IRSA / IDA : inopposable au client",
    texte:
      "Entre eux, les assureurs abandonnent leurs recours sur le dépannage, le remorquage et l'immobilisation (sinistres < 6 500 € HT) : l'assureur du client n'a donc aucun intérêt à financer l'immobilisation. Mais cette convention ne lie pas l'assuré, qui conserve son recours de droit commun contre le responsable et son assureur.",
  },
  {
    titre: "Libre choix du réparateur et cession de créance",
    texte:
      "Art. L211-5-1 du Code des assurances (loi Hamon 2014) : le client choisit librement son réparateur et l'assureur doit le lui rappeler à la déclaration du sinistre. Art. L211-5-2 (loi du 3 décembre 2020) : les clauses interdisant la cession de l'indemnité sont nulles — le client peut céder sa créance au garage, payé directement par l'assureur (notifier l'assureur par écrit avant l'intervention). En revanche, rien n'oblige l'assureur à étendre au garage libre les avantages commerciaux de son réseau (dont le prêt gratuit « partenaire »). Le véhicule de remplacement contractuel d'ASSISTANCE, lui, est dû quel que soit le garage, aux conditions des CG (immobilisation minimale, remorquage par l'assisteur, accord préalable…).",
  },
  {
    titre: "Transfert des garanties sur le véhicule prêté",
    texte:
      "La plupart des contrats transfèrent automatiquement les garanties de l'assuré sur un véhicule prêté ou loué par le professionnel qui répare, en général 30 jours maximum et hors panne mécanique : le client reste couvert au volant de votre véhicule. Demander la confirmation écrite (bloc « transfert de garantie » du dossier).",
  },
  {
    titre: "Réflexe avant d'attribuer un véhicule",
    texte:
      "1) Identifier l'assureur et la FORMULE / les OPTIONS du client (conditions particulières, pas seulement le nom de l'assureur). 2) Repérer l'événement (accident responsable ou non, vol, panne, incendie) et la durée indicative. 3) Vérifier le seuil de déclenchement (immobilisation > 24 ou 48 h, heures de main-d'œuvre) et l'accord préalable de l'assisteur. 4) Choisir : prêt gratuit (réseau / geste commercial) ou location facturée (non responsable, dépassement de la durée garantie). 5) Tracer le tout dans le contrat de prêt.",
  },
];

export const CHAMPS_VIDES_FICHE = {
  nom: "", alias: "", contrat: "", inclusion: "inconnu", formules: "", prix_option: "",
  duree_panne: "", duree_accident: "", duree_vol: "", duree_incendie: "", duree_max: "",
  categorie: "", plafond_jour: "", plafond_detail: "", immobilisation_min: "", garage_agree: "inconnu",
  conditions: "", exclusions: "", facturation_garage: "", assisteur: "", assisteur_tel: "",
  sources: "", fiabilite: "site", verifie_le: "", notes: "",
};
export type FormFiche = typeof CHAMPS_VIDES_FICHE;

const s = (v: unknown) => (v == null ? "" : String(v));

export function ficheVersForm(f: GuidePretAssureur): FormFiche {
  return {
    nom: s(f.nom), alias: s(f.alias), contrat: s(f.contrat), inclusion: f.inclusion || "inconnu", formules: s(f.formules),
    prix_option: s(f.prix_option), duree_panne: s(f.duree_panne), duree_accident: s(f.duree_accident), duree_vol: s(f.duree_vol),
    duree_incendie: s(f.duree_incendie), duree_max: s(f.duree_max), categorie: s(f.categorie), plafond_jour: s(f.plafond_jour),
    plafond_detail: s(f.plafond_detail), immobilisation_min: s(f.immobilisation_min), garage_agree: f.garage_agree || "inconnu",
    conditions: s(f.conditions), exclusions: s(f.exclusions), facturation_garage: s(f.facturation_garage), assisteur: s(f.assisteur),
    assisteur_tel: s(f.assisteur_tel), sources: s(f.sources), fiabilite: f.fiabilite || "site", verifie_le: s(f.verifie_le), notes: s(f.notes),
  };
}

/** Formulaire → colonnes de la table (chaînes vides → null, nombres convertis). */
export function formVersFiche(f: FormFiche): Partial<GuidePretAssureur> {
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  const txt = (v: string) => (v.trim() === "" ? null : v.trim());
  return {
    nom: f.nom.trim(), alias: txt(f.alias), contrat: txt(f.contrat), inclusion: f.inclusion, formules: txt(f.formules),
    prix_option: txt(f.prix_option), duree_panne: num(f.duree_panne), duree_accident: num(f.duree_accident), duree_vol: num(f.duree_vol),
    duree_incendie: num(f.duree_incendie), duree_max: num(f.duree_max), categorie: txt(f.categorie), plafond_jour: num(f.plafond_jour),
    plafond_detail: txt(f.plafond_detail), immobilisation_min: txt(f.immobilisation_min), garage_agree: f.garage_agree,
    conditions: txt(f.conditions), exclusions: txt(f.exclusions), facturation_garage: txt(f.facturation_garage), assisteur: txt(f.assisteur),
    assisteur_tel: txt(f.assisteur_tel), sources: txt(f.sources), fiabilite: f.fiabilite, verifie_le: txt(f.verifie_le), notes: txt(f.notes),
  };
}
