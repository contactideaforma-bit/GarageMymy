// Constantes et libellés spécifiques au métier VITRAGE (bris de glace).

export const TYPES_VITRAGE = [
  { key: "pare_brise", label: "Pare-brise" },
  { key: "lunette_arriere", label: "Lunette arrière" },
  { key: "vitre_laterale", label: "Vitre latérale" },
  { key: "toit_ouvrant", label: "Toit / toit ouvrant" },
  { key: "autre", label: "Autre vitrage" },
] as const;

export const NATURES_INTERVENTION = [
  { key: "reparation", label: "Réparation d'impact" },
  { key: "remplacement", label: "Remplacement" },
] as const;

export function labelTypeVitrage(k?: string | null): string {
  return TYPES_VITRAGE.find((t) => t.key === k)?.label ?? "—";
}

export function labelNatureIntervention(k?: string | null): string {
  return NATURES_INTERVENTION.find((n) => n.key === k)?.label ?? "—";
}

// Un calibrage ADAS est en attente quand il est requis mais pas encore fait.
export function calibrageEnAttente(dossier: {
  calibrage_requis?: boolean | null;
  calibrage_fait?: boolean | null;
}): boolean {
  return Boolean(dossier.calibrage_requis) && !dossier.calibrage_fait;
}
