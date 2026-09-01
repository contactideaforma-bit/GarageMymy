// ====================================================================
//  BASE DE CONNAISSANCE DE MY-MY (v12.0) — support technique cloisonné
//
//  MY-MY doit pouvoir répondre sur l'abonnement, la réglementation du
//  métier et le fonctionnement de l'application. Mais TOUT LE MONDE NE
//  DOIT PAS VOIR LA MÊME CHOSE :
//    · un compte GARAGE n'accède qu'à ce qui le concerne et à nos
//      conditions (CGU, CGV, RGPD, tarifs publics, aide, réglementation) ;
//    · un compte COMMERCIAL y ajoute son contrat d'apporteur et les
//      documents commerciaux ;
//    · rien d'INTERNE (marges, coûts, taux versés aux secrétaires,
//      stratégie tarifaire, contrats des autres collaborateurs, audits)
//      n'entre dans cette base — même pour l'éditeur, ces sujets se
//      consultent dans l'espace admin, pas via le chatbot.
//
//  ⚠️ LE CLOISONNEMENT EST FAIT CÔTÉ SERVEUR, PAR SÉLECTION DU CORPUS :
//  on n'envoie au modèle QUE les fiches autorisées. Un modèle ne peut pas
//  divulguer ce qu'il n'a jamais reçu — c'est bien plus sûr que de lui
//  demander de « ne pas répondre » à certaines questions.
//
//  ⚠️ `Parametres` contient des champs CONFIDENTIELS (tauxHoraireSecretaire,
//  coutTechnique, coutsFixes, tauxRetrocession, primeSignature…). On ne
//  passe JAMAIS l'objet entier : chaque fiche compose son texte champ par
//  champ, avec uniquement ce qui est public.
// ====================================================================

import { FORMULES, Formule, Parametres, tarifFormule } from "./admin/economie";
import { articlesCGU } from "./admin/cgu";
import { articlesCGV } from "./admin/contratGarage";
import { articlesDPA } from "./admin/dpa";

export type PorteeDoc = "public" | "commercial";

export type FicheDoc = {
  cle: string;
  titre: string;
  portee: PorteeDoc;
  motsCles: string[];
  contenu: string;
};

const eur = (n: number) => `${n.toLocaleString("fr-FR")} € HT`;

/** Portées auxquelles un compte a droit. Calculé SERVEUR, jamais reçu du client. */
export function porteesAutorisees(metier: string | null | undefined): PorteeDoc[] {
  return metier === "commercial" ? ["public", "commercial"] : ["public"];
}

/* ==================================================================
   FICHES PUBLIQUES — garage ET commercial
================================================================== */

function ficheTarifs(p: Parametres): FicheDoc {
  const lignes = FORMULES.map((f: Formule) => {
    const pf = p.formules[f];
    const t = tarifFormule(f, p);
    const heures = pf.heures > 0 ? `${pf.heures} h de secrétariat par mois` : "application seule";
    return `· ${pf.libelle} — ${heures} : ${eur(pf.prix)} par mois sans engagement ; ${eur(t.mensuelEngage)} par mois avec engagement de 12 mois ; ${eur(t.annuelUnique)} pour l'année payée en une fois.`;
  }).join("\n");
  return {
    cle: "tarifs",
    titre: "Formules et tarifs de l'abonnement",
    portee: "public",
    motsCles: ["tarif", "prix", "formule", "abonnement", "essentiel", "starter", "confort", "serenite", "sérénité", "combien", "coute", "coûte", "mensualite", "mensualité", "engagement", "remise", "heures"],
    contenu: `Quatre formules, toutes au mois, prix hors taxes (TVA 20 % en sus ; le garage assujetti la récupère) :
${lignes}

Mise en service (paramétrage du compte, reprise des dossiers en cours, formation à distance) : ${eur(p.miseEnService)}, OFFERTE avec un engagement de 12 mois ou l'année payée en une fois.
Heure de secrétariat au-delà du forfait : ${eur(p.heureHorsForfait)}.
Heures non consommées : reportables à hauteur de 50 % sur le mois suivant seulement.
Utilisateurs, dossiers, documents et stockage : illimités. Pas de jetons, pas d'option payante cachée.
Changement de formule : montée en gamme à tout moment ; descente en gamme avec préavis d'un mois sans engagement, ou au terme (ou après 6 mensualités réglées) si engagé. Un avenant est signé dans tous les cas.`,
  };
}

