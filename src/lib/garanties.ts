// ====================================================================
//  GARANTIES DE PAIEMENT SUR LE VÉHICULE (v13.15, migration v83)
//
//  Trois leviers légaux, du plus simple au plus fort, portés par l'ordre
//  de réparation signé et suivis dans le parcours « retard de paiement » :
//
//   1. DROIT DE RÉTENTION (art. 2286 et 1948 C. civ.) : le véhicule reste
//      au garage jusqu'au paiement intégral ; frais de gardiennage après la
//      date de restitution prévue (tarif affiché du profil).
//   2. CLAUSE D'ABANDON — loi du 31 décembre 1903 : passé 3 MOIS sans
//      paiement ni retrait après mise en demeure en recommandé, requête au
//      tribunal judiciaire par commissaire de justice → vente aux enchères ;
//      le prix paie les frais puis la créance, le surplus est consigné à la
//      Caisse des dépôts pour le propriétaire.
//   3. OPTION GAGE + PACTE COMMISSOIRE (art. 2336, 2348 C. civ.) : le client
//      consent EXPRESSÉMENT (case distincte) qu'à défaut de paiement dans le
//      délai suivant la mise en demeure, la propriété du véhicule soit
//      transférée au garage. Garde-fous IMPÉRATIFS : évaluation par expert
//      (ou cotation officielle) au jour du transfert, restitution de la
//      différence, inscription du gage au registre des sûretés mobilières,
//      client propriétaire (exclu : LOA / LLD / crédit). Toute clause
//      contraire est réputée non écrite (art. 2348 al. 2 et 3).
//
//  L'appli n'est ni avocat ni commissaire de justice : la clause de gage
//  est fournie désactivée par défaut et doit être validée par un conseil.
// ====================================================================

import { ClausesOR, Dossier, Entreprise, OrdreReparation } from "./types";
import { round2 } from "./paiements";

export const VERSION_CLAUSES = 1;
export const DELAI_ABANDON_JOURS = 92; // « trois mois » (loi 1903)

const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n) || 0).replace(/[  ]/g, " ");
const dateFr = (d?: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "");

/* ------------------------- Clauses de l'OR --------------------------- */

/** Clauses à figer sur un OR, d'après le profil du garage et le dossier. */
export function clausesDepuisProfil(ent: Partial<Entreprise> | null | undefined, dossier: Pick<Dossier, "vehicule_finance">, montantHt: number | null): ClausesOR {
  const seuil = Number(ent?.garantie_gage_seuil) || 0;
  const gagePossible = Boolean(ent?.garantie_gage) && !dossier.vehicule_finance && (montantHt ?? 0) >= seuil;
  return {
    version: VERSION_CLAUSES,
    retention: ent?.garantie_retention !== false,
    gardiennage_jour: ent?.gard_tarif_jour != null ? Number(ent.gard_tarif_jour) : null,
    abandon: ent?.garantie_abandon !== false,
    gage: gagePossible,
    gage_montant: gagePossible ? montantHt : null,
    gage_delai: gagePossible ? Number(ent?.garantie_gage_delai) || 30 : null,
  };
}

export type ClauseTexte = { code: "retention" | "abandon" | "gage"; titre: string; texte: string; consentement?: string };

