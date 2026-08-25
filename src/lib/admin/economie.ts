// ============================================================
//  ÉCONOMIE DE L'OFFRE — calculs PURS partagés par le simulateur et les
//  relevés (v53). Aucune dépendance réseau : testable seul.
//
//  Sources : NOTE-STRATEGIE-TARIFAIRE (grille, rétrocession 65 %, coûts)
//  et grille apporteurs d'affaires v1.1 (−15 %) du 25/08/2026.
// ============================================================

export type Formule = "essentiel" | "starter" | "confort" | "serenite";
export const FORMULES: Formule[] = ["essentiel", "starter", "confort", "serenite"];

export type ParamsFormule = {
  libelle: string;
  prix: number;            // € HT / mois
  heures: number;          // heures de secrétariat incluses
  primeSignature: number;  // commission commerciale à M2
  primeFidelite: number;   // à M6
  bonusEngagement: number; // si engagement 12 mois
};

export type Parametres = {
  formules: Record<Formule, ParamsFormule>;
  tauxHoraireSecretaire: number; // € HT versés à la secrétaire par heure de forfait (v53 : 17 €, négociable)
  tauxRetrocession: number;      // ANCIEN modèle (% du CA secrétariat) — conservé pour compatibilité, plus utilisé
  coutTechnique: number;         // € / garage / mois
  coutsFixes: number;            // € / mois (hébergement, outils, assurance…)
  tauxEngagement: number;        // part des devis signés avec engagement 12 mois (simulateur)
  tauxConservationM6: number;    // part des garages encore actifs à M6 (simulateur)
  bonusVolume: { palier1: number; bonus1: number; palier2: number; bonus2: number };
  mensualitesReprise: number;    // reprise de la prime si arrêt avant N mensualités
};

export const PARAMETRES_DEFAUT: Parametres = {
  formules: {
    // Grille v1.2 (25/08/2026) : UNE prime par garage signé (85 % d'une
    // mensualité), PLUS de prime de fidélité (primeFidelite = 0, conservé pour
    // compatibilité et pour pouvoir la réactiver dans les paramètres).
    essentiel: { libelle: "ESSENTIEL", prix: 79, heures: 0, primeSignature: 130, primeFidelite: 0, bonusEngagement: 40 },
    starter: { libelle: "STARTER", prix: 490, heures: 10, primeSignature: 415, primeFidelite: 0, bonusEngagement: 85 },
    confort: { libelle: "CONFORT", prix: 860, heures: 20, primeSignature: 730, primeFidelite: 0, bonusEngagement: 85 },
    serenite: { libelle: "SÉRÉNITÉ", prix: 1570, heures: 40, primeSignature: 1335, primeFidelite: 0, bonusEngagement: 85 },
  },
  tauxHoraireSecretaire: 17,
  tauxRetrocession: 0.65,
  coutTechnique: 25,
  coutsFixes: 270,
  tauxEngagement: 0.6,
  tauxConservationM6: 0.85,
  bonusVolume: { palier1: 5, bonus1: 255, palier2: 10, bonus2: 680 },
  mensualitesReprise: 3,
};