function ficheSecretariat(): FicheDoc {
  return {
    cle: "secretariat",
    titre: "Comment fonctionne le service de secrétariat",
    portee: "public",
    motsCles: ["secretaire", "secrétaire", "secretariat", "secrétariat", "heures", "forfait", "deleguer", "déléguer", "taches", "tâches", "supplementaires", "supplémentaires", "changer", "absence"],
    contenu: `Le secrétariat est assuré À DISTANCE par des collaboratrices indépendantes, spécialisées dans les dossiers de sinistres. Ce sont des PRESTATAIRES INDÉPENDANTES, pas des salariées de l'éditeur, et pas des salariées du garage.

Ce qu'elles font, selon le périmètre convenu : création et suivi des dossiers à partir du rapport d'expertise, contrôle du chiffrage, devis et factures, envoi en signature, relances des experts, des assurances et des clients, suivi des encaissements, prise de rendez-vous, tri de la boîte mail du garage, commandes de pièces, planning.

Ce qui n'est JAMAIS confié, et qu'elles peuvent refuser sans que ce soit une faute : la comptabilité, le bilan, les déclarations fiscales ou de TVA, la paie et la gestion du personnel, toute signature ou engagement juridique au nom du garage, la négociation d'une responsabilité avec un assureur, le maniement de fonds ou d'espèces, le démarchage commercial, et toute tâche sans lien avec la plateforme ou le métier de la carrosserie.

Délai de traitement des demandes courantes : un jour ouvré.

HEURES AU-DELÀ DU FORFAIT : la demande se fait AUPRÈS DE L'ÉDITEUR (jamais directement auprès de la collaboratrice), qui la lui soumet ; elle est libre d'accepter ou de refuser. L'accord est confirmé PAR ÉCRIT avant l'exécution. Aucune heure hors forfait exécutée sans cet accord écrit n'est facturable.

CHANGER DE COLLABORATRICE : le garage peut en faire la demande à l'éditeur, pour n'importe quel motif, même de simple convenance. L'éditeur organise le changement avec un préavis de 15 jours ; cela n'implique aucune faute de la collaboratrice.

Le temps passé et son objet sont enregistrés dans l'application : le garage voit à quoi part son forfait.`,
  };
}

function ficheAideDossiers(): FicheDoc {
  return {
    cle: "aide-dossiers",
    titre: "Utiliser l'application — dossiers de sinistres",
    portee: "public",
    motsCles: ["dossier", "sinistre", "import", "rapport", "expertise", "pipeline", "statut", "etape", "étape", "creer", "créer", "chiffrage", "analyse", "ia"],
    contenu: `Créer un dossier : le plus simple est d'IMPORTER LE RAPPORT D'EXPERTISE en PDF depuis « Nouveau dossier » (/import). L'analyse lit le client, le véhicule, l'assurance et le chiffrage ligne par ligne, puis pré-remplit le formulaire. Il reste à vérifier et compléter.

⚠️ L'analyse est une AIDE À LA SAISIE : les montants, postes et références doivent être vérifiés avant d'émettre le moindre document. Le rapport de l'expert fait foi.

Le dossier avance en 7 étapes : Nouveau → Expertise → Devis → Réparation → Facture envoyée → Véhicule rendu → Payé. Le statut se change depuis la fiche du dossier.

La fiche regroupe tout : véhicule, client, sinistre, assurance, cabinet d'expertise, documents, pièces, photos d'état, paiements, événements, historique des emails envoyés, et une note libre (bouton rond en bas à droite).

Le chiffrage lu dans le rapport est CONSERVÉ sur le dossier : si un devis ou une facture est supprimé, il peut être régénéré à l'identique. Le bouton « ↻ Relire le rapport » relance l'analyse.

MENTIONS PARTICULIÈRES : l'analyse signale automatiquement ce qui change la conduite du dossier (voir la fiche réglementation). Les alertes rouges interdisent d'engager les travaux ou de facturer sans accord.`,
  };
}

