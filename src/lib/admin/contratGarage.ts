// ============================================================
//  CONTRAT D'ABONNEMENT GARAGE + CGV (v10.0)
//
//  Texte UNIQUE, partagé par la page /vente (lecture avant signature), le
//  PDF du contrat et les documents du pack commercial. Il protège les deux
//  parties : le garage (droit de rétractation pro hors établissement art.
//  L221-3 C. conso, transparence des prix, réversibilité des données) et
//  IDEAFORMA (engagement ferme de 12 mois, mensualités dues, suspension
//  pour impayé, limitation de responsabilité, propriété intellectuelle).
//  ⚠️ Modèle à faire relire par un avocat avant les premières signatures.
// ============================================================

import { SOCIETE, ADRESSE_COMPLETE } from "@/components/vitrine/societe";
import { Formule, Parametres, Periodicite, prixVente, tarifFormule } from "./economie";

export type VenteContrat = {
  garage_nom: string;
  garage_siret?: string | null;
  garage_adresse?: string | null;
  garage_cp?: string | null;
  garage_ville?: string | null;
  contact_nom?: string | null;
  contact_fonction?: string | null;
  contact_email: string;
  contact_tel?: string | null;
  formule: Formule;
  engagement_12: boolean;
  periodicite: Periodicite;
  remise_supp_pct?: number | null;
  prix_mensuel_ht: number;
  montant_annuel_ht?: number | null;
  mise_en_service_ht?: number | null;
  mode_paiement: string;
  date_debut_souhaitee?: string | null;
  signataire_nom?: string | null;
  signataire_qualite?: string | null;
  code_apporteur?: string | null;
};

export const MODES_PAIEMENT: Record<string, string> = {
  virement: "Virement bancaire",
  prelevement: "Prélèvement SEPA mensuel",
  cheque: "Chèque à l'ordre d'IDEAFORMA",
  especes: "Espèces (reçu remis)",
  cb: "Carte bancaire (lien de paiement)",
};

const eur = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

/** Récapitulatif chiffré de l'abonnement (bloc « Conditions particulières »). */
export function conditionsParticulieres(v: VenteContrat, p: Parametres): string[] {
  const t = tarifFormule(v.formule, p);
  const engage = v.engagement_12 || v.periodicite === "annuel";
  const lignes = [
    `Formule souscrite : ${t.libelle}${t.heures ? ` — application + ${t.heures} h de secrétariat par mois` : " — application seule"}.`,
    `Prix catalogue : ${eur(t.mensuel)} HT par mois sans engagement.`,
  ];
  if (engage) lignes.push(`Engagement ferme de 12 mois : remise de ${t.remiseEngagementPct} % → ${eur(t.mensuelEngage)} HT par mois.`);
  else lignes.push("Sans engagement : résiliable à tout moment avec un préavis d'un mois (fin de mois).");
  if (Number(v.remise_supp_pct) > 0) lignes.push(`Remise commerciale exceptionnelle : ${v.remise_supp_pct} % (sous réserve de validation par IDEAFORMA).`);
  if (v.periodicite === "annuel") {
    lignes.push(
      `Paiement de l'année en une fois : ${eur(v.montant_annuel_ht)} HT (${t.bonusAnnuelLibelle}), soit 12 mois d'abonnement.`
    );
  } else {
    lignes.push(`Mensualité HT : ${eur(v.prix_mensuel_ht)} (TVA en sus au taux en vigueur), payable d'avance chaque mois.`);
  }
  lignes.push(
    engage
      ? `Mise en service (paramétrage, import, formation à distance) : offerte.`
      : `Mise en service (paramétrage, import, formation à distance) : ${eur(v.mise_en_service_ht ?? p.miseEnService)} HT, facturée une fois.`
  );
  lignes.push(`Heure de secrétariat hors forfait : ${eur(p.heureHorsForfait)} HT ; heures non consommées reportables à 50 % sur le mois suivant.`);
  lignes.push(`Mode de règlement : ${MODES_PAIEMENT[v.mode_paiement] || v.mode_paiement}.`);
  if (v.date_debut_souhaitee) lignes.push(`Date de mise en service souhaitée : ${new Date(v.date_debut_souhaitee).toLocaleDateString("fr-FR")}.`);
  return lignes;
}

