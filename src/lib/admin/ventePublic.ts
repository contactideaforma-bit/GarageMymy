// Types partagés entre la route publique /api/vente et la page /vente (v10.0).
import { Parametres } from "./economie";

/** Sous-ensemble des paramètres exposé au formulaire public (jamais les coûts internes). */
export type ParametresPublics = Pick<
  Parametres,
  | "formules"
  | "remiseEngagement"
  | "bonusAnnuelMensualites"
  | "bonusAnnuelEuros"
  | "miseEnService"
  | "heureHorsForfait"
  | "iban"
  | "bic"
  | "primeMensualiteAvecEngagement"
  | "primeMensualiteSansEngagement"
  | "mensualitesReprise"
>;

export type ReponseCode = { commercial: { prenom: string | null; nom: string }; parametres: ParametresPublics };

/** Questions de la FICHE DE RENSEIGNEMENT (besoins du garage), remplie sur place. */
export const QUESTIONS_BESOINS: { cle: string; label: string; type: "texte" | "nombre" | "choix" | "multi"; options?: string[] }[] = [
  { cle: "activite", label: "Activité principale", type: "choix", options: ["Carrosserie", "Carrosserie + mécanique", "Vitrage / pare-brise", "Concession / agent de marque", "Autre"] },
  { cle: "effectif", label: "Nombre de personnes (atelier + bureau)", type: "nombre" },
  { cle: "dossiers_mois", label: "Dossiers sinistres par mois (environ)", type: "nombre" },
  { cle: "assureurs", label: "Assureurs / experts les plus fréquents", type: "texte" },
  { cle: "logiciel_actuel", label: "Outil actuel (papier, Excel, logiciel…)", type: "texte" },
  { cle: "douleurs", label: "Ce qui prend le plus de temps aujourd'hui", type: "multi", options: ["Saisie des rapports d'expertise", "Devis / factures", "Relances de paiement", "Suivi des dossiers", "Appels clients / assurances", "Planning atelier", "Véhicules de prêt", "Comptabilité"] },
  { cle: "impayes", label: "Retards de paiement des assurances (fréquence)", type: "choix", options: ["Rares", "Réguliers", "Très fréquents"] },
  { cle: "secretariat", label: "Qui gère l'administratif aujourd'hui ?", type: "choix", options: ["Le patron", "Un(e) salarié(e)", "Un(e) conjoint(e)", "Personne / en retard", "Un prestataire"] },
  { cle: "equipement", label: "Équipement (ordinateur, tablette, smartphone, imprimante)", type: "texte" },
  { cle: "demarrage", label: "Démarrage souhaité", type: "choix", options: ["Dès que possible", "Sous 1 mois", "Sous 3 mois", "À définir"] },
  { cle: "attentes", label: "Attentes particulières / points à traiter à la mise en service", type: "texte" },
];
