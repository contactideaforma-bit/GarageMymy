// Types du MODE EXPERT (v13.5) — tables expertise_* (migration v75).

export type StatutExpertise = "mission" | "visite" | "chiffrage" | "rapport" | "emis" | "cloture";

export const STATUTS_EXPERTISE: { code: StatutExpertise; label: string; badge: string }[] = [
  { code: "mission", label: "Mission reçue", badge: "badge-neutral" },
  { code: "visite", label: "Visite planifiée", badge: "badge-info" },
  { code: "chiffrage", label: "Chiffrage en cours", badge: "badge-warn" },
  { code: "rapport", label: "Rapport à émettre", badge: "badge-warn" },
  { code: "emis", label: "Rapport émis", badge: "badge-ok" },
  { code: "cloture", label: "Clôturé", badge: "badge-neutral" },
];

export function infoStatutExpertise(code: string | null | undefined) {
  return STATUTS_EXPERTISE.find((s) => s.code === code) || STATUTS_EXPERTISE[0];
}

export type Cabinet = {
  owner_id: string;
  nom: string;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  tel: string | null;
  email: string | null;
  siret: string | null;
  expert_nom: string | null;
  expert_numero: string | null;
  signature_path: string | null;
  taux_tva: number | null;
  prochain_numero: number;
};

export type GarageExpert = {
  id: string;
  owner_id: string;
  nom: string;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  siret: string | null;
  tel: string | null;
  email: string | null;
  contact: string | null;
  taux_t1: number | null;
  taux_t2: number | null;
  taux_t3: number | null;
  taux_peinture: number | null;
  notes: string | null;
  created_at: string;
};

export type Conclusions = {
  tva_recuperable?: boolean;
  immobilisation_jours?: number | null;
  reparabilite_technique?: string | null;
  reparabilite_economique?: string | null;
  procedure_vge?: string | null;
  accord_reparateur?: boolean | null;
  accord_assure?: boolean | null;
  facture_reparateur?: string | null;
  reglement_direct?: boolean | null;
  montant_compagnie?: number | null;
  observations?: string | null;
};

