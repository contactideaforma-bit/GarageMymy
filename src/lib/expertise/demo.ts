// Données de DÉMONSTRATION du mode expert (v13.5) : le dossier du rapport
// modèle (Mercedes Classe C GV-277-WR, AE00034914) + des réparateurs et des
// missions en cours à chaque étape, pour montrer l'outil « en situation ».
// Idempotent : un dossier / garage déjà présent n'est pas recréé.

import { supabase } from "@/lib/supabaseClient";
import { chargerDossiers, chargerGarages, completerAnnuaireDepuisDossier, creerDossier, enregistrerGarage } from "./data";
import { Choc, DossierExpert, GarageExpert, Operation } from "./types";

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

/* ------------------------------ Garages ------------------------------ */

const GARAGES_DEMO: Partial<GarageExpert>[] = [
  { nom: "AB MOTORS", adresse: "32 BOULEVARD PASTEUR", code_postal: "95210", ville: "SAINT-GRATIEN", siret: "98072608700029", tel: "01 39 89 12 40", contact: "M. Aziz Benali", taux_t1: 125, taux_t2: 125, taux_t3: 125, taux_peinture: 125 },
  { nom: "CARROSSERIE BY SAM", adresse: "14 CHEMIN DE LA MADRAGUE-VILLE", code_postal: "13015", ville: "MARSEILLE", siret: "84512396700018", tel: "04 91 63 22 18", email: "contact@carrosseriebysam.fr", contact: "Sam", taux_t1: 68, taux_t2: 72, taux_t3: 78, taux_peinture: 74, notes: "Agréé toutes compagnies, véhicule de courtoisie." },
  { nom: "GARAGE DU ROUCAS", adresse: "112 AVENUE DE LA CORSE", code_postal: "13007", ville: "MARSEILLE", siret: "53298114500027", tel: "04 91 52 10 77", contact: "Mme Karine Roux", taux_t1: 65, taux_t2: 70, taux_t3: 75, taux_peinture: 70 },
  { nom: "CARROSSERIE DE L'ÉTANG", adresse: "ZA LES ESTROUBLANS, 8 RUE DE BERLIN", code_postal: "13127", ville: "VITROLLES", siret: "79934682100031", tel: "04 42 89 34 61", contact: "M. Thierry Pons", taux_t1: 62, taux_t2: 66, taux_t3: 70, taux_peinture: 68, notes: "Spécialiste aluminium et véhicules premium." },
  { nom: "AUTO PRESTIGE AIX", adresse: "410 ROUTE DES MILLES", code_postal: "13290", ville: "AIX-EN-PROVENCE", siret: "88123776500012", tel: "04 42 20 55 09", contact: "M. Nicolas Ferrer", taux_t1: 72, taux_t2: 78, taux_t3: 85, taux_peinture: 80 },
  { nom: "CARROSSERIE MARIGNANE SERVICES", adresse: "25 AVENUE DU 8 MAI 1945", code_postal: "13700", ville: "MARIGNANE", siret: "43121987600044", tel: "04 42 09 71 30", contact: "M. Rachid Lounis", taux_t1: 60, taux_t2: 64, taux_t3: 68, taux_peinture: 66 },
];

/* ------------------------------ Dossiers ----------------------------- */

const ilYA = (jours: number) => {
  const d = new Date();
  d.setDate(d.getDate() - jours);
  return d.toISOString().slice(0, 10);
};

type DossierDemo = { dossier: Partial<DossierExpert>; garage: string; rapport?: { statut: "brouillon" | "emis"; source: "manuel" | "devis" | "facture" | "photos"; chocs: Choc[]; operations: Operation[]; date?: string } };

