export type Dossier = {
  id: string;
  created_at: string;
  statut: string;
  montant: number | null;

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

  // Rapport
  rapport_path: string | null;
  rapport_nom: string | null;

  // Relances automatiques (cron) activées sur ce dossier
  relance_auto?: boolean | null;
  // Mode cession de créance : le garage est payé directement par l'assurance
  mode_cession?: boolean | null;
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
};

export type DocumentLigne = {
  id: string;
  document_id: string;
  designation: string | null;
  quantite: number | null;
  prix_unitaire: number | null;
  ordre: number | null;
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
  type: string; // carte_grise | constat | rapport_definitif | autre
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
