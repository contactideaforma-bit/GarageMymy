// Identité de l'ÉDITEUR — une seule source pour la vitrine, les mentions
// légales, les CGU et le pied de page. À modifier ICI uniquement.

export const SOCIETE = {
  produit: "My Easy Auto",
  editeur: "IDEAFORMA",
  signature: "MY EASY AUTO by IDEAFORMA",
  email: "contact@myeasyauto.fr",
  siret: "993 125 335 00014",
  siretBrut: "99312533500014",
  adresse: "144 Avenue Charles de Gaulle",
  codePostal: "92200",
  ville: "Neuilly-sur-Seine",
  pays: "France",
  site: "https://myeasyauto.fr",
} as const;

export const ADRESSE_COMPLETE = `${SOCIETE.adresse}, ${SOCIETE.codePostal} ${SOCIETE.ville}`;