const DOSSIERS_DEMO: DossierDemo[] = [
  {
    garage: "AB MOTORS",
    dossier: {
      numero: "AE00034914", statut: "emis", date_mission: "2026-06-16", date_visite: "2026-06-18", lieu_expertise: "Autre lieu", type_expertise: "Avant travaux",
      mandant_nom: "GROUPAMA D OC", mandant_adresse: "MAISON DE L'AGRICULTURE, 10 PLACE DU MARÉCHAL JUIN, 31000 TOULOUSE", numero_sinistre: "2026534269", date_sinistre: "2026-05-18", numero_police: "C421410200002", assure_nom: "MONSIEUR BEN-HIDA SEDAM",
      lese_nom: "MONSIEUR BEN-HIDA SEDAM", lese_adresse: "31830 PLAISANCE DU TOUCH", lese_email: "semabvtc@gmail.com",
      immatriculation: "GV-277-WR", marque: "Mercedes", modele: "CLASSE C", finition: "C 300/350 e", energie: "Essence Electricité (Rechargeable)", places: 5, couleur: "Noir", vin: "W1KAF5EB6RR163146", date_mec: "2024-03-21", date_certificat: "2024-03-21", kilometrage: 105729,
      dommage_type: "Circulation", dommage_imputable: "intensité", vehicule_reparable: true,
      conclusions: { tva_recuperable: false, immobilisation_jours: 5.5, accord_reparateur: true, reglement_direct: false, montant_compagnie: 0 },
    },
    rapport: { statut: "emis", source: "manuel", chocs: CHOCS_DEMO, operations: OPERATIONS_DEMO, date: "2026-06-18" },
  },
  {
    garage: "CARROSSERIE BY SAM",
    dossier: {
      numero: "AE00034915", statut: "rapport", date_mission: ilYA(9), date_visite: ilYA(4), lieu_expertise: "Chez le réparateur", type_expertise: "Avant travaux",
      mandant_nom: "AXA FRANCE IARD", mandant_adresse: "313 TERRASSES DE L'ARCHE, 92727 NANTERRE CEDEX", numero_sinistre: "2026A0458812", date_sinistre: ilYA(15), numero_police: "1029384756", assure_nom: "MADAME LAURA MARTINEZ",
      lese_nom: "MADAME LAURA MARTINEZ", lese_adresse: "27 RUE PARADIS\n13006 MARSEILLE", lese_email: "laura.martinez@gmail.com", lese_tel: "06 12 45 78 90",
      immatriculation: "GK-512-AZ", marque: "Peugeot", modele: "3008", finition: "1.5 BlueHDi 130 Allure", energie: "Diesel", places: 5, couleur: "Gris Artense", vin: "VF3MCYHZRNS123456", date_mec: "2022-09-14", date_certificat: "2022-09-14", kilometrage: 48210,
      dommage_type: "Circulation", dommage_imputable: "Oui", dommage_intensite: "moyenne", dommage_description: "Choc arrière droit : bouclier AR, feu ARD, hayon enfoncé, aile ARD à redresser.", vehicule_reparable: true,
      conclusions: { tva_recuperable: false, immobilisation_jours: 4, accord_reparateur: true, reglement_direct: true, montant_compagnie: 0 },
    },
    rapport: {
      statut: "brouillon", source: "devis",
      chocs: [{ numero: 1, libelle: "Choc arrière droit", postes: [
        { poste: "Tôlerie T1", heures: 6.5, taux: 68, remise: 0 }, { poste: "Tôlerie T2", heures: 3, taux: 72, remise: 0 },
        { poste: "Peinture T1", heures: 7.5, taux: 74, remise: 0 }, { poste: "Nacré vernis", heures: 7.5, taux: 74, remise: 0 }, { poste: "Ingrédients peinture", heures: 0, taux: 0, remise: 0, forfait: 210 },
      ] }],
      operations: [
        { op: "E", peinture: true, designation: "BOUCLIER AR.", qte: 1, prix_unit: 412.5, reference: "9838461980", qualite: "origine" },
        { op: "E", peinture: false, designation: "FEU ARD.", qte: 1, prix_unit: 296.4, reference: "9836587280", qualite: "origine" },
        { op: "E", peinture: true, designation: "HAYON AR.", qte: 1, prix_unit: 1084.2, qualite: "reemploi" },
        { op: "E", peinture: false, designation: "CAPTEUR RECUL ARD.", qte: 2, prix_unit: 58.9, qualite: "equivalente" },
        { op: "I", peinture: true, designation: "AILE ARD. REPARER", qte: 0, prix_unit: 0 },
        { op: "L", peinture: true, designation: "PORTE ARD. RACCORD", qte: 0, prix_unit: 0 },
        { op: "N", peinture: false, designation: "GARNITURE HAYON DEP/REP", qte: 0, prix_unit: 0 },
        { op: "P", peinture: false, designation: "CONTROLE GEOMETRIE TRAIN AR.", qte: 0, prix_unit: 0 },
      ],
    },
  },
  {
    garage: "GARAGE DU ROUCAS",
    dossier: {
      numero: "AE00034916", statut: "chiffrage", date_mission: ilYA(6), date_visite: ilYA(2), lieu_expertise: "Chez le réparateur", type_expertise: "Avant travaux",
      mandant_nom: "MAIF", mandant_adresse: "200 AVENUE SALVADOR ALLENDE, 79000 NIORT", numero_sinistre: "26-0987-4412", date_sinistre: ilYA(11), numero_police: "M7781203", assure_nom: "MONSIEUR KARIM HADDAD",
      lese_nom: "MONSIEUR KARIM HADDAD", lese_adresse: "5 BOULEVARD MICHELET\n13008 MARSEILLE", lese_tel: "07 61 20 33 48",
      immatriculation: "FS-846-LM", marque: "Renault", modele: "CLIO V", finition: "TCe 90 Intens", energie: "Essence", places: 5, couleur: "Rouge Flamme", vin: "VF1RJA00X68123789", date_mec: "2021-03-02", kilometrage: 61300,
      dommage_type: "Stationnement", dommage_imputable: "Oui", dommage_intensite: "faible", dommage_description: "Rayures profondes et enfoncement porte AVG + rétroviseur gauche cassé.", vehicule_reparable: true,
      conclusions: { tva_recuperable: false },
    },
    rapport: {
      statut: "brouillon", source: "photos",
      chocs: [{ numero: 1, libelle: "Choc latéral gauche", postes: [
        { poste: "Tôlerie T1", heures: 3, taux: 65, remise: 0 }, { poste: "Peinture T1", heures: 4, taux: 70, remise: 0 }, { poste: "Nacré vernis", heures: 4, taux: 70, remise: 0 },
      ] }],
      operations: [
        { op: "E", peinture: true, designation: "RETROVISEUR EXT. G.", qte: 1, prix_unit: 189, qualite: "equivalente" },
        { op: "I", peinture: true, designation: "PORTE AVG. REPARER", qte: 0, prix_unit: 0 },
        { op: "L", peinture: true, designation: "AILE AVG. RACCORD", qte: 0, prix_unit: 0 },
      ],
    },
  },
  {
    garage: "CARROSSERIE DE L'ÉTANG",
    dossier: {
      numero: "AE00034917", statut: "visite", date_mission: ilYA(2), date_visite: ilYA(-2), lieu_expertise: "Chez le réparateur", type_expertise: "Avant travaux",
      mandant_nom: "ALLIANZ IARD", mandant_adresse: "1 COURS MICHELET, 92800 PUTEAUX", numero_sinistre: "AZ2026-778-1140", date_sinistre: ilYA(5), numero_police: "056781234", assure_nom: "SAS TRANSPORTS RIVIÈRE",
      lese_nom: "SAS TRANSPORTS RIVIÈRE", lese_adresse: "ZI LES PALUDS, 220 AVENUE DES CAILLOLS\n13400 AUBAGNE", lese_email: "compta@transports-riviere.fr", lese_tel: "04 42 03 88 11",
      immatriculation: "HB-203-TR", marque: "Volkswagen", modele: "TRANSPORTER T6.1", finition: "2.0 TDI 150 Fourgon", genre: "Camionnette", carrosserie: "Fourgon", energie: "Diesel", places: 3, couleur: "Blanc Candy", vin: "WV1ZZZ7HZNH045678", date_mec: "2023-01-19", kilometrage: 88540,
      dommage_type: "Circulation", dommage_imputable: "Oui", dommage_intensite: "forte", dommage_description: "Collision frontale à faible vitesse : bouclier AV, calandre, capot, optiques, radiateur à contrôler.", vehicule_reparable: true,
      conclusions: { tva_recuperable: true },
    },
  },
  {
    garage: "AUTO PRESTIGE AIX",
    dossier: {
      numero: "AE00034918", statut: "mission", date_mission: ilYA(1), date_visite: ilYA(-4), lieu_expertise: "Chez le réparateur", type_expertise: "Avant travaux",
      mandant_nom: "MACIF", mandant_adresse: "1 RUE JACQUES VANDIER, 79000 NIORT", numero_sinistre: "2026-MC-331902", date_sinistre: ilYA(3), numero_police: "MC5540921", assure_nom: "MADAME SOPHIE DURAND",
      lese_nom: "MADAME SOPHIE DURAND", lese_adresse: "18 COURS MIRABEAU\n13100 AIX-EN-PROVENCE", lese_email: "s.durand@outlook.fr", lese_tel: "06 84 11 27 65",
      immatriculation: "GT-119-PX", marque: "BMW", modele: "SERIE 1", finition: "118i M Sport", energie: "Essence", places: 5, couleur: "Bleu Portimao", vin: "WBA7K310X0AB12345", date_mec: "2023-07-05", kilometrage: 27900,
      dommage_type: "Grêle", dommage_imputable: "Oui", dommage_intensite: "moyenne", dommage_description: "Impacts de grêle sur capot, toit et coffre (déclaration après épisode du 12/09).", vehicule_reparable: true,
      conclusions: {},
    },
  },
  {
    garage: "CARROSSERIE MARIGNANE SERVICES",
    dossier: {
      numero: "AE00034919", statut: "chiffrage", date_mission: ilYA(12), date_visite: ilYA(7), lieu_expertise: "Chez le réparateur", type_expertise: "Valeur vénale",
      mandant_nom: "GMF ASSURANCES", mandant_adresse: "1 RUE RAOUL DAUTRY, 95120 ERMONT", numero_sinistre: "GMF-26-0112877", date_sinistre: ilYA(20), numero_police: "G09912345", assure_nom: "MONSIEUR JEAN-PIERRE LOMBARD",
      lese_nom: "MONSIEUR JEAN-PIERRE LOMBARD", lese_adresse: "3 IMPASSE DES OLIVIERS\n13700 MARIGNANE", lese_tel: "06 33 90 14 22",
      immatriculation: "DV-624-KJ", marque: "Citroën", modele: "C3", finition: "1.2 PureTech 82 Feel", energie: "Essence", places: 5, couleur: "Blanc Banquise", vin: "VF7SXHMZ6FT456123", date_mec: "2015-11-23", kilometrage: 142600,
      dommage_type: "Circulation", dommage_imputable: "Oui", dommage_intensite: "forte", dommage_description: "Choc avant important : longeron AVG touché, airbags déployés. Réparabilité économique à évaluer (VEI probable).", vehicule_reparable: false,
      conclusions: { tva_recuperable: false, procedure_vge: "En cours", reparabilite_economique: "Non — valeur de remplacement à dire d'expert 5 900 €" },
    },
    rapport: {
      statut: "brouillon", source: "manuel",
      chocs: [{ numero: 1, libelle: "Choc avant", postes: [
        { poste: "Tôlerie T1", heures: 14, taux: 60, remise: 0 }, { poste: "Tôlerie T2", heures: 9, taux: 64, remise: 0 }, { poste: "Mécanique M1", heures: 6, taux: 64, remise: 0 },
        { poste: "Peinture T1", heures: 12, taux: 66, remise: 0 }, { poste: "Opaque vernis", heures: 12, taux: 66, remise: 0 },
      ] }],
      operations: [
        { op: "E", peinture: true, designation: "BOUCLIER AV.", qte: 1, prix_unit: 385, qualite: "origine" },
        { op: "E", peinture: true, designation: "CAPOT MOTEUR", qte: 1, prix_unit: 512.6, qualite: "origine" },
        { op: "E", peinture: true, designation: "AILE AVG.", qte: 1, prix_unit: 198.4, qualite: "origine" },
        { op: "E", peinture: false, designation: "OPTIQUE AVG.", qte: 1, prix_unit: 342.9, qualite: "origine" },
        { op: "E", peinture: false, designation: "OPTIQUE AVD.", qte: 1, prix_unit: 342.9, qualite: "origine" },
        { op: "E", peinture: false, designation: "AIRBAG CONDUCTEUR", qte: 1, prix_unit: 689, qualite: "origine" },
        { op: "E", peinture: false, designation: "AIRBAG PASSAGER", qte: 1, prix_unit: 742, qualite: "origine" },
        { op: "E", peinture: false, designation: "PRETENSIONNEURS CEINTURES AV.", qte: 2, prix_unit: 165, qualite: "origine" },
        { op: "E", peinture: false, designation: "RADIATEUR REFROIDISSEMENT", qte: 1, prix_unit: 228.5, qualite: "equivalente" },
        { op: "E", peinture: false, designation: "CONDENSEUR CLIM.", qte: 1, prix_unit: 189.9, qualite: "equivalente" },
        { op: "M", peinture: false, designation: "PASSAGE AU MARBRE - LONGERON AVG.", qte: 0, prix_unit: 0 },
        { op: "V", peinture: false, designation: "MESURE SOUBASSEMENT", qte: 0, prix_unit: 0 },
      ],
    },
  },
  {
    garage: "CARROSSERIE BY SAM",
    dossier: {
      numero: "AE00034920", statut: "emis", date_mission: ilYA(30), date_visite: ilYA(26), lieu_expertise: "Chez le réparateur", type_expertise: "Après travaux",
      mandant_nom: "GROUPAMA MEDITERRANEE", mandant_adresse: "24 PARC DU GOLF, 13290 AIX-EN-PROVENCE", numero_sinistre: "2026511077", date_sinistre: ilYA(40), numero_police: "C421488001177", assure_nom: "MONSIEUR YANIS BOUZID",
      lese_nom: "MONSIEUR YANIS BOUZID", lese_adresse: "44 AVENUE DE SAINT-ANTOINE\n13015 MARSEILLE", lese_tel: "06 58 77 41 09",
      immatriculation: "GA-771-NC", marque: "Toyota", modele: "YARIS", finition: "1.5 Hybrid 116h Design", energie: "Essence Electricité (Non rechargeable)", places: 5, couleur: "Gris Atlas", vin: "VNKKD3D330A987654", date_mec: "2021-10-08", kilometrage: 53120,
      dommage_type: "Circulation", dommage_imputable: "Oui", dommage_intensite: "faible", dommage_description: "Accrochage latéral droit : porte AVD et bas de caisse.", vehicule_reparable: true,
      conclusions: { tva_recuperable: false, immobilisation_jours: 3, accord_reparateur: true, accord_assure: true, reglement_direct: true, montant_compagnie: 1868.4 },
    },
    rapport: {
      statut: "emis", source: "facture", date: ilYA(22),
      chocs: [{ numero: 1, libelle: "Choc latéral droit", postes: [
        { poste: "Tôlerie T1", heures: 4, taux: 68, remise: 0 }, { poste: "Peinture T1", heures: 5, taux: 74, remise: 0 }, { poste: "Nacré vernis", heures: 5, taux: 74, remise: 0 }, { poste: "Ingrédients peinture", heures: 0, taux: 0, remise: 0, forfait: 145 },
      ] }],
      operations: [
        { op: "E", peinture: true, designation: "BAGUETTE PORTE AVD.", qte: 1, prix_unit: 96.3, qualite: "origine" },
        { op: "I", peinture: true, designation: "PORTE AVD. REPARER", qte: 0, prix_unit: 0 },
        { op: "I", peinture: true, designation: "BAS DE CAISSE D. REPARER", qte: 0, prix_unit: 0 },
      ],
    },
  },
];

