// ============================================================
//  CONTRATS DE COLLABORATION (v10.6) — modèles préremplis depuis la
//  fiche du collaborateur, MODIFIABLES avant signature :
//    · commercial  → contrat d'apporteur d'affaires (pack v1.3) ;
//    · secrétaire  → contrat de prestation de services (pack).
//  Le texte reprend mot pour mot les modèles du pack commercial
//  (docs/pack-commercial) ; les champs [entre crochets] sont remplis
//  avec la fiche (nom, adresse, SIRET, zone, portefeuille, taux…).
//  Le contenu complet est stocké dans collaborateur_documents.contenu :
//  le PDF se régénère à l'identique sans dépendre des paramètres.
// ============================================================

import { SOCIETE, ADRESSE_COMPLETE } from "@/components/vitrine/societe";
import { FORMULES, Parametres, tarifFormule } from "./economie";
import type { Collaborateur } from "./client";

export type ArticleContrat = { titre: string; texte: string };
export type TableContrat = { tete: string[]; lignes: string[][]; apresArticle: number };
export type ContenuContrat = {
  modele: "apporteur" | "prestation";
  version: string;
  lieu: string;
  date: string; // AAAA-MM-JJ
  sousTitre: string;
  blocEditeur: string;
  blocCollaborateur: string;
  intro: string;
  articles: ArticleContrat[];
  table?: TableContrat | null;
  annexeTitre: string;
  annexeTexte: string;
  avertissement: string;
};

export const VERSION_CONTRAT_APPORTEUR = "v1.3";
export const VERSION_CONTRAT_PRESTATION = "v1.0";

