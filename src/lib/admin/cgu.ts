// ====================================================================
//  CONDITIONS GÉNÉRALES D'UTILISATION — version CONTRACTUELLE (v11.7)
//
//  Pourquoi ce fichier existe : les CGU vivaient uniquement dans la page
//  publique /cgu. Elles n'étaient donc PAS acceptées à la vente — seules
//  les CGV l'étaient (audit juridique du 31/08/2026, §6.5). Or ce sont
//  les CGU qui encadrent la sécurité des identifiants, la valeur de la
//  signature électronique, le rôle de l'IA et la propriété du service.
//
//  ⚠️ SOURCE UNIQUE DE LA VERSION : `VERSION_CGU` ci-dessous est importée
//  par la page publique. Si vous modifiez le texte d'un article ici,
//  répercutez-le sur /cgu (et l'inverse) — c'est le même contrat.
//  Chantier prévu : faire rendre la page publique à partir de ce
//  fichier, pour supprimer définitivement le risque de divergence.
// ====================================================================

import { SOCIETE, ADRESSE_COMPLETE } from "@/components/vitrine/societe";

export const VERSION_CGU = "v1.0 — août 2026";

export const ACCEPTATION_CGU =
  "J'ai lu et j'accepte les conditions générales d'utilisation de l'application My Easy Auto, consultables à tout moment sur myeasyauto.fr/cgu.";

export function articlesCGU(): { titre: string; texte: string }[] {
  return [
    {
      titre: "Article 1 — Objet et acceptation",
      texte: `Les présentes conditions générales d'utilisation régissent l'accès et l'usage de l'application ${SOCIETE.produit}, éditée par ${SOCIETE.editeur}, ${ADRESSE_COMPLETE}, SIRET ${SOCIETE.siret}. Toute utilisation du Service implique leur acceptation pleine et entière. Elles complètent les conditions générales de vente, qui régissent le prix et la durée de l'abonnement.`,
    },
    {
      titre: "Article 2 — Accès réservé aux professionnels",
      texte:
        "Le Service est réservé aux professionnels agissant dans le cadre de leur activité. Un compte correspond à un seul établissement ; les données de chaque garage sont cloisonnées. Le Service est accessible en ligne 24 h/24, sauf interruption pour maintenance ou force majeure ; son état est consultable sur la page « État du service ».",
    },
    {
      titre: "Article 3 — Compte et identifiants",
      texte:
        "Le Garage est responsable de la confidentialité de ses identifiants et de toute activité réalisée depuis son compte. Il prévient l'Éditeur sans délai de toute utilisation non autorisée. Les mots de passe des extranets tiers saisis dans le Service sont chiffrés et ne sont jamais affichés en clair.",
    },
    {
      titre: "Article 4 — Obligations du Garage",
      texte:
        "Le Garage utilise le Service conformément à la loi. Il VÉRIFIE le contenu de tout document généré (devis, facture, ordre de réparation, cession de créance, PV) avant envoi ou signature : ces documents sont établis sous sa seule responsabilité. Il fournit des informations exactes, n'utilise pas le Service à des fins illicites et répond des contenus qu'il enregistre.",
    },
    {
      titre: "Article 5 — Signature électronique",
      texte:
        "Le Service propose une signature électronique simple, horodatée et conservée avec le document signé. Les parties reconnaissent sa valeur probatoire entre elles. Il appartient au Garage de vérifier l'identité et la qualité du signataire avant de recueillir sa signature.",
    },
    {
      titre: "Article 6 — Données et propriété",
      texte:
        "Les données saisies restent la propriété du Garage, qui peut les exporter à tout moment depuis l'application. L'application, sa marque, son code et sa documentation demeurent la propriété exclusive de l'Éditeur ; le Garage bénéficie d'un droit d'usage personnel, non exclusif et non cessible pour la durée du contrat. Le traitement des données personnelles est régi par l'accord de traitement des données annexé au contrat d'abonnement.",
    },
    {
      titre: "Article 7 — Intelligence artificielle",
      texte:
        "Certaines fonctions s'appuient sur une analyse automatisée (lecture des rapports d'expertise et des cartes grises). Ces analyses sont des AIDES À LA SAISIE : elles peuvent comporter des erreurs et ne constituent ni un conseil, ni une validation. Le Garage vérifie systématiquement les montants, postes et références avant d'émettre un document. Aucune décision produisant des effets juridiques n'est prise sur le seul fondement d'un traitement automatisé.",
    },
    {
      titre: "Article 8 — Tarifs, durée et résiliation",
      texte:
        "Le prix, la durée, l'engagement éventuel et les conditions de résiliation sont fixés par les conditions générales de vente et les conditions particulières signées par le Garage. En cas de contradiction sur ces points, les conditions générales de vente prévalent sur les présentes.",
    },
    {
      titre: "Article 9 — Disponibilité et responsabilité",
      texte:
        "L'Éditeur met en œuvre des moyens raisonnables pour assurer la disponibilité du Service et la sauvegarde quotidienne des données. Sa responsabilité, toutes causes confondues, est limitée aux sommes payées par le Garage au cours des douze derniers mois et ne couvre pas les dommages indirects — sauf faute lourde, dol, atteinte à la confidentialité ou manquement aux obligations de protection des données.",
    },
    {
      titre: "Article 10 — Assistance",
      texte:
        "L'assistance est assurée par voie électronique aux jours ouvrés. Le Garage signale les incidents depuis l'application ; les incidents bloquants sont traités en priorité.",
    },
    {
      titre: "Article 11 — Modification des CGU",
      texte:
        "L'Éditeur peut modifier les présentes CGU pour tenir compte d'évolutions techniques ou légales. Toute modification substantielle est notifiée au Garage avec un préavis d'un mois ; à défaut d'acceptation, le Garage peut résilier sans frais dans ce délai, nonobstant tout engagement en cours.",
    },
    {
      titre: "Article 12 — Droit applicable",
      texte: `Les présentes CGU sont soumises au droit français. En cas de différend, les parties recherchent une solution amiable pendant trente jours ; à défaut, le tribunal de commerce de Nanterre est seul compétent. Version des CGU : ${VERSION_CGU}.`,
    },
  ];
}