/* ------------------------------ Création ----------------------------- */

export async function creerDossierDemo(): Promise<{ garages: number; dossiers: number }> {
  const existants = await chargerGarages();
  const parNom = new Map(existants.map((g) => [g.nom, g]));
  let nbGarages = 0;
  for (const g of GARAGES_DEMO) {
    if (parNom.has(g.nom!)) continue;
    parNom.set(g.nom!, await enregistrerGarage(g));
    nbGarages += 1;
  }

  const { dossiers: dejaLa } = await chargerDossiers();
  const numeros = new Set(dejaLa.map((d) => d.numero));
  let nbDossiers = 0;
  for (const dd of DOSSIERS_DEMO) {
    if (numeros.has(dd.dossier.numero!)) continue;
    const g = parNom.get(dd.garage)!;
    const dossier = await creerDossier({
      ...dd.dossier,
      garage_id: g.id,
      reparateur_nom: g.nom,
      reparateur_adresse: [g.adresse, [g.code_postal, g.ville].filter(Boolean).join(" ")].filter(Boolean).join("\n"),
      reparateur_siret: g.siret,
    });
    nbDossiers += 1;
    if (dd.rapport) {
      await supabase.from("expertise_rapports").insert({
        dossier_id: dossier.id, numero: dossier.numero, version: 1, statut: dd.rapport.statut, source: dd.rapport.source,
        date_rapport: dd.rapport.date || ilYA(0), taux_tva: 20, chocs: dd.rapport.chocs, operations: dd.rapport.operations,
      });
      // Pièces mémorisées = les remplacements du chiffrage (avec référence quand elle existe).
      const pieces = dd.rapport.operations.filter((o) => o.op === "E" && o.prix_unit > 0).slice(0, 4).map((o) => ({
        dossier_id: dossier.id, designation: o.designation, reference: o.reference || null,
        etat: o.qualite === "reemploi" ? "occasion" : o.qualite === "equivalente" ? "equivalent" : "origine",
        fournisseur: o.qualite === "reemploi" ? "Opisto" : o.qualite === "equivalente" ? "Autodoc" : "Concession", prix_ht: o.prix_unit, source: "manuel",
      }));
      if (pieces.length) await supabase.from("expertise_pieces").insert(pieces);
    }
  }
  // Base de données (v13.6) : assurances et clients des missions de démo.
  for (const dd of DOSSIERS_DEMO) await completerAnnuaireDepuisDossier(dd.dossier);
  // Agenda (v13.7) : un rendez-vous par visite à venir, si l'agenda est vide.
  const { data: rdvExistants } = await supabase.from("expertise_rdv").select("id").limit(1);
  if (rdvExistants && rdvExistants.length === 0) {
    const { dossiers: tous } = await chargerDossiers();
    const heures = ["09:00:00", "10:30:00", "14:00:00", "15:30:00"];
    const aVenir = tous.filter((d) => d.date_visite && d.date_visite >= ilYA(0) && d.statut !== "emis" && d.statut !== "cloture");
    if (aVenir.length) {
      await supabase.from("expertise_rdv").insert(aVenir.map((d, i) => ({
        dossier_id: d.id, garage_id: d.garage_id, date: d.date_visite, heure: heures[i % heures.length], duree_min: 45,
        type: d.type_expertise === "Contradictoire" ? "contradictoire" : "visite", lieu: d.reparateur_nom,
        adresse: (d.reparateur_adresse || "").replace(/\n/g, ", ") || null, notes: d.dommage_description ? d.dommage_description.slice(0, 120) : null, statut: "planifie",
      })));
    }
  }
  return { garages: nbGarages, dossiers: nbDossiers };
}