const eur = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString("fr-FR")} € HT`;
const ou = (v: string | null | undefined, defaut: string) => (v && v.trim() ? v.trim() : defaut);
export const nomComplet = (c: Pick<Collaborateur, "nom" | "prenom">) => [c.prenom, c.nom].filter(Boolean).join(" ");
export const dateJourIso = () => new Date().toISOString().slice(0, 10);
export const dateContratFr = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "[date]");

function blocEditeurDefaut(): string {
  return [SOCIETE.editeur, ADRESSE_COMPLETE, `SIRET ${SOCIETE.siret}`, SOCIETE.email, "représentée par son représentant légal"].join("\n");
}
function blocCollaborateurDefaut(c: Collaborateur, role: string): string {
  return [
    nomComplet(c) || "[Nom / prénom]",
    ou(c.adresse, "[adresse]"),
    c.siret ? `SIRET ${c.siret}` : "SIRET [__________]",
    [c.email, c.tel].filter(Boolean).join(" · "),
    role,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ====================================================================
   COMMERCIAL — contrat d'apporteur d'affaires (modèle du pack, v1.3)
==================================================================== */
export function contratApporteurDefaut(c: Collaborateur, p: Parametres): ContenuContrat {
  const t = FORMULES.map((f) => ({ f, tarif: tarifFormule(f, p), pf: p.formules[f] }));
  const lignes = t.map(({ tarif, pf }) => [
    `${pf.libelle.toUpperCase()} (${eur(tarif.mensuel)} / mois)`,
    eur(pf.primeSignature),
    eur(pf.bonusEngagement),
  ]);
  const echeanceAvec = p.primeMensualiteAvecEngagement;
  const echeanceSans = p.primeMensualiteSansEngagement;

  return {
    modele: "apporteur",
    version: VERSION_CONTRAT_APPORTEUR,
    lieu: "Neuilly-sur-Seine",
    date: dateJourIso(),
    sousTitre: `Contrat d'apporteur d'affaires — ${VERSION_CONTRAT_APPORTEUR}`,
    blocEditeur: blocEditeurDefaut(),
    blocCollaborateur: blocCollaborateurDefaut(c, "ci-après « l'Apporteur »"),
    intro:
      "IDEAFORMA, ci-après « IDEAFORMA » ou « le Mandant », et l'Apporteur, dont les coordonnées figurent ci-dessus, conviennent de ce qui suit.",
    articles: [
      {
        titre: "Article 1 — Objet",
        texte:
          "IDEAFORMA édite l'application My Easy Auto et propose aux professionnels de la réparation automobile un service de secrétariat à distance (ensemble, « les Services »). L'Apporteur s'engage, de manière indépendante, à rechercher et présenter à IDEAFORMA des garages susceptibles de souscrire aux Services, à les qualifier et à les accompagner jusqu'à la signature du devis. L'Apporteur n'a aucun pouvoir de conclure un contrat, de consentir une remise ou d'encaisser un paiement au nom d'IDEAFORMA.",
      },
      {
        titre: "Article 2 — Indépendance",
        texte:
          "L'Apporteur exerce en toute indépendance, sous son propre statut, avec ses propres moyens et son assurance responsabilité civile professionnelle, dont il remet l'attestation à la signature. Il organise librement son activité, ses horaires et ses déplacements et n'est soumis à aucun lien de subordination. Il peut exercer toute autre activité, sous réserve de l'article 8. Il déclare être à jour de ses obligations sociales et fiscales et le justifie sur demande (attestation de vigilance URSSAF tous les six mois).",
      },
      {
        titre: "Article 3 — Zone, portefeuille et déclaration des prospects",
        texte: [
          `3.1 Zone et portefeuille attribués. IDEAFORMA attribue à l'Apporteur une zone géographique et, le cas échéant, une liste de prospects (le « Portefeuille »), décrits en Annexe 1 et reproduits sur sa fiche dans l'espace éditeur. L'Apporteur prospecte exclusivement dans cette zone et ce Portefeuille ; un même garage ne peut être attribué qu'à un seul Apporteur. IDEAFORMA peut modifier la zone ou le Portefeuille avec un préavis d'un mois, sans effet sur les prospects déjà déclarés.`,
          "3.2 Déclaration. Un prospect est réputé apporté par l'Apporteur lorsqu'il a été déclaré dans son espace clients (fiche créée sur l'application, avec le SIREN du garage) ou sur la page myeasyauto.fr/vente avec son code apporteur, ou à défaut par email à contact@myeasyauto.fr. La date de création de la fiche fait foi. Le prospect déclaré est réservé à l'Apporteur pendant soixante (60) jours, renouvelables une fois sur justification d'un rendez-vous ; passé ce délai sans signature, il redevient libre.",
          "3.3 Exceptions au Portefeuille. Par exception à l'exclusivité de zone, l'Apporteur peut apporter un garage situé hors de sa zone ou dans le Portefeuille d'un autre Apporteur dans deux cas seulement : (a) il s'agit d'une CONNAISSANCE PERSONNELLE, c'est-à-dire un garage avec lequel il entretenait une relation antérieure à la signature du présent contrat ; (b) il a été RECOMMANDÉ DIRECTEMENT à ce garage par un client qu'il a lui-même apporté. Dans les deux cas, l'Apporteur mentionne l'exception et sa justification (nature du lien, nom du client recommandant) dans la fiche du prospect au moment de sa création ; à défaut de justification à la création, l'exception ne peut être invoquée. Tout autre apport hors zone requiert l'accord écrit préalable d'IDEAFORMA.",
          "3.4 Conflits. En cas de déclaration du même garage par deux Apporteurs, le prospect revient à celui qui l'a déclaré en premier ; si le second invoque une exception dûment justifiée à la création de sa fiche, IDEAFORMA tranche dans les dix jours, au vu des justifications, et sa décision s'impose aux deux Apporteurs. Un Apporteur qui démarche sciemment un garage attribué à un autre, ou qui invoque une exception inexacte, perd toute commission sur ce garage et s'expose à la résiliation du présent contrat pour faute.",
          "3.5 Validation. Le contrat conclu avec le garage n'est définitif qu'après validation par IDEAFORMA (création du compte), au plus tard sous cinq jours ouvrés ; IDEAFORMA peut refuser une vente non conforme à la grille, aux conditions de vente ou au présent article.",
        ].join("\n"),
      },
      {
        titre: "Article 4 — Rémunération",
        texte: [
          "L'Apporteur perçoit, pour chaque contrat signé par un prospect qu'il a apporté, la prime suivante, fixée forfaitairement par formule souscrite (85 % de la mensualité hors taxes de la grille en vigueur) :",
          `Prime : versée UNE seule fois par contrat. Elle est ACQUISE, lorsque le garage a souscrit un engagement de douze mois (ou payé l'année en une fois), dès l'encaissement par IDEAFORMA de la ${echeanceAvec === 1 ? "première mensualité (ou du forfait annuel)" : `${echeanceAvec}e mensualité`} ; en l'absence d'engagement, elle est acquise à l'encaissement de la ${echeanceSans}e mensualité, soit un différé de ${Math.max(0, echeanceSans - 1)} mois. Les remises prévues à la grille (engagement de douze mois, paiement annuel) ne réduisent pas la prime. Une remise exceptionnelle hors grille, qui ne peut être consentie qu'avec l'accord écrit d'IDEAFORMA, réduit la prime dans la même proportion, sans pouvoir être inférieure à ${eur(p.formules.essentiel.primeSignature)} pour ESSENTIEL ; le bonus engagement reste inchangé.`,
          "Bonus engagement : acquis avec la prime de signature lorsque le devis signé comporte un engagement de douze mois.",
          "Montée en formule : lorsqu'un garage apporté souscrit une formule supérieure dans les douze mois suivant sa signature, l'Apporteur perçoit 85 % de la différence entre les deux mensualités hors taxes, aux conditions de la prime.",
          "Bonus de volume : 255 € lorsque cinq contrats hors ESSENTIEL apportés par l'Apporteur ont été signés et ont donné lieu à un premier règlement au cours d'un même trimestre civil ; 680 € pour dix contrats. Ces deux bonus ne se cumulent pas.",
          "Les commissions sont exprimées hors taxes ; l'Apporteur y ajoute la TVA selon son régime. Aucune commission n'est due sur les heures hors forfait, les frais de mise en service ni les prestations ponctuelles.",
        ].join("\n"),
      },
      {
        titre: "Article 5 — Reprise et absence de commission",
        texte: `Si le garage résilie, cesse de payer, exerce un droit de rétractation ou obtient l'annulation de son contrat avant d'avoir réglé sa ${p.mensualitesReprise}e mensualité, la prime et le bonus engagement correspondants sont repris : IDEAFORMA les compense sur les commissions dues à l'Apporteur au titre des relevés suivants et, à défaut de compensation possible, l'Apporteur les rembourse sous trente jours de la demande. La reprise s'applique que le garage ait ou non réglé l'indemnité de résiliation anticipée prévue à son propre contrat. Aucune commission n'est due sur une vente refusée par IDEAFORMA, sur une vente obtenue au moyen d'une promesse non prévue par les documents commerciaux, ni lorsque l'Apporteur a encaissé un paiement en son nom ou omis de déclarer sous quarante-huit heures un règlement remis par le garage.`,
      },
      {
        titre: "Article 6 — Relevé et paiement",
        texte:
          "Avant le 5 de chaque mois, IDEAFORMA adresse à l'Apporteur un relevé des commissions acquises au cours du mois précédent, contrat par contrat. L'Apporteur émet sa facture sur la base de ce relevé ; IDEAFORMA la règle par virement à trente (30) jours date de facture. Toute contestation du relevé est formulée par écrit dans les quinze jours de sa réception.",
      },
      {
        titre: "Article 7 — Conduite commerciale",
        texte:
          "L'Apporteur présente les Services conformément aux documents commerciaux remis par IDEAFORMA (plaquette, plaquette tarifaire, kit de vente, contrat d'abonnement et conditions générales de vente, grille de commissions en vigueur). Il fait lire au garage les conditions particulières et les conditions générales avant signature, notamment le caractère ferme de l'engagement de douze mois. Il s'interdit toute promesse non prévue par ces documents, toute remise hors grille sans accord écrit d'IDEAFORMA, et tout encaissement en son nom : les paiements sont libellés à l'ordre d'IDEAFORMA ou versés sur son compte, et déclarés dans la vente. Il utilise exclusivement le compte de démonstration fourni par IDEAFORMA pour ses présentations et n'y saisit aucune donnée réelle d'un garage. Il n'a pas qualité pour engager IDEAFORMA ni pour signer en son nom.",
      },
      {
        titre: "Article 8 — Non-concurrence limitée et non-sollicitation",
        texte:
          "Pendant la durée du contrat et douze (12) mois après sa fin, l'Apporteur s'interdit de proposer aux garages qu'il a rencontrés ou déclarés dans le cadre du présent contrat un logiciel de gestion de sinistres ou un service de secrétariat concurrent des Services, et de solliciter les collaborateurs d'IDEAFORMA. Cette clause est limitée aux prospects et clients identifiés dans le cadre du contrat ; elle n'interdit pas à l'Apporteur d'exercer toute autre activité commerciale.",
      },
      {
        titre: "Article 9 — Confidentialité",
        texte:
          "Les informations relatives à IDEAFORMA (tarifs internes, marges, contrats collaborateurs, feuille de route de l'application, données des garages) sont confidentielles pendant la durée du contrat et trois ans après son terme. Le guide du commercial et ses annexes ne sont pas remis aux garages.",
      },
      {
        titre: "Article 10 — Durée et fin du contrat",
        texte:
          "Le contrat est conclu pour une durée indéterminée à compter de sa signature. Chaque partie peut y mettre fin à tout moment par email ou lettre recommandée, moyennant un préavis d'un mois. Les commissions acquises avant la fin du contrat restent dues ; les primes des contrats signés avant la fin du contrat restent dues si leur condition d'acquisition se réalise dans les trois mois suivant celle-ci. En cas de manquement grave (article 7 ou 8), IDEAFORMA peut résilier sans préavis par écrit motivé.",
      },
      {
        titre: "Article 11 — Droit applicable",
        texte:
          "Le présent contrat est soumis au droit français. Les parties rechercheront une solution amiable à tout différend ; à défaut, les tribunaux du ressort du siège d'IDEAFORMA sont compétents.",
      },
    ],
    table: { tete: ["Formule souscrite (mensualité HT de la grille)", "Prime (par garage signé)", "Bonus engagement 12 mois"], lignes, apresArticle: 3 },
    annexeTitre: "Annexe 1 — Zone et Portefeuille attribués à l'Apporteur",
    annexeTexte: [
      `Zone géographique : ${ou(c.zone, "______________________________________________")} .`,
      `Portefeuille : ${ou(c.portefeuille, "tous les garages de la zone")} .`,
      `Code apporteur : ${ou(c.code_apporteur, "attribué sur la fiche du commercial")} .`,
      "Exclusions : garages déjà clients d'IDEAFORMA ou attribués à un autre Apporteur.",
      "Cette annexe est reproduite sur la fiche du commercial dans l'espace éditeur (champs « Zone » et « Portefeuille »). Toute modification fait l'objet d'un email d'IDEAFORMA avec un mois de préavis (art. 3.1).",
    ].join("\n"),
    avertissement:
      "Modèle fourni à titre indicatif : ce document ne constitue pas un conseil juridique. Faites-le relire par un avocat ou un expert-comptable, notamment sur l'indépendance de l'Apporteur (absence de subordination), la clause de non-sollicitation et le régime de TVA applicable aux commissions.",
  };
}

