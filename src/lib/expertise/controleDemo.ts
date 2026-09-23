// CONTRÔLE DE DÉMONSTRATION (mode expert, v13.23) : le devis de la
// Carrosserie By Sam confronté au pré-rapport du dossier AE00034915
// (Peugeot 3008). Aucune lecture IA : la démo fonctionne hors ligne et
// montre tous les cas (temps, taux, forfait, qualité de pièce, redressage
// devenu remplacement, ajouts, opération supprimée).

import { supabase } from "@/lib/supabaseClient";
import { Chiffrage, comparerControle } from "./controle";
import { chargerRapports } from "./data";
import { chargerControlesDossier, coteDepuisRapport, creerControle } from "./controleData";

export const DEVIS_DEMO: Chiffrage = {
  chocs: [{ numero: 1, libelle: "Arrière droit", postes: [
    { poste: "Tôlerie T1", heures: 8, taux: 68, remise: 0 },
    { poste: "Tôlerie T2", heures: 3, taux: 72, remise: 0 },
    { poste: "Peinture T1", heures: 7.5, taux: 78, remise: 0 },
    { poste: "Nacré vernis", heures: 7.5, taux: 78, remise: 0 },
    { poste: "Ingrédients peinture", heures: 0, taux: 0, remise: 0, forfait: 265 },
  ] }],
  operations: [
    { op: "E", peinture: true, designation: "BOUCLIER ARRIERE", qte: 1, prix_unit: 412.5, reference: "9838461980", qualite: "origine" },
    { op: "E", peinture: false, designation: "FEU AR D", qte: 1, prix_unit: 296.4, reference: "9836587280", qualite: "origine" },
    { op: "E", peinture: true, designation: "HAYON AR.", qte: 1, prix_unit: 1486.9, reference: "9816541080", qualite: "origine" },
    { op: "E", peinture: false, designation: "CAPTEUR RECUL ARD.", qte: 2, prix_unit: 58.9, qualite: "equivalente" },
    { op: "E", peinture: true, designation: "AILE ARD.", qte: 1, prix_unit: 389, reference: "9812773580", qualite: "origine" },
    { op: "L", peinture: true, designation: "PORTE ARD. RACCORD", qte: 0, prix_unit: 0 },
    { op: "N", peinture: false, designation: "GARNITURE HAYON DEP/REP", qte: 0, prix_unit: 0 },
    { op: "E", peinture: false, designation: "KIT AGRAFES BOUCLIER AR.", qte: 1, prix_unit: 24.6 },
    { op: "FO", peinture: false, designation: "NETTOYAGE VEHICULE", qte: 1, prix_unit: 35 },
  ],
};

/** Crée le contrôle de démo s'il manque. Renvoie true si créé. */
export async function creerControleDemo(): Promise<boolean> {
  const { data } = await supabase.from("expertise_dossiers").select("*").eq("numero", "AE00034915").maybeSingle();
  if (!data) return false;
  const dossierId = (data as { id: string }).id;
  const { controles, dispo } = await chargerControlesDossier(dossierId);
  if (!dispo || controles.length) return false;
  const rapports = await chargerRapports(dossierId);
  const base = rapports.find((r) => r.version === 1) || rapports[rapports.length - 1];
  if (!base) return false;
  const reference = coteDepuisRapport(base);
  const devis = { ...DEVIS_DEMO, source: "manuel" as const, nom: "Devis D-2026-0917 (Carrosserie By Sam)", numero: "D-2026-0917", total_imprime_ht: 4957.2 };
  const { ecarts } = comparerControle(reference, devis);
  await creerControle({ dossierId, reference, devis, ecarts, action: "Contrôle de démonstration créé" });
  return true;
}