function ficheAideDocuments(): FicheDoc {
  return {
    cle: "aide-documents",
    titre: "Utiliser l'application — devis, factures et documents",
    portee: "public",
    motsCles: ["devis", "facture", "ordre", "reparation", "réparation", "cession", "creance", "créance", "pv", "restitution", "signature", "signer", "pdf", "document", "gardiennage", "pret", "prêt"],
    contenu: `Les documents se génèrent depuis la fiche du dossier : devis, facture, ordre de réparation, cession de créance, PV de restitution, contrat de véhicule de prêt, facture de gardiennage.

LA FACTURE DOIT REPRODUIRE LE RAPPORT. Un bandeau compare en permanence le total du document au montant retenu au rapport de l'expert, avec une tolérance d'un euro. L'application SIGNALE l'écart, elle ne corrige jamais toute seule : c'est au garage de trancher.

Les lignes sans prix (opérations comprises dans la main d'œuvre) sont conservées et imprimées « — / Inclus » : elles figurent au rapport, donc à la facture.

Le tableau « main d'œuvre et peinture » ne contient que T1, T2, T3, Peinture et Ingrédients de peinture. Une pièce dont le libellé contient « peinture » reste une pièce.

SIGNATURE ÉLECTRONIQUE : sur tablette à l'atelier, ou par lien envoyé au client. Le document signé est horodaté et conservé. Il appartient au garage de vérifier l'identité et la qualité du signataire.

Un document ne peut pas être enregistré sans aucune ligne.`,
  };
}

function ficheAideFinance(): FicheDoc {
  return {
    cle: "aide-finance",
    titre: "Utiliser l'application — encaissements, relances, impayés",
    portee: "public",
    motsCles: ["paiement", "encaissement", "relance", "impaye", "impayé", "banque", "csv", "rapprochement", "echeancier", "échéancier", "mise en demeure", "recouvrement", "cession"],
    contenu: `Chaque facture suit son règlement : payée, partielle ou impayée, avec le reste dû et le retard éventuel.

RELANCES : l'application propose des relances graduées vers l'assurance, l'expert ou le client, jusqu'à la mise en demeure. ⚠️ Une mise en demeure est un acte juridique : elle ne part que sur validation expresse du garage.

RAPPROCHEMENT BANCAIRE : import du relevé au format CSV depuis l'onglet Banque, puis pointage automatique des factures réglées. Les écarts sont signalés.

CESSION DE CRÉANCE : le garage se fait régler directement par l'assurance à la place du client. Elle se signe dans l'application et se joint à la facture.

Le portail client permet de partager l'avancement d'un dossier avec le client, en lecture seule.`,
  };
}

function ficheReglementationRapport(): FicheDoc {
  return {
    cle: "reglementation-rapport",
    titre: "Réglementation — les mentions du rapport d'expertise",
    portee: "public",
    motsCles: ["conservatoire", "sursis", "surseoir", "vge", "vei", "epave", "épave", "reglement direct", "règlement direct", "rdr", "franchise", "vetuste", "vétusté", "tva", "recuperable", "récupérable", "expertise", "mention", "provisoire", "reemploi", "réemploi"],
    contenu: `Certaines mentions du rapport changent complètement la conduite à tenir. L'application les détecte et les affiche sur le dossier.

CE QUI INTERDIT D'AGIR (alerte rouge) :
· EXPERTISE À TITRE CONSERVATOIRE — l'expert n'a pas donné d'accord de réparation, le chiffrage est une estimation de sauvegarde. Ne pas démarrer les travaux, ne pas facturer l'assurance sans accord écrit.
· SURSIS À TRAVAUX / « ne pas engager les travaux » — rien ne doit être engagé tant que l'accord n'est pas reçu.
· PROCÉDURE VGE (véhicule gravement endommagé, art. L327-5 du code de la route) — immatriculation bloquée jusqu'au rapport de conformité ; réparations conformes au rapport et contre-visite obligatoire avant restitution.
· VÉHICULE ÉCONOMIQUEMENT IRRÉPARABLE (VEI) — le coût dépasse la valeur du véhicule ; l'assurance indemnise en valeur. Ne pas réparer sans accord écrit du propriétaire ET de l'assurance.
· PRISE EN CHARGE REFUSÉE.

CE QUI CONDITIONNE LA FACTURATION (à vérifier) :
· RAPPORT PROVISOIRE — attendre le définitif avant de facturer.
· RÈGLEMENT DIRECT suspendu, sous réserve ou absent — la facture est à adresser au CLIENT, pas à l'assurance, tant que le règlement direct n'est pas délivré.
· ACCORD RÉPARATEUR : NON — vérifier les heures, taux et pièces, et faire valoir ses observations à l'expert.
· FRANCHISE — reste à la charge du client, se déduit de la part réglée par l'assurance, à encaisser à la restitution.
· VÉTUSTÉ — déduite par l'expert, non prise en charge par l'assurance, reste au client.

BON À SAVOIR (information) :
· RÈGLEMENT DIRECT ACCORDÉ (« R.D.R. OUI ») — l'assurance règle directement le garage : la facture lui est adressée, franchise et vétusté restant dues par le client.
· TVA OUVRANT DROIT : OUI — le client récupère la TVA, donc l'assurance indemnise HORS TAXES et la TVA est à facturer et encaisser auprès du client. Si NON, l'indemnisation est TTC.
· DOMMAGES APPARENTS / sans démontage — tout dommage caché découvert en atelier doit être signalé à l'expert (complément d'expertise) AVANT d'être réparé et facturé.
· PIÈCES DE RÉEMPLOI retenues — les commander conformes ; une pièce neuve à la place ne sera pas prise en charge sans accord.

Ces informations sont données pour aider à la gestion courante ; elles ne remplacent pas l'avis de l'expert ni celui d'un conseil.`,
  };
}