/** Textes imprimés sur l'OR (et affichés à la signature). */
export function textesClauses(c: ClausesOR | null | undefined, ent: Partial<Entreprise> | null | undefined, dossier: Pick<Dossier, "immatriculation" | "marque_modele" | "numero_serie">, or?: Pick<OrdreReparation, "montant_ht" | "date_fin">): ClauseTexte[] {
  if (!c) return [];
  const garage = ent?.nom || "le réparateur";
  const veh = [dossier.marque_modele, dossier.immatriculation ? `immatriculé ${dossier.immatriculation}` : "", dossier.numero_serie ? `(VIN ${dossier.numero_serie})` : ""].filter(Boolean).join(" ") || "le véhicule";
  const out: ClauseTexte[] = [];
  if (c.retention) {
    out.push({
      code: "retention",
      titre: "Paiement et droit de rétention",
      texte:
        `Les réparations sont payables à la restitution du véhicule, sauf prise en charge ou cession de créance acceptée par l'assureur. ` +
        `Conformément aux articles 2286 et 1948 du Code civil, ${garage} conserve le véhicule jusqu'au paiement intégral des sommes dues au titre du présent ordre. ` +
        (c.gardiennage_jour ? `Passée la date de restitution prévue${or?.date_fin ? ` (${dateFr(or.date_fin)})` : ""}, des frais de gardiennage de ${eur(c.gardiennage_jour)} HT par jour sont dus, selon les tarifs affichés dans nos locaux.` : `Des frais de gardiennage, selon les tarifs affichés dans nos locaux, sont dus passée la date de restitution prévue.`),
    });
  }
  if (c.abandon) {
    out.push({
      code: "abandon",
      titre: "Véhicule non retiré",
      texte:
        `Si, trois mois après la mise à disposition du véhicule et malgré une mise en demeure adressée par lettre recommandée, le véhicule n'est ni payé ni retiré, ${garage} pourra demander au tribunal judiciaire, par l'intermédiaire d'un commissaire de justice, l'autorisation de le vendre aux enchères publiques (loi du 31 décembre 1903). ` +
        `Le prix de vente sera affecté aux frais puis au paiement des sommes dues ; l'excédent éventuel sera consigné à la Caisse des dépôts et consignations à la disposition du propriétaire.`,
    });
  }
  if (c.gage) {
    out.push({
      code: "gage",
      titre: "Gage du véhicule et pacte commissoire (option acceptée expressément)",
      texte:
        `En garantie du paiement des travaux objet du présent ordre${c.gage_montant ? ` (${eur(c.gage_montant)} HT, outre TVA, frais et accessoires)` : ""}, le client, qui déclare être propriétaire de ${veh}, libre de tout gage, crédit, location avec option d'achat ou location longue durée, constitue ce véhicule en gage au profit de ${garage} (art. 2333 et suivants du Code civil). ` +
        `${garage} pourra inscrire ce gage au registre des sûretés mobilières. ` +
        `Il est convenu, conformément à l'article 2348 du Code civil, qu'à défaut de paiement intégral dans un délai de ${c.gage_delai || 30} jours suivant une mise en demeure adressée par lettre recommandée avec accusé de réception, ${garage} deviendra propriétaire du véhicule. ` +
        `La valeur du véhicule sera alors déterminée au jour du transfert par un expert automobile désigné d'un commun accord ou, à défaut, judiciairement, ou par une cotation officielle. ` +
        `Si cette valeur excède le montant des sommes dues (travaux, frais de gardiennage, frais d'expertise et de procédure), la différence sera restituée au client ; si elle est inférieure, le solde restera dû. ` +
        `Cette clause ne s'applique pas si le client bénéficie d'un crédit affecté aux réparations.`,
      consentement: "J'ai lu la clause de gage et de pacte commissoire ci-dessus et je l'accepte expressément.",
    });
  }
  return out;
}

/* --------------------------- Calculs --------------------------------- */

export type SituationVehicule = {
  /** Date à partir de laquelle le véhicule est « à disposition » (fin des travaux). */
  dispoDepuis: string | null;
  joursDepuisDispo: number;
  /** Date à partir de laquelle la vente loi 1903 peut être demandée. */
  dateVentePossible: string | null;
  joursAvantVente: number;
  gardiennageJours: number;
  gardiennageMontant: number;
};

export function situationVehicule(dossier: Pick<Dossier, "reparation_fin">, or: Pick<OrdreReparation, "date_fin" | "date_debut" | "date_or"> | null, clauses: ClausesOR | null | undefined, aujourdHui = new Date()): SituationVehicule {
  const dispo = or?.date_fin || dossier.reparation_fin || or?.date_debut || or?.date_or || null;
  const t = dispo ? new Date(dispo).getTime() : NaN;
  const jours = isNaN(t) ? 0 : Math.max(0, Math.floor((aujourdHui.getTime() - t) / 86400000));
  const vente = isNaN(t) ? null : new Date(t + DELAI_ABANDON_JOURS * 86400000).toISOString().slice(0, 10);
  const tarif = Number(clauses?.gardiennage_jour) || 0;
  return {
    dispoDepuis: dispo,
    joursDepuisDispo: jours,
    dateVentePossible: vente,
    joursAvantVente: Math.max(0, DELAI_ABANDON_JOURS - jours),
    gardiennageJours: jours,
    gardiennageMontant: round2(jours * tarif),
  };
}

/** Affectation du prix d'une vente aux enchères (loi 1903, art. 5). */
export function affectationVente(prix: number, frais: number, creance: number): { frais: number; creance: number; surplusConsigne: number; resteDu: number } {
  const p = Math.max(0, Number(prix) || 0);
  const f = Math.min(p, Math.max(0, Number(frais) || 0));
  const c = Math.min(p - f, Math.max(0, Number(creance) || 0));
  return { frais: round2(f), creance: round2(c), surplusConsigne: round2(p - f - c), resteDu: round2(Math.max(0, creance - c)) };
}

