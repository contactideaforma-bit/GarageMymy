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

  // Client
  client_nom: string | null;
  client_adresse: string | null;
  client_code_postal: string | null;
  client_ville: string | null;

  // Rapport
  rapport_path: string | null;
  rapport_nom: string | null;
};

export type Evenement = {
  id: string;
  created_at: string;
  dossier_id: string | null;
  titre: string;
  description: string | null;
  date_evenement: string;
};

export type DocumentType = "devis" | "facture";

export type Document = {
  id: string;
  created_at: string;
  dossier_id: string;
  type: DocumentType;
  numero: string | null;
  date_document: string | null;
  statut: string; // brouillon|envoye|accepte|refuse|paye
  tva: number | null;
  notes: string | null;
  total_ht: number | null;
  total_tva: number | null;
  total_ttc: number | null;
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