/** Conditions générales de vente — un article par entrée {titre, texte}. */
export function articlesCGV(p: Parametres): { titre: string; texte: string }[] {
  const ed = SOCIETE.editeur;
  return [
    {
      titre: "Article 1 — Objet",
      texte: `${ed} (SIRET ${SOCIETE.siret}, ${ADRESSE_COMPLETE}) met à disposition du Client, professionnel de la réparation automobile, l'application en ligne ${SOCIETE.produit} (gestion des dossiers de sinistres, devis, factures, encaissements, documents) et, selon la formule, un service de secrétariat externalisé assuré par des collaborateurs indépendants sous la coordination d'${ed}. Le présent contrat est conclu entre professionnels ; le Client reconnaît souscrire pour les besoins de son activité.`,
    },
    {
      titre: "Article 2 — Durée, engagement et renouvellement",
      texte: `Le contrat prend effet à la date de mise en service. SANS ENGAGEMENT, il est conclu pour un mois renouvelable tacitement, résiliable par chaque partie à tout moment par email, avec un préavis d'un mois prenant effet à la fin du mois suivant. AVEC ENGAGEMENT DE 12 MOIS (remise consentie en contrepartie), le Client s'engage fermement pour douze mensualités consécutives : en cas de résiliation anticipée de son fait ou de résiliation par ${ed} pour manquement du Client, il est redevable de FRAIS DE RÉSILIATION ANTICIPÉE égaux à la totalité des mensualités hors taxes restant à courir jusqu'au terme de l'engagement, immédiatement exigibles à titre d'indemnité de résiliation (clause pénale), la remise ayant été accordée en considération de cet engagement ; la mise en service offerte au titre de l'engagement redevient en outre due au tarif en vigueur au jour de la souscription. Ces frais sont arrêtés à la date d'effet de la résiliation et font l'objet d'une facture de solde. Il en va de même en cas de FERMETURE, cession, ou cessation d'activité du Client avant le terme : la somme due est arrêtée à la date de cessation et immédiatement exigible, sous réserve des dispositions d'ordre public applicables aux procédures collectives (sauvegarde, redressement, liquidation), qui prévalent. Au terme des 12 mois, le contrat se poursuit par tacite reconduction par périodes d'un mois, sans engagement, au tarif engagé, sauf dénonciation avec un mois de préavis.`,
    },
    {
      titre: "Article 3 — Droit de rétractation",
      texte: `Conformément à l'article L221-3 du Code de la consommation, le Client professionnel qui emploie cinq salariés au plus et dont l'objet du contrat n'entre pas dans le champ de son activité principale bénéficie, lorsque le contrat est conclu hors établissement, d'un délai de rétractation de quatorze jours à compter de la signature, exercé par email à ${SOCIETE.email}. Le Client peut demander expressément la mise en service avant la fin de ce délai ; en cas de rétractation, il reste redevable du prix correspondant au service fourni jusqu'à la notification de sa décision. Les sommes déjà versées (mensualité, forfait annuel payé en une fois, mise en service) lui sont remboursées dans les quatorze jours de la notification, déduction faite de ce service déjà fourni. La vente rétractée est réputée n'avoir produit aucun effet à l'égard des tiers : elle n'ouvre droit à aucune commission d'apporteur d'affaires (article 11) et aucun frais de résiliation n'est dû.`,
    },
    {
      titre: "Article 4 — Prix et paiement",
      texte: `Les prix sont exprimés hors taxes ; la TVA est appliquée au taux en vigueur au jour de la facturation. Les mensualités sont payables d'avance, à réception de facture, par virement, prélèvement SEPA, chèque, espèces (dans la limite légale, contre reçu) ou carte bancaire. Un paiement remis au commercial ne libère le Client que s'il est établi à l'ordre d'${ed} (chèque) ou versé sur le compte d'${ed} (virement) ; le commercial n'est pas habilité à encaisser en son nom. Le paiement annuel en une fois donne droit à l'avantage indiqué aux conditions particulières et couvre douze mois ; il n'est pas remboursable en cas de résiliation anticipée du fait du Client. Tout retard de paiement entraîne de plein droit des pénalités au taux de trois fois l'intérêt légal et une indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 et D441-5 du Code de commerce). Les prix peuvent être révisés annuellement avec un préavis de deux mois ; le Client engagé conserve son tarif jusqu'au terme de l'engagement.`,
    },
    {
      titre: "Article 5 — Suspension pour impayé",
      texte: `À défaut de paiement d'une mensualité dans les quinze jours suivant une relance restée sans effet, ${ed} peut suspendre l'accès à l'application et le service de secrétariat jusqu'à régularisation, sans que le Client puisse prétendre à indemnité ; les mensualités continuent de courir pendant la suspension. Après trente jours d'impayé, ${ed} peut résilier le contrat aux torts du Client (art. 2). Les données du Client restent exportables pendant 90 jours après la fin du contrat.`,
    },
    {
      titre: "Article 6 — Mise en service et service de secrétariat",
      texte: `La mise en service comprend le paramétrage du compte, l'import des données transmises par le Client et une formation à distance. Le service de secrétariat est fourni dans la limite des heures incluses dans la formule, du lundi au vendredi aux horaires ouvrés ; les heures non consommées sont reportables à hauteur de 50 % sur le mois suivant ; les heures supplémentaires sont facturées au tarif hors forfait. Le secrétariat agit sur instruction du Client, qui reste seul responsable des décisions de gestion, des devis et des factures émis en son nom.`,
    },
    {
      titre: "Article 7 — Obligations du Client",
      texte: `Le Client fournit des informations exactes, conserve la confidentialité de ses identifiants, respecte la réglementation applicable à son activité et n'utilise pas le service à des fins illicites. Il est responsable des contenus qu'il enregistre. Il informe ${ed} de tout changement de coordonnées ou de situation (cession, cessation d'activité).`,
    },
    {
      titre: "Article 8 — Disponibilité et responsabilité",
      texte: `${ed} s'engage à des moyens raisonnables pour assurer la disponibilité du service (objectif 99 % hors maintenance planifiée annoncée) et la sauvegarde quotidienne des données. Les analyses assistées par intelligence artificielle sont des aides à la saisie que le Client doit vérifier avant émission de tout document. La responsabilité d'${ed}, toutes causes confondues, est limitée au montant des sommes effectivement payées par le Client au cours des douze derniers mois ; elle ne couvre pas les dommages indirects (perte de chiffre d'affaires, de clientèle, d'image).`,
    },
    {
      titre: "Article 9 — Données personnelles et confidentialité",
      texte: `Le Client est responsable du traitement des données de ses propres clients ; ${ed} agit comme sous-traitant au sens du RGPD, sur instruction du Client, avec des mesures de sécurité appropriées, et ne les utilise à aucune autre fin. Les données sont hébergées dans l'Union européenne. Chaque partie garde confidentielles les informations de l'autre partie pendant le contrat et trois ans après. À la fin du contrat, le Client exporte ses données depuis l'application (sauvegarde complète) ; ${ed} les supprime après 90 jours.`,
    },
    {
      titre: "Article 10 — Propriété intellectuelle",
      texte: `L'application, sa marque, son code et sa documentation restent la propriété exclusive d'${ed}. Le Client bénéficie d'un droit d'utilisation personnel, non exclusif et non cessible pour la durée du contrat. Toute reproduction, revente ou mise à disposition de tiers est interdite.`,
    },
    {
      titre: "Article 11 — Apporteur d'affaires",
      texte: `Le contrat peut être présenté par un apporteur d'affaires indépendant mandaté par ${ed}, identifié par son code apporteur. Il n'a pas qualité pour modifier les présentes conditions ni pour consentir des remises non prévues à la grille sans validation écrite d'${ed}. Le contrat n'est définitif qu'après confirmation par ${ed} (email de bienvenue et création du compte), au plus tard sous 5 jours ouvrés.`,
    },
    {
      titre: "Article 12 — Changement de formule",
      texte: `MONTÉE EN GAMME : le Client peut à tout moment passer à une formule supérieure, par simple demande écrite ; le changement prend effet le 1er jour du mois suivant (ou immédiatement, la différence de mensualité étant alors facturée au prorata). Le Client engagé conserve son engagement (même terme) et bénéficie de la remise d'engagement propre à la nouvelle formule. DESCENTE EN GAMME : sans engagement, le Client peut passer à une formule inférieure avec un préavis d'un mois (effet au 1er jour du mois suivant le préavis). Avec engagement de douze mois, la descente en gamme est possible au terme de l'engagement ou, avant ce terme, après six mensualités réglées ; l'engagement se poursuit alors jusqu'à son terme sur la nouvelle formule, au tarif engagé de celle-ci, sans indemnité. Les heures de secrétariat reportées non consommées sont perdues au changement de formule. Tout changement fait l'objet d'un avenant signé par les deux parties ; les données et documents du Client sont conservés quelle que soit la formule.`,
    },
    {
      titre: "Article 13 — Droit applicable et litiges",
      texte: `Le présent contrat est soumis au droit français. En cas de différend, les parties recherchent une solution amiable pendant trente jours ; à défaut, le tribunal de commerce de Nanterre est seul compétent, nonobstant pluralité de défendeurs ou appel en garantie. Version des CGV : ${VERSION_CGV}.`,
    },
  ];
}

export const VERSION_CGV = "v1.2 — août 2026";

/** Phrase d'acceptation cochée par le garage sur la page de vente. */
export const ACCEPTATION_CGV =
  "J'ai lu et j'accepte les conditions particulières ci-dessus et les conditions générales de vente. Je demande la mise en service dès validation par IDEAFORMA.";

/** Calcule les montants d'une vente à partir des paramètres (source unique). */
export function montantsVente(
  formule: Formule,
  engagement12: boolean,
  periodicite: Periodicite,
  remiseSupp: number,
  p: Parametres
) {
  return prixVente(formule, { engagement12, periodicite, remiseSupp }, p);
}
