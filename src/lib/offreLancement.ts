// ============================================================
//  OFFRE DE LANCEMENT (v13.44) — logique PURE, partagée par le site
//  public (bandeau, formules, compte à rebours), le parcours
//  d'inscription, les routes serveur (Stripe, mensualités) et le contrat.
//
//  Règle décidée le 15/10/2026 : −20 % sur TOUTES les formules pendant
//  les 3 premiers mois, pour toute souscription jusqu'au 15 novembre 2026
//  inclus (heure de Paris). La remise s'applique automatiquement : rien à
//  saisir pour le garage. Après la date, tout disparaît tout seul.
//
//  · Mensuel : les 3 premières mensualités sont remisées, puis plein tarif.
//  · Année payée en une fois : le montant annuel est diminué de 3 × 20 %
//    d'une mensualité engagée (même avantage, versé d'un coup).
//  · La mise en service n'est jamais remisée (déjà offerte avec engagement).
// ============================================================

export type OffreLancement = {
  /** Identifiant stable (coupon Stripe, notes, contrat). */
  code: string;
  pct: number;
  mois: number;
  /** Dernier instant de validité (ISO, heure de Paris). */
  fin: string;
  libelle: string;
};

export const OFFRE_LANCEMENT: OffreLancement = {
  code: "LANCEMENT20",
  pct: 20,
  mois: 3,
  fin: "2026-11-15T23:59:59+01:00",
  libelle: "Offre de lancement : −20 % pendant 3 mois",
};

export const finOffre = (o: OffreLancement = OFFRE_LANCEMENT): Date => new Date(o.fin);

/** L'offre est-elle valable à cet instant ? (par défaut : maintenant) */
export function offreActive(now: Date = new Date(), o: OffreLancement = OFFRE_LANCEMENT): boolean {
  return now.getTime() <= finOffre(o).getTime();
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Mensualité remisée pendant la période de lancement. */
export const mensualiteLancement = (mensualite: number, pct: number = OFFRE_LANCEMENT.pct): number => r2(mensualite * (1 - pct / 100));

/** Économie totale sur la période (mensuel) : mois × remise. */
export const economieLancement = (mensualite: number, o: Pick<OffreLancement, "pct" | "mois"> = OFFRE_LANCEMENT): number => r2(mensualite * (o.pct / 100) * o.mois);

/**
 * Montant de l'année payée en une fois, remise de lancement déduite : la
 * remise porte sur les `mois` premières mensualités engagées.
 */
export const annuelLancement = (montantAnnuel: number, mensuelEngage: number, o: Pick<OffreLancement, "pct" | "mois"> = OFFRE_LANCEMENT): number =>
  r2(Math.max(0, montantAnnuel - economieLancement(mensuelEngage, o)));

/** Dernière période (1er du mois, AAAA-MM-01) couverte par la remise, à partir du mois de début. */
export function finRemiseLancement(dateDebut: string, mois: number = OFFRE_LANCEMENT.mois): string {
  const d = new Date(dateDebut);
  const f = new Date(d.getFullYear(), d.getMonth() + Math.max(0, mois - 1), 1);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Montant d'une mensualité donnée : remisé tant que la période ≤ lancement_fin. */
export function montantMensualite(prixHt: number, periode: string, lancement: { pct?: number | null; fin?: string | null } | null | undefined): number {
  const pct = Number(lancement?.pct) || 0;
  const fin = lancement?.fin ? String(lancement.fin).slice(0, 10) : null;
  if (pct > 0 && fin && periode.slice(0, 10) <= fin) return mensualiteLancement(prixHt, pct);
  return prixHt;
}

/** Temps restant, découpé pour le compte à rebours. */
export function compteARebours(now: Date = new Date(), o: OffreLancement = OFFRE_LANCEMENT): { jours: number; heures: number; minutes: number; secondes: number; total: number } {
  const total = Math.max(0, finOffre(o).getTime() - now.getTime());
  const s = Math.floor(total / 1000);
  return { total, jours: Math.floor(s / 86400), heures: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), secondes: s % 60 };
}

export const DATE_FIN_LIBELLE = "15 novembre 2026";