function ficheReglementationFacturation(): FicheDoc {
  return {
    cle: "reglementation-facturation",
    titre: "Réglementation — facturation entre professionnels",
    portee: "public",
    motsCles: ["penalite", "pénalité", "retard", "delai", "délai", "paiement", "mention", "obligatoire", "facturation electronique", "électronique", "facturx", "conservation", "comptable", "10 ans", "prescription"],
    contenu: `DÉLAIS DE PAIEMENT (art. L441-10 du code de commerce) : entre professionnels, le délai convenu ne peut dépasser 60 jours à compter de l'émission de la facture, ou 45 jours fin de mois. À défaut d'accord, le délai est de 30 jours.

PÉNALITÉS DE RETARD : dues de plein droit, sans rappel, au taux convenu (au minimum trois fois le taux d'intérêt légal), plus une INDEMNITÉ FORFAITAIRE DE 40 € pour frais de recouvrement (art. D441-5). Ces deux mentions doivent figurer sur la facture.

MENTIONS OBLIGATOIRES d'une facture : identité et adresse des deux parties, numéro SIREN, numéro de TVA intracommunautaire, numéro et date de la facture, désignation et quantité, prix unitaire hors taxes, taux et montant de TVA, total à payer, date d'échéance, pénalités et indemnité de 40 €. En cas d'exonération, la mention légale correspondante.

FACTURATION ÉLECTRONIQUE : la réforme impose progressivement l'émission et la réception de factures électroniques entre entreprises. L'application génère des factures au format Factur-X (PDF avec données structurées intégrées), qui répond à ce besoin. Les échéances exactes dépendent de la taille de l'entreprise : à vérifier auprès de votre expert-comptable.

CONSERVATION : les factures et pièces comptables se conservent DIX ANS. Attention, archiver un dossier dans l'application équivaut à le supprimer du serveur : le ZIP téléchargé devient la seule copie, à ranger hors de l'ordinateur du garage.

Ces informations sont générales et ne remplacent pas l'avis d'un expert-comptable.`,
  };
}

function ficheCompte(): FicheDoc {
  return {
    cle: "compte",
    titre: "Compte, accès, données et fin de contrat",
    portee: "public",
    motsCles: ["compte", "mot de passe", "identifiant", "connexion", "acces", "accès", "donnees", "données", "export", "sauvegarde", "archivage", "suspension", "impaye", "resiliation", "résiliation", "supprimer"],
    contenu: `Un compte correspond à un seul établissement ; les données de chaque garage sont cloisonnées. Le garage est responsable de la confidentialité de ses identifiants.

SUSPENSION POUR IMPAYÉ : après une relance restée sans effet pendant quinze jours, l'accès peut être suspendu jusqu'à régularisation ; les mensualités continuent de courir. Après trente jours d'impayé, le contrat peut être résilié aux torts du client.

FIN DE CONTRAT : les données restent exportables depuis l'application (Organisation → Sauvegarde) pendant toute la durée du contrat et QUATRE-VINGT-DIX JOURS après sa fin, puis elles sont supprimées. Le client peut aussi demander une restitution complète ou une suppression immédiate.

RÉSILIATION : sans engagement, préavis d'un mois. Pendant un engagement de 12 mois, la résiliation anticipée du fait du client entraîne le rattrapage de la remise consentie, les frais de mise en service offerts, et une indemnité de 50 % des mensualités restantes. Aucune indemnité n'est due si la résiliation vient d'un manquement de l'éditeur, du refus d'une hausse de prix ou d'une modification substantielle des conditions.

NOTIFICATIONS : l'application peut envoyer des notifications sur le téléphone (résumé du matin, rappels à l'heure des rendez-vous). Sur iPhone, cela n'est possible QUE si l'application a été ajoutée à l'écran d'accueil et rouverte depuis son icône — c'est une contrainte d'Apple, pas un réglage de l'application.`,
  };
}

