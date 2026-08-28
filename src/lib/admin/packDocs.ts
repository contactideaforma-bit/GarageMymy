// ============================================================
//  DOCUMENTS D'INFORMATION DU PACK COMMERCIAL (v10.6) — liste
//  partagée client/serveur des documents remis aux collaborateurs.
//  Les fichiers vivent dans docs/pack-commercial/ (embarqués dans le
//  déploiement via outputFileTracingIncludes) et sont servis par :
//    · /api/admin/pack-doc?cle=…   (éditeur, fiche collaborateur) ;
//    · /api/commercial/pack?cle=…  (espace commercial « Mes documents »).
// ============================================================

export type DocPack = { cle: string; titre: string; fichier: string };

/** Documentation remise au COMMERCIAL (apporteur d'affaires). */
export const DOCS_COMMERCIAL: DocPack[] = [
  { cle: "entretien-commercial", titre: "Entretien de collaboration (support)", fichier: "commerciaux/ENTRETIEN-COLLABORATION_commercial.pdf" },
  { cle: "formation-commercial", titre: "Formation — Commercial (support)", fichier: "commerciaux/FORMATION_commercial.pdf" },
  { cle: "guide-commercial", titre: "Guide du commercial", fichier: "commerciaux/GUIDE-COMMERCIAL_MyEasyAuto.pdf" },
  { cle: "kit-vente", titre: "Kit du commercial — procédure de vente", fichier: "commerciaux/KIT-DU-COMMERCIAL_procedure-de-vente.pdf" },
  { cle: "grille-commissions", titre: "Grille de commissions (1 page)", fichier: "commerciaux/GRILLE-COMMISSIONS_1page.pdf" },
  { cle: "plaquette-tarifs", titre: "Plaquette tarifaire (version commercial)", fichier: "commerciaux/PLAQUETTE-TARIFS_commercial.pdf" },
  { cle: "plaquette-commerciale", titre: "Plaquette commerciale My Easy Auto", fichier: "PLAQUETTE-COMMERCIALE_MyEasyAuto.pdf" },
  { cle: "argumentaire", titre: "Argumentaire de démarchage", fichier: "ARGUMENTAIRE-DEMARCHAGE.pdf" },
  { cle: "fiche-besoins", titre: "Fiche de besoins garage (papier)", fichier: "FICHE-BESOINS_garage.pdf" },
  { cle: "tuto-email", titre: "Tuto — régler l'envoi d'emails du garage", fichier: "TUTO-EMAIL_profil-garage.pdf" },
  { cle: "contrat-abonnement-cgv", titre: "Contrat d'abonnement garage + CGV (modèle papier)", fichier: "commerciaux/CONTRAT-ABONNEMENT_garage-CGV.pdf" },
  { cle: "avenant-formule", titre: "Avenant de changement de formule", fichier: "commerciaux/AVENANT-CHANGEMENT-DE-FORMULE.pdf" },
  { cle: "formulaire-resiliation", titre: "Formulaire de résiliation garage", fichier: "commerciaux/FORMULAIRE-RESILIATION_garage.pdf" },
];

/** Documentation remise à la SECRÉTAIRE (envoyée par email : pas de compte dédié). */
export const DOCS_SECRETAIRE: DocPack[] = [
  { cle: "entretien-secretaire", titre: "Entretien de collaboration (support)", fichier: "ENTRETIEN-COLLABORATION_secretaire.pdf" },
  { cle: "formation-secretaire", titre: "Formation — Secrétaire (support)", fichier: "FORMATION_secretaire.pdf" },
  { cle: "guide-collaborateur", titre: "Guide du collaborateur", fichier: "GUIDE-COLLABORATEUR.pdf" },
  { cle: "tuto-email", titre: "Tuto — régler l'envoi d'emails du garage", fichier: "TUTO-EMAIL_profil-garage.pdf" },
  { cle: "procedure-changement", titre: "Procédure interne — changement de formule", fichier: "PROCEDURE-CHANGEMENT-DE-FORMULE_interne.pdf" },
  { cle: "procedure-resiliation", titre: "Procédure interne — résiliation", fichier: "PROCEDURE-RESILIATION_interne.pdf" },
  { cle: "fiche-besoins", titre: "Fiche de besoins garage (papier)", fichier: "FICHE-BESOINS_garage.pdf" },
  { cle: "devis-type", titre: "Devis type — application et secrétariat", fichier: "DEVIS-TYPE_appli-et-secretariat.pdf" },
];

export function docsPour(type: "commercial" | "secretaire"): DocPack[] {
  return type === "commercial" ? DOCS_COMMERCIAL : DOCS_SECRETAIRE;
}
export function docParCle(cle: string): DocPack | null {
  return [...DOCS_COMMERCIAL, ...DOCS_SECRETAIRE].find((d) => d.cle === cle) || null;
}
export function nomFichierDoc(d: DocPack): string {
  return d.fichier.split("/").pop() || `${d.cle}.pdf`;
}
