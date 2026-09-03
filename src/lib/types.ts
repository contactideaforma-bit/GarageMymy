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
  // FACTURATION ÉLECTRONIQUE (v52) : SIREN du client professionnel et de
  // l'assureur — mention obligatoire sur les factures électroniques.
  client_siren?: string | null;
  assureur_siren?: string | null;
  // RENTABILITÉ (v49) : heures réellement passées à l'atelier et coût
  // d'achat des pièces quand aucune commande n'est saisie.
  heures_passees?: number | null;
  cout_pieces_reel?: number | null;
  // CHIFFRAGE DU RAPPORT (v50) : les lignes lues dans le rapport
  // d'expertise, conservées pour pouvoir REGÉNÉRER devis et facture à
  // l'identique — y compris après suppression. Tableau JSON, cf.
  // `lignesDepuisChiffrage` dans lib/documents.ts.
  chiffrage?: unknown;

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
  // v60 (v10.8) — mode LITIGE : dossier bloqué (expert, assurance, client…)
  litige?: boolean | null;
  litige_probleme?: string | null;
  litige_deblocage?: string | null;
  litige_depuis?: string | null;
  /** v11.2 — mentions particulières lues dans le rapport (jsonb, cf. lib/mentionsRapport). */
  mentions_rapport?: unknown;
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
  siren?: string | null; // v52 — facturation électronique
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
  // ORIGINE (v54) : null = facture de réparation ; 'gardiennage' = frais de
  // parc — le contrôle « conforme au rapport d'expertise » ne s'applique pas.
  origine?: string | null;
  // FACTURATION ÉLECTRONIQUE (v52) — cycle de vie renvoyé par la plateforme
  // agréée (étape 2) : deposee | rejetee | recue | acceptee | refusee | payee
  fe_statut?: string | null;
  fe_reference?: string | null;
  fe_transmis_le?: string | null;
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
  // Date du dernier export complet des données (v46)
  derniere_sauvegarde?: string | null;
  // Lien de dépôt d'avis proposé au client à la restitution (v48)
  lien_avis?: string | null;
  // Coût horaire de l'atelier, charges comprises (v49) — sert au calcul
  // de marge ; à ne pas confondre avec le taux horaire FACTURÉ.
  cout_horaire?: number | null;
  modele_pdf?: string | null; // modèle de mise en page des PDF : classique | bandeau | epure (v31)
  couleur_pdf?: string | null; // couleur d'accent des PDF, hex #rrggbb (v31)
  // Contenu du résumé push quotidien (v42)
  push_rdv?: boolean | null;
  push_rappels?: boolean | null;
  push_urgents?: boolean | null;
  // FACTURATION ÉLECTRONIQUE (v52) : plateforme agréée désignée + option
  // « TVA sur les débits »
  fe_plateforme?: string | null;
  fe_plateforme_ref?: string | null;
  fe_choisie_le?: string | null;
  fe_reception_ok?: boolean | null;
  tva_debits?: boolean | null;
  // VÉHICULE DE PRÊT & GARDIENNAGE (v54) : tarifs par défaut, repris sur
  // chaque contrat / facture et modifiables document par document.
  pret_tarif_jour?: number | null;
  pret_tarif_horaire?: number | null;
  pret_franchise?: number | null;
  pret_km_jour?: number | null;
  pret_prix_km?: number | null;
  gard_tarif_jour?: number | null;
  gard_frais_entree?: number | null;
  gard_frais_sortie?: number | null;
  gard_frais_enlevement?: number | null;
};

// Appareil autorisé à recevoir les notifications push (v42).
// `endpoint` + les 2 clés sont fournis par le navigateur ; sans elles,
// la notification ne peut pas être déchiffrée par le téléphone.
export type PushAbonnement = {
  id: string;
  created_at: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  appareil: string | null;
  derniere_erreur?: string | null;
  dernier_envoi?: string | null;
  actif: boolean;
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
  siren?: string | null; // v52 — client professionnel
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
  // CONTRAT DE PRÊT (v54)
  tarif_jour?: number | null;
  tarif_horaire?: number | null;
  franchise?: number | null;
  km_jour?: number | null;
  prix_km?: number | null;
  km_depart?: number | null;
  carburant?: string | null;
  conducteur_nom?: string | null;
  conducteur_naissance?: string | null;
  permis_numero?: string | null;
  permis_date?: string | null;
  prise_en_charge?: string | null; // assurance | client
  clauses?: string | null;
  observations?: string | null;
  signataire_nom?: string | null;
  signature?: string | null;
  signe_le?: string | null;
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
  // FICHE VÉHICULE (v67 / v12.3)
  type_contrat_assurance?: string | null;
  numero_police?: string | null;
  date_debut_contrat?: string | null;
  date_fin_contrat?: string | null;
  assureur_tel?: string | null;
  assureur_email?: string | null;
  vin?: string | null;
  date_mise_circulation?: string | null;
  date_ct?: string | null;
  date_prochain_ct?: string | null;
  kilometrage?: number | null;
  couleur?: string | null;
  carburant?: string | null;
  notes?: string | null;
  /** Véhicule du garage immatriculé au nom d'un tiers (onglet « Flotte hors garage »). */
  hors_garage?: boolean | null;
  titulaire_cg?: string | null;
  titulaire_cg_tel?: string | null;
};

