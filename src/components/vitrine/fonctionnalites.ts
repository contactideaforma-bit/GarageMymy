// ============================================================
//  INVENTAIRE PUBLIC DES FONCTIONNALITÉS (v13.48)
//  Source unique de la page /fonctionnalites et du comparatif. Chaque ligne
//  correspond à une fonction réellement livrée dans l'appli (voir PROJET.md) :
//  on n'annonce rien qui n'existe pas. « service » = réservé aux formules
//  Adhésion Service (chargés de mission).
// ============================================================

export type Domaine = {
  id: string;
  titre: string;
  accroche: string;
  icone: string; // nom d'icône (voir IconeDomaine)
  fonctions: { titre: string; texte: string; service?: boolean; nouveau?: boolean }[];
};

export const DOMAINES: Domaine[] = [
  {
    id: "sinistres",
    titre: "Dossiers sinistres",
    accroche: "Le cœur de l'atelier : chaque sinistre suivi du premier appel au paiement, sans rien chercher.",
    icone: "dossier",
    fonctions: [
      { titre: "Fiche dossier complète", texte: "Véhicule, client, assureur, expert, cabinet, garanties : tout sur un écran, avec l'historique de chaque action, appel et email." },
      { titre: "Pipeline de statut", texte: "Nouveau → Expertise → Devis → Réparation → Facturé → Véhicule rendu → Payé → Clôturé. Un coup d'œil suffit pour savoir où en est chaque voiture." },
      { titre: "Lecture IA du rapport d'expertise", texte: "Déposez le PDF (BCA, Allianz, Sidexa, Alpha…) : véhicule, sinistre, client, expert, assurance et lignes du chiffrage sont extraits et le dossier pré-rempli. Les grilles de main-d'œuvre T1/T2/T3 sont lues de façon déterministe, sans erreur de total." },
      { titre: "Reprise des dossiers en cours", texte: "Vous démarrez avec des dossiers déjà en route ? Import multi-documents (rapport, devis, facture extérieure) pour tout reprendre d'un coup." },
      { titre: "Pièces du dossier et complétude", texte: "Carte grise, constat, rapport, accord de prise en charge : l'appli dit ce qui manque avant que l'assureur ne le réclame." },
      { titre: "Photos d'état avant / après", texte: "Prises depuis le téléphone, horodatées, rangées dans le dossier et exportables en PDF pour l'expert ou le client." },
      { titre: "Prochaine action suggérée", texte: "Sur chaque dossier, l'appli propose la suite logique : relancer l'expert, envoyer la facture, demander l'accord…" },
      { titre: "Recherche instantanée", texte: "Une plaque, un nom, un numéro de sinistre : le dossier s'ouvre depuis le tableau de bord." },
      { titre: "Fiche récap à partager", texte: "Client, véhicule, sinistre, expert, assurance, montants sur un écran ; un bouton copie le tout, un autre l'envoie par WhatsApp, Messages ou mail au client ou à l'expert.", nouveau: true },
      { titre: "Bris de glace et calibrage ADAS", texte: "Suivi spécifique des dossiers vitrage, avec le calibrage en attente signalé." },
    ],
  },
  {
    id: "documents",
    titre: "Documents et signatures",
    accroche: "Les documents se génèrent depuis le dossier, à la charte du garage, et se signent depuis un téléphone.",
    icone: "document",
    fonctions: [
      { titre: "Devis et factures automatiques", texte: "Générés depuis le rapport d'expertise, modifiables, exportés en PDF avec votre logo, vos mentions et vos totaux." },
      { titre: "Ordre de réparation et PV de restitution", texte: "Prêts à signer à la réception et à la livraison du véhicule, avec les réserves et le kilométrage." },
      { titre: "Cession de créance", texte: "Pour être payé directement par l'assureur, le document est pré-rempli à partir du dossier." },
      { titre: "Signature électronique à distance", texte: "Le client reçoit un lien sécurisé et signe depuis son téléphone en 30 secondes ; le document signé revient dans le dossier." },
      { titre: "Facture de gardiennage", texte: "Calculée automatiquement sur la durée d'immobilisation, prête à envoyer." },
      { titre: "Facture électronique (Factur-X)", texte: "Vos factures embarquent déjà le format structuré exigé par la réforme 2026-2027 : vous êtes prêt sans module supplémentaire." },
      { titre: "Courriers de déblocage", texte: "Libre choix du réparateur, mise en demeure, contestation d'expertise, relance assureur : des courriers juridiques prêts, à imprimer et poster avec suivi de l'accusé de réception.", service: true },
    ],
  },
  {
    id: "assureurs",
    titre: "Experts et assureurs",
    accroche: "Vos interlocuteurs sont connus, joignables et suivis, dossier par dossier.",
    icone: "poignee",
    fonctions: [
      { titre: "Base de données clients, assurances, experts", texte: "Alimentée automatiquement par vos dossiers, enrichie à la main, avec recherche et commentaires." },
      { titre: "Espaces experts", texte: "Les liens vers les extranets des cabinets et des assureurs au même endroit, avec les identifiants du garage conservés en coffre." },
      { titre: "Demandes à l'assureur", texte: "Accord de prise en charge, complément, règlement : chaque demande est tracée avec sa date et sa réponse." },
      { titre: "Garanties de paiement et transfert de garantie", texte: "Qui paie quoi, pour quel montant, et le transfert de garantie quand le véhicule change de mains." },
      { titre: "Déclaration auprès des experts", texte: "Nouveau garage ? Un email groupé assisté présente votre atelier à tous les cabinets de votre secteur." },
      { titre: "Guide véhicule de prêt par assureur", texte: "Les conditions de prise en charge d'un véhicule de remplacement, assureur par assureur." },
    ],
  },
  {
    id: "finance",
    titre: "Finance et rentabilité",
    accroche: "Être payé, et savoir ce que chaque dossier vous rapporte vraiment.",
    icone: "euro",
    fonctions: [
      { titre: "Paiements et relances", texte: "Encaissements saisis par dossier, échéances, relances programmées ; les factures en retard remontent toutes seules." },
      { titre: "Recouvrement des impayés", texte: "Escalade automatique : relance, mise en demeure, dossier remis au chargé de mission qui appelle l'assureur à votre place.", service: true },
      { titre: "Suivi des litiges", texte: "Expertise contestée, assureur qui fait le mort, client qui ne répond plus : chaque litige a son plan d'action et son historique.", service: true },
      { titre: "Rentabilité par dossier", texte: "Marge = facturé − pièces − heures passées. Et le classement des assureurs qui vous coûtent le plus de trésorerie en délais de paiement." },
      { titre: "Export comptable", texte: "Journal des ventes et des encaissements au format de votre expert-comptable." },
      { titre: "Banque et rapprochement", texte: "Importez le relevé CSV de n'importe quelle banque : les virements sont rapprochés automatiquement des factures." },
      { titre: "Prix nets, sans jetons ni option cachée", texte: "Une formule, un prix affiché, et tout est inclus." },
    ],
  },
  {
    id: "atelier",
    titre: "Atelier et planning",
    accroche: "Qui fait quoi, sur quelle voiture, quel jour. Sur le téléphone du chef d'atelier.",
    icone: "cle",
    fonctions: [
      { titre: "Planning de réparation", texte: "Période et réparateur affectés à chaque dossier, vue semaine, replanification en un geste." },
      { titre: "Agenda", texte: "Rendez-vous clients et passages d'experts, vue semaine ou mois, liés au dossier." },
      { titre: "Véhicules présents au garage", texte: "Le tableau de bord compte les voitures dans l'atelier ; chaque véhicule a sa case « au garage »." },
      { titre: "Commandes de pièces", texte: "Pièces attendues par dossier, fournisseur, date de livraison prévue, réception." },
      { titre: "Tableau de bord", texte: "Dossiers en cours, facturé du mois, événements à venir, alertes : la journée en un écran." },
    ],
  },
  {
    id: "flotte",
    titre: "Flotte et véhicules de prêt",
    accroche: "Vos véhicules de courtoisie gérés comme un loueur, sans la paperasse du loueur.",
    icone: "voiture",
    fonctions: [
      { titre: "Fiche véhicule", texte: "Carte grise, assurance, contrôle technique, entretiens, documents, photos : tout ce que la préfecture et l'assureur peuvent vous demander." },
      { titre: "Ajout par photo de la carte grise", texte: "Photographiez la carte grise : le véhicule est créé, les champs lus sont remplis, et l'appli vous indique ce qui reste à compléter.", nouveau: true },
      { titre: "Contrats de prêt et de location", texte: "Pré-remplis depuis le dossier sinistre ou le client, avec état des lieux photo, kilométrage, carburant, franchise et signature." },
      { titre: "« Qui avait le véhicule le… »", texte: "Un PV d'amende arrive : la réponse en un clic, avec le contrat signé." },
      { titre: "Alertes assurance et contrôle technique", texte: "Échéances suivies, alerte 40 jours après la souscription, rien n'expire sans prévenir." },
      { titre: "Flotte hors garage et transfert", texte: "Véhicules au nom d'un tiers suivis à part ; export et import de toute la flotte en un fichier quand on change de structure.", nouveau: true },
    ],
  },
  {
    id: "communication",
    titre: "Communication et clients",
    accroche: "Le client sait où en est sa voiture sans vous appeler.",
    icone: "bulle",
    fonctions: [
      { titre: "Emails intégrés", texte: "Envoyés depuis votre propre adresse, rangés dans le dossier, avec l'historique complet par interlocuteur." },
      { titre: "Suivi client par lien", texte: "Le client reçoit un lien et suit l'avancement de son dossier, sans compte à créer." },
      { titre: "Courriers postaux guidés", texte: "Recommandés et lettres simples : édition, impression, envoi et accusé de réception suivis jusqu'au bout." },
      { titre: "Notifications", texte: "Alertes sur le téléphone quand un dossier bouge, un paiement tombe ou une échéance approche." },
      { titre: "Assistant MY-MY", texte: "Posez vos questions en français : « quels dossiers attendent l'expert depuis plus de 15 jours ? », l'assistant répond depuis vos données." },
    ],
  },
  {
    id: "confort",
    titre: "Sécurité et confort",
    accroche: "Pensé pour un atelier, pas pour un bureau : ça marche sur le téléphone, même quand le réseau lâche.",
    icone: "bouclier",
    fonctions: [
      { titre: "Mobile d'abord", texte: "Toute l'appli tient dans la poche : photos, signatures, consultation et saisie entre deux voitures." },
      { titre: "Mode dégradé sans réseau", texte: "La 4G tombe derrière la cabine de peinture ? Vos écrans restent lisibles (dernière copie datée) et les notes saisies repartent dès le retour du réseau." },
      { titre: "Vos données vous appartiennent", texte: "Chaque garage est cloisonné, sauvegarde complète téléchargeable à tout moment, rappel tous les 15 jours." },
      { titre: "Archives", texte: "Un dossier clos s'archive en un ZIP complet (documents, photos, historique) que vous gardez chez vous." },
      { titre: "Mode clair ou sombre", texte: "Lisible au soleil sur le parking comme le soir au bureau." },
      { titre: "Aide, incidents et état du service", texte: "Un bouton pour signaler un problème, une page qui dit si tout fonctionne, une réponse humaine." },
    ],
  },
  {
    id: "service",
    titre: "Le service humain (Adhésion Service)",
    accroche: "Ce qu'aucun logiciel ne fait : des chargés de mission qui décrochent le téléphone à votre place.",
    icone: "personne",
    fonctions: [
      { titre: "Déblocage des dossiers compliqués", texte: "Expert injoignable, assureur silencieux, pièce manquante : le chargé de mission reprend le dossier et le fait avancer.", service: true },
      { titre: "Impayés et litiges", texte: "Relances, courriers, mise en demeure, suivi jusqu'au paiement : vous réparez, nous encaissons.", service: true },
      { titre: "Compteur d'heures transparent", texte: "10, 20 ou 40 h par mois selon la formule ; vous voyez à tout moment le temps utilisé et sur quels dossiers.", service: true },
      { titre: "Conversation directe", texte: "Un fil de discussion garage ↔ chargé de mission, dans l'appli, avec les pièces jointes.", service: true },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  COMPARATIF — face à un DMS d'atelier classique                      */
/*  Formulé prudemment (« souvent », « selon l'éditeur ») : on compare  */
/*  une catégorie, pas un produit nommé.                                */
/* ------------------------------------------------------------------ */

export type Verdict = "oui" | "non" | "partiel";

export const COMPARATIF: { critere: string; mea: Verdict; meaTexte: string; dms: Verdict; dmsTexte: string }[] = [
  { critere: "Prix public", mea: "oui", meaTexte: "Affiché sur le site, net, à partir de 79 € / mois", dms: "non", dmsTexte: "Sur devis, après démonstration" },
  { critere: "Engagement", mea: "oui", meaTexte: "Sans engagement, ou 12 mois avec mise en service offerte", dms: "partiel", dmsTexte: "Souvent 12 à 36 mois, installation et formation facturées" },
  { critere: "Mise en route", mea: "oui", meaTexte: "Inscription en ligne, compte prêt le jour même, reprise de vos dossiers en cours", dms: "partiel", dmsTexte: "Déploiement planifié avec l'éditeur, formation sur site" },
  { critere: "Lecture des rapports d'expertise", mea: "oui", meaTexte: "IA : n'importe quel PDF (BCA, Allianz, Sidexa, Alpha…) devient un dossier pré-rempli", dms: "partiel", dmsTexte: "Interface avec l'outil de chiffrage sous licence, ou saisie" },
  { critere: "Interfaces directes chiffrage / DARVA", mea: "partiel", meaTexte: "Pas encore : lecture du PDF et de l'email, sans interface à payer. Prévu avec la croissance du réseau", dms: "oui", dmsTexte: "Oui chez les éditeurs historiques, selon abonnement" },
  { critere: "Devis, factures, ordre de réparation, PV", mea: "oui", meaTexte: "Générés depuis le dossier, à votre charte", dms: "oui", dmsTexte: "Oui" },
  { critere: "Facture électronique 2026-2027", mea: "oui", meaTexte: "Factur-X intégré dans chaque facture", dms: "partiel", dmsTexte: "Souvent un module ou un produit séparé" },
  { critere: "Rentabilité par dossier et par assureur", mea: "oui", meaTexte: "Marge réelle et délais de paiement par assureur", dms: "partiel", dmsTexte: "Marge par dossier selon l'éditeur ; rarement par assureur" },
  { critere: "Planning, agenda, pièces", mea: "oui", meaTexte: "Inclus", dms: "oui", dmsTexte: "Inclus" },
  { critere: "Véhicules de prêt", mea: "oui", meaTexte: "Fiche, contrats signés, état des lieux photo, « qui avait le véhicule le… »", dms: "partiel", dmsTexte: "Module mobile en option selon l'éditeur" },
  { critere: "Courriers juridiques prêts", mea: "oui", meaTexte: "Libre choix du réparateur, mise en demeure, contestation, suivi des recommandés", dms: "non", dmsTexte: "Hors périmètre" },
  { critere: "Des humains qui débloquent vos dossiers", mea: "oui", meaTexte: "Chargés de mission (Adhésion Service) : relances, litiges, impayés", dms: "non", dmsTexte: "Logiciel seul ; hotline technique" },
  { critere: "Mobile et hors ligne", mea: "oui", meaTexte: "Toute l'appli sur le téléphone, mode dégradé sans réseau", dms: "partiel", dmsTexte: "Application mobile en complément, selon l'éditeur" },
  { critere: "Ancienneté et références", mea: "partiel", meaTexte: "Lancé en 2025 : jeune, et c'est pour ça que les prix sont ce qu'ils sont", dms: "oui", dmsTexte: "Installés depuis longtemps, réseaux et groupements" },
];
