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
      titre: "Article 2 — Durée, engagement et résiliation",
      texte: `2.1 SANS ENGAGEMENT — le contrat prend effet à la date de mise en service, pour un mois renouvelable tacitement. Chaque partie peut y mettre fin par email, avec un préavis d'un mois prenant effet à la fin du mois suivant.
2.2 AVEC ENGAGEMENT DE 12 MOIS — la remise de grille et la gratuité de la mise en service sont consenties EN CONTREPARTIE de cet engagement. Le Client s'engage fermement pour douze mensualités consécutives.
2.3 RÉSILIATION ANTICIPÉE DU FAIT DU CLIENT (ou résiliation par ${ed} pour manquement du Client) pendant l'engagement. Le Client est alors redevable, cumulativement :
(a) du RATTRAPAGE DE REMISE : la différence entre le tarif sans engagement et le tarif engagé, pour les seules mensualités déjà exécutées. Il ne s'agit pas d'une pénalité mais de la restitution d'un avantage tarifaire consenti en considération d'un engagement non tenu ;
(b) des FRAIS DE MISE EN SERVICE, au tarif en vigueur au jour de la souscription, lorsqu'ils ont été offerts au titre de l'engagement — pour le même motif ;
(c) d'une INDEMNITÉ FORFAITAIRE DE RÉSILIATION égale à CINQUANTE POUR CENT (50 %) des mensualités hors taxes restant à courir jusqu'au terme, au tarif engagé. Les parties conviennent expressément que ce taux représente une évaluation raisonnable du préjudice d'${ed} (perte de marge, coûts d'acquisition et d'installation non amortis, réorganisation du service de secrétariat), compte tenu du fait que la prestation cesse d'être fournie.
2.4 IMPUTATION ET NON-CUMUL — les sommes déjà versées au titre du forfait annuel payé en une fois s'imputent intégralement sur les montants dus au titre du 2.3 ; l'excédent éventuel est remboursé au Client dans les trente jours. Aucune autre indemnité n'est due au titre de la résiliation.
2.5 CAS OÙ AUCUNE INDEMNITÉ N'EST DUE — le 2.3 ne s'applique pas lorsque la résiliation résulte : d'un manquement d'${ed} à ses obligations, non réparé dans les trente jours d'une mise en demeure ; du refus par le Client d'une révision de prix (article 4) ou d'une modification substantielle des conditions générales d'utilisation ; d'un cas de force majeure durable. Dans ces hypothèses, le Client est remboursé au prorata des sommes payées d'avance.
2.6 CESSATION D'ACTIVITÉ — en cas de fermeture, de cession ou de cessation d'activité du Client avant le terme, les sommes dues au titre du 2.3 sont arrêtées à la date de cessation, SOUS RÉSERVE des dispositions d'ordre public applicables aux procédures collectives (sauvegarde, redressement, liquidation judiciaires), qui prévalent en toute hypothèse.
2.7 RÉDUCTION — si une juridiction estimait l'indemnité du 2.3 (c) manifestement excessive au sens de l'article 1231-5 du code civil, elle serait réduite sans que les autres stipulations du présent article en soient affectées.
2.8 APRÈS L'ENGAGEMENT — au terme des douze mois, le contrat se poursuit par tacite reconduction par périodes d'un mois, sans engagement, au tarif engagé, sauf dénonciation avec un mois de préavis.`,
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
      texte: `${ed} s'engage à des moyens raisonnables pour assurer la disponibilité du service (objectif 99 % hors maintenance planifiée annoncée) et la sauvegarde quotidienne des données. Les analyses assistées par intelligence artificielle sont des aides à la saisie que le Client doit vérifier avant émission de tout document. La responsabilité d'${ed}, toutes causes confondues, est limitée au montant des sommes effectivement payées par le Client au cours des douze derniers mois ; elle ne couvre pas les dommages indirects (perte de chiffre d'affaires, de clientèle, d'image). CES LIMITATIONS NE S'APPLIQUENT PAS en cas de faute lourde, de dol, de dommage corporel, d'atteinte à la confidentialité ou de manquement aux obligations de protection des données personnelles.`,
    },
    {
      titre: "Article 9 — Protection des données personnelles (article 28 du RGPD)",
      texte: `Le présent article vaut CONTRAT DE SOUS-TRAITANCE au sens de l'article 28.3 du règlement (UE) 2016/679 (« RGPD »). Il est complété par l'Accord de traitement des données annexé au contrat, qui en fait partie intégrante.
9.1 RÔLES — le Client est RESPONSABLE DU TRAITEMENT des données personnelles de ses propres clients et de ses interlocuteurs. ${ed} agit en qualité de SOUS-TRAITANT et ne traite ces données que pour le compte du Client.
9.2 OBJET, DURÉE, NATURE ET FINALITÉ — l'objet du traitement est la gestion des dossiers de sinistres automobiles du Client ; sa nature comprend la collecte, l'enregistrement, la consultation, la modification, l'extraction et la communication des données ; sa finalité est l'exécution du service souscrit (suivi des dossiers, édition et envoi des devis, factures, ordres de réparation, cessions de créance et procès-verbaux, relances, encaissements, agenda). La durée du traitement est celle du contrat, augmentée de la période de conservation prévue au 9.9.
9.3 TYPES DE DONNÉES ET PERSONNES CONCERNÉES — données d'identification et de contact (nom, prénom, adresse postale, téléphone, email), données relatives au véhicule (immatriculation, marque, modèle, numéro de série), données relatives au sinistre et à son indemnisation (rapport d'expertise, montants, assureur, numéro de contrat et de sinistre), données de facturation et de paiement. Personnes concernées : les clients du Client, ses interlocuteurs chez les assureurs et cabinets d'expertise, ses propres collaborateurs utilisateurs du service. Le Client s'interdit d'enregistrer dans le service des données relevant de l'article 9 du RGPD (données dites sensibles) ; les éventuelles données de santé figurant dans un rapport d'expertise ne doivent pas être saisies dans les champs libres.
9.4 INSTRUCTIONS ET TRANSFERTS — ${ed} ne traite les données que sur instruction documentée du Client, dont le contrat et l'usage du service constituent l'instruction initiale. Les données sont hébergées et traitées EXCLUSIVEMENT DANS L'UNION EUROPÉENNE ; aucun transfert hors de l'Union n'est réalisé sans instruction écrite préalable du Client et sans garanties appropriées. ${ed} informe le Client s'il estime qu'une instruction constitue une violation du RGPD.
9.5 CONFIDENTIALITÉ DES PERSONNES AUTORISÉES — ${ed} veille à ce que les personnes autorisées à traiter les données s'engagent à en respecter la confidentialité, soient formées et n'accèdent qu'aux données nécessaires à leurs missions, au moyen d'accès nominatifs.
9.6 SÉCURITÉ — ${ed} met en œuvre les mesures techniques et organisationnelles appropriées prévues à l'article 32 du RGPD : cloisonnement des données par compte, chiffrement des flux et des secrets, authentification individuelle, journalisation des accès, sauvegarde quotidienne, contrôle des habilitations et procédure de gestion des incidents.
9.7 SOUS-TRAITANCE ULTÉRIEURE — LE CLIENT EST INFORMÉ ET AUTORISE ${ed}, PAR AUTORISATION GÉNÉRALE ÉCRITE au sens de l'article 28.2 du RGPD, à faire intervenir sur son compte : (i) ses hébergeurs et prestataires techniques situés dans l'Union européenne ; (ii) DES COLLABORATEURS INDÉPENDANTS EXTERNES — secrétaires spécialisées, PRESTATAIRES ET NON SALARIÉS d'${ed} — chargés d'exécuter à distance le service de secrétariat souscrit. Ces collaborateurs sont sélectionnés par ${ed}, interviennent depuis leurs propres moyens et sont contractuellement tenus des MÊMES OBLIGATIONS que celles du présent article, dont ${ed} demeure pleinement responsable envers le Client. La liste des sous-traitants ultérieurs et l'identité du collaborateur affecté au compte sont communiquées au Client sur simple demande ; ${ed} l'informe de tout changement et le Client peut S'Y OPPOSER pour un motif légitime tenant à la protection des données, ${ed} lui proposant alors un autre collaborateur.
9.8 ASSISTANCE — ${ed} assiste le Client, compte tenu de la nature du traitement et par des mesures appropriées : pour répondre aux demandes d'exercice des droits des personnes concernées (accès, rectification, effacement, limitation, opposition, portabilité) ; pour garantir la sécurité, notifier les violations de données et réaliser, le cas échéant, une analyse d'impact et la consultation préalable de la CNIL. ${ed} NOTIFIE AU CLIENT toute violation de données le concernant DANS LES QUARANTE-HUIT (48) HEURES de sa connaissance, avec les éléments permettant au Client de procéder, s'il y a lieu, à sa propre notification dans le délai de soixante-douze heures qui lui incombe.
9.9 SORT DES DONNÉES EN FIN DE CONTRAT — au choix du Client exprimé au plus tard à la fin du contrat, ${ed} lui restitue l'intégralité des données dans un format exploitable (export complet depuis l'application) ou les supprime. À défaut de choix exprimé, les données restent exportables par le Client pendant QUATRE-VINGT-DIX (90) JOURS après la fin du contrat, puis sont supprimées, copies comprises, sauf obligation légale de conservation.
9.10 DOCUMENTATION ET AUDIT — ${ed} met à la disposition du Client toute information nécessaire pour démontrer le respect des obligations du présent article et permet la réalisation d'audits, y compris d'inspections, par le Client ou un auditeur qu'il mandate, une fois par an au plus, moyennant un préavis raisonnable, pendant les heures ouvrées et sans perturbation excessive de l'activité, aux frais du Client.
9.11 CONFIDENTIALITÉ — indépendamment des données personnelles, chaque partie garde confidentielles les informations de l'autre pendant la durée du contrat et trois ans après son terme.`,
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

export const VERSION_CGV = "v2.0 — août 2026";

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