export type FlotteDocument = {
  id: string;
  created_at: string;
  vehicule_id: string;
  type: string; // carte_grise | assurance | cni | permis | controle_technique | photo | entretien | contrat | autre
  nom: string | null;
  path: string;
  date_expiration: string | null;
};

export type FlotteEntretien = {
  id: string;
  created_at: string;
  vehicule_id: string;
  date_entretien: string | null;
  type: string; // revision | vidange | pneus | freins | ct | carrosserie | reparation | autre
  description: string | null;
  kilometrage: number | null;
  cout: number | null;
  prestataire: string | null;
  prochain_le: string | null;
  prochain_km: number | null;
};

/** Prêt OU location d'un véhicule de la flotte (v67). */
export type FlotteMiseADispo = {
  id: string;
  created_at: string;
  vehicule_id: string;
  type: string; // pret | location
  statut: string; // en_cours | terminee | annulee
  dossier_id: string | null;
  client_id: string | null;
  transfert_id: string | null;
  conducteur_nom: string | null;
  conducteur_tel: string | null;
  conducteur_email: string | null;
  conducteur_adresse: string | null;
  conducteur_naissance: string | null;
  permis_numero: string | null;
  permis_date: string | null;
  date_debut: string | null;
  date_fin: string | null;
  date_retour: string | null;
  km_depart: number | null;
  km_retour: number | null;
  carburant_depart: string | null;
  carburant_retour: string | null;
  observations_depart: string | null;
  observations_retour: string | null;
  tarif_jour: number | null;
  tarif_horaire: number | null;
  franchise: number | null;
  km_jour: number | null;
  prix_km: number | null;
  prise_en_charge: string | null; // assurance | client
  caution: number | null;
  clauses: string | null;
  signataire_nom: string | null;
  signature: string | null;
  signe_le: string | null;
  cg_acceptees: boolean;
  notes: string | null;
};

export type FlottePhoto = {
  id: string;
  created_at: string;
  vehicule_id: string;
  mise_a_dispo_id: string | null;
  moment: string; // depart | retour | libre
  angle: string;
  path: string;
  kilometrage: number | null;
  commentaire: string | null;
  prise_le: string;
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

// Rappel écrit par le garage (table `ardoise`) — v41.
// Peut être rattaché à un dossier et porter une échéance, laquelle crée
// un rendez-vous dans l'agenda (`evenement_id`).
export type LigneArdoise = {
  id: string;
  created_at: string;
  texte: string;
  fait: boolean;
  fait_le?: string | null;
  ordre: number;
  dossier_id?: string | null;
  echeance?: string | null;
  evenement_id?: string | null;
  // v59 (v10.7) — conversation garage ↔ secrétaire
  auteur?: "garage" | "secretaire" | null;   // qui a créé la tâche
  pour?: "garage" | "secretaire" | null;     // destinataire (null = tous)
  origine?: string | null;                   // 'suggestion:<code>' si programmée depuis la fiche
};

/** Message du fil interne garage ↔ secrétaire (v59, v10.7). */
export type MessageConversation = {
  id: string;
  created_at: string;
  auteur: "garage" | "secretaire";
  texte: string;
  dossier_id?: string | null;
  lu_garage: boolean;
  lu_secretaire: boolean;
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

// ============================================================
//  ASSISTANCE — tickets d'incident (v43)
// ============================================================

export type Ticket = {
  id: string;
  created_at: string;
  maj_le?: string | null;
  numero?: string | null;
  sujet: string;
  description: string;
  /** bug | lenteur | donnees | document | question | amelioration | autre */
  categorie: string;
  /** bloquant | gene | mineur */
  gravite: string;
  /** nouveau | en_cours | resolu | ferme */
  statut: string;
  page?: string | null;
  navigateur?: string | null;
  version_app?: string | null;
  contact_email?: string | null;
  contact_tel?: string | null;
  garage_nom?: string | null;
  lu_admin?: boolean;
  lu_garage?: boolean;
  ferme_le?: string | null;
  owner_id?: string | null;
};

export type TicketMessage = {
  id: string;
  created_at: string;
  ticket_id: string;
  /** 'garage' = le carrossier ; 'support' = l'éditeur */
  auteur: string;
  auteur_nom?: string | null;
  message: string;
  owner_id?: string | null;
};

/** Ticket enrichi côté admin : identité du garage résolue par le serveur. */
export type TicketAdmin = Ticket & {
  compte_email?: string | null;
  entreprise_nom?: string | null;
  nb_messages?: number;
  messages?: TicketMessage[];
};

// Photo d'état du véhicule, à l'entrée ou à la sortie (v47).
export type PhotoEtat = {
  id: string;
  created_at: string;
  dossier_id: string;
  /** entree | sortie */
  moment: string;
  /** code d'angle (cf. lib/photosEtat.ts) */
  angle: string;
  path: string;
  commentaire?: string | null;
  prise_le: string;
  kilometrage?: number | null;
  owner_id?: string | null;
};

// Lien de suivi partagé au client d'un dossier (v48).
export type PartageSuivi = {
  id: string;
  created_at: string;
  dossier_id: string;
  token: string;
  actif: boolean;
  expire_le?: string | null;
  vues: number;
  derniere_vue?: string | null;
  owner_id?: string | null;
};