/** Attribution du véhicule en exécution du pacte commissoire (art. 2348 al. 3). */
export function attributionGage(valeurExpert: number, creance: number, frais: number): { aRestituer: number; resteDu: number; total: number } {
  const v = Math.max(0, Number(valeurExpert) || 0);
  const total = round2((Number(creance) || 0) + (Number(frais) || 0));
  return { total, aRestituer: round2(Math.max(0, v - total)), resteDu: round2(Math.max(0, total - v)) };
}

/* --------------------------- Étapes ---------------------------------- */

export type VoieGarantie = "retention" | "abandon" | "gage";

export type EtapeGarantie = {
  code: string;
  voie: VoieGarantie;
  titre: string;
  aide: string;
  /** Champs demandés à la validation. */
  ref: string | null;
  montants?: { cle: "montant" | "frais"; label: string }[];
  /** Rappel automatique (jours). */
  rappel: [string, number] | null;
};

export const ETAPES_GARANTIE: EtapeGarantie[] = [
  { code: "gar_med_retrait", voie: "abandon", titre: "Mise en demeure de payer et de retirer le véhicule", aide: "Recommandé AR : point de départ des 3 mois de la loi de 1903 et du délai du pacte commissoire.", ref: "N° du recommandé", rappel: ["Mise en demeure de retrait : paiement reçu ? Sinon requête de vente (loi 1903) ou réalisation du gage", 30] },
  { code: "gar_requete_1903", voie: "abandon", titre: "Requête en vente aux enchères (commissaire de justice)", aide: "Passé 3 mois : le commissaire de justice dépose la requête au tribunal judiciaire du siège du garage.", ref: "Commissaire de justice / n° de requête", rappel: ["Vente loi 1903 : ordonnance reçue ? Date de la vente ?", 30] },
  { code: "gar_vente_1903", voie: "abandon", titre: "Vente réalisée — affectation du prix", aide: "Prix d'adjudication et frais : l'appli calcule ce qui revient au garage et le surplus consigné.", ref: "Date / lieu de la vente", montants: [{ cle: "montant", label: "Prix de vente (€)" }, { cle: "frais", label: "Frais (procédure, vente) (€)" }], rappel: null },
  { code: "gar_gage_inscription", voie: "gage", titre: "Inscription du gage au registre des sûretés mobilières", aide: "À faire dès la signature de l'OR (opposabilité aux tiers, 5 ans). Registre du ministère de l'Intérieur.", ref: "N° d'inscription", rappel: null },
  { code: "gar_gage_expertise", voie: "gage", titre: "Évaluation du véhicule par un expert", aide: "Obligatoire au jour du transfert (art. 2348) : expert automobile indépendant ou cotation officielle.", ref: "Expert / référence", montants: [{ cle: "montant", label: "Valeur du véhicule (€)" }, { cle: "frais", label: "Frais d'expertise et de gardiennage (€)" }], rappel: null },
  { code: "gar_gage_attribution", voie: "gage", titre: "Transfert de propriété et restitution du surplus", aide: "Notification au client, déclaration de cession (cerfa 15776), restitution de la différence si la valeur dépasse la dette.", ref: "Date du transfert / n° de cession", rappel: ["Gage réalisé : surplus restitué ? Carte grise mise à jour ?", 15] },
];

export function etapeGarantie(code: string): EtapeGarantie | null {
  return ETAPES_GARANTIE.find((e) => e.code === code) || null;
}

/** Le gage est-il réellement mobilisable sur ce dossier ? */
export function gageMobilisable(or: Pick<OrdreReparation, "clauses" | "signe_le"> | null, dossier: Pick<Dossier, "vehicule_finance">): { ok: boolean; raison: string | null } {
  if (!or) return { ok: false, raison: "Aucun ordre de réparation." };
  if (!or.clauses?.gage) return { ok: false, raison: "L'OR ne contient pas la clause de gage." };
  if (!or.signe_le) return { ok: false, raison: "L'OR n'est pas signé." };
  if (!or.clauses.gage_consenti_le) return { ok: false, raison: "Le client n'a pas coché l'acceptation expresse de la clause de gage." };
  if (dossier.vehicule_finance) return { ok: false, raison: "Véhicule financé (LOA / LLD / crédit) : le client n'en est pas propriétaire." };
  return { ok: true, raison: null };
}
