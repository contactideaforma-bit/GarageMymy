// Données de DÉMONSTRATION du mode expert : le dossier du rapport modèle
// (Mercedes Classe C GV-277-WR, rapport AE00034914) — créé en un clic depuis
// le tableau de bord quand l'espace est vide, pour montrer le résultat.

import { supabase } from "@/lib/supabaseClient";
import { creerDossier, enregistrerGarage } from "./data";
import { Choc, DossierExpert, Operation } from "./types";

export const CHOCS_DEMO: Choc[] = [
  {
    numero: 1,
    libelle: "Choc avant gauche",
    postes: [
      { poste: "Tôlerie T1", heures: 11, taux: 125, remise: 0 },
      { poste: "Tôlerie T2", heures: 9, taux: 125, remise: 0 },
      { poste: "Peinture T1", heures: 16, taux: 125, remise: 0 },
      { poste: "Nacré vernis", heures: 16, taux: 125, remise: 0 },
    ],
  },
];

export const OPERATIONS_DEMO: Operation[] = [
  { op: "E", peinture: true, designation: "OPTIQUE AVG.", qte: 1, prix_unit: 2232.84, qualite: "origine" },
  { op: "E", peinture: true, designation: "AILE AVG.", qte: 1, prix_unit: 520.3, qualite: "origine" },
  { op: "E", peinture: false, designation: "MONOGRAMME AILE AVG.", qte: 1, prix_unit: 53.87 },
  { op: "E", peinture: true, designation: "PORTE AVG.", qte: 1, prix_unit: 885.25, qualite: "origine" },
  { op: "E", peinture: false, designation: "JOINT PORTE AVG.", qte: 1, prix_unit: 148.05 },
  { op: "E", peinture: true, designation: "PORTE ARG.", qte: 1, prix_unit: 983.6, qualite: "origine" },
  { op: "E", peinture: false, designation: "JOINT PORTE ARG.", qte: 1, prix_unit: 148.05 },
  { op: "I", peinture: true, designation: "CAPOT MOTEUR REPARER", qte: 0, prix_unit: 0 },
  { op: "I", peinture: true, designation: "AILE ARG. REPARER", qte: 0, prix_unit: 0 },
  { op: "L", peinture: true, designation: "PREPARATION POUR PEINTURE BI-COUCHES SUR", qte: 0, prix_unit: 0 },
  { op: "L", peinture: true, designation: "PIECES PLAST./METALLIQUES  PONCER", qte: 0, prix_unit: 0 },
  { op: "L", peinture: true, designation: "PIECES PLAST./METALLIQUES  APPRETER", qte: 0, prix_unit: 0 },
  { op: "L", peinture: true, designation: "PIECES PLAST./METALLIQUES  REP/MASTIQUER", qte: 0, prix_unit: 0 },
  { op: "L", peinture: true, designation: "BOUCLIER AV.  APPRETAGE (COMPL.)", qte: 0, prix_unit: 0 },
  { op: "L", peinture: true, designation: "BOUCLIER AV.  MASTIQUAGE (COMPL.)", qte: 0, prix_unit: 0 },
  { op: "L", peinture: true, designation: "BOUCLIER AV.  APPRETER (COMPL.)", qte: 0, prix_unit: 0 },
  { op: "L", peinture: true, designation: "BOUCLIER AR.  COMPL.APPRETAGE", qte: 0, prix_unit: 0 },
  { op: "L", peinture: true, designation: "BOUCLIER AR.  COMPL.MASTIQUAGE", qte: 0, prix_unit: 0 },
  { op: "L", peinture: true, designation: "BOUCLIER AR.  APPRETER (COMPL.)", qte: 0, prix_unit: 0 },
  { op: "L", peinture: true, designation: "REVET.BOUCLIER AV. PEINDRE EFFETS", qte: 0, prix_unit: 0 },
  { op: "L", peinture: true, designation: "REVETEM.BOUCLIER AR. PEINDRE EFFETS", qte: 0, prix_unit: 0 },
];

export async function creerDossierDemo(): Promise<DossierExpert> {
  const garage = await enregistrerGarage({
    nom: "AB MOTORS",
    adresse: "32 BOULEVARD PASTEUR",
    code_postal: "95210",
    ville: "SAINT-GRATIEN",
    siret: "98072608700029",
    taux_t1: 125, taux_t2: 125, taux_t3: 125, taux_peinture: 125,
  });
  const dossier = await creerDossier({
    numero: "AE00034914",
    statut: "emis",
    date_mission: "2026-06-16",
    date_visite: "2026-06-18",
    lieu_expertise: "Autre lieu",
    type_expertise: "Avant travaux",
    mandant_nom: "GROUPAMA D OC",
    numero_sinistre: "2026534269",
    date_sinistre: "2026-05-18",
    numero_police: "C421410200002",
    assure_nom: "MONSIEUR BEN-HIDA SEDAM",
    lese_nom: "MONSIEUR BEN-HIDA SEDAM",
    lese_adresse: "31830 PLAISANCE DU TOUCH",
    lese_email: "semabvtc@gmail.com",
    garage_id: garage.id,
    reparateur_nom: garage.nom,
    reparateur_adresse: "32 BOULEVARD PASTEUR\n95210 SAINT-GRATIEN",
    reparateur_siret: garage.siret,
    immatriculation: "GV-277-WR",
    marque: "Mercedes",
    modele: "CLASSE C",
    finition: "C 300/350 e",
    genre: "Voiture Particulière (Y Compris Commerciale)",
    carrosserie: "Conduite Intérieure",
    energie: "Essence Electricité (Rechargeable)",
    places: 5,
    couleur: "Noir",
    vin: "W1KAF5EB6RR163146",
    date_mec: "2024-03-21",
    date_certificat: "2024-03-21",
    kilometrage: 105729,
    etat_general: "Normal",
    dommage_type: "Circulation",
    dommage_imputable: "intensité",
    vehicule_reparable: true,
    conclusions: {
      tva_recuperable: false,
      immobilisation_jours: 5.5,
      accord_reparateur: true,
      reglement_direct: false,
      montant_compagnie: 0,
    },
  });
  await supabase.from("expertise_rapports").insert({
    dossier_id: dossier.id,
    numero: dossier.numero,
    version: 1,
    statut: "emis",
    source: "manuel",
    date_rapport: "2026-06-18",
    taux_tva: 20,
    chocs: CHOCS_DEMO,
    operations: OPERATIONS_DEMO,
  });
  await supabase.from("expertise_pieces").insert([
    { dossier_id: dossier.id, designation: "Optique avant gauche LED", reference: "A2069066903", etat: "origine", fournisseur: "Mercedes-Benz Parts", prix_ht: 2232.84, source: "manuel" },
    { dossier_id: dossier.id, designation: "Porte avant gauche", reference: "A2067200105", etat: "origine", fournisseur: "Mercedes-Benz Parts", prix_ht: 885.25, source: "manuel" },
  ]);
  return dossier;
}