export type DossierExpert = {
  id: string;
  owner_id: string;
  numero: string;
  statut: StatutExpertise;
  date_mission: string | null;
  date_visite: string | null;
  lieu_expertise: string | null;
  type_expertise: string | null;
  mandant_nom: string | null;
  mandant_adresse: string | null;
  mandant_email: string | null;
  numero_sinistre: string | null;
  date_sinistre: string | null;
  numero_police: string | null;
  assure_nom: string | null;
  lese_nom: string | null;
  lese_adresse: string | null;
  lese_email: string | null;
  lese_tel: string | null;
  garage_id: string | null;
  reparateur_nom: string | null;
  reparateur_adresse: string | null;
  reparateur_siret: string | null;
  immatriculation: string | null;
  marque: string | null;
  modele: string | null;
  finition: string | null;
  genre: string | null;
  type_mine: string | null;
  numero_formule: string | null;
  carrosserie: string | null;
  energie: string | null;
  places: number | null;
  couleur: string | null;
  vin: string | null;
  date_mec: string | null;
  date_certificat: string | null;
  validite_ct: string | null;
  kilometrage: number | null;
  etat_general: string | null;
  pneu_avg: string | null;
  pneu_avd: string | null;
  pneu_arg: string | null;
  pneu_ard: string | null;
  dommage_type: string | null;
  dommage_imputable: string | null;
  dommage_intensite: string | null;
  dommage_description: string | null;
  vehicule_reparable: boolean | null;
  conclusions: Conclusions | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ZonePhoto =
  | "avant" | "arriere" | "avg" | "avd" | "arg" | "ard"
  | "lateral_g" | "lateral_d" | "toit" | "interieur" | "compteur" | "vin" | "plaque" | "dommage" | "autre";

export const ZONES_PHOTO: { code: ZonePhoto; label: string; groupe: "tour" | "identification" | "dommages" }[] = [
  { code: "avant", label: "Face avant", groupe: "tour" },
  { code: "avg", label: "3/4 avant gauche", groupe: "tour" },
  { code: "lateral_g", label: "Latéral gauche", groupe: "tour" },
  { code: "arg", label: "3/4 arrière gauche", groupe: "tour" },
  { code: "arriere", label: "Face arrière", groupe: "tour" },
  { code: "ard", label: "3/4 arrière droit", groupe: "tour" },
  { code: "lateral_d", label: "Latéral droit", groupe: "tour" },
  { code: "avd", label: "3/4 avant droit", groupe: "tour" },
  { code: "toit", label: "Toit", groupe: "tour" },
  { code: "plaque", label: "Plaque d'immatriculation", groupe: "identification" },
  { code: "compteur", label: "Compteur kilométrique", groupe: "identification" },
  { code: "vin", label: "N° de série (VIN)", groupe: "identification" },
  { code: "interieur", label: "Intérieur", groupe: "identification" },
  { code: "dommage", label: "Dommage (gros plan)", groupe: "dommages" },
  { code: "autre", label: "Autre", groupe: "dommages" },
];

export function labelZone(code: string | null | undefined): string {
  return ZONES_PHOTO.find((z) => z.code === code)?.label || "Autre";
}

export type PhotoExpert = {
  id: string;
  owner_id: string;
  dossier_id: string;
  zone: ZonePhoto;
  legende: string | null;
  path: string;
  prise_le: string;
  created_at: string;
};

export type TypeDocExpert =
  | "ordre_mission" | "devis_garage" | "facture_garage" | "carte_grise" | "constat" | "pv_police"
  | "permis" | "rapport" | "courrier" | "autre";

export const TYPES_DOC_EXPERT: { code: TypeDocExpert; label: string }[] = [
  { code: "ordre_mission", label: "Ordre de mission" },
  { code: "devis_garage", label: "Devis du garage" },
  { code: "facture_garage", label: "Facture du garage" },
  { code: "carte_grise", label: "Carte grise" },
  { code: "constat", label: "Constat amiable" },
  { code: "pv_police", label: "PV / dépôt de plainte" },
  { code: "permis", label: "Permis de conduire" },
  { code: "rapport", label: "Rapport d'expertise" },
  { code: "courrier", label: "Courrier" },
  { code: "autre", label: "Autre" },
];

export function labelTypeDoc(code: string | null | undefined): string {
  return TYPES_DOC_EXPERT.find((t) => t.code === code)?.label || "Autre";
}

export type DocumentExpert = {
  id: string;
  owner_id: string;
  dossier_id: string;
  type: TypeDocExpert;
  nom: string;
  path: string;
  taille: number | null;
  analyse_ia: Record<string, unknown> | null;
  created_at: string;
};

/** Une ligne de main-d'œuvre / peinture d'un choc (tableau « Détail choc »). */
export type PosteChoc = {
  poste: string; // "Tôlerie T1", "Peinture T1", "Nacré vernis", "Ingrédients peinture"…
  heures: number;
  taux: number; // €/h
  remise: number; // %
  forfait?: number | null; // montant HT direct (ingrédients, forfaits) — remplace heures × taux
};

export type Choc = {
  numero: number;
  libelle?: string | null; // "Choc avant", "Choc latéral gauche"…
  postes: PosteChoc[];
};

/** Codes d'opération du rapport (légende du modèle Alliance). */
export type CodeOperation = "E" | "FO" | "I" | "L" | "M" | "N" | "P" | "V" | "A" | "C";

export const CODES_OPERATION: { code: CodeOperation; label: string }[] = [
  { code: "E", label: "Remplacement" },
  { code: "FO", label: "Forfait" },
  { code: "I", label: "Redressage" },
  { code: "L", label: "Peinture seule" },
  { code: "M", label: "Marbre" },
  { code: "N", label: "Dépose repose" },
  { code: "P", label: "Contrôle" },
  { code: "V", label: "Mesure" },
  { code: "A", label: "Port" },
  { code: "C", label: "Consigne" },
];

export type Operation = {
  op: CodeOperation;
  peinture: boolean; // « * » après l'opération = opération de peinture
  designation: string;
  qte: number;
  prix_unit: number; // € HT (pièce) — 0 pour une opération de main-d'œuvre
  reference?: string | null;
  qualite?: "origine" | "equivalente" | "reemploi" | null; // O / Q / R (seconde main)
  fournisseur?: string | null;
  note?: string | null;
};

export type RapportExpert = {
  id: string;
  owner_id: string;
  dossier_id: string;
  numero: string;
  version: number;
  statut: "brouillon" | "emis";
  source: "manuel" | "devis" | "facture" | "photos";
  date_rapport: string | null;
  taux_tva: number | null;
  chocs: Choc[];
  operations: Operation[];
  remise: number | null;
  vetuste: number | null;
  srgc: number | null;
  pdf_path: string | null;
  created_at: string;
  updated_at: string;
};

export type PieceExpert = {
  id: string;
  owner_id: string;
  dossier_id: string | null;
  designation: string;
  reference: string | null;
  etat: "neuf" | "occasion" | "origine" | "equivalent";
  fournisseur: string | null;
  prix_ht: number | null;
  url: string | null;
  source: "ia" | "manuel";
  notes: string | null;
  created_at: string;
};

/* ---------------------- Base de données (v13.6) ---------------------- */

export type AssuranceExpert = {
  id: string;
  owner_id: string;
  nom: string;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  siren: string | null;
  tel: string | null;
  email: string | null;
  contact: string | null;
  notes: string | null;
  created_at: string;
};

export type ClientExpert = {
  id: string;
  owner_id: string;
  nom: string;
  type: "particulier" | "societe";
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  siren: string | null;
  tel: string | null;
  email: string | null;
  contact: string | null;
  notes: string | null;
  created_at: string;
};

/** Ligne générique d'une fiche de l'annuaire (assurance, client, réparateur). */
export type FicheAnnuaire = {
  nom: string;
  adresse?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  siren?: string | null;
  siret?: string | null;
  tel?: string | null;
  email?: string | null;
  contact?: string | null;
  notes?: string | null;
  type?: "particulier" | "societe" | null;
};

/** Adresse sur une ligne à partir d'une fiche. */
export function adresseFiche(f: { adresse?: string | null; code_postal?: string | null; ville?: string | null }): string {
  return [f.adresse, [f.code_postal, f.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}
