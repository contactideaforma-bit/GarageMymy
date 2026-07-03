// Helpers Atelier : ordre de réparation & PV de restitution.

export function genNumeroOR(): string {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `OR-${ym}-${String(Date.now()).slice(-5)}`;
}

export const STATUTS_ATELIER: Record<string, { label: string; badge: string }> = {
  brouillon: { label: "Brouillon", badge: "bg-slate-100 text-slate-700" },
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

// Texte de décharge imprimé sur le PV de restitution.
export const DECHARGE_RESTITUTION =
  "Je soussigné(e), client(e) désigné(e) ci-dessus, reconnais avoir récupéré ce jour " +
  "le véhicule mentionné, réparé conformément aux travaux convenus, et n'avoir " +
  "constaté aucune anomalie apparente au moment de la restitution, sous réserve " +
  "des observations éventuelles notées ci-dessus.";
