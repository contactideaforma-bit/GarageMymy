export type Dossier = {
  id: string;
  created_at: string;
  statut: string;
  /** Montant HT retenu au rapport d'expertise. */
  montant: number | null;
  /** Taux de TVA du dossier, en % (v40) — sert à afficher aussi le TTC. */
  tva?: number | null;

  // Véhicule
  immatriculation: string | null;
  marque_modele: string | null;
  numero_serie: string | null;
  premiere_circulation: string | null;

  // Sinistre
  date_sinistre: string | null;
  numero_sinistre: string | null;
  cabinet_expert: string | null;
  date_expertise: string | null;
  numero_police: string | null;
  assureur: string | null;

  // Cabinet d'expert (coordonnées)
  cabinet_adresse: string | null;
  cabinet_tel: string | null;
  cabinet_email: string | null;
  // Expert en charge
  expert_nom: string | null;
  expert_tel: string | null;
  expert_email: string | null;
  // Assurance (coordonnées)
  assureur_adresse: string | null;
  assureur_tel: string | null;
  assureur_email: string | null;

  // Client
  client_nom: string | null;
  client_adresse: string | null;
  client_code_postal: string | null;
  client_ville: string | null;
  client_email?: string | null;
  client_tel?: string | null;

  // Réparation (planning)
  reparation_debut: string | null;
  reparation_fin: string | null;
  reparateur: string | null;
  au_garage: boolean | null;

  // Vitrage / bris de glace (métier vitrage — v28)
  type_vitrage?: string | null; // pare_brise | lunette_arriere | vitre_laterale | toit_ouvrant | autre
  nature_intervention?: string | null; // reparation | remplacement
  calibrage_requis?: boolean | null; // calibrage ADAS nécessaire
  calibrage_fait?: boolean | null;
  franchise?: number | null; // reste à charge client

  // Rapport
  rapport_path: string | null;
  rapport_nom: string | null;

  // Relances automatiques (cron) activées sur ce dossier
  relance_auto?: boolean | null;
  // Mode cession de créance : le garage est payé directement par l'assurance
  mode_cession?: boolean | null;
  // Mode prise en charge (v32) : l'expert fournit un accord de prise en charge ;
  // rempli et joint à la facture, il permet le paiement direct du garage.
  // Distinct de la cession de créance (pas de créance cédée par le client).
  mode_pec?: boolean | null;
  pec_reference?: string | null; // référence / n° de l'accord (optionnel)
  // Note libre du dossier (bouton rond en bas à droite de la fiche) — v7.2
  note?: string | null;
  note_maj?: string | null;
  // Archivé : contenu téléchargé en ZIP puis purgé du serveur (trace seule)
  archive?: boolean | null;
  archive_le?: string | null;
};

export type Vehicule = {
  id: string;
  created_at: string;
  immatriculation: string | null;
  marque_modele: string | null;
  proprietaire: string | null;
  au_garage: boolean;
  notes: string | null;
};

export type Expert = {
  id: string;
  created_at: string;
  cabinet: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  tel: string | null;
  email: string | null;
  expert_nom: string | null;
  expert_tel: string | null;
  expert_email: string | null;
  source: string;
  notes: string | null;
};

export type Assureur = {
  id: string;
  created_at: string;
  nom: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  tel: string | null;
  email: string | null;
  source: string;
  notes: string | null;
};

export type Evenement = {
  id: string;
  created_at: string;
  dossier_id: string | null;
  titre: string;
  description: string | null;
  date_evenement: string;
  categorie: string | null; // rdv_client | rdv_expert | autre
  avec_qui: string | null;
};

export type DocumentType = "devis" | "facture";

