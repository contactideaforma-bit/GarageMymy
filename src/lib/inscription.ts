// ============================================================
//  INSCRIPTION EN LIGNE (v13.41) — logique PURE partagée par la page
//  publique /inscription, la route /api/inscription et l'espace éditeur.
//
//  · recommanderFormule : à partir des réponses à la fiche de besoins
//    (QUESTIONS_BESOINS), propose LA formule la plus adaptée, avec les
//    raisons en clair. Le garage reste libre de choisir autre chose.
//  · SOURCES_CONNAISSANCE : « Comment nous avez-vous connu ? »
//  · CRENEAUX_RAPPEL : créneaux proposés pour être rappelé.
//  · MODES_EN_LIGNE : les moyens de paiement proposés selon la périodicité
//    (prélèvement automatique Stripe pour le mensuel, lien Qonto ou
//    virement pour l'année en une fois) — le garage garde le choix.
// ============================================================

import type { Formule, Periodicite } from "@/lib/admin/economie";

export type Besoins = Record<string, string | string[] | number | undefined>;

export type Recommandation = {
  formule: Formule;
  score: number;
  raisons: string[];
  /** Phrase d'accroche affichée au-dessus de la formule conseillée. */
  resume: string;
};

const num = (v: unknown): number => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const liste = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/**
 * Score de « charge administrative » : plus il est élevé, plus le garage a
 * besoin d'heures de chargé de mission. Seuils volontairement simples et
 * lisibles (expliqués au garage).
 */
export function recommanderFormule(b: Besoins): Recommandation {
  let score = 0;
  const raisons: string[] = [];

  const dossiers = num(b.dossiers_mois);
  if (dossiers > 50) { score += 3; raisons.push(`Plus de 50 dossiers par mois : un suivi quotidien s'impose.`); }
  else if (dossiers > 25) { score += 2; raisons.push(`${dossiers} dossiers par mois : un volume qui demande un suivi régulier.`); }
  else if (dossiers >= 10) { score += 1; raisons.push(`${dossiers} dossiers par mois : quelques dossiers bloqués chaque mois sont probables.`); }
  else if (dossiers > 0) raisons.push(`${dossiers} dossiers par mois : l'application seule peut suffire.`);

  const impayes = String(b.impayes || "");
  if (impayes === "Très fréquents") { score += 2; raisons.push("Retards de paiement très fréquents : des relances suivies jusqu'à l'encaissement font gagner de la trésorerie."); }
  else if (impayes === "Réguliers") { score += 1; raisons.push("Retards de paiement réguliers : un chargé de mission relance à votre place."); }

  const secretariat = String(b.secretariat || "");
  if (secretariat === "Personne / en retard") { score += 2; raisons.push("Personne ne gère l'administratif aujourd'hui : il faut quelqu'un pour reprendre les dossiers en retard."); }
  else if (secretariat === "Le patron" || secretariat === "Un(e) conjoint(e)") { score += 1; raisons.push("L'administratif repose sur vous : chaque heure déléguée est une heure d'atelier retrouvée."); }

  const douleurs = liste(b.douleurs);
  const lourdes = ["Relances de paiement", "Suivi des dossiers", "Appels clients / assurances"].filter((d) => douleurs.includes(d));
  if (lourdes.length) { score += lourdes.length; raisons.push(`Ce qui vous prend le plus de temps (${lourdes.join(", ").toLowerCase()}) est exactement ce que fait le chargé de mission.`); }
  const outils = ["Saisie des rapports d'expertise", "Devis / factures", "Planning atelier", "Véhicules de prêt"].filter((d) => douleurs.includes(d));
  if (outils.length && !lourdes.length) raisons.push(`${outils.join(", ")} : l'application s'en charge automatiquement.`);

  const effectif = num(b.effectif);
  if (effectif >= 8) { score += 1; raisons.push(`${effectif} personnes : la coordination des dossiers compte autant que leur saisie.`); }

  let formule: Formule;
  if (score <= 1) formule = "essentiel";
  else if (score <= 4) formule = "starter";
  else if (score <= 6) formule = "confort";
  else formule = "serenite";

  const resume =
    formule === "essentiel"
      ? "D'après vos réponses, l'application seule couvre vos besoins : elle prépare les documents, rappelle les échéances et relance pour vous."
      : formule === "starter"
      ? "D'après vos réponses, quelques dossiers bloqués vous coûtent du temps chaque mois : 10 h de chargé de mission suffisent à les sortir."
      : formule === "confort"
      ? "D'après vos réponses, vous avez besoin d'un suivi régulier des litiges et des impayés, pas seulement d'un déblocage ponctuel : 20 h par mois."
      : "D'après vos réponses, le suivi administratif de vos sinistres mérite d'être confié au quotidien : 40 h par mois, vous gardez les décisions.";

  if (!raisons.length) raisons.push("Remplissez la fiche de besoins pour affiner ce conseil — vous pouvez aussi choisir librement ci-dessous.");
  return { formule, score, raisons, resume };
}