/* ==================================================================
   FICHES COMMERCIALES — apporteurs d'affaires uniquement
================================================================== */

function ficheCommercialCommissions(p: Parametres): FicheDoc {
  const lignes = FORMULES.map((f: Formule) => {
    const pf = p.formules[f];
    return `· ${pf.libelle} : prime ${eur(pf.primeSignature)} par garage signé, bonus engagement 12 mois + ${eur(pf.bonusEngagement)}.`;
  }).join("\n");
  return {
    cle: "commercial-commissions",
    titre: "Commissions de l'apporteur d'affaires",
    portee: "commercial",
    motsCles: ["commission", "prime", "bonus", "remuneration", "rémunération", "gagne", "touche", "releve", "relevé", "reprise", "portefeuille", "volume"],
    contenu: `UNE prime par garage signé, égale à 85 % de la mensualité hors taxes de la grille :
${lignes}

ACQUISITION : avec un engagement de 12 mois (ou l'année payée en une fois), la prime est acquise dès l'encaissement de la première mensualité. Sans engagement, elle est acquise à l'encaissement de la ${p.primeMensualiteSansEngagement}e mensualité, soit un différé de deux mois.

REPRISE : si le garage résilie, cesse de payer ou se rétracte avant d'avoir réglé sa ${p.mensualitesReprise}e mensualité, la prime et le bonus sont repris — par compensation sur les relevés suivants, ou remboursement sous trente jours.

Les remises de grille (engagement, année en une fois) ne réduisent PAS la prime. Une remise exceptionnelle hors grille, qui exige l'accord écrit de l'éditeur, la réduit dans la même proportion.

MONTÉE EN FORMULE : 85 % de la différence entre les deux mensualités, si elle intervient dans les douze mois.
BONUS DE VOLUME, par trimestre civil, hors ESSENTIEL : ${eur(p.bonusVolume.bonus1)} pour ${p.bonusVolume.palier1} contrats, ${eur(p.bonusVolume.bonus2)} pour ${p.bonusVolume.palier2}. Non cumulables.

Aucune commission sur les heures hors forfait, la mise en service ou les prestations ponctuelles. Relevé adressé avant le 5 de chaque mois ; facture émise sur cette base, réglée à 30 jours.

PORTEFEUILLE : une liste de garages est confiée à titre exclusif, avec pour contrepartie une activité réelle de démarchage. Après deux mois sans AUCUNE activité déclarée, un point d'étape écrit est fait ; un mois de plus sans activité, le portefeuille peut être retiré et réattribué — sans fin de contrat et sans perte des commissions déjà acquises.`,
  };
}

function ficheCommercialVente(): FicheDoc {
  return {
    cle: "commercial-vente",
    titre: "Procédure de vente et règles de conduite du commercial",
    portee: "commercial",
    motsCles: ["vente", "demo", "démo", "demonstration", "démonstration", "prospect", "declarer", "déclarer", "code apporteur", "encaisser", "paiement", "signature", "interdit"],
    contenu: `DÉCLARER UN PROSPECT : fiche créée dans l'espace Clients avec le SIREN du garage, ou sur myeasyauto.fr/vente avec le code apporteur. La date de création fait foi. Le prospect est réservé 60 jours, renouvelables une fois sur justification d'un rendez-vous.

DÉMONSTRATION : utiliser UNIQUEMENT le compte de démonstration fourni, et des rapports d'expertise factices. Ne jamais saisir de données réelles d'un garage dans le compte démo, et ne jamais utiliser un vrai rapport d'un prospect : il contient les données personnelles d'un tiers.

SIGNATURE : le garage lit et signe sur la page de vente les conditions particulières, les conditions générales de vente, les conditions générales d'utilisation et l'accord de traitement des données — trois acceptations distinctes, toutes obligatoires.

CE QUI EST INTERDIT : encaisser en son nom (les paiements sont à l'ordre de l'éditeur ou versés sur son compte) ; consentir une remise hors grille sans accord écrit ; promettre quoi que ce soit qui ne figure pas dans les documents commerciaux ; démarcher un garage attribué à un autre apporteur. Un paiement remis par un garage doit être déclaré sous 48 heures.

La vente n'est définitive qu'après validation par l'éditeur (création du compte), sous cinq jours ouvrés.`,
  };
}

