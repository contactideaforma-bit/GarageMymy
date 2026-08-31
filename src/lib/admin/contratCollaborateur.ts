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
import { HORS_PERIMETRE, ProfilPrestation, libellesMateriel, lireProfil, perimetreConvenu } from "./tachesSecretaire";
import { DATE_TAUX, SEUILS, netAvantImpot, phraseBrutNet, regimeDe, tauxPrelevements } from "./remuneration";

export type ArticleContrat = { titre: string; texte: string };
export type TableContrat = { tete: string[]; lignes: string[][]; apresArticle: number };
export type ContenuContrat = {
  modele: "apporteur" | "prestation" | "avenant";
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
  /** Annexes 2, 3, 4… (v11.3). Ancien contenu sans ce champ : rendu inchangé. */
  annexes?: ArticleContrat[] | null;
  avertissement: string;
};

export const VERSION_CONTRAT_APPORTEUR = "v1.5";
export const VERSION_CONTRAT_PRESTATION = "v2.1";
export const VERSION_AVENANT_AFFECTATION = "v1.0";

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
          `3.1 Zone et portefeuille attribués. IDEAFORMA attribue à l'Apporteur une zone géographique et une LISTE PRÉDÉFINIE DE GARAGES à démarcher (le « Portefeuille »), décrits en Annexe 1 et reproduits sur sa fiche dans l'espace éditeur. L'Apporteur prospecte exclusivement dans cette zone et ce Portefeuille ; un même garage ne peut être attribué qu'à un seul Apporteur. IDEAFORMA peut modifier la zone ou le Portefeuille avec un préavis d'un mois, sans effet sur les prospects déjà déclarés.`,
          `3.1 bis Contrepartie de l'exclusivité — activité effective de démarchage. Le Portefeuille est confié à titre EXCLUSIF : pendant qu'il lui est attribué, aucun autre Apporteur ne peut démarcher ces garages. Cette exclusivité a pour contrepartie une activité réelle de démarchage. L'Apporteur reste entièrement libre d'organiser son temps et de cumuler cette activité avec toute autre occupation ; en revanche, un Portefeuille laissé inexploité prive IDEAFORMA de toute chance commerciale sur les garages concernés.
En conséquence, l'Apporteur DÉCLARE dans l'application, au fil de l'eau, les garages contactés et les rendez-vous obtenus. À défaut d'activité déclarée sur son Portefeuille pendant DEUX (2) MOIS consécutifs — aucun garage contacté, aucun rendez-vous, aucun prospect créé — IDEAFORMA lui adresse un point d'étape écrit. Si la situation perdure UN (1) MOIS après ce point, IDEAFORMA peut retirer tout ou partie du Portefeuille et le RÉATTRIBUER à un autre Apporteur, par notification écrite et sans indemnité.
Ce retrait ne met pas fin au contrat, qui se poursuit ; il n'emporte aucune sanction et ne prive l'Apporteur d'AUCUNE commission déjà acquise ni d'aucun prospect régulièrement déclaré et encore réservé au sens du 3.2. L'Apporteur peut se voir attribuer un nouveau Portefeuille ultérieurement, sans garantie de contenu ni de délai. Il ne peut être fixé à l'Apporteur ni horaire, ni quota de rendez-vous, ni obligation de résultat : seule l'absence TOTALE d'activité déclarée est visée par le présent article.`,
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
          "Rétractation : lorsque le contrat du garage est conclu hors établissement avec un professionnel de cinq salariés au plus, la prime n'est en tout état de cause acquise qu'après l'expiration du délai légal de rétractation de quatorze jours — y compris lorsque l'année est payée en une fois et encaissée immédiatement. Une vente rétractée n'ouvre droit à aucune commission ; une prime déjà réglée sur une vente rétractée est reprise dans les conditions de l'article 5.",
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
   SECRÉTAIRE — contrat de prestation de services (v2.0, v11.3)

   Réécrit après l'arbitrage du 31/08/2026 : PRIORITÉ À LA PRÉVENTION
   DE LA REQUALIFICATION en contrat de travail. Concrètement :
    · les tâches de l'annexe 2 sont un PÉRIMÈTRE CONVENU, pas des ordres ;
    · aucun horaire n'est imposé, aucun pouvoir disciplinaire n'existe ;
    · le taux est NÉGOCIÉ (art. 6), pas fixé unilatéralement ;
    · le matériel est celui DU PRESTATAIRE, déclaré par lui (annexe 3) ;
    · droit de refus explicite (art. 3) et faculté de remplacement (art. 2) ;
    · pas de période d'essai (notion salariale, et indice de requalification).
   Et, côté protection du Donneur d'ordre : confidentialité, RGPD art. 28,
   vigilance URSSAF (art. L8222-1 C. trav.), non-sollicitation, limitation
   de responsabilité, réversibilité, préavis gradué.
