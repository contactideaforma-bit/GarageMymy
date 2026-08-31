// ====================================================================
//  ACCORD DE TRAITEMENT DES DONNÉES — annexe RGPD (v11.8)
//
//  Pourquoi ce fichier : l'audit du 31/08/2026 a relevé que
//  (a) la sous-traitance vers les secrétaires indépendantes n'était
//      autorisée par personne — violation de l'article 28.2 du RGPD ;
//  (b) deux documents commerciaux promettaient au garage « l'accord de
//      traitement des données », qui n'existait pas.
//
//  L'article 9 des CGV porte désormais les huit mentions obligatoires
//  de l'article 28.3. Le présent accord en est l'ANNEXE OPÉRATIONNELLE :
//  il décrit concrètement qui traite quoi, où, combien de temps, et
//  recueille l'AUTORISATION EXPRESSE du garage pour l'intervention des
//  collaborateurs indépendants externes.
//
//  ⚠️ À tenir à jour : la liste des sous-traitants ultérieurs (§4) doit
//  refléter la réalité. Un hébergeur qu'on change sans mettre à jour
//  cette liste, c'est l'autorisation qui tombe.
// ==================================================================== */

import { SOCIETE, ADRESSE_COMPLETE } from "@/components/vitrine/societe";

export const VERSION_DPA = "v1.0 — août 2026";

/** Texte de la case à cocher, signée par le garage à la vente. */
export const AUTORISATION_SOUS_TRAITANCE =
  "J'ai reçu l'accord de traitement des données et j'AUTORISE IDEA FORMA à faire intervenir sur mon compte des collaborateurs indépendants externes — secrétaires prestataires, non salariées d'IDEA FORMA — tenus des mêmes obligations de confidentialité et de protection des données. Je sais que je peux demander à tout moment l'identité du collaborateur affecté à mon compte et m'opposer, pour un motif légitime, à une intervention.";

export type LigneDpa = { titre: string; texte: string };

export function articlesDPA(): LigneDpa[] {
  const ed = SOCIETE.editeur;
  return [
    {
      titre: "1. Parties et objet",
      texte: `Le présent accord est conclu entre le GARAGE, responsable de traitement, et ${ed}, ${ADRESSE_COMPLETE}, SIRET ${SOCIETE.siret}, sous-traitant. Il complète l'article 9 des conditions générales de vente, dont il fait partie intégrante, et décrit les conditions concrètes du traitement des données personnelles réalisé au moyen de l'application ${SOCIETE.produit}. En cas de contradiction, l'article 9 des CGV prévaut.`,
    },
    {
      titre: "2. Ce qui est traité, et pourquoi",
      texte: `Finalité : gérer les dossiers de sinistres automobiles du Garage — création et suivi du dossier, édition des devis, factures, ordres de réparation, cessions de créance et procès-verbaux, relances des assurances, experts et clients, suivi des encaissements, agenda et planning.
Catégories de données : identité et coordonnées (nom, prénom, adresse, téléphone, email) ; véhicule (immatriculation, marque, modèle, numéro de série) ; sinistre et indemnisation (rapport d'expertise, montants, assureur, numéros de contrat et de sinistre) ; facturation et paiement.
Personnes concernées : les clients du Garage, ses interlocuteurs chez les assureurs et cabinets d'expertise, ses collaborateurs utilisateurs de l'application.
⚠️ Le Garage s'interdit d'enregistrer des données sensibles au sens de l'article 9 du RGPD. Les mentions de santé pouvant figurer dans un rapport d'expertise ne doivent pas être recopiées dans les champs libres.`,
    },
    {
      titre: "3. Où sont les données, et combien de temps",
      texte:
        "Hébergement dans l'Union européenne, sans aucun transfert hors de l'Union. Les données restent accessibles et exportables par le Garage pendant toute la durée du contrat. À la fin du contrat, elles restent exportables quatre-vingt-dix (90) jours, puis sont supprimées, copies et sauvegardes comprises, sauf obligation légale de conservation. Le Garage peut demander leur suppression immédiate ou leur restitution complète avant ce terme.",
    },
    {
      titre: "4. Qui intervient — sous-traitants ultérieurs autorisés",
      texte: `Le Garage autorise expressément, par autorisation générale écrite (article 28.2 du RGPD), l'intervention des catégories suivantes :
· HÉBERGEUR ET PRESTATAIRES TECHNIQUES situés dans l'Union européenne (hébergement applicatif, base de données, stockage des documents, envoi des emails).
· COLLABORATEURS INDÉPENDANTS EXTERNES : secrétaires spécialisées dans les dossiers de sinistres, PRESTATAIRES INDÉPENDANTES ET NON SALARIÉES d'${ed}, intervenant À DISTANCE depuis leurs propres moyens, uniquement lorsque le Garage a souscrit une formule incluant du secrétariat.
· PRESTATAIRE D'ANALYSE AUTOMATISÉE des documents (lecture des rapports d'expertise et des cartes grises), aux seules fins d'aide à la saisie.
Chacun est lié par un contrat imposant les mêmes obligations que le présent accord. ${ed} demeure PLEINEMENT RESPONSABLE envers le Garage de leur exécution. La liste nominative et l'identité du collaborateur affecté au compte sont communiquées sur simple demande ; tout changement est notifié et le Garage peut s'y opposer pour un motif légitime, un autre collaborateur lui étant alors proposé.`,
    },
    {
      titre: "5. Sécurité",
      texte:
        "Cloisonnement strict des données par compte (aucun garage ne voit les dossiers d'un autre) ; authentification individuelle et nominative ; chiffrement des flux et des secrets enregistrés ; journalisation des accès ; sauvegarde quotidienne ; gestion des habilitations à l'entrée et à la sortie de chaque collaborateur ; procédure documentée de gestion des incidents.",
    },
    {
      titre: "6. Violation de données",
      texte: `${ed} notifie au Garage toute violation de données le concernant DANS LES QUARANTE-HUIT (48) HEURES de sa connaissance, avec la nature de la violation, les catégories et le nombre approximatif de personnes et d'enregistrements concernés, les conséquences probables et les mesures prises. Cette information permet au Garage de procéder, s'il y a lieu, à sa propre notification à la CNIL dans les soixante-douze heures qui lui incombent, et d'informer les personnes concernées.`,
    },
    {
      titre: "7. Droits des personnes et assistance",
      texte: `Lorsqu'une personne exerce ses droits (accès, rectification, effacement, limitation, opposition, portabilité) directement auprès d'${ed}, la demande est transmise au Garage sans délai : c'est à lui d'y répondre. ${ed} l'assiste par des mesures techniques appropriées (recherche, extraction, suppression) et l'aide, le cas échéant, à réaliser une analyse d'impact.`,
    },
    {
      titre: "8. Audit et durée",
      texte: `${ed} met à disposition du Garage les informations nécessaires pour démontrer le respect de ses obligations et permet un audit par an au plus, sur préavis raisonnable, pendant les heures ouvrées, sans perturbation excessive de l'activité et aux frais du Garage. Le présent accord prend effet à la mise en service et prend fin avec le contrat d'abonnement, les obligations de confidentialité et de suppression lui survivant.`,
    },
  ];
}
