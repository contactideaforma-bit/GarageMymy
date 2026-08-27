// ============================================================
//  FACTURE DE GARDIENNAGE (v54 / v9.9)
//
//  Frais de parc d'un véhicule immobilisé au garage : entrée de parc,
//  journées de gardiennage, sortie de parc, enlèvement (remorquage). La
//  facture est un DOCUMENT ordinaire (type facture, origine 'gardiennage')
//  — numérotation, PDF, mentions légales, envoi, paiements et Factur-X
//  sont donc ceux de toutes les factures. Ce fichier ne fait que préparer
//  les lignes et le texte, TOUT est modifiable dans l'éditeur avant
//  enregistrement.
// ============================================================

import { Dossier, Entreprise } from "./types";
import { formatDate, formatEuros } from "./format";
import type { LigneSource } from "@/components/DocumentEditor";

export type ParametresGardiennage = {
  date_entree: string;      // AAAA-MM-JJ
  date_sortie: string;      // AAAA-MM-JJ (ou date du jour si le véhicule est encore là)
  date_enlevement: string;  // optionnel
  tarif_jour: number;
  frais_entree: number;
  frais_sortie: number;
  frais_enlevement: number;
  avec_entree: boolean;
  avec_sortie: boolean;
  avec_enlevement: boolean;
  jours_franchise: number;  // jours offerts (ex. 0 ou 3)
};

export function defautsGardiennage(ent: Partial<Entreprise> | null, dossier: Dossier): ParametresGardiennage {
  const auj = new Date().toISOString().slice(0, 10);
  return {
    date_entree: dossier.reparation_debut || dossier.created_at?.slice(0, 10) || auj,
    date_sortie: dossier.reparation_fin || auj,
    date_enlevement: "",
    tarif_jour: Number(ent?.gard_tarif_jour) || 0,
    frais_entree: Number(ent?.gard_frais_entree) || 0,
    frais_sortie: Number(ent?.gard_frais_sortie) || 0,
    frais_enlevement: Number(ent?.gard_frais_enlevement) || 0,
    avec_entree: Number(ent?.gard_frais_entree) > 0,
    avec_sortie: Number(ent?.gard_frais_sortie) > 0,
    avec_enlevement: false,
    jours_franchise: 0,
  };
}

/** Jours de gardiennage facturables (entrée et sortie incluses, moins la franchise). */
export function joursGardiennage(p: Pick<ParametresGardiennage, "date_entree" | "date_sortie" | "jours_franchise">): number {
  const a = new Date(p.date_entree);
  const b = new Date(p.date_sortie);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  const brut = Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
  return Math.max(0, brut - (Number(p.jours_franchise) || 0));
}

/** Lignes de la facture, prêtes pour l'éditeur (toutes modifiables). */
export function lignesGardiennage(p: ParametresGardiennage): LigneSource[] {
  const lignes: LigneSource[] = [];
  const jours = joursGardiennage(p);
  if (p.avec_enlevement && p.frais_enlevement > 0) {
    lignes.push({
      designation: `Enlèvement / remorquage du véhicule${p.date_enlevement ? ` le ${formatDate(p.date_enlevement)}` : ""}`,
      quantite: 1,
      prix_unitaire: p.frais_enlevement,
      remise: 0,
      categorie: "autre",
    });
  }
  if (p.avec_entree && p.frais_entree > 0) {
    lignes.push({ designation: `Entrée de parc le ${formatDate(p.date_entree)}`, quantite: 1, prix_unitaire: p.frais_entree, remise: 0, categorie: "autre" });
  }
  lignes.push({
    designation: `Frais de gardiennage du ${formatDate(p.date_entree)} au ${formatDate(p.date_sortie)} — ${jours} jour(s)${
      p.jours_franchise > 0 ? ` (${p.jours_franchise} jour(s) offert(s) déduit(s))` : ""
    }`,
    quantite: jours,
    prix_unitaire: p.tarif_jour,
    remise: 0,
    categorie: "autre",
  });
  if (p.avec_sortie && p.frais_sortie > 0) {
    lignes.push({ designation: `Sortie de parc le ${formatDate(p.date_sortie)}`, quantite: 1, prix_unitaire: p.frais_sortie, remise: 0, categorie: "autre" });
  }
  return lignes;
}

/** Total HT prévisionnel (pour l'aperçu du formulaire). */
export function totalGardiennageHt(p: ParametresGardiennage): number {
  return lignesGardiennage(p).reduce((s, l) => s + (Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0), 0);
}

/**
 * Mentions imprimées sous le tableau (champ « notes » de la facture) —
 * modifiables dans l'éditeur. Les mentions générales obligatoires (identité
 * du garage, TVA, pénalités de retard, indemnité de 40 €, échéance) sont
 * déjà portées par le modèle de facture.
 */
export function mentionsGardiennage(p: ParametresGardiennage, dossier: Dossier, ent: Partial<Entreprise> | null): string {
  const jours = joursGardiennage(p);
  return [
    `Véhicule ${dossier.marque_modele || ""}${dossier.immatriculation ? ` immatriculé ${dossier.immatriculation}` : ""} — sinistre n° ${
      dossier.numero_sinistre || "—"
    }${dossier.assureur ? `, assureur ${dossier.assureur}` : ""}.`,
    `Véhicule stationné dans nos locaux du ${formatDate(p.date_entree)} au ${formatDate(p.date_sortie)}, soit ${jours} jour(s) facturé(s) au tarif journalier de ${formatEuros(
      p.tarif_jour
    )} HT${p.jours_franchise > 0 ? ` après déduction de ${p.jours_franchise} jour(s) offert(s)` : ""}. Toute journée commencée est due.`,
    `Tarifs de gardiennage et de prestations affichés dans nos locaux et communiqués avant intervention, conformément à l'arrêté du 3 décembre 1987 relatif à l'information du consommateur sur les prix et aux articles L111-1 et L112-1 du Code de la consommation.`,
    `Conformément à l'article 2286 du Code civil, ${ent?.nom || "le garage"} peut exercer son droit de rétention sur le véhicule jusqu'au règlement intégral des sommes dues. Les frais de gardiennage continuent de courir jusqu'à l'enlèvement effectif du véhicule.`,
    `En cas de retard de paiement : pénalités au taux légal en vigueur (débiteur particulier) ou à trois fois le taux d'intérêt légal et indemnité forfaitaire de 40 € pour frais de recouvrement (débiteur professionnel, art. L441-10 et D441-5 du Code de commerce).`,
  ].join("\n");
}
