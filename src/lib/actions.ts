// Moteur « Prochaine action » : à partir de l'état d'un dossier, calcule
// LA prochaine chose à faire, selon le processus métier du garage :
// dossier → expertise → chiffrage → devis → validation → OR + facture →
// réparation → envoi facture (client OU assurance si cession) → paiement
// (relances) → restitution → clôture.

import {
  CessionCreance,
  DemandeAssurance,
  Document,
  Dossier,
  OrdreReparation,
  Paiement,
  PieceDossier,
  Relance,
  Restitution,
} from "./types";
import { resteAPayer, totalPaye } from "./paiements";
import { completudePieces } from "./pieces";
import { addJoursOuvres } from "./format";
import { calibrageEnAttente } from "./vitrage";

export type ProchaineAction = {
  code: string;
  titre: string;
  detail?: string;
  href: string;
  ctaLabel: string;
  // haute = à faire sans attendre · normale = à faire · attente = on attend un tiers
  urgence: "haute" | "normale" | "attente";
};

function joursDepuis(date: string | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export function calculeProchaineAction(args: {
  dossier: Dossier;
  documents: Document[];
  paiements: Paiement[];
  relances: Relance[];
  ordres: OrdreReparation[];
  restitutions: Restitution[];
  cessions: CessionCreance[];
  pieces?: Pick<PieceDossier, "type">[];
  demandes?: Pick<DemandeAssurance, "demande" | "date_envoi">[];
  metier?: string | null;
}): ProchaineAction | null {
  // Le métier vitrage suit un processus différent (pas d'ordre de réparation
  // imposé, calibrage ADAS, pas de délai d'envoi de facture).
  if (args.metier === "vitrage") return actionVitrage(args);

  const { dossier, documents, paiements, relances, ordres, restitutions, cessions, pieces, demandes } = args;
  if (dossier.statut === "cloture") return null;

  // PRIORITÉ ABSOLUE : une demande de documents en attente bloque le paiement
  const demandesEnAttente = (demandes || []).filter((d) => !d.date_envoi);
  if (demandesEnAttente.length > 0) {
    return {
      code: "demande_assurance",
      titre: `Envoie les documents demandés (${demandesEnAttente[0].demande})`,
      detail:
        demandesEnAttente.length > 1
          ? `${demandesEnAttente.length} demandes en attente — chaque jour de retard repousse le paiement.`
          : "Tant que ce n'est pas envoyé, l'assurance ne paiera pas.",
      href: `/sinistres/${dossier.id}`,
      ctaLabel: "Ouvrir le dossier",
      urgence: "haute",
    };
  }

  // 0) Dossier tout neuf : rassembler les pièces du client d'abord
  if (pieces && ["nouveau", "expertise"].includes(dossier.statut)) {
    const comp = completudePieces(dossier, pieces);
    const manquantesClient = comp.manquantes.filter((m) => m !== "rapport d'expertise");
    if (manquantesClient.length > 0) {
      return {
        code: "pieces",
        titre: `Complète les pièces du dossier (${manquantesClient.join(", ")})`,
        detail: "Photographie-les directement depuis le téléphone : bloc « Pièces du dossier » de la fiche.",
        href: `/sinistres/${dossier.id}`,
        ctaLabel: "Ouvrir le dossier",
        urgence: "normale",
      };
    }
  }

  const fiche = `/sinistres/${dossier.id}`;
  const factures = documents.filter((d) => d.type === "facture");
  const orSigne = ordres.some((o) => o.statut === "signe");
  const cessionSignee = cessions.some((c) => c.statut === "signe");
  const restitutionSignee = restitutions.some((r) => r.statut === "signe");

  // Reste à payer total sur les factures
  let resteTotal = 0;
  let factureEchue: Document | null = null;
  for (const f of factures) {
    const paye = totalPaye(paiements.filter((p) => p.document_id === f.id));
    const reste = resteAPayer(f.total_ttc, paye);
    resteTotal += reste;
    if (reste > 0 && f.date_echeance && new Date(f.date_echeance) < new Date()) {
      factureEchue = f;
    }
  }

  // 1) Pas de chiffrage : on attend le pré-rapport de l'expert
  if (!dossier.rapport_path && ordres.length === 0 && factures.length === 0) {
    return {
      code: "chiffrage",
      titre: "Importe le chiffrage de l'expert (pré-rapport)",
      detail: "Dès réception du mail de l'expert, importe son rapport : l'ordre de réparation et la facture se créent tout seuls, conformes au chiffrage.",
      href: "/import",
      ctaLabel: "Importer le rapport",
      urgence: "normale",
    };
  }

  // 2) Chiffrage reçu mais pas d'ordre de réparation (anciens dossiers)
  if (ordres.length === 0) {
    return {
      code: "or_creer",
      titre: "Émets l'ordre de réparation",
      detail: "Strictement conforme au chiffrage de l'expert (bloc Atelier de la fiche).",
      href: fiche,
      ctaLabel: "Ouvrir le dossier",
      urgence: "normale",
    };
  }

  // 3) OR émis mais pas signé : signature du client avant les travaux
  if (!orSigne) {
    return {
      code: "or",
      titre: "Fais signer l'ordre de réparation",
      detail: "Signature à l'écran, ou envoie le lien de signature au client (bloc Atelier).",
      href: fiche,
      ctaLabel: "Ouvrir le dossier",
      urgence: "normale",
    };
  }

  // 4bis) Mode cession activé : la cession doit être signée avant la facture
  if (dossier.mode_cession && !cessionSignee) {
    return {
      code: "cession_signature",
      titre: "Fais signer la cession de créance",
      detail: "Ce dossier est en mode cession : signature du client (bloc Atelier), puis la facture partira directement à l'assurance.",
      href: fiche,
      ctaLabel: "Ouvrir le dossier",
      urgence: "normale",
    };
  }

  // 5) Pas encore de facture
  if (factures.length === 0) {
    return {
      code: "facture",
      titre: "Crée la facture",
      detail: "Bloc Devis & Factures de la fiche : + Facture (reprend les lignes du devis).",
      href: fiche,
      ctaLabel: "Ouvrir le dossier",
      urgence: "normale",
    };
  }

  // 6) Facture en brouillon : envoi à J+3 OUVRÉS après le chiffrage
  //    (destinataires : expert + client, ou expert + assurance si cession)
  const enCession = cessionSignee || Boolean(dossier.mode_cession);
  const factureBrouillon = factures.find((f) => f.statut === "brouillon");
  if (factureBrouillon) {
    const dateEnvoi = addJoursOuvres(factureBrouillon.created_at, 3);
    dateEnvoi.setHours(0, 0, 0, 0);
    const aujourdhui = new Date();
    if (aujourdhui < dateEnvoi) {
      return {
        code: "attente_envoi_facture",
        titre: `Facture à envoyer le ${dateEnvoi.toLocaleDateString("fr-FR")}`,
        detail: "Délai de 3 jours ouvrés après réception du chiffrage. Un rappel est déjà dans l'agenda.",
        href: fiche,
        ctaLabel: "Ouvrir le dossier",
        urgence: "attente",
      };
    }
    return {
      code: "envoi_facture",
      titre: enCession
        ? "Envoie la facture à l'expert et à l'assurance (cession)"
        : "Envoie la facture à l'expert et au client",
      detail: enCession
        ? "Les 3 jours ouvrés sont passés. La cession est en place : l'assurance te paiera directement — n'envoie PAS la facture au client."
        : "Les 3 jours ouvrés sont passés. Cas normal : le client transmettra la facture à son assurance.",
      href: fiche,
      ctaLabel: "Ouvrir le dossier",
      urgence: "normale",
    };
  }

  // 7) Réparation pas planifiée
  if (!dossier.reparation_debut && ["devis", "expertise", "nouveau"].includes(dossier.statut)) {
    return {
      code: "planning",
      titre: "Planifie la réparation",
      detail: "Réserve le créneau atelier et commande les pièces.",
      href: "/planning",
      ctaLabel: "Ouvrir le planning",
      urgence: "normale",
    };
  }

  // 8) Facture échue impayée : relancer (au-delà de 7 j depuis la dernière relance)
  if (factureEchue) {
    const rels = relances.filter((r) => r.document_id === factureEchue!.id);
    const derniere = rels[0]?.date_relance || null;
    const j = joursDepuis(derniere);
    if (j === null || j >= 7) {
      const niveau = rels.length + 1;
      return {
        code: "relance",
        titre: niveau >= 3 ? "Envoie la mise en demeure" : `Relance le paiement (n°${niveau})`,
        detail: `Facture ${factureEchue.numero || ""} échue, reste ${resteTotal.toFixed(2).replace(".", ",")} €. Page Finance : bouton Relancer.`,
        href: "/finance",
        ctaLabel: "Ouvrir Finance",
        urgence: "haute",
      };
    }
    return {
      code: "attente_paiement",
      titre: "En attente du paiement (relancé récemment)",
      detail: "Dernière relance il y a moins de 7 jours.",
      href: "/finance",
      ctaLabel: "Ouvrir Finance",
      urgence: "attente",
    };
  }

  // 9) Facture envoyée, pas encore échue : attente
  if (resteTotal > 0) {
    return {
      code: "attente_paiement",
      titre: "En attente du paiement",
      detail: cessionSignee || dossier.mode_cession
        ? "L'assurance doit te régler directement (cession de créance)."
        : "L'assurance paie le client, qui te fait un virement. Pense au rapprochement bancaire à réception.",
      href: "/finance",
      ctaLabel: "Ouvrir Finance",
      urgence: "attente",
    };
  }

  // 10) Payé : restitution signée puis clôture
  if (!restitutionSignee) {
    return {
      code: "restitution",
      titre: "Fais signer le PV de restitution",
      detail: "Le dossier est payé : remets le véhicule au client et fais signer le PV (bloc Atelier).",
      href: fiche,
      ctaLabel: "Ouvrir le dossier",
      urgence: "normale",
    };
  }
  return {
    code: "cloture",
    titre: "Clôture le dossier",
    detail: "Tout est fait : véhicule rendu et facture soldée. Passe le statut en Clôturé.",
    href: fiche,
    ctaLabel: "Ouvrir le dossier",
    urgence: "normale",
  };
}

// ---------- Processus VITRAGE (bris de glace) ----------
// Diagnostic → devis → (cession) → planification → intervention + calibrage
// ADAS → facture → paiement (relances) → restitution → clôture.
function actionVitrage(args: {
  dossier: Dossier;
  documents: Document[];
  paiements: Paiement[];
  relances: Relance[];
  restitutions: Restitution[];
  cessions: CessionCreance[];
  pieces?: Pick<PieceDossier, "type">[];
  demandes?: Pick<DemandeAssurance, "demande" | "date_envoi">[];
}): ProchaineAction | null {
  const { dossier, documents, paiements, relances, restitutions, cessions, pieces, demandes } = args;
  if (dossier.statut === "cloture") return null;
  const fiche = `/sinistres/${dossier.id}`;

  // PRIORITÉ ABSOLUE : une demande de documents en attente bloque le paiement
  const demandesEnAttente = (demandes || []).filter((d) => !d.date_envoi);
  if (demandesEnAttente.length > 0) {
    return {
      code: "demande_assurance",
      titre: `Envoie les documents demandés (${demandesEnAttente[0].demande})`,
      detail:
        demandesEnAttente.length > 1
          ? `${demandesEnAttente.length} demandes en attente — chaque jour de retard repousse le paiement.`
          : "Tant que ce n'est pas envoyé, l'assurance ne paiera pas.",
      href: fiche,
      ctaLabel: "Ouvrir le dossier",
      urgence: "haute",
    };
  }

  // 0) Pièces du client (carte grise, constat) avant tout
  if (pieces && ["nouveau", "expertise"].includes(dossier.statut)) {
    const comp = completudePieces(dossier, pieces);
    const manquantesClient = comp.manquantes.filter((m) => m !== "rapport d'expertise");
    if (manquantesClient.length > 0) {
      return {
        code: "pieces",
        titre: `Complète les pièces du dossier (${manquantesClient.join(", ")})`,
        detail: "Photographie-les directement depuis le téléphone : bloc « Pièces du dossier ».",
        href: fiche,
        ctaLabel: "Ouvrir le dossier",
        urgence: "normale",
      };
    }
  }

  const factures = documents.filter((d) => d.type === "facture");
  const devisList = documents.filter((d) => d.type === "devis");
  const cessionSignee = cessions.some((c) => c.statut === "signe");
  const restitutionSignee = restitutions.some((r) => r.statut === "signe");
  const enCession = cessionSignee || Boolean(dossier.mode_cession);

  let resteTotal = 0;
  let factureEchue: Document | null = null;
  for (const f of factures) {
    const paye = totalPaye(paiements.filter((p) => p.document_id === f.id));
    const reste = resteAPayer(f.total_ttc, paye);
    resteTotal += reste;
    if (reste > 0 && f.date_echeance && new Date(f.date_echeance) < new Date()) {
      factureEchue = f;
    }
  }

  // 1) Diagnostic fait : établir le devis (impact réparable ou remplacement)
  if (devisList.length === 0 && factures.length === 0) {
    return {
      code: "devis",
      titre: "Établis le devis de l'intervention",
      detail:
        "Après diagnostic (réparation d'impact ou remplacement) : crée le devis dans « Documents du dossier ».",
      href: fiche,
      ctaLabel: "Ouvrir le dossier",
      urgence: "normale",
    };
  }

  // 2) Tiers payant : la cession doit être signée
  if (dossier.mode_cession && !cessionSignee) {
    return {
      code: "cession_signature",
      titre: "Fais signer la cession de créance",
      detail:
        "Tiers payant : le client signe la cession, l'assurance te règle directement (bloc Documents).",
      href: fiche,
      ctaLabel: "Ouvrir le dossier",
      urgence: "normale",
    };
  }

  // 3) Intervention non planifiée : réserver le créneau + commander le vitrage
  if (!dossier.reparation_debut && ["nouveau", "expertise", "devis"].includes(dossier.statut)) {
    return {
      code: "planning",
      titre: "Planifie l'intervention",
      detail:
        "Réserve le créneau et commande le vitrage (référence selon options : capteurs, chauffant, acoustique…).",
      href: "/planning",
      ctaLabel: "Ouvrir le planning",
      urgence: "normale",
    };
  }

  // 4) Calibrage ADAS obligatoire avant restitution
  if (calibrageEnAttente(dossier) && dossier.reparation_debut) {
    return {
      code: "calibrage",
      titre: "Réalise et enregistre le calibrage ADAS",
      detail:
        "Caméra derrière le pare-brise : le calibrage est obligatoire avant de rendre le véhicule. Coche « Calibrage réalisé » sur la fiche.",
      href: fiche,
      ctaLabel: "Ouvrir le dossier",
      urgence: "haute",
    };
  }

  // 5) Pas encore de facture
  if (factures.length === 0) {
    return {
      code: "facture",
      titre: "Crée la facture",
      detail: "Bloc « Documents du dossier » : + Facture (reprend les lignes du devis).",
      href: fiche,
      ctaLabel: "Ouvrir le dossier",
      urgence: "normale",
    };
  }

  // 6) Facture en brouillon : envoi immédiat (assurance si tiers payant, sinon client)
  const factureBrouillon = factures.find((f) => f.statut === "brouillon");
  if (factureBrouillon) {
    return {
      code: "envoi_facture",
      titre: enCession
        ? "Envoie la facture à l'assurance (tiers payant)"
        : "Envoie la facture au client",
      detail: enCession
        ? "Cession en place : l'assurance te règle directement. Le client ne paie que sa franchise éventuelle."
        : "Le client règle l'intervention (franchise éventuelle) puis se fait rembourser par son assurance.",
      href: fiche,
      ctaLabel: "Ouvrir le dossier",
      urgence: "normale",
    };
  }

  // 7) Facture échue impayée : relancer
  if (factureEchue) {
    const rels = relances.filter((r) => r.document_id === factureEchue!.id);
    const derniere = rels[0]?.date_relance || null;
    const j = joursDepuis(derniere);
    if (j === null || j >= 7) {
      const niveau = rels.length + 1;
      return {
        code: "relance",
        titre: niveau >= 3 ? "Envoie la mise en demeure" : `Relance le paiement (n°${niveau})`,
        detail: `Facture ${factureEchue.numero || ""} échue, reste ${resteTotal
          .toFixed(2)
          .replace(".", ",")} €. Page Finance : bouton Relancer.`,
        href: "/finance",
        ctaLabel: "Ouvrir Finance",
        urgence: "haute",
      };
    }
    return {
      code: "attente_paiement",
      titre: "En attente du paiement (relancé récemment)",
      detail: "Dernière relance il y a moins de 7 jours.",
      href: "/finance",
      ctaLabel: "Ouvrir Finance",
      urgence: "attente",
    };
  }

  // 8) Facture envoyée, pas encore échue : attente
  if (resteTotal > 0) {
    return {
      code: "attente_paiement",
      titre: "En attente du paiement",
      detail: enCession
        ? "L'assurance doit te régler directement (tiers payant / cession)."
        : "Le client règle l'intervention (virement à réception). Pense au rapprochement bancaire.",
      href: "/finance",
      ctaLabel: "Ouvrir Finance",
      urgence: "attente",
    };
  }

  // 9) Payé : restitution du véhicule (PV facultatif)
  if (!restitutionSignee && dossier.statut !== "rendu") {
    return {
      code: "restitution",
      titre: "Restitue le véhicule au client",
      detail:
        "Intervention payée : rends le véhicule. Tu peux faire signer un PV (bloc Documents), sinon passe le statut en « Véhicule restitué ».",
      href: fiche,
      ctaLabel: "Ouvrir le dossier",
      urgence: "normale",
    };
  }

  // 10) Tout est fait : clôture
  return {
    code: "cloture",
    titre: "Clôture le dossier",
    detail: "Véhicule rendu et facture soldée. Passe le statut en Clôturé.",
    href: fiche,
    ctaLabel: "Ouvrir le dossier",
    urgence: "normale",
  };
}

export const URGENCE_STYLE: Record<
  ProchaineAction["urgence"],
  { badge: string; label: string; couleur: string }
> = {
  haute: { badge: "bg-rose-100 text-rose-700", label: "URGENT", couleur: "#e11d48" },
  normale: { badge: "bg-amber-100 text-amber-700", label: "A FAIRE", couleur: "#f59e0b" },
  attente: { badge: "bg-slate-100 text-slate-500", label: "EN ATTENTE", couleur: "#94a3b8" },
};