/** « Comment nous avez-vous connu ? » */
export const SOURCES_CONNAISSANCE: { cle: string; label: string; detail?: string }[] = [
  { cle: "bouche_a_oreille", label: "Un confrère / le bouche-à-oreille", detail: "Qui nous a recommandés ? (facultatif)" },
  { cle: "commercial", label: "Un commercial My Easy Auto", detail: "Son nom ou son code apporteur" },
  { cle: "expert_assureur", label: "Un expert ou un assureur" },
  { cle: "google", label: "Une recherche Google" },
  { cle: "reseaux", label: "Les réseaux sociaux (Facebook, Instagram, TikTok, LinkedIn)" },
  { cle: "flyer", label: "Un flyer, un courrier ou un email" },
  { cle: "salon", label: "Un salon ou un événement" },
  { cle: "autre", label: "Autre", detail: "Précisez" },
];
export const libelleSource = (cle: string | null | undefined): string => SOURCES_CONNAISSANCE.find((s) => s.cle === cle)?.label || cle || "—";

export const CRENEAUX_RAPPEL: { cle: string; label: string }[] = [
  { cle: "matin", label: "Le matin (9h – 12h)" },
  { cle: "midi", label: "Entre midi et deux" },
  { cle: "apres-midi", label: "L'après-midi (14h – 17h)" },
  { cle: "fin-journee", label: "En fin de journée (17h – 19h)" },
];
export const libelleCreneau = (cle: string | null | undefined): string => CRENEAUX_RAPPEL.find((c) => c.cle === cle)?.label || cle || "—";

export type ModeEnLigne = "stripe" | "qonto" | "virement";

export type OptionPaiement = {
  mode: ModeEnLigne;
  titre: string;
  detail: string;
  recommande: boolean;
};

/** Moyens de paiement proposés au garage, selon la périodicité choisie. */
export function optionsPaiement(periodicite: Periodicite, dispo: { stripe: boolean; qonto: boolean }): OptionPaiement[] {
  if (periodicite === "mensuel") {
    const opts: OptionPaiement[] = [];
    if (dispo.stripe) opts.push({ mode: "stripe", titre: "Prélèvement automatique chaque mois", detail: "Carte bancaire ou prélèvement SEPA enregistré une fois, en toute sécurité. Chaque mensualité est prélevée toute seule ; vous recevez la facture par email.", recommande: true });
    opts.push({ mode: "virement", titre: "Virement chaque mois", detail: "Vous recevez un appel de paiement avant chaque échéance (lien de paiement sécurisé ou virement avec référence).", recommande: false });
    return opts;
  }
  const opts: OptionPaiement[] = [];
  if (dispo.qonto) opts.push({ mode: "qonto", titre: "Paiement en ligne sécurisé", detail: "Carte bancaire via un lien de paiement unique. Votre compte est activé dès que le paiement est confirmé.", recommande: true });
  opts.push({ mode: "virement", titre: "Virement bancaire", detail: "IBAN et référence communiqués à la fin de l'inscription et par email. Votre compte est activé à réception du virement.", recommande: !dispo.qonto });
  return opts;
}

export const ETAPES_INSCRIPTION = [
  { cle: "garage", label: "Votre garage" },
  { cle: "besoins", label: "Vos besoins" },
  { cle: "offre", label: "Votre formule" },
  { cle: "paiement", label: "Paiement" },
  { cle: "contrat", label: "Contrat" },
] as const;
export type EtapeInscription = (typeof ETAPES_INSCRIPTION)[number]["cle"] | "fini";

/** Résumé public d'une inscription (page « merci », sans rien d'interne). */
export type InscriptionPublique = {
  numero: string;
  token: string;
  garage_nom: string;
  contact_email: string;
  formule: Formule;
  periodicite: Periodicite;
  engagement_12: boolean;
  prix_mensuel_ht: number;
  montant_annuel_ht: number | null;
  /** v13.44 — offre de lancement accordée (0 = aucune). */
  lancement_pct?: number;
  lancement_mois?: number;
  mise_en_service_ht: number;
  paiement_en_ligne_mode: ModeEnLigne | null;
  paye: boolean;
  activee: boolean;
  compte_cree: boolean;
  qonto_url: string | null;
  stripe_statut: string | null;
  virement: { iban: string; bic: string; reference: string; montant: number } | null;
  signe_le: string | null;
};