/** Fusionne des paramètres partiels (venant de la base) avec les défauts. */
export function fusionnerParametres(p?: Partial<Parametres> | null): Parametres {
  if (!p) return PARAMETRES_DEFAUT;
  const formules = { ...PARAMETRES_DEFAUT.formules } as Record<Formule, ParamsFormule>;
  for (const f of FORMULES) formules[f] = { ...PARAMETRES_DEFAUT.formules[f], ...(p.formules?.[f] || {}) };
  return { ...PARAMETRES_DEFAUT, ...p, formules, bonusVolume: { ...PARAMETRES_DEFAUT.bonusVolume, ...(p.bonusVolume || {}) } };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** CA secrétariat d'une formule = prix − prix de l'appli seule. */
export function caSecretariat(prix: number, p: Parametres): number {
  return Math.max(0, prix - p.formules.essentiel.prix);
}

/**
 * Rémunération mensuelle de la secrétaire pour une mensualité payée :
 * HEURES du forfait × TAUX HORAIRE (celui de la secrétaire, sinon le taux
 * par défaut des paramètres). Indépendant du prix vendu : une remise
 * commerciale ne pèse pas sur la secrétaire.
 */
export function retrocessionMensuelle(heures: number, tauxHoraire: number | null | undefined, p: Parametres): number {
  return r2(Math.max(0, heures) * (tauxHoraire ?? p.tauxHoraireSecretaire));
}

/** Rémunération mensuelle de la secrétaire pour une formule de la grille. */
export function retrocessionFormule(f: Formule, p: Parametres, tauxHoraire?: number | null): number {
  return retrocessionMensuelle(p.formules[f].heures, tauxHoraire, p);
}

/* ------------------------------------------------------------------
 *  SIMULATEUR — « je vends N formules, avec ou sans commercial »
 * ------------------------------------------------------------------ */

export type LigneSimulation = { formule: Formule; nombre: number; avecCommercial: boolean };

export type ResultatSimulation = {
  garages: number;
  caMensuel: number;
  retrocessionsMensuelles: number;
  techniqueMensuel: number;
  margeAvantCommercialMensuelle: number;
  commissionsAnnee1: number;          // espérance : signature + engagement × taux + fidélité × conservation
  commissionsLisseesMensuelles: number;
  coutsFixesMensuels: number;
  resultatMensuelAnnee1: number;      // après commissions lissées et coûts fixes
  resultatMensuelCroisiere: number;   // année 2 : plus de commission
  resultatAnnee1: number;
  resultatAnnee2: number;
  detail: Array<LigneSimulation & { ca: number; retro: number; marge: number; commission: number; resultatA1: number; resultatA2: number }>;
};

export function simuler(lignes: LigneSimulation[], p: Parametres): ResultatSimulation {
  const detail = lignes
    .filter((l) => l.nombre > 0)
    .map((l) => {
      const f = p.formules[l.formule];
      const ca = f.prix * l.nombre;
      const retro = retrocessionMensuelle(f.heures, null, p) * l.nombre;
      const tech = p.coutTechnique * l.nombre;
      const marge = ca - retro - tech; // par mois
      const commission = l.avecCommercial
        ? (f.primeSignature + f.bonusEngagement * p.tauxEngagement + f.primeFidelite * p.tauxConservationM6) * l.nombre
        : 0;
      return { ...l, ca, retro, marge, commission, resultatA1: marge * 12 - commission, resultatA2: marge * 12 };
    });
  const somme = (k: keyof (typeof detail)[number]) => detail.reduce((s, d) => s + (Number(d[k]) || 0), 0);
  const garages = somme("nombre");
  const caMensuel = somme("ca");
  const retro = somme("retro");
  const tech = p.coutTechnique * garages;
  const margeM = caMensuel - retro - tech;
  const commissionsA1 = somme("commission");
  const fixes = p.coutsFixes;
  return {
    garages,
    caMensuel: r2(caMensuel),
    retrocessionsMensuelles: r2(retro),
    techniqueMensuel: r2(tech),
    margeAvantCommercialMensuelle: r2(margeM),
    commissionsAnnee1: r2(commissionsA1),
    commissionsLisseesMensuelles: r2(commissionsA1 / 12),
    coutsFixesMensuels: fixes,
    resultatMensuelAnnee1: r2(margeM - commissionsA1 / 12 - fixes),
    resultatMensuelCroisiere: r2(margeM - fixes),
    resultatAnnee1: r2(margeM * 12 - commissionsA1 - fixes * 12),
    resultatAnnee2: r2(margeM * 12 - fixes * 12),
    detail: detail.map((d) => ({ ...d, ca: r2(d.ca), retro: r2(d.retro), marge: r2(d.marge), commission: r2(d.commission), resultatA1: r2(d.resultatA1), resultatA2: r2(d.resultatA2) })),
  };
}

/* ------------------------------------------------------------------
 *  RELEVÉS — lignes DUES d'après les abonnements et leurs mensualités
 * ------------------------------------------------------------------ */

export type AbonnementCalc = {
  id: string;
  garage_nom: string;
  formule: Formule;
  prix_ht: number; // mensualité réellement facturée (remise déduite)
  date_signature: string;
  engagement_12: boolean;
  statut: "actif" | "suspendu" | "resilie";
  commercial_id: string | null;
  secretaire_id: string | null;
};
export type MensualiteCalc = { abonnement_id: string; periode: string; montant_ht: number; payee_le: string | null; heures_faites?: number | null };
export type CollaborateurCalc = { id: string; type: "commercial" | "secretaire"; taux_horaire?: number | null; taux_retrocession?: number | null };

export type LigneDue = {
  cle: string;
  collaborateur_id: string;
  abonnement_id: string;
  type: "commission" | "fidelite" | "bonus" | "retrocession" | "reprise";
  libelle: string;
  periode: string | null;
  montant: number;
};

/**
 * Calcule TOUTES les lignes dues à ce jour (idempotentes via `cle`) :
 *  · commercial : prime de signature à la 2e mensualité payée, bonus
 *    engagement avec elle, fidélité à la 6e, reprise si résiliation avant
 *    la 3e mensualité payée ;
 *  · secrétaire : rémunération pour chaque mensualité payée d'une formule
 *    avec heures = heures × taux horaire (17 € par défaut, ou le taux
 *    propre à la secrétaire) — indépendante du prix vendu.
 *  REMISE : si le commercial a vendu moins cher que la grille, ses primes
 *  (signature, fidélité) suivent la même proportion — le plancher de la
 *  formule ESSENTIEL est conservé. Le bonus engagement est fixe.
 * Les bonus de volume trimestriels ne sont pas générés ici (validation
 * manuelle par l'éditeur).
 */
export function lignesDues(
  abonnements: AbonnementCalc[],
  mensualites: MensualiteCalc[],
  collaborateurs: CollaborateurCalc[],
  p: Parametres
): LigneDue[] {
  const lignes: LigneDue[] = [];
  const collabs = new Map(collaborateurs.map((c) => [c.id, c]));
  for (const a of abonnements) {
    const f0 = p.formules[a.formule];
    const ratio = f0.prix > 0 ? Math.min(1, Math.max(0, (Number(a.prix_ht) || f0.prix) / f0.prix)) : 1;
    const plancher = p.formules.essentiel.primeSignature;
    const f = {
      ...f0,
      primeSignature: r2(Math.max(a.formule === "essentiel" ? plancher : 0, f0.primeSignature * ratio)),
      primeFidelite: r2(f0.primeFidelite * ratio),
    };
    const payees = mensualites
      .filter((m) => m.abonnement_id === a.id && m.payee_le)
      .sort((x, y) => x.periode.localeCompare(y.periode));
    const nbPayees = payees.length;

    if (a.commercial_id && collabs.get(a.commercial_id)?.type === "commercial") {
      const cid = a.commercial_id;
      if (nbPayees >= 2) {
        lignes.push({ cle: `sig:${a.id}`, collaborateur_id: cid, abonnement_id: a.id, type: "commission", libelle: `Prime de signature — ${a.garage_nom} (${f.libelle})`, periode: payees[1].periode, montant: f.primeSignature });
        if (a.engagement_12) {
          lignes.push({ cle: `eng:${a.id}`, collaborateur_id: cid, abonnement_id: a.id, type: "bonus", libelle: `Bonus engagement 12 mois — ${a.garage_nom}`, periode: payees[1].periode, montant: f.bonusEngagement });
        }
      }
      if (f.primeFidelite > 0 && nbPayees >= 6 && a.statut !== "resilie") {
        lignes.push({ cle: `fid:${a.id}`, collaborateur_id: cid, abonnement_id: a.id, type: "fidelite", libelle: `Prime de fidélité — ${a.garage_nom} (${f.libelle})`, periode: payees[5].periode, montant: f.primeFidelite });
      }
      if (a.statut === "resilie" && nbPayees >= 2 && nbPayees < p.mensualitesReprise) {
        const reprise = f.primeSignature + (a.engagement_12 ? f.bonusEngagement : 0);
        lignes.push({ cle: `rep:${a.id}`, collaborateur_id: cid, abonnement_id: a.id, type: "reprise", libelle: `Reprise (résiliation avant la ${p.mensualitesReprise}e mensualité) — ${a.garage_nom}`, periode: null, montant: -reprise });
      }
    }

    if (a.secretaire_id && collabs.get(a.secretaire_id)?.type === "secretaire" && f.heures > 0) {
      const taux = collabs.get(a.secretaire_id)?.taux_horaire ?? null;
      for (const m of payees) {
        lignes.push({
          cle: `ret:${a.id}:${m.periode.slice(0, 7)}`,
          collaborateur_id: a.secretaire_id,
          abonnement_id: a.id,
          type: "retrocession",
          libelle: `Rétrocession ${m.periode.slice(0, 7)} — ${a.garage_nom} (${f.libelle})`,
          periode: m.periode,
          montant: retrocessionMensuelle(f0.heures, taux, p),
        });
      }
    }
  }
  return lignes;
}

/** Marge IDEAFORMA d'un abonnement sur ses mensualités payées (indicateur du tableau de bord). */
export function margeAbonnement(a: AbonnementCalc, mensualites: MensualiteCalc[], reglements: { abonnement_id: string | null; montant: number; statut: string }[], p: Parametres): number {
  const payees = mensualites.filter((m) => m.abonnement_id === a.id && m.payee_le);
  const ca = payees.reduce((s, m) => s + (Number(m.montant_ht) || 0), 0);
  const tech = payees.length * p.coutTechnique;
  const verse = reglements.filter((r) => r.abonnement_id === a.id && r.statut !== "annule").reduce((s, r) => s + (Number(r.montant) || 0), 0);
  return r2(ca - tech - verse);
}