export type Document = {
  id: string;
  created_at: string;
  dossier_id: string;
  type: DocumentType;
  numero: string | null;
  date_document: string | null;
  date_echeance: string | null;
  statut: string; // brouillon|envoye|accepte|refuse|paye
  tva: number | null;
  notes: string | null;
  total_ht: number | null;
  total_tva: number | null;
  total_ttc: number | null;
  // Signature électronique (en bas du PDF)
  signataire_nom?: string | null;
  signature?: string | null;
  signe_le?: string | null;
  sign_token?: string | null;
  favori?: boolean | null;
  // Facture réglée : mention "Acquittée" apposée sur le PDF (v29)
  acquitte?: boolean | null;
  // Mode de règlement imprimé sur la facture, choisi au moment de générer
  // le PDF (v34) : virement | cheque | cb | especes | prelevement |
  // assurance | multiple | autre
  mode_paiement?: string | null;
  // Durée d'immobilisation en jours (surcharge le calcul fait depuis le
  // planning de réparation du dossier) — v34
  jours_reparation?: number | null;
};

export type DocumentLigne = {
  id: string;
  document_id: string;
  designation: string | null;
  quantite: number | null;
  prix_unitaire: number | null;
  ordre: number | null;
  // Remise accordée sur la ligne, en % (v34) — mention obligatoire dès lors
  // qu'une réduction est acquise à la date de la vente (art. 242 nonies A CGI)
  remise?: number | null;
  // Tableau d'appartenance sur la facture (v34) :
  // piece (tableau principal) | mo (T1/T2/T3, peinture, ingrédients) | autre
  categorie?: string | null;
};

export type Entreprise = {
  id: string;
  created_at?: string;
  nom: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  tel: string | null;
  email: string | null;
  siret: string | null;
  tva_intra: string | null;
  iban: string | null;
  bic: string | null;
  mentions: string | null;
  logo_path: string | null;
  modele_facture_path: string | null;
  signature_mail?: string | null; // signature ajoutée en bas des emails (v26)
  rib_path?: string | null; // RIB PDF officiel uploadé (bucket entreprise, v26)
  // Signature du garage (PNG, bucket PRIVÉ 'prive') — superposée au tampon
  // sur les documents générés (v7.6)
  signature_path?: string | null;
  modele_pdf?: string | null; // modèle de mise en page des PDF : classique | bandeau | epure (v31)
  couleur_pdf?: string | null; // couleur d'accent des PDF, hex #rrggbb (v31)
};

export type Client = {
  id: string;
  created_at: string;
  nom: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  source: string;
  notes: string | null;
};

export type Paiement = {
  id: string;
  created_at: string;
  dossier_id: string | null;
  document_id: string | null;
  montant: number | null;
  date_paiement: string | null;
  moyen: string; // virement|cheque|cb|especes|autre
  reference: string | null;
  notes: string | null;
};

export type Relance = {
  id: string;
  created_at: string;
  dossier_id: string | null;
  document_id: string | null;
  date_relance: string | null;
  canal: string; // email|telephone|courrier|autre
  notes: string | null;
};

export type OrdreReparation = {
  id: string;
  created_at: string;
  dossier_id: string;
  numero: string | null;
  date_or: string | null;
  travaux: string | null;
  date_debut: string | null;
  date_fin: string | null;
  montant_ht: number | null;
  signataire_nom: string | null;
  signature: string | null; // dataURL PNG
  signe_le: string | null;
  statut: string; // brouillon | signe
  sign_token?: string | null;
};

export type Restitution = {
  id: string;
  created_at: string;
  dossier_id: string;
  date_restitution: string | null;
  kilometrage: number | null;
  observations: string | null;
  signataire_nom: string | null;
  signature: string | null; // dataURL PNG
  signe_le: string | null;
  statut: string; // brouillon | signe
};

export type TransfertGarantie = {
  id: string;
  created_at: string;
  dossier_id: string;
  vehicule_immat: string | null;
  vehicule_modele: string | null;
  date_debut: string | null;
  date_fin: string | null;
  date_demande: string | null;
  date_accord: string | null;
  statut: string; // a_demander | demande | accorde | refuse
  notes: string | null;
};

