// Moteur « Prochaine action » : à partir de l'état d'un dossier, calcule
// LA prochaine chose à faire, selon le processus métier du garage :
// dossier → expertise → chiffrage → devis → validation → OR + facture →
// réparation → envoi facture (client OU assurance si cession) → paiement
// (relances) → restitution → clôture.

import {
  CessionCreance,
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
}): ProchaineAction | null {
  const { dossier, documents, paiements, relances, ordres, restitutions, cessions, pieces } = args;
  if (dossier.statut === "cloture") return null;

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
  const devis = documents.filter((d) => d.type === "devis");
  const factures = documents.filter((d) => d.type === "facture");
  const dernierDevis = devis[0] || null; // les listes sont triées created_at desc
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

  // 1) Pas de devis : soit on attend le chiffrage, soit il faut le faire
  if (devis.length === 0) {
    if (!dossier.rapport_path) {
      return {
        code: "chiffrage",
        titre: "Importe le chiffrage de l'expert",
        detail: "Dès réception du mail de l'expert, importe son rapport : le devis se créera tout seul.",
        href: "/import",
        ctaLabel: "Importer le rapport",
        urgence: "normale",
      };
    }
    return {
      code: "devis",
      titre: "Crée le devis",
      detail: "Le rapport est là : crée le devis (bloc Devis & Factures de la fiche).",
      href: fiche,
      ctaLabel: "Ouvrir le dossier",
      urgence: "normale",
    };
  }

  // 2) Devis en brouillon : à envoyer à l'expert et au client
  if (dernierDevis && dernierDevis.statut === "brouillon") {
    return {
      code: "envoi_devis",
      titre: "Envoie le devis à l'expert et au client",
      detail: "Bouton « Envoyer » sur le devis, dans la fiche du dossier.",
      href: fiche,
      ctaLabel: "Ouvrir le dossier",
      urgence: "normale",
    };
  }

  // 3) Devis envoyé mais pas encore accepté : on attend la validation
  if (dernierDevis && dernierDevis.statut === "envoye") {
    const j = joursDepuis(dernierDevis.date_document || dernierDevis.created_at) ?? 0;
    if (j > 7) {
      return {
        code: "relance_devis",
        titre: "Relance l'expert : devis sans réponse",
        detail: `Devis envoyé il y a ${j} jours sans validation. Un petit rappel s'impose.`,
        href: fiche,
        ctaLabel: "Ouvrir le dossier",
        urgence: "haute",
      };
    }
    return {
      code: "attente_validation",
      titre: "En attente de validation du devis",
      detail: "L'expert doit valider et envoyer son rapport définitif.",
      href: fiche,
      ctaLabel: "Ouvrir le dossier",
      urgence: "attente",
    };
  }

  // 4) Devis accepté : ordre de réparation signé avant les travaux
  if (!orSigne) {
    return {
      code: "or",
      titre: "Fais signer l'ordre de réparation",
      detail: "Signature du client directement à l'écran (bloc Atelier), avant de commencer les travaux.",
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

  // 6) Facture en brouillon : à envoyer (destinataire selon cession)
  const enCession = cessionSignee || Boolean(dossier.mode_cession);
  const factureBrouillon = factures.find((f) => f.statut === "brouillon");
  if (factureBrouillon) {
    return {
      code: "envoi_facture",
      titre: enCession
        ? "Envoie la facture à l'assurance (cession de créance)"
        : "Envoie la facture au client et à l'expert",
      detail: enCession
        ? "La cession est en place : l'assurance te paiera directement. N'envoie PAS la facture au client."
        : "Cas normal : le client transmettra la facture à son assurance. (Astuce : la cession de créance évite cette étape.)",
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

export const URGENCE_STYLE: Record<
  ProchaineAction["urgence"],
  { badge: string; label: string; couleur: string }
> = {
  haute: { badge: "bg-rose-100 text-rose-700", label: "URGENT", couleur: "#e11d48" },
  normale: { badge: "bg-amber-100 text-amber-700", label: "A FAIRE", couleur: "#f59e0b" },
  attente: { badge: "bg-slate-100 text-slate-500", label: "EN ATTENTE", couleur: "#94a3b8" },
};