/* ==================================================================
   Assemblage et sélection
================================================================== */

/** Textes contractuels, découpés article par article pour une sélection fine. */
function fichesContractuelles(p: Parametres): FicheDoc[] {
  const bloc = (
    prefixe: string,
    titre: string,
    motsCles: string[],
    articles: { titre: string; texte: string }[]
  ): FicheDoc[] =>
    articles.map((a) => ({
      cle: `${prefixe}-${a.titre.toLowerCase().replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}`,
      titre: `${titre} — ${a.titre}`,
      portee: "public" as const,
      motsCles: [...motsCles, ...a.titre.toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter((m) => m.length > 3)],
      contenu: a.texte,
    }));

  return [
    ...bloc("cgv", "Conditions générales de vente", ["cgv", "condition", "contrat", "abonnement", "vente"], articlesCGV(p)),
    ...bloc("cgu", "Conditions générales d'utilisation", ["cgu", "condition", "utilisation", "usage"], articlesCGU()),
    ...bloc("rgpd", "Accord de traitement des données", ["rgpd", "donnees", "données", "personnelles", "confidentialite", "confidentialité", "sous-traitance"], articlesDPA()),
  ];
}

export function baseConnaissance(p: Parametres): FicheDoc[] {
  return [
    ficheTarifs(p),
    ficheSecretariat(),
    ficheAideDossiers(),
    ficheAideDocuments(),
    ficheAideFinance(),
    ficheReglementationRapport(),
    ficheReglementationFacturation(),
    ficheCompte(),
    ...fichesContractuelles(p),
    ficheCommercialCommissions(p),
    ficheCommercialVente(),
  ];
}

/** Normalise pour la comparaison (accents, ponctuation). */
function normaliser(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const VIDES = new Set([
  "avec", "pour", "dans", "cette", "cette", "quoi", "quel", "quelle", "quels", "quelles", "comment",
  "est", "sont", "une", "des", "les", "que", "qui", "sur", "par", "pas", "plus", "mon", "mes", "ma",
  "je", "tu", "il", "elle", "nous", "vous", "the", "and", "combien", "faire", "peux", "puis", "dois",
]);

/**
 * Sélection des fiches pertinentes (mini-recherche par mots clés, sans
 * embeddings : suffisant sur un corpus de cette taille, et gratuit).
 * On envoie au modèle un extrait BORNÉ — le quota IA de l'utilisateur paie
 * ces jetons, autant ne pas lui facturer tout le corpus à chaque question.
 */
export function selectionner(
  question: string,
  fiches: FicheDoc[],
  portees: PorteeDoc[],
  maxChars = 14000
): FicheDoc[] {
  const autorisees = fiches.filter((f) => portees.includes(f.portee));
  const mots = Array.from(
    new Set(
      normaliser(question)
        .split(/[^a-z0-9]+/)
        .filter((m) => m.length > 2 && !VIDES.has(m))
    )
  );
  if (mots.length === 0) return [];

  const notees = autorisees
    .map((f) => {
      const cible = normaliser(`${f.titre} ${f.motsCles.join(" ")} ${f.contenu}`);
      const cleIndex = normaliser(`${f.titre} ${f.motsCles.join(" ")}`);
      let score = 0;
      for (const m of mots) {
        if (cleIndex.includes(m)) score += 3; // mot clé ou titre : signal fort
        else if (cible.includes(m)) score += 1;
      }
      return { f, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const retenues: FicheDoc[] = [];
  let taille = 0;
  for (const { f } of notees) {
    if (taille + f.contenu.length > maxChars) continue;
    retenues.push(f);
    taille += f.contenu.length;
    if (retenues.length >= 8) break;
  }
  return retenues;
}

/** Corpus mis en forme pour le prompt. */
export function corpusPourPrompt(fiches: FicheDoc[]): string {
  if (fiches.length === 0) return "";
  return fiches.map((f) => `### ${f.titre}\n${f.contenu}`).join("\n\n");
}