export type CommandePiece = {
  id: string;
  created_at: string;
  dossier_id: string;
  designation: string;
  prix_ht: number | null;
  statut: string; // a_commander | commande | en_livraison | receptionne
  commentaire: string | null;
};

export type DemandeAssurance = {
  id: string;
  created_at: string;
  dossier_id: string;
  demande: string;
  demandeur: string; // assurance | expert | autre
  date_demande: string | null;
  date_envoi: string | null; // null = pas encore envoyé
  notes: string | null;
};

export type PieceDossier = {
  id: string;
  created_at: string;
  dossier_id: string;
  type: string; // carte_grise | constat | rapport_definitif | prise_en_charge | autre
  nom: string | null;
  path: string;
};

export type CessionCreance = {
  id: string;
  created_at: string;
  dossier_id: string;
  date_cession: string | null;
  montant: number | null; // créance cédée (TTC)
  signataire_nom: string | null;
  signature: string | null; // dataURL PNG
  signe_le: string | null;
  statut: string; // brouillon | signe
  sign_token?: string | null;
};

export type FlotteVehicule = {
  id: string;
  created_at: string;
  immatriculation: string;
  marque_modele: string | null;
  assurance: string | null;
  date_assurance: string | null;
  date_sinistre: string | null;
  conducteur: string | null;
  conducteur_tel: string | null;
  ct_ok: boolean;
  cg_ok: boolean;
  entretien_ok: boolean;
  loue: boolean;
  locataire: string | null;
  locataire_tel: string | null;
  location_debut: string | null;
  location_fin: string | null;
  prix_jour: number | null;
  commentaire: string | null;
};

export type BankTransaction = {
  id: string;
  created_at: string;
  date_transaction: string | null;
  libelle: string | null;
  montant: number | null; // crédit > 0, débit < 0
  reference: string | null;
  compte: string | null;
  source: string; // csv | api
  statut: string; // nouveau | rapproche | ignore
  document_id: string | null;
  paiement_id: string | null;
  hash: string | null;
};

// Action du tableau de bord marquée comme FAITE (v35) : tant que la marque
// existe, l'action reste hors de la liste « À faire aujourd'hui ».
export type ActionFaite = {
  id: string;
  created_at: string;
  dossier_id: string;
  code: string;      // code de l'action (cf. lib/actions.ts)
  fait_le: string;
};

export type ListeDiffusion = {
  id: string;
  created_at: string;
  nom: string;
  emails: string; // adresses séparées par des virgules
};

export type Email = {
  id: string;
  created_at: string;
  dossier_id: string | null;
  client_id: string | null;
  destinataire: string | null;
  objet: string | null;
  corps: string | null;
  statut: string;
  erreur: string | null;
};

/* ==================================================================
 *  MÉMOIRE DE L'ANALYSE (v40) — « l'IA apprend » des corrections
 *  du garage sur les devis / factures générés depuis un rapport.
 * ================================================================== */

export type TypeRegle =
  | "libelle" // écrire « valeur » à la place de la désignation « cle »
  | "categorie" // ranger « cle » dans le tableau « valeur » (piece|mo|autre)
  | "taux" // taux horaire habituel de « cle » (indication pour l'IA)
  | "ignorer" // ne pas extraire la ligne « cle »
  | "consigne"; // consigne libre écrite par le garage

export type IaRegle = {
  id: string;
  created_at: string;
  updated_at?: string | null;
  type: TypeRegle;
  /** Désignation d'origine, normalisée (minuscules, sans accents). */
  cle: string;
  valeur: string;
  source: "auto" | "manuel";
  occurrences: number;
  actif: boolean;
  exemple: string | null;
};

export type IaCorrection = {
  id: string;
  created_at: string;
  dossier_id: string | null;
  document_id: string | null;
  type: TypeRegle;
  cle: string;
  valeur: string;
  exemple: string | null;
};
