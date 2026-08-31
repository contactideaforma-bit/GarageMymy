// ====================================================================
//  RÉMUNÉRATION DES COLLABORATEURS INDÉPENDANTS — BRUT / NET (v11.3)
//
//  ⚠️ POURQUOI CE MODULE EXISTE
//  Retour utilisateur : « dans les contrats certains montants de revenus
//  sont notés HT / TTC, or il s\'agit de revenus, on doit savoir
//  clairement si c\'est du NET ou du BRUT ».
//
//  Il avait raison, et les deux vocabulaires étaient mélangés :
//   · HT / TTC est une notion de TVA — elle qualifie une FACTURE ;
//   · BRUT / NET est une notion de rémunération — elle qualifie un REVENU.
//  Un collaborateur indépendant (micro-entrepreneur) n\'a pas de « net »
//  au sens du salariat : il n\'y a AUCUNE retenue à la source. Ce qu\'il
//  facture est son CHIFFRE D\'AFFAIRES, c\'est-à-dire son revenu BRUT ;
//  il paie ensuite lui-même ses cotisations et son impôt.
//
//  Règle de rédaction retenue pour tous les documents :
//    « 17 € HT par heure facturée = revenu BRUT du collaborateur
//      (chiffre d\'affaires). Le Donneur d\'ordre ne pratique aucune
//      retenue. Après cotisations sociales, le revenu NET avant impôt
//      est d\'environ 13,37 € par heure. »
//
//  TAUX VÉRIFIÉS LE 31/08/2026 (sources officielles / portail
//  auto-entrepreneur). Ils changent : la fonction `dateTaux` est
//  affichée dans les documents pour que le lecteur sache à quelle date
//  le calcul a été fait, et le guide renvoie vers autoentrepreneur.urssaf.fr.
// ==================================================================== */

export type CleRegime = "bic" | "bnc" | "cipav";

export type Regime = {
  cle: CleRegime;
  libelle: string;
  /** Cotisations sociales URSSAF, en % du chiffre d\'affaires encaissé. */
  cotisations: number;
  /** Contribution à la formation professionnelle, en % du CA. */
  cfp: number;
  /** Taux du versement libératoire de l\'impôt sur le revenu (option). */
  versementLiberatoire: number;
  /** Abattement forfaitaire pour frais si PAS de versement libératoire. */
  abattement: number;
  aide: string;
};

/** Régimes du micro-entrepreneur — taux au 1er janvier 2026. */
export const REGIMES: Record<CleRegime, Regime> = {
  bic: {
    cle: "bic",
    libelle: "Prestations de services commerciales (BIC)",
    cotisations: 21.2,
    cfp: 0.1,
    versementLiberatoire: 1.7,
    abattement: 50,
    aide: "Cas le plus fréquent pour du secrétariat facturé à une société (code APE 8211Z, services administratifs de bureau).",
  },
  bnc: {
    cle: "bnc",
    libelle: "Activité libérale non réglementée (BNC)",
    cotisations: 25.6,
    cfp: 0.2,
    versementLiberatoire: 2.2,
    abattement: 34,
    aide: "Taux passé à 25,6 % au 1er janvier 2026. C\'est le régime si l\'activité a été déclarée comme libérale.",
  },
  cipav: {
    cle: "cipav",
    libelle: "Activité libérale réglementée (Cipav)",
    cotisations: 23.2,
    cfp: 0.2,
    versementLiberatoire: 2.2,
    abattement: 34,
    aide: "Uniquement pour les professions listées relevant de la Cipav — rare pour du secrétariat.",
  },
};

/** Date à laquelle les taux ci-dessus ont été vérifiés. */
export const DATE_TAUX = "31/08/2026";

/** Seuils 2026 (prestations de services). */
export const SEUILS = {
  /** Plafond du régime micro pour les prestations de services. */
  micro: 83600,
  /** Franchise en base de TVA — en dessous, on facture SANS TVA. */
  tvaFranchise: 37500,
  /** Seuil majoré : au-delà, TVA immédiate. */
  tvaMajore: 41250,
};

export function regimeDe(cle: string | null | undefined): Regime {
  const r = (cle || "bic") as CleRegime;
  return REGIMES[r] || REGIMES.bic;
}

/** Prélèvements sociaux totaux (cotisations + formation), en %. */
export function tauxPrelevements(r: Regime): number {
  return Math.round((r.cotisations + r.cfp) * 100) / 100;
}

/**
 * Revenu NET avant impôt pour un montant FACTURÉ (hors taxes).
 * C\'est ce qui reste au collaborateur une fois l\'URSSAF payée.
 */
export function netAvantImpot(montantHt: number, r: Regime): number {
  return Math.round(montantHt * (1 - tauxPrelevements(r) / 100) * 100) / 100;
}

/** Idem, avec le versement libératoire de l\'impôt (option) : net « dans la poche ». */
export function netApresVersementLiberatoire(montantHt: number, r: Regime): number {
  return Math.round(montantHt * (1 - (tauxPrelevements(r) + r.versementLiberatoire) / 100) * 100) / 100;
}

const eur2 = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Phrase prête à coller dans un contrat ou un document, qui lève
 * l\'ambiguïté HT/TTC vs BRUT/NET une bonne fois pour toutes.
 */
export function phraseBrutNet(tauxHoraireHt: number, regime: Regime): string {
  return [
    `Le taux de ${eur2(tauxHoraireHt)} € par heure s\'entend HORS TAXES et constitue le revenu BRUT du Prestataire, `,
    `c\'est-à-dire son chiffre d\'affaires. Le Donneur d\'ordre ne pratique AUCUNE retenue à la source : `,
    `le Prestataire acquitte lui-même ses cotisations sociales et son impôt sur le revenu. `,
    `À titre purement indicatif, sous le régime « ${regime.libelle} » (${eur2(tauxPrelevements(regime))} % de prélèvements sociaux au ${DATE_TAUX}), `,
    `le revenu NET avant impôt correspondant est d\'environ ${eur2(netAvantImpot(tauxHoraireHt, regime))} € par heure. `,
    `Cette estimation est donnée pour information et n\'engage pas le Donneur d\'ordre : les taux sont fixés par la loi et évoluent.`,
  ].join("");
}

/** Tableau « ce que je facture / ce qu\'il me reste » pour le guide et l\'annexe. */
export function tableauBrutNet(tauxHoraireHt: number, regime: Regime, heuresParMois: number[]): string[][] {
  return heuresParMois.map((h) => {
    const brut = Math.round(tauxHoraireHt * h * 100) / 100;
    return [
      `${h} h / mois`,
      `${eur2(brut)} €`,
      `${eur2(netAvantImpot(brut, regime))} €`,
      `${eur2(netApresVersementLiberatoire(brut, regime))} €`,
    ];
  });
}

/** La collaboratrice facture-t-elle avec ou sans TVA ? */
export function mentionTva(caAnnuelEstime: number): string {
  return caAnnuelEstime <= SEUILS.tvaFranchise
    ? `Tant que le chiffre d\'affaires annuel reste sous ${SEUILS.tvaFranchise.toLocaleString("fr-FR")} €, la facture est établie SANS TVA avec la mention « TVA non applicable, article 293 B du CGI ».`
    : `Au-delà de ${SEUILS.tvaFranchise.toLocaleString("fr-FR")} € de chiffre d\'affaires annuel, la TVA devient applicable : la facture porte alors la TVA en sus du taux horaire hors taxes convenu.`;
}