==================================================================== */
export function contratPrestationDefaut(c: Collaborateur, p: Parametres, garagesAffectes?: string[]): ContenuContrat {
  const taux = c.taux_horaire != null ? Number(c.taux_horaire) : 17;
  const profil: ProfilPrestation = lireProfil((c as { profil_prestation?: unknown }).profil_prestation);
  const regime = regimeDe(profil.regime);
  const net = netAvantImpot(taux, regime);
  const exemples = FORMULES.filter((f) => p.formules[f].heures > 0)
    .map((f) => `${p.formules[f].libelle} (${p.formules[f].heures} h / mois) → ${eur(p.formules[f].heures * taux)} par garage et par mois`)
    .join(" ; ");
  const perimetre = perimetreConvenu(profil);
  const materiel = libellesMateriel(profil);

  return {
    modele: "prestation",
    version: VERSION_CONTRAT_PRESTATION,
    lieu: "Neuilly-sur-Seine",
    date: dateJourIso(),
    sousTitre: "Contrat de prestation de services — secrétariat externalisé À DISTANCE, gestion de dossiers de sinistres automobiles",
    blocEditeur: blocEditeurDefaut(),
    blocCollaborateur: blocCollaborateurDefaut(c, "entrepreneur individuel indépendant, ci-après « le Prestataire »"),
    intro:
      "IDEA FORMA, ci-après « le Donneur d'ordre », et le Prestataire, dont les coordonnées figurent ci-dessus, conviennent de ce qui suit. Les parties rappellent que le Prestataire est un professionnel indépendant, immatriculé à son nom, qui exécute les prestations en toute autonomie et n'est lié au Donneur d'ordre par aucun contrat de travail.",
    articles: [
      {
        titre: "Article 1 — Objet du contrat",
        texte: [
          "Le Donneur d'ordre confie au Prestataire, qui l'accepte, des prestations de SECRÉTARIAT EXTERNALISÉ RÉALISÉES INTÉGRALEMENT À DISTANCE, portant sur la gestion administrative de dossiers de sinistres automobiles, au moyen de la plateforme My Easy Auto éditée par le Donneur d'ordre, au bénéfice des garages de carrosserie clients de ce dernier.",
          "Les prestations sont exécutées depuis le lieu de travail du Prestataire, qu'il choisit librement. AUCUNE présence dans les locaux d'un garage ou du Donneur d'ordre n'est requise, attendue ni organisée. Aucun déplacement n'entre dans le champ du contrat.",
          "Les prestations effectivement confiées sont limitativement énumérées à l'ANNEXE 2 (périmètre convenu). Toute prestation qui n'y figure pas est hors du présent contrat.",
        ].join("\n"),
      },
      {
        titre: "Article 2 — Indépendance du Prestataire",
        texte: [
          "Le Prestataire exerce une activité indépendante. Il organise librement son temps, ses méthodes et son lieu de travail. AUCUN horaire, AUCUNE plage de présence et AUCUN lieu d'exécution ne lui sont imposés : seuls comptent les délais de traitement convenus à l'annexe 2 et la qualité du résultat.",
          "Le Prestataire n'est soumis à aucun pouvoir de direction, de contrôle ni de sanction disciplinaire du Donneur d'ordre. Les échanges relatifs aux dossiers sont des demandes de prestation, non des instructions hiérarchiques.",
          "Le Prestataire n'est tenu à AUCUNE exclusivité : il conserve et développe librement sa propre clientèle et peut travailler pour tout autre donneur d'ordre, y compris concurrent, sous réserve de l'article 17.",
          "Le Prestataire peut se faire remplacer, à ses frais et sous sa responsabilité, par une personne de compétence équivalente, à charge pour lui d'en informer préalablement le Donneur d'ordre et de faire souscrire au remplaçant les mêmes engagements de confidentialité et de protection des données.",
          "Le Prestataire déclare être régulièrement immatriculé, assumer seul l'intégralité de ses obligations sociales et fiscales, et ne bénéficier d'aucun élément du statut salarié (congés payés, heures supplémentaires au sens du code du travail, préavis salarial, assurance chômage).",
        ].join("\n"),
      },
      {
        titre: "Article 3 — Périmètre convenu et droit de refus",
        texte: [
          "Le périmètre des prestations est arrêté d'un commun accord à l'ANNEXE 2, à partir d'un entretien préalable au cours duquel le Prestataire a indiqué les tâches qu'il accepte de prendre en charge. Ce périmètre ne peut être élargi que par accord écrit des deux parties.",
          "Le Prestataire est FONDÉ À REFUSER, sans que ce refus constitue un manquement contractuel ni un motif de résiliation à ses torts, toute demande qui : (i) ne figure pas à l'annexe 2 ; (ii) figure sur la liste des exclusions de l'annexe 2 ; (iii) est sans lien avec la plateforme My Easy Auto ou avec l'activité de carrosserie ; (iv) excède les limites de volume ou de disponibilité qu'il a déclarées à l'annexe 3 ; (v) suppose une présence physique ou un déplacement ; (vi) le placerait en infraction avec la loi, une réglementation professionnelle ou ses propres obligations de confidentialité.",
          "Le Prestataire informe le Donneur d'ordre de tout refus dans les meilleurs délais et en indique le motif. Le Donneur d'ordre fait son affaire de la réponse à apporter au garage concerné et garantit le Prestataire contre toute réclamation de ce dernier fondée sur un refus légitime.",
          "Le Prestataire s'interdit réciproquement d'accepter directement d'un garage une mission hors périmètre : toute demande de cette nature est renvoyée au Donneur d'ordre.",
        ].join("\n"),
      },
      {
        titre: "Article 4 — Affectation des garages — absence de garantie de volume",
        texte: [
          "Le Donneur d'ordre propose au Prestataire l'affectation d'un ou plusieurs garages clients. Chaque affectation, comme chaque fin d'affectation, fait l'objet d'un AVENANT écrit signé des deux parties (annexe 1 mise à jour). Le Prestataire est libre d'accepter ou de refuser une affectation.",
          "LE PRÉSENT CONTRAT NE GARANTIT AUCUN VOLUME D'HEURES NI AUCUN REVENU MINIMUM. Le volume dépend exclusivement du nombre de garages clients du Donneur d'ordre et des forfaits qu'ils souscrivent ; il est par nature variable et peut être nul. Le Prestataire, professionnel indépendant, déclare en avoir pleinement connaissance, ne pas placer le Donneur d'ordre en situation de dépendance économique et organiser son activité en conséquence.",
          "En conséquence, le Donneur d'ordre peut, s'il ne dispose pas d'un nombre de clients suffisant, cesser de proposer des affectations, réduire le volume proposé ou mettre fin au contrat dans les conditions de l'article 21, sans que cela ouvre droit à indemnité autre que le paiement des prestations exécutées et le respect du préavis.",
          "Fin d'affectation : lorsqu'un garage résilie, change de formule, suspend son abonnement ou cesse son activité, le Donneur d'ordre en informe le Prestataire dès qu'il en a connaissance et respecte un préavis de quinze (15) jours, sauf cessation immédiate imposée par le garage, impayé ou rétractation. La perte d'une affectation n'emporte pas résiliation du contrat, qui se poursuit pour les autres garages.",
        ].join("\n"),
      },
      {
        titre: "Article 5 — Continuité de service et absence prolongée",
        texte: [
          "Le Prestataire prévient le Donneur d'ordre de toute indisponibilité programmée au moins sept (7) jours à l'avance, et de toute indisponibilité imprévue sans délai, afin que la continuité du service due aux garages puisse être organisée.",
          "ABSENCE PROLONGÉE : lorsque le Prestataire est indisponible, pour quelque cause que ce soit, pendant une durée continue supérieure à DEUX (2) MOIS, le Donneur d'ordre peut réaffecter tout ou partie des garages qui lui étaient confiés à un autre prestataire, afin d'assurer la continuité du service. Cette réaffectation ne constitue ni une faute ni une rupture du contrat.",
          "À l'issue d'une telle absence, le Prestataire retrouve la faculté de se voir proposer des affectations, MAIS SANS AUCUNE GARANTIE de retrouver les mêmes garages, le même volume d'heures, ni un volume équivalent. Les affectations lui sont proposées en fonction des besoins alors existants.",
          "Le Prestataire peut, pendant son absence, proposer un remplaçant dans les conditions de l'article 2 ; le Donneur d'ordre ne peut refuser ce remplaçant que pour un motif objectif tenant à sa compétence ou à sa fiabilité.",
        ].join("\n"),
      },
      {
        titre: "Article 6 — Rémunération",
        texte: [
          `La rémunération du Prestataire résulte d'une NÉGOCIATION entre les parties, actée à l'ANNEXE 1. À la signature, le taux horaire convenu est de ${taux.toLocaleString("fr-FR")} euros hors taxes par heure. Il ne peut être modifié que par avenant signé des deux parties.`,
          `Le Prestataire est rémunéré, pour chaque garage affecté, sur la base du nombre d'heures du forfait de secrétariat souscrit par ce garage, multiplié par le taux horaire convenu. Le prix de vente pratiqué par le Donneur d'ordre auprès du garage, et les remises qu'il consent, sont sans incidence sur la rémunération du Prestataire.`,
          `À titre indicatif à la date de signature, et sous réserve des affectations effectives : ${exemples}.`,
          "⚠️ NATURE DE CETTE SOMME — " + phraseBrutNet(taux, regime),
          `Le Prestataire fait son affaire de sa situation au regard de la TVA. ${SEUILS.tvaFranchise.toLocaleString("fr-FR")} euros de chiffre d'affaires annuel constituent le seuil de la franchise en base : en deçà, la facture est établie sans TVA avec la mention « TVA non applicable, article 293 B du CGI » ; au-delà, la TVA s'ajoute au taux hors taxes convenu.`,
        ].join("\n"),
      },
      {
        titre: "Article 7 — Heures supplémentaires demandées par un garage",
        texte: [
          "Un garage peut souhaiter faire réaliser des prestations AU-DELÀ du forfait mensuel qu'il a souscrit. La procédure est la suivante, et elle est impérative :",
          "1° Le garage adresse sa demande AU DONNEUR D'ORDRE (et non directement au Prestataire), en précisant la nature des prestations et le volume souhaité.",
          "2° Le Donneur d'ordre consulte le Prestataire, qui est LIBRE D'ACCEPTER OU DE REFUSER, notamment au regard du volume maximum qu'il a déclaré à l'annexe 3. Un refus n'est pas un manquement.",
          "3° En cas d'accord, celui-ci est confirmé PAR ÉCRIT (email suffit) entre les trois parties AVANT l'exécution : volume autorisé, période, et rappel du taux applicable.",
          "4° Les heures supplémentaires sont rémunérées au Prestataire au MÊME taux horaire que le forfait, sauf accord différent formalisé par avenant.",
          "Aucune heure au-delà du forfait n'est due au Prestataire si elle a été exécutée SANS cet accord écrit préalable. Réciproquement, le Prestataire n'est jamais tenu d'exécuter des heures hors forfait qu'il n'a pas acceptées.",
          "Le relevé d'heures tenu dans la plateforme, qui mentionne pour chaque intervention sa durée et son objet, fait foi entre les parties pour le décompte du forfait et des heures supplémentaires.",
        ].join("\n"),
      },
      {
        titre: "Article 8 — Facturation et paiement",
        texte: [
          "Le Prestataire adresse au Donneur d'ordre, au plus tard le 5 de chaque mois, une facture conforme aux mentions légales, accompagnée du relevé d'heures par garage tenu dans la plateforme. Le Donneur d'ordre dispose de cinq (5) jours ouvrés pour contester une facture de façon motivée ; à défaut elle est réputée acceptée.",
          "Règlement par virement dans un délai de dix (10) jours à compter de la réception de la facture. Conformément aux articles L441-10 et D441-5 du code de commerce, tout retard de paiement entraîne de plein droit des pénalités au taux d'intérêt de la Banque centrale européenne majoré de dix points, ainsi qu'une indemnité forfaitaire de quarante (40) euros pour frais de recouvrement.",
          "Le Prestataire supporte seul ses frais d'exploitation (matériel, connexion, logiciels) ; aucun remboursement de frais n'est dû, sauf accord écrit préalable et sur justificatifs.",
        ].join("\n"),
      },
      {
        titre: "Article 9 — Obligations de qualité du Prestataire",
        texte: [
          "Le Prestataire est tenu d'une OBLIGATION DE MOYENS : il s'engage à mettre en œuvre, avec diligence et compétence, tous les moyens raisonnables pour la bonne exécution des prestations. Il traite les demandes des garages affectés dans un délai d'un (1) jour ouvré, tient les dossiers à jour au fil de l'eau, respecte les règles de gestion du guide du collaborateur, et signale sans délai toute difficulté (surcharge, absence, litige, anomalie sur un dossier).",
          "Le Prestataire n'engage jamais le garage ni le Donneur d'ordre au-delà des actes de gestion courante prévus à l'annexe 2. Il ne se présente en aucun cas comme salarié du garage ou du Donneur d'ordre.",
          "Le Prestataire signale immédiatement toute mention du rapport d'expertise de nature à interdire ou différer les travaux ou la facturation (expertise à titre conservatoire, sursis à travaux, procédure VGE, absence de règlement direct). Il ne procède de sa propre initiative à aucune correction de chiffrage.",
          "Le Prestataire renseigne dans la plateforme, au fil de l'eau, le temps passé et l'objet de chaque intervention.",
        ].join("\n"),
      },
      {
        titre: "Article 10 — Manquements répétés et réclamations d'un garage",
        texte: [
          "Le Donneur d'ordre est responsable, devant ses clients, de la qualité du service rendu. Lorsqu'un garage formule une réclamation écrite et circonstanciée mettant en cause l'exécution des prestations (erreurs répétées, retards, dossiers non tenus à jour, absence de réponse), la procédure suivante s'applique :",
          "1° Le Donneur d'ordre transmet la réclamation au Prestataire, par écrit et de façon documentée.",
          "2° Le Prestataire dispose de HUIT (8) JOURS pour présenter ses observations. Les parties recherchent ensemble la cause du manquement (périmètre mal défini, volume excessif, information manquante du garage) et les mesures correctives.",
          "3° En cas de NOUVEAU manquement de même nature dans les TROIS (3) MOIS suivants, ou de réclamations écrites émanant de DEUX garages différents dans la même période, le Donneur d'ordre peut mettre fin à l'affectation concernée (article 11) ou résilier le contrat dans les conditions de l'article 21.",
          "4° Si les manquements sont graves et répétés au point de compromettre la relation du Donneur d'ordre avec ses clients, la résiliation peut intervenir sans préavis après mise en demeure restée sans effet huit (8) jours.",
          "⚠️ Ces échanges constituent des CONSTATS D'EXÉCUTION du contrat d'entreprise, dans le respect du contradictoire. Ils ne sont ni des sanctions, ni des avertissements disciplinaires : le pouvoir disciplinaire est étranger au présent contrat et exclu par l'article 2.",
        ].join("\n"),
      },
      {
        titre: "Article 11 — Changement de prestataire à la demande d'un garage",
        texte: [
          "Un garage peut demander au Donneur d'ordre que ses dossiers soient confiés à un autre prestataire, pour quelque motif que ce soit, y compris de simple convenance. Le Donneur d'ordre reste seul juge de la suite à donner.",
          "S'il accepte, il en informe le Prestataire par écrit et met fin à l'affectation par AVENANT, moyennant un préavis de quinze (15) jours, sauf urgence tenant à la continuité du service ou manquement grave.",
          "Une telle fin d'affectation N'IMPLIQUE AUCUNE FAUTE du Prestataire et n'est pas mentionnée comme telle. Elle n'emporte pas résiliation du contrat, qui se poursuit pour les autres garages et pour les affectations à venir, sans garantie de volume (article 4).",
          "Le Prestataire assure la transmission ordonnée des dossiers en cours à son successeur, dans les conditions de l'article 23. Les prestations exécutées jusqu'à la date d'effet demeurent dues.",
        ].join("\n"),
      },
      {
        titre: "Article 12 — Confidentialité et secret des affaires",
        texte: [
          "Le Prestataire s'engage à une stricte confidentialité sur toute information dont il a connaissance à l'occasion du contrat : données des garages, de leurs clients, informations financières, documents d'assurance, savoir-faire, tarifs et fonctionnement de la plateforme.",
          "Cet engagement vaut pendant toute la durée du contrat et cinq (5) ans après son terme. Il s'étend aux informations protégées au titre du secret des affaires (articles L151-1 et suivants du code de commerce). Le Prestataire répond de ses éventuels remplaçants et préposés.",
        ].join("\n"),
      },
      {
        titre: "Article 13 — Protection des données personnelles (RGPD)",
        texte: [
          "Les garages clients sont responsables des traitements de données personnelles réalisés dans la plateforme. Le Donneur d'ordre agit en qualité de sous-traitant. Le Prestataire intervient en qualité de SOUS-TRAITANT ULTÉRIEUR au sens de l'article 28.4 du RGPD, avec l'autorisation écrite des garages concernés.",
          "À ce titre, le Prestataire : ne traite les données que sur instruction documentée et pour la seule exécution des prestations de l'annexe 2 ; n'en réalise aucune copie, export ou traitement hors de la plateforme, sauf demande expresse et tracée ; utilise exclusivement l'accès qui lui est ouvert et ne le partage avec personne ; met en œuvre des mesures de sécurité appropriées (poste verrouillé, mots de passe robustes, session fermée, matériel non partagé, connexion sécurisée — le travail à distance impliquant une vigilance particulière) ; ne transfère aucune donnée hors de l'Union européenne.",
          "Le Prestataire notifie au Donneur d'ordre toute violation de données dans les VINGT-QUATRE (24) HEURES de sa connaissance, et l'assiste dans les demandes d'exercice de droits, les analyses d'impact et les notifications à la CNIL. À la fin du contrat, il supprime toute donnée éventuellement détenue hors plateforme et en atteste par écrit.",
          "Le Donneur d'ordre peut vérifier le respect de ces obligations, après préavis raisonnable et sans perturbation excessive de l'activité du Prestataire.",
        ].join("\n"),
      },
      {
        titre: "Article 14 — Moyens du Prestataire",
        texte: [
          "Le Prestataire exécute les prestations avec SES PROPRES MOYENS, dont il est seul propriétaire ou détenteur, et qu'il déclare à l'ANNEXE 3. Il en assure l'entretien, la sécurité, la mise à jour et le remplacement à ses frais, et demeure SEUL RESPONSABLE de leur bon fonctionnement.",
          "Le travail étant réalisé à distance, le Prestataire garantit disposer d'une connexion et d'un poste de travail permettant l'exécution normale des prestations. Une panne, une perte de données ou une indisponibilité de son matériel ou de sa connexion ne suspend pas ses obligations : il lui appartient de prévoir une solution de repli et d'en informer sans délai le Donneur d'ordre.",
          "Le Donneur d'ordre ne met à disposition ni matériel, ni local, ni ligne téléphonique : il fournit uniquement l'accès à la plateforme My Easy Auto, la documentation et une formation initiale à l'outil, nécessaires à l'interopérabilité des prestations.",
        ].join("\n"),
      },
      {
        titre: "Article 15 — Assurance",
        texte:
          "Le Prestataire souscrit et maintient, pendant toute la durée du contrat, une assurance de responsabilité civile professionnelle couvrant les conséquences pécuniaires de sa responsabilité du fait de ses prestations. Il en justifie à la signature puis à chaque échéance annuelle, et informe le Donneur d'ordre de toute résiliation ou modification substantielle de garantie. Le défaut d'assurance constitue un manquement grave au sens de l'article 21.",
      },
      {
        titre: "Article 16 — Conformité sociale et fiscale — obligation de vigilance",
        texte: [
          "Le Prestataire atteste sur l'honneur que les prestations sont réalisées par des personnes régulièrement employées ou par lui-même, au sens des articles L8221-1 et L8221-5 du code du travail.",
          "En application de l'article L8222-1 du code du travail, le Prestataire remet au Donneur d'ordre, à la signature puis TOUS LES SIX (6) MOIS jusqu'à la fin du contrat : une ATTESTATION DE VIGILANCE URSSAF de moins de six mois, et un justificatif d'immatriculation (extrait K, avis de situation SIRENE ou équivalent). Il informe le Donneur d'ordre sans délai de toute radiation, cessation d'activité ou perte de son immatriculation.",
          "⚠️ CONSÉQUENCES DU DÉFAUT — le Donneur d'ordre engage sa propre responsabilité solidaire s'il fait appel à un prestataire non à jour. En conséquence : à défaut de remise des pièces dans les quinze (15) jours d'une mise en demeure, le Donneur d'ordre SUSPEND de plein droit les affectations en cours et le paiement des factures non encore échues ; si la situation n'est pas régularisée dans les TRENTE (30) JOURS suivant cette mise en demeure, le contrat est RÉSILIÉ DE PLEIN DROIT, sans préavis ni indemnité, par simple notification écrite.",
          "Il en va de même si l'attestation révèle que le Prestataire n'est pas à jour de ses cotisations sociales et qu'il ne justifie pas, dans le même délai, d'un plan d'apurement accepté par l'organisme.",
        ].join("\n"),
      },
      {
        titre: "Article 17 — Non-sollicitation et non-contournement",
        texte: [
          "Pendant la durée du contrat et pendant DOUZE (12) MOIS après son terme, le Prestataire s'interdit de proposer ou fournir, directement ou par personne interposée, des prestations de même nature aux garages qui lui ont été affectés en exécution du présent contrat, sauf accord écrit préalable du Donneur d'ordre.",
          "⚠️ NON-CONTOURNEMENT — cette interdiction s'applique Y COMPRIS lorsque l'initiative vient du garage. Si un garage propose au Prestataire de travailler directement pour lui, à quelque titre que ce soit (prestation, contrat de travail, mise à disposition, société interposée), le Prestataire doit REFUSER et en informer sans délai le Donneur d'ordre. Toute mise en relation commerciale avec un garage passe par le Donneur d'ordre.",
          "Cette clause, limitée aux seuls garages effectivement affectés, à douze mois et au territoire français, ne fait pas obstacle à la poursuite et au développement de l'activité du Prestataire auprès de tout autre client : il ne s'agit PAS d'une clause de non-concurrence.",
          "En cas de manquement, le Prestataire devra au Donneur d'ordre une indemnité égale à six (6) mois de rémunération perçue au titre du garage concerné, sans préjudice de la réparation d'un préjudice supérieur.",
          "Réciproquement, le Donneur d'ordre s'interdit de solliciter les clients propres du Prestataire dont il aurait connaissance.",
        ].join("\n"),
      },
      {
        titre: "Article 18 — Propriété des livrables et des données",
        texte:
          "Les dossiers, documents, modèles et données produits ou renseignés dans la plateforme dans le cadre des prestations appartiennent aux garages clients et, pour ce qui concerne la plateforme, au Donneur d'ordre. Le Prestataire ne détient aucun droit sur la plateforme, sa documentation ou ses modèles, et s'interdit de les reproduire, adapter ou diffuser. Il conserve en revanche l'entière propriété de ses propres méthodes et outils.",
      },
      {
        titre: "Article 19 — Responsabilité",
        texte: [
          "Chaque partie répond des dommages causés par sa faute prouvée. LA RESPONSABILITÉ DU PRESTATAIRE PEUT ÊTRE MISE EN CAUSE EN CAS DE MANQUEMENT À SON OBLIGATION DE MOYENS, telle que définie à l'article 9, ainsi qu'en cas de défaillance des moyens matériels dont il a la charge au titre de l'article 14.",
          "La responsabilité du Prestataire est limitée, toutes causes confondues et par année contractuelle, au montant total des rémunérations qu'il a perçues au cours des six (6) derniers mois, sauf faute lourde, dol, atteinte à la confidentialité ou violation des obligations de protection des données.",
          "Le Donneur d'ordre demeure seul responsable de la plateforme, de sa disponibilité et de la relation contractuelle avec les garages. Le Prestataire ne répond ni des choix techniques des garages, ni de l'exactitude des rapports d'expertise, ni des décisions prises par le garage sur ses informations d'ordre administratif.",
        ].join("\n"),
      },
      {
        titre: "Article 20 — Durée et reconduction",
        texte: [
          `Le contrat prend effet le ${dateContratFr(c.date_debut || dateJourIso())} et est conclu pour une durée initiale d'UN (1) MOIS.`,
          "Il se reconduit ensuite TACITEMENT, de mois en mois, sauf dénonciation par l'une des parties dans les conditions de l'article 21. Cette reconduction traduit la volonté commune de poursuivre la collaboration ; à défaut d'accord sur sa poursuite, le contrat prend fin de plein droit au terme de la période en cours.",
          "IL N'EST PAS PRÉVU DE PÉRIODE D'ESSAI : le présent contrat étant un contrat d'entreprise entre professionnels indépendants, cette notion, propre au contrat de travail, est sans objet.",
        ].join("\n"),
      },
      {
        titre: "Article 21 — Résiliation",
        texte: [
          "Chaque partie peut mettre fin au contrat par lettre recommandée avec accusé de réception ou courrier électronique avec accusé de réception, moyennant un préavis de : quinze (15) jours pendant les six premiers mois de relation ; un (1) mois de six mois à deux ans de relation ; deux (2) mois au-delà de deux ans. Ce préavis gradué tient compte de l'ancienneté de la relation commerciale au sens de l'article L442-1, II du code de commerce.",
          "Pendant le préavis, les affectations en cours se poursuivent aux conditions habituelles et les prestations exécutées restent dues.",
          "RÉSILIATION IMMÉDIATE, sans préavis ni indemnité, en cas de manquement grave : violation de la confidentialité ou des obligations de protection des données ; contournement au sens de l'article 17 ; abandon de mission ; défaut d'assurance (article 15) ; défaut de mise à jour sociale ou d'attestation de vigilance dans les conditions de l'article 16 ; manquements répétés constatés selon l'article 10 ; comportement portant atteinte à l'image du Donneur d'ordre ou d'un garage. La résiliation intervient après mise en demeure restée sans effet huit (8) jours, sauf urgence ou manquement insusceptible de régularisation.",
          "Le contrat prend fin de plein droit en cas de cessation d'activité, de radiation, de liquidation judiciaire d'une partie, ou de perte par le Prestataire de son immatriculation.",
        ].join("\n"),
      },
      {
        titre: "Article 22 — Force majeure",
        texte:
          "Aucune partie n'est responsable d'un manquement dû à un cas de force majeure au sens de l'article 1218 du code civil. La partie empêchée en informe l'autre sans délai. Si l'empêchement dure plus de deux (2) mois, chaque partie peut résilier le contrat par écrit, sans indemnité, les prestations exécutées restant dues. Une panne du matériel ou de la connexion du Prestataire ne constitue pas un cas de force majeure (article 14).",
      },
      {
        titre: "Article 23 — Fin du contrat et réversibilité",
        texte:
          "À la fin du contrat, quelle qu'en soit la cause, le Prestataire : achève ou transmet les dossiers en cours selon les instructions du Donneur d'ordre ; restitue ou détruit tout document et toute donnée en sa possession ; cesse tout accès à la plateforme. Il apporte, pendant le préavis, une assistance raisonnable à la reprise de ses dossiers par le Donneur d'ordre ou par un autre prestataire. Les articles 12, 13, 17, 18 et 19 survivent à la fin du contrat.",
      },
      {
        titre: "Article 24 — Dispositions générales",
        texte: [
          "Le contrat, ses annexes et les avenants signés expriment l'intégralité de l'accord des parties et remplacent tout échange antérieur. Toute modification requiert un écrit signé des deux parties.",
          "Si une stipulation est jugée nulle ou inapplicable, les autres demeurent en vigueur et les parties lui substituent une stipulation valide d'effet équivalent.",
          "Le fait pour une partie de ne pas se prévaloir d'un manquement ne vaut pas renonciation à s'en prévaloir ultérieurement.",
          "Le contrat est conclu intuitu personae : il ne peut être cédé sans l'accord écrit de l'autre partie, sauf transmission par le Donneur d'ordre à une société de son groupe ou en cas de cession de son fonds.",
        ].join("\n"),
      },
      {
        titre: "Article 25 — Droit applicable et règlement des litiges",
        texte:
          "Le contrat est soumis au droit français. En cas de différend, les parties s'engagent à rechercher une solution amiable pendant trente (30) jours à compter de la première notification écrite, le cas échéant en recourant à un médiateur désigné d'un commun accord. À défaut d'accord, compétence expresse est attribuée au tribunal de commerce de Nanterre, y compris en cas de pluralité de défendeurs ou d'appel en garantie.",
      },
    ],
    table: null,
    annexeTitre: "Annexe 1 — Garages affectés, volume indicatif et taux horaire",
    annexeTexte: [
      `Taux horaire convenu : ${taux.toLocaleString("fr-FR")} € HT par heure (revenu BRUT du Prestataire — voir annexe 4).`,
      garagesAffectes && garagesAffectes.length
        ? `Garages affectés à la signature :\n${garagesAffectes.map((g) => `· ${g}`).join("\n")}`
        : "Garages affectés à la signature : AUCUN à ce jour. Les affectations seront proposées au fur et à mesure et feront chacune l'objet d'un avenant.",
      "Rappel : le volume d'heures dépend du nombre de garages clients et des forfaits souscrits. Il n'est ni garanti, ni minimal (article 4).",
      "Toute affectation ou fin d'affectation est constatée par un avenant signé des deux parties, qui met à jour la présente annexe.",
    ].join("\n"),
    annexes: [
      {
        titre: "Annexe 2 — Périmètre convenu des prestations",
        texte: [
          "Les prestations suivantes ont été convenues d'un commun accord lors de l'entretien préalable. Elles seules entrent dans le champ du contrat.",
          perimetre.length
            ? perimetre.map((f) => `▸ ${f.titre}\n${f.lignes.map((l) => `   · ${l}`).join("\n")}`).join("\n")
            : "▸ Périmètre à compléter lors de l'entretien préalable (aucune tâche cochée à ce jour).",
          "",
          "EXCLUSIONS — prestations jamais confiées, que le Prestataire est fondé à refuser (article 3) :",
          HORS_PERIMETRE.map((h) => `   · ${h}`).join("\n"),
          "",
          "Délai de traitement convenu : un (1) jour ouvré pour les demandes courantes des garages affectés, sauf urgence signalée et acceptée.",
        ].join("\n"),
      },
      {
        titre: "Annexe 3 — Moyens, disponibilités et limites déclarés par le Prestataire",
        texte: [
          "Le Prestataire déclare disposer, en propre, des moyens suivants pour l'exécution des prestations :",
          materiel.length ? materiel.map((m) => `   · ${m}`).join("\n") : "   · à compléter lors de l'entretien préalable",
          "",
          `Disponibilités annoncées par le Prestataire : ${profil.disponibilites && profil.disponibilites.trim() ? profil.disponibilites.trim() : "à compléter — le Prestataire organise librement son temps ; ces indications servent uniquement à la bonne information des garages."}`,
          `Volume maximum accepté, toutes affectations confondues : ${profil.heures_max_mois ? `${profil.heures_max_mois} h / mois` : "à convenir"}.`,
          `Limites posées par le Prestataire : ${profil.limites && profil.limites.trim() ? profil.limites.trim() : "néant à ce jour"}.`,
          `Contraintes portées à la connaissance du Donneur d'ordre : ${profil.contraintes && profil.contraintes.trim() ? profil.contraintes.trim() : "néant à ce jour"}.`,
          "",
          "Ces déclarations émanent du Prestataire et bornent les demandes qui peuvent lui être adressées (article 3). Elles ne constituent ni un horaire de travail, ni un engagement de disponibilité permanente.",
          `Assurance RC professionnelle : ${profil.rc_pro && profil.rc_pro.trim() ? profil.rc_pro.trim() : "attestation à fournir à la signature"}.`,
          `Dernière attestation de vigilance URSSAF remise le : ${profil.vigilance_le && profil.vigilance_le.trim() ? dateContratFr(profil.vigilance_le) : "__________"}.`,
        ].join("\n"),
      },
      {
        titre: "Annexe 4 — Nature de la rémunération : ce que « HT » veut dire ici",
        texte: [
          "Cette annexe lève une ambiguïté fréquente. HT et TTC qualifient une FACTURE (c'est une question de TVA). BRUT et NET qualifient un REVENU (c'est une question de cotisations).",
          "",
          `· Le taux convenu de ${taux.toLocaleString("fr-FR")} € HT par heure est le REVENU BRUT du Prestataire, c'est-à-dire son chiffre d'affaires.`,
          "· Le Donneur d'ordre ne pratique AUCUNE retenue à la source : il verse l'intégralité du montant facturé.",
          "· Le Prestataire acquitte ensuite lui-même ses cotisations sociales, puis son impôt sur le revenu.",
          "",
          `Régime déclaré par le Prestataire : ${regime.libelle}. Prélèvements sociaux applicables : ${tauxPrelevements(regime).toLocaleString("fr-FR")} % du chiffre d'affaires (taux constatés au ${DATE_TAUX}, fixés par la loi et susceptibles d'évoluer).`,
          `Revenu NET avant impôt correspondant : environ ${net.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € par heure facturée.`,
          "",
          "Cette estimation est fournie à titre d'information, pour que le Prestataire mesure exactement ce qu'il percevra. Elle n'engage pas le Donneur d'ordre. Le guide « Déclarer mes revenus de collaborateur indépendant », remis avec le présent contrat, détaille les démarches.",
        ].join("\n"),
      },
    ],
    avertissement:
      "Modèle établi avec soin mais fourni à titre indicatif : il ne constitue pas un conseil juridique. Faites-le relire par un avocat avant utilisation, en particulier sur la prévention de la requalification en contrat de travail (indépendance réelle, absence de subordination), la clause de non-sollicitation, le préavis de rupture et les obligations de sous-traitance RGPD.",
  };
}

