// ============================================================
//  FICHE D'IDENTIFICATION DES BESOINS (v10.4) — reprise fidèle du document
//  du pack commercial « FICHE-BESOINS_garage.pdf » (entretien de découverte).
//  Le questionnaire de la fiche client suit ces sections ; les réponses sont
//  stockées dans prospects.besoins (jsonb, clé = `cle` de chaque question).
//  Les demandes particulières du garage vivent sous la clé `demandes`
//  (liste d'objets { titre, detail }).
//  Les anciennes clés du questionnaire v10.2 (activite, effectif,
//  dossiers_mois, assureurs, logiciel_actuel, douleurs, impayes, secretariat,
//  equipement, demarrage, attentes) sont conservées : rien n'est perdu.
// ============================================================

export type TypeQuestion = "texte" | "long" | "nombre" | "choix" | "multi" | "ouinon";

export type QuestionBesoin = {
  cle: string;
  label: string;
  type: TypeQuestion;
  options?: string[];
  aide?: string;
  /** Pour « ouinon » : clé du champ de précision affiché à côté (« lesquels », « combien »). */
  precision?: { cle: string; label: string };
};

export type SectionBesoins = {
  cle: string;
  titre: string;
  intro?: string;
  /** Section réservée à IDEAFORMA (synthèse après l'entretien) : mise en évidence. */
  interne?: boolean;
  questions: QuestionBesoin[];
};

export type DemandeParticuliere = { titre: string; detail?: string };

/** Agrément assureur : nom + tarif particulier éventuel (taux horaire,
 *  remise consentie, forfait…) négocié avec cet assureur. */
export type Agrement = { nom: string; tarif?: string };

export const TACHES_SECRETARIAT = [
  "Création et saisie des dossiers sinistres (import du rapport d'expertise par IA)",
  "Édition des devis et factures depuis le chiffrage de l'expert",
  "Envoi des documents pour signature électronique (OR, cession de créance…)",
  "Relances des assurances et des experts (paiements, accords, pièces manquantes)",
  "Relances clients (franchises, restes à charge)",
  "Suivi des encaissements et rapprochement bancaire (import CSV)",
  "Gestion des rendez-vous (dépôt, expertise, restitution) et du planning atelier",
  "Commandes de pièces : suivi des demandes et des réceptions",
  "Gestion de la flotte de véhicules de prêt (contrats, alertes CT/CG)",
  "Boîte mail du garage : tri, réponses types, transferts",
  "Constitution des dossiers de prise en charge / cession de créance",
];

export const SECTIONS_BESOINS: SectionBesoins[] = [
  {
    cle: "entretien",
    titre: "Entretien",
    intro: "L'identité du garage (raison sociale, adresse, SIRET, contact) est reprise de l'onglet Fiche.",
    questions: [
      { cle: "date_entretien", label: "Date de l'entretien", type: "texte", aide: "jj/mm/aaaa" },
      { cle: "interlocuteur_ideaforma", label: "Interlocuteur IDEAFORMA", type: "texte" },
      { cle: "enseigne", label: "Enseigne / nom commercial (si différent)", type: "texte" },
    ],
  },
  {
    cle: "activite",
    titre: "Activité",
    questions: [
      { cle: "activite", label: "Métier principal", type: "choix", options: ["Carrosserie", "Vitrage / pare-brise", "Mixte", "Carrosserie + mécanique", "Concession / agent de marque", "Autre"] },
      { cle: "dossiers_mois", label: "Nombre de dossiers sinistres / mois (moyenne)", type: "nombre" },
      { cle: "panier_moyen", label: "Panier moyen d'une réparation (€ TTC)", type: "nombre" },
      { cle: "assureurs", label: "Assureurs / plateformes les plus fréquents", type: "texte" },
      { cle: "agrements", label: "Agréments assureurs ?", type: "ouinon", aide: "Si oui : lister chaque agrément et son éventuel tarif particulier." },
      { cle: "effectif", label: "Effectif atelier", type: "nombre" },
      { cle: "effectif_admin", label: "Effectif administratif", type: "nombre" },
      { cle: "vehicules_pret", label: "Véhicules de prêt (flotte)", type: "ouinon", precision: { cle: "vehicules_pret_nb", label: "Combien" } },
    ],
  },
  {
    cle: "organisation",
    titre: "Organisation administrative actuelle",
    questions: [
      { cle: "secretariat", label: "Qui gère l'administratif aujourd'hui ?", type: "choix", options: ["Le patron", "Secrétaire", "Conjoint(e)", "Un(e) salarié(e)", "Un prestataire", "Personne / en retard"] },
      { cle: "temps_admin", label: "Temps administratif estimé / semaine (heures)", type: "nombre" },
      { cle: "logiciel_actuel", label: "Outils actuels (logiciel, Excel, papier…)", type: "texte" },
      { cle: "equipement", label: "Équipement (ordinateur, tablette, smartphone, imprimante)", type: "texte" },
      { cle: "delai_encaissement", label: "Délai moyen d'encaissement d'une facture assurance", type: "texte" },
      { cle: "impayes_montant", label: "Montant estimé des impayés / retards en cours (€)", type: "nombre" },
      { cle: "impayes", label: "Retards de paiement des assurances (fréquence)", type: "choix", options: ["Rares", "Réguliers", "Très fréquents"] },
      { cle: "douleurs", label: "Ce qui prend le plus de temps aujourd'hui", type: "multi", options: ["Saisie des rapports d'expertise", "Devis / factures", "Relances de paiement", "Suivi des dossiers", "Appels clients / assurances", "Planning atelier", "Véhicules de prêt", "Comptabilité"] },
      { cle: "difficultes", label: "Principales difficultés citées", type: "long" },
    ],
  },
  {
    cle: "taches",
    titre: "Tâches à déléguer au secrétariat IDEAFORMA",
    intro: "Cocher les tâches souhaitées — elles définissent le contenu du forfait.",
    questions: [
      { cle: "taches", label: "Tâches souhaitées", type: "multi", options: TACHES_SECRETARIAT },
      { cle: "taches_autre", label: "Autre tâche", type: "texte" },
    ],
  },
  {
    cle: "modalites",
    titre: "Volume et modalités",
    questions: [
      { cle: "volume_horaire", label: "Volume horaire mensuel souhaité", type: "choix", options: ["10 h / mois", "20 h / mois", "40 h / mois", "À évaluer"] },
      { cle: "plages", label: "Plages de disponibilité attendues", type: "texte" },
      { cle: "canal", label: "Canal privilégié (téléphone, mail, WhatsApp…)", type: "texte" },
      { cle: "demarrage", label: "Démarrage souhaité", type: "choix", options: ["Dès que possible", "Sous 1 mois", "Sous 3 mois", "À définir"] },
      { cle: "vigilance", label: "Points de vigilance / confidentialité", type: "long" },
      { cle: "attentes", label: "Attentes particulières / points à traiter à la mise en service", type: "long" },
    ],
  },
  {
    cle: "synthese",
    titre: "Synthèse IDEAFORMA (après l'entretien)",
    interne: true,
    questions: [
      { cle: "formule_recommandee", label: "Formule recommandée", type: "choix", options: ["Essentiel", "Starter", "Confort", "Sérénité"] },
      { cle: "volume_retenu", label: "Volume horaire retenu / tâches prioritaires", type: "long" },
      { cle: "collaborateur_pressenti", label: "Collaborateur pressenti (secrétaire)", type: "texte" },
      { cle: "prochaine_etape", label: "Prochaine étape (démo, devis, relance…) et échéance", type: "texte" },
    ],
  },
];

