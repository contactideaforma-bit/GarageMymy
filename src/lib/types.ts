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
