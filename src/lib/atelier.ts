// Helpers Atelier : ordre de réparation & PV de restitution.

export function genNumeroOR(): string {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `OR-${ym}-${String(Date.now()).slice(-5)}`;
}

export const STATUTS_ATELIER: Record<string, { label: string; badge: string }> = {
  brouillon: { label: "Généré", badge: "bg-slate-100 text-slate-700" },
  signe: { label: "Signé", badge: "bg-emerald-100 text-emerald-700" },
};

export function labelStatutAtelier(s: string): string {
  return STATUTS_ATELIER[s]?.label || s;
}
export function badgeStatutAtelier(s: string): string {
  return STATUTS_ATELIER[s]?.badge || "bg-slate-100 text-slate-700";
}

// Texte d'autorisation imprimé sur l'ordre de réparation.
export const AUTORISATION_OR =
  "Je soussigné(e), client(e) désigné(e) ci-dessus, autorise le réparateur à effectuer " +
  "les travaux décrits sur le véhicule mentionné, ainsi que les essais routiers " +
  "nécessaires. En cas de travaux supplémentaires indispensables, le réparateur " +
  "s'engage à recueillir mon accord préalable.";

// Texte juridique de la cession de créance (art. 1321 à 1326 du Code civil).
// Les parties et montants sont injectés par le PDF.
export const CESSION_OBJET =
  "Par la présente, le cédant cède au cessionnaire, qui l'accepte, la créance " +
  "d'indemnisation qu'il détient sur le débiteur cédé au titre du sinistre " +
  "désigné ci-dessus, conformément aux articles 1321 et suivants du Code civil. " +
  "Le cessionnaire est en conséquence autorisé à percevoir directement du " +
  "débiteur cédé le règlement de l'indemnité, à hauteur du montant indiqué.";

export const CESSION_NOTIFICATION =
  "La présente cession sera notifiée au débiteur cédé, à qui elle est opposable " +
  "à compter de cette notification (art. 1324 du Code civil). Le cédant garantit " +
  "l'existence de la créance cédée mais non la solvabilité du débiteur.";

// Texte de décharge imprimé sur le PV de restitution.
export const DECHARGE_RESTITUTION =
  "Je soussigné(e), client(e) désigné(e) ci-dessus, reconnais avoir récupéré ce jour " +
  "le véhicule mentionné, réparé conformément aux travaux convenus, et n'avoir " +
  "constaté aucune anomalie apparente au moment de la restitution, sous réserve " +
  "des observations éventuelles notées ci-dessus.";