/* ====================================================================
   AVENANT D'AFFECTATION (v11.3) — un par garage confié ou retiré.
   C'est la pièce qui matérialise l'accord des deux parties sur le
   périmètre réel : sans elle, l'affectation ressemble à une affectation
   unilatérale de personnel (indice de subordination).
==================================================================== */
export function avenantAffectationDefaut(
  c: Collaborateur,
  p: Parametres,
  garage: string,
  sens: "affectation" | "fin",
  opts?: { formule?: string | null; heures?: number | null; dateEffet?: string | null; motif?: string | null }
): ContenuContrat {
  const taux = c.taux_horaire != null ? Number(c.taux_horaire) : 17;
  const profil = lireProfil((c as { profil_prestation?: unknown }).profil_prestation);
  const regime = regimeDe(profil.regime);
  const heures = opts?.heures ?? null;
  const effet = opts?.dateEffet || dateJourIso();
  const entree = sens === "affectation";
  const brutMois = heures ? Math.round(heures * taux * 100) / 100 : null;

  return {
    modele: "avenant",
    version: VERSION_AVENANT_AFFECTATION,
    lieu: "Neuilly-sur-Seine",
    date: dateJourIso(),
    sousTitre: entree
      ? `Avenant d'affectation — ${garage}`
      : `Avenant de fin d'affectation — ${garage}`,
    blocEditeur: blocEditeurDefaut(),
    blocCollaborateur: blocCollaborateurDefaut(c, "entrepreneur individuel indépendant, ci-après « le Prestataire »"),
    intro: `Le présent avenant complète le contrat de prestation de services conclu entre les parties le ${dateContratFr(c.date_debut)}. Toutes les stipulations du contrat non modifiées par le présent avenant demeurent applicables.`,
    articles: entree
      ? [
          {
            titre: "Article 1 — Garage affecté",
            texte: [
              `Le Donneur d'ordre propose au Prestataire, qui l'accepte expressément par sa signature, l'affectation du garage suivant : ${garage}.`,
              opts?.formule ? `Formule de secrétariat souscrite par ce garage : ${opts.formule}.` : "",
              heures ? `Volume indicatif : ${heures} h / mois, correspondant au forfait souscrit par ce garage.` : "Volume indicatif : selon le forfait souscrit par ce garage.",
              `Date d'effet : ${dateContratFr(effet)}.`,
            ].filter(Boolean).join("\n"),
          },
          {
            titre: "Article 2 — Rémunération de cette affectation",
            texte: [
              `La rémunération est calculée au taux horaire convenu au contrat, soit ${taux.toLocaleString("fr-FR")} € HT par heure.`,
              brutMois ? `Soit, pour le volume indicatif ci-dessus : ${eur(brutMois)} par mois, en revenu BRUT (chiffre d'affaires du Prestataire).` : "",
              brutMois ? `Revenu NET avant impôt estimé : environ ${netAvantImpot(brutMois, regime).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € par mois (régime ${regime.libelle}, ${tauxPrelevements(regime).toLocaleString("fr-FR")} % de prélèvements au ${DATE_TAUX}).` : "",
              "Ce volume est indicatif et non garanti : il suit le forfait effectivement souscrit par le garage et les mensualités effectivement encaissées par le Donneur d'ordre (article 4 du contrat).",
            ].filter(Boolean).join("\n"),
          },
          {
            titre: "Article 3 — Périmètre",
            texte:
              "Les prestations réalisées pour ce garage restent strictement limitées au périmètre convenu à l'annexe 2 du contrat. Le Prestataire est fondé à refuser toute demande hors de ce périmètre, dans les conditions de l'article 3 du contrat, sans que ce refus lui soit opposable.",
          },
        ]
      : [
          {
            titre: "Article 1 — Fin d'affectation",
            texte: [
              `L'affectation du garage ${garage} prend fin le ${dateContratFr(effet)}.`,
              opts?.motif ? `Motif : ${opts.motif}.` : "Motif : fin de l'abonnement du garage, changement de formule ou réorganisation du portefeuille.",
              "Cette fin d'affectation n'emporte pas résiliation du contrat de prestation, qui se poursuit pour les autres garages affectés et pour les affectations à venir.",
            ].join("\n"),
          },
          {
            titre: "Article 2 — Prestations et rémunération dues",
            texte:
              "Les prestations exécutées jusqu'à la date d'effet demeurent dues et sont facturées dans les conditions de l'article 8 du contrat. Le Prestataire transmet les dossiers en cours selon les instructions du Donneur d'ordre et cesse, à la date d'effet, tout accès aux données de ce garage.",
          },
          {
            titre: "Article 3 — Suites",
            texte:
              "Le Prestataire reste éligible à de nouvelles affectations, sans garantie de volume ni de délai (article 4 du contrat). Les obligations de confidentialité, de protection des données et de non-sollicitation continuent de produire effet à l'égard de ce garage.",
          },
        ],
    table: null,
    annexeTitre: "",
    annexeTexte: "",
    annexes: null,
    avertissement:
      "Avenant fourni à titre indicatif : il ne constitue pas un conseil juridique. Il doit être signé des deux parties AVANT la prise d'effet de l'affectation.",
  };
}

/** Contenu par défaut selon le type de la fiche. */
export function contratDefaut(c: Collaborateur, p: Parametres, garagesAffectes?: string[]): ContenuContrat {
  return c.type === "commercial" ? contratApporteurDefaut(c, p) : contratPrestationDefaut(c, p, garagesAffectes);
}
export function titreContrat(modele: "apporteur" | "prestation" | "avenant"): string {
  if (modele === "apporteur") return "Contrat d'apporteur d'affaires";
  if (modele === "avenant") return "Avenant au contrat de prestation";
  return "Contrat de prestation de services";
}