/** Toutes les questions à plat (label par clé). */
export const QUESTIONS_PAR_CLE: Record<string, QuestionBesoin> = Object.fromEntries(
  SECTIONS_BESOINS.flatMap((s) => s.questions).flatMap((q) => [[q.cle, q], ...(q.precision ? [[q.precision.cle, { cle: q.precision.cle, label: `${q.label} — ${q.precision.label}`, type: "texte" as TypeQuestion }]] : [])])
);

export function libelleQuestion(cle: string): string {
  return QUESTIONS_PAR_CLE[cle]?.label || cle;
}

/** Texte lisible d'une réponse (tableau → liste, booléen → Oui/Non). */
export function reponseLisible(v: unknown): string {
  if (Array.isArray(v)) return v.map(String).filter(Boolean).join(", ");
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  if (v == null || v === "") return "";
  return String(v);
}

export function agrementsDe(besoins: Record<string, unknown> | null | undefined): Agrement[] {
  const a = besoins?.agrements_liste;
  const liste = Array.isArray(a)
    ? a.map((x) => (typeof x === "string" ? { nom: x } : (x as Agrement))).filter((x) => x && typeof x.nom === "string" && x.nom.trim())
    : [];
  // Héritage v10.4 : « lesquels » en texte libre → une ligne par agrément.
  if (!liste.length && typeof besoins?.agrements_detail === "string" && besoins.agrements_detail.trim()) {
    return besoins.agrements_detail.split(/[,;\n]/).map((n) => n.trim()).filter(Boolean).map((nom) => ({ nom }));
  }
  return liste;
}

export function demandesDe(besoins: Record<string, unknown> | null | undefined): DemandeParticuliere[] {
  const d = besoins?.demandes;
  if (!Array.isArray(d)) return [];
  return d
    .map((x) => (typeof x === "string" ? { titre: x } : (x as DemandeParticuliere)))
    .filter((x) => x && typeof x.titre === "string" && x.titre.trim());
}

/** Lignes [question, réponse] d'une section, sans les réponses vides. */
export function lignesSection(s: SectionBesoins, besoins: Record<string, unknown>): [string, string][] {
  const out: [string, string][] = [];
  for (const q of s.questions) {
    let r = reponseLisible(besoins[q.cle]);
    if (q.precision) {
      const p = reponseLisible(besoins[q.precision.cle]);
      if (p) r = `${r || "Oui"} — ${q.precision.label.toLowerCase()} : ${p}`;
    }
    if (q.cle === "agrements") {
      const ag = agrementsDe(besoins);
      if (ag.length) {
        out.push([q.label, `Oui — ${ag.map((a) => a.nom).join(", ")}`]);
        for (const a of ag) if (a.tarif) out.push([`Agrément ${a.nom}`, `Tarif particulier : ${a.tarif}`]);
        continue;
      }
    }
    if (r) out.push([q.label, r]);
  }
  return out;
}

/** Taux de remplissage (hors synthèse et demandes), pour la fiche client. */
export function tauxRemplissage(besoins: Record<string, unknown> | null | undefined): number {
  const qs = SECTIONS_BESOINS.filter((s) => !s.interne).flatMap((s) => s.questions);
  if (!besoins || !qs.length) return 0;
  const n = qs.filter((q) => reponseLisible(besoins[q.cle])).length;
  return Math.round((n / qs.length) * 100);
}