/* ====================================================================
   SECRÉTAIRE — contrat de prestation de services (modèle du pack)
==================================================================== */
export function contratPrestationDefaut(c: Collaborateur, p: Parametres, garagesAffectes?: string[]): ContenuContrat {
  const taux = c.taux_horaire != null ? Number(c.taux_horaire) : 17;
  const exemples = FORMULES.filter((f) => p.formules[f].heures > 0)
    .map((f) => `forfait ${p.formules[f].libelle} (${p.formules[f].heures} h / mois) → ${eur(p.formules[f].heures * taux)} par garage et par mois`)
    .join(" ; ");

  return {
    modele: "prestation",
    version: VERSION_CONTRAT_PRESTATION,
    lieu: "Neuilly-sur-Seine",
    date: dateJourIso(),
    sousTitre: "Contrat de prestation de services — secrétariat externalisé, gestion de dossiers de sinistres automobiles",
    blocEditeur: blocEditeurDefaut(),
    blocCollaborateur: blocCollaborateurDefaut(c, "entrepreneur individuel (micro-entrepreneur), ci-après « le Prestataire »"),
    intro:
      "IDEA FORMA, ci-après « le Donneur d'ordre », et le Prestataire, dont les coordonnées figurent ci-dessus, conviennent de ce qui suit.",
    articles: [
      {
        titre: "Article 1 — Objet",
        texte: [
          "Le Donneur d'ordre confie au Prestataire des missions de secrétariat et de gestion administrative de dossiers de sinistres automobiles pour le compte des garages clients du Donneur d'ordre, réalisées au moyen de la plateforme My Easy Auto éditée par le Donneur d'ordre.",
          "Les missions comprennent notamment : création et suivi des dossiers, édition de devis et factures, envoi de documents en signature, relances des assurances, experts et clients, suivi des encaissements, gestion d'agenda et de planning, traitement du courrier électronique des garages affectés.",
        ].join("\n"),
      },
      {
        titre: "Article 2 — Indépendance du Prestataire",
        texte: [
          "Le Prestataire exécute les missions en toute indépendance, sans lien de subordination. Il organise librement son temps de travail et ses méthodes, sous réserve des délais de traitement convenus avec chaque garage (annexe 1) et des règles de qualité du guide du collaborateur.",
          "Le Prestataire demeure libre de développer sa propre clientèle et n'est tenu à aucune exclusivité. Il déclare être régulièrement immatriculé et assumer l'ensemble de ses obligations sociales et fiscales. Il s'engage à fournir chaque année une attestation de vigilance URSSAF.",
        ].join("\n"),
      },
      {
        titre: "Article 3 — Affectation des garages",
        texte:
          "Le Donneur d'ordre affecte au Prestataire un ou plusieurs garages clients, d'un commun accord et par écrit (annexe 1 mise à jour). Le Prestataire peut refuser une affectation. Le volume horaire indicatif correspond au forfait de secrétariat souscrit par chaque garage (heures PAR MOIS de la formule).",
      },
      {
        titre: "Article 4 — Rémunération",
        texte: [
          `Le Prestataire perçoit une rémunération forfaitaire par garage affecté, égale au nombre d'heures du forfait souscrit par ce garage multiplié par le taux horaire hors taxes fixé à l'annexe 1 (${taux.toLocaleString("fr-FR")} euros à la signature, révisable d'un commun accord par avenant). Elle est due pour chaque mensualité effectivement encaissée par le Donneur d'ordre auprès du garage ; les heures hors forfait validées par le garage sont rémunérées au même taux horaire. Le prix de vente pratiqué par le Donneur d'ordre, et les remises qu'il consent, sont sans incidence sur cette rémunération.`,
          `À titre indicatif à la date de signature : ${exemples}.`,
          "Le Prestataire adresse au Donneur d'ordre, au plus tard le 5 de chaque mois, une facture accompagnée du relevé d'heures par garage tenu dans la plateforme. Règlement par virement à 10 jours.",
        ].join("\n"),
      },
      {
        titre: "Article 5 — Qualité de service",
        texte: [
          "Le Prestataire s'engage à : traiter les demandes des garages affectés dans un délai d'un jour ouvré ; tenir à jour les dossiers dans la plateforme au fil de l'eau ; respecter le guide du collaborateur remis à la signature ; signaler sans délai toute difficulté (surcharge, absence, litige).",
          "En cas d'absence planifiée, le Prestataire prévient le Donneur d'ordre au moins 7 jours à l'avance afin d'organiser la continuité de service.",
        ].join("\n"),
      },
      {
        titre: "Article 6 — Confidentialité",
        texte:
          "Le Prestataire s'engage à une stricte confidentialité sur l'ensemble des informations des garages clients et de leurs propres clients (données personnelles, données financières, documents d'assurance), pendant toute la durée du contrat et 5 ans après son terme.",
      },
      {
        titre: "Article 7 — Protection des données (RGPD)",
        texte:
          "Pour les traitements réalisés pour le compte des garages via la plateforme, le Prestataire agit sur instruction du Donneur d'ordre au sens de l'article 28 du RGPD : il ne traite les données que pour l'exécution des missions, n'en fait aucune copie hors plateforme, utilise exclusivement son compte nominatif et informe sans délai le Donneur d'ordre de toute violation de données.",
      },
      {
        titre: "Article 8 — Moyens et outils",
        texte:
          "Le Donneur d'ordre fournit l'accès nominatif à la plateforme My Easy Auto, la formation initiale et les modèles de documents. Le Prestataire utilise son propre matériel informatique et sa propre connexion, et souscrit une assurance responsabilité civile professionnelle dont il justifie à la signature puis à chaque renouvellement.",
      },
      {
        titre: "Article 9 — Non-sollicitation",
        texte:
          "Pendant la durée du contrat et 12 mois après son terme, le Prestataire s'interdit de proposer directement ou indirectement, pour son compte ou celui d'un tiers, des services identiques ou similaires aux garages clients du Donneur d'ordre qui lui ont été affectés, sauf accord écrit préalable. Réciproquement, le Donneur d'ordre s'interdit de solliciter les clients propres du Prestataire.",
      },
      {
        titre: "Article 10 — Durée et résiliation",
        texte: [
          `Le contrat est conclu pour une durée indéterminée à compter du ${dateContratFr(c.date_debut || dateJourIso())}. Chaque partie peut y mettre fin par lettre recommandée ou e-mail avec accusé de réception, moyennant un préavis d'un mois. En cas de manquement grave (violation de confidentialité, abandon de mission…), la résiliation est immédiate après mise en demeure restée sans effet 8 jours.`,
          "Une période d'essai de 2 mois est convenue, pendant laquelle chaque partie peut rompre le contrat avec un préavis de 7 jours.",
        ].join("\n"),
      },
      {
        titre: "Article 11 — Responsabilité",
        texte:
          "Le Prestataire est responsable de la bonne exécution de ses missions. Sa responsabilité est limitée, toutes causes confondues, au montant des rémunérations perçues au cours des 6 derniers mois. Le Donneur d'ordre reste seul responsable de la plateforme et de la relation contractuelle avec les garages.",
      },
      {
        titre: "Article 12 — Litiges",
        texte:
          "Le présent contrat est soumis au droit français. Les parties rechercheront une solution amiable avant toute action ; à défaut, compétence est attribuée aux tribunaux de Nanterre.",
      },
    ],
    table: null,
    annexeTitre: "Annexe 1 — Garages affectés, volumes et taux horaire",
    annexeTexte: [
      `Taux horaire : ${taux.toLocaleString("fr-FR")} € HT / heure.`,
      garagesAffectes && garagesAffectes.length
        ? `Garages affectés à la signature :\n${garagesAffectes.map((g) => `· ${g}`).join("\n")}`
        : "Garages affectés à la signature : ______________________________________________",
      "Toute nouvelle affectation (ou fin d'affectation) est confirmée par email et reportée sur la fiche du collaborateur dans l'espace éditeur.",
    ].join("\n"),
    avertissement:
      "Modèle fourni à titre indicatif : ce document ne constitue pas un conseil juridique. Faites-le relire par un avocat avant utilisation, notamment sur la non-sollicitation et le RGPD.",
  };
}

/** Contenu par défaut selon le type de la fiche. */
export function contratDefaut(c: Collaborateur, p: Parametres, garagesAffectes?: string[]): ContenuContrat {
  return c.type === "commercial" ? contratApporteurDefaut(c, p) : contratPrestationDefaut(c, p, garagesAffectes);
}
export function titreContrat(modele: "apporteur" | "prestation"): string {
  return modele === "apporteur" ? "Contrat d'apporteur d'affaires" : "Contrat de prestation de services";
}
