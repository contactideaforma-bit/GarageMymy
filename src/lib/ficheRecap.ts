// ============================================================
//  FICHE RÉCAP D'UN DOSSIER (v13.49) — logique PURE.
//
//  Toutes les infos utiles d'un sinistre en un coup d'œil, et le même
//  contenu en texte brut prêt à coller dans WhatsApp, Messages ou un mail
//  (« tu me passes les infos du dossier ? »). Les montants viennent de la
//  dernière facture si elle existe, sinon du montant HT retenu au rapport.
// ============================================================

import type { Document, Dossier } from "./types";
import { formatDate, formatEuros } from "./format";
import { tauxTva } from "./tva";

export type LigneRecap = { label: string; valeur: string; cle: string; tel?: boolean; email?: boolean };
export type SectionRecap = { titre: string; lignes: LigneRecap[] };

function montants(dossier: Dossier, documents: Document[]): { ht: number | null; ttc: number | null; source: string } {
  const factures = documents
    .filter((d) => d.type === "facture" && (d.total_ht != null || d.total_ttc != null))
    .sort((a, b) => (b.date_document || b.created_at).localeCompare(a.date_document || a.created_at));
  if (factures[0]) {
    const f = factures[0];
    const ht = f.total_ht ?? (f.total_ttc != null ? f.total_ttc / (1 + tauxTva(f) / 100) : null);
    const ttc = f.total_ttc ?? (ht != null ? ht * (1 + tauxTva(f) / 100) : null);
    return { ht, ttc, source: `facture ${f.numero || ""}`.trim() };
  }
  if (dossier.montant != null) {
    return { ht: dossier.montant, ttc: dossier.montant * (1 + tauxTva(dossier) / 100), source: "rapport d'expertise" };
  }
  return { ht: null, ttc: null, source: "" };
}

/** Sections affichées dans la fenêtre (les lignes vides sont omises). */
export function sectionsRecap(dossier: Dossier, documents: Document[]): SectionRecap[] {
  const m = montants(dossier, documents);
  const brut: SectionRecap[] = [
    {
      titre: "Client",
      lignes: [
        { cle: "client_nom", label: "Nom", valeur: dossier.client_nom || "" },
        { cle: "client_tel", label: "Téléphone", valeur: dossier.client_tel || "", tel: true },
        { cle: "client_email", label: "Email", valeur: dossier.client_email || "", email: true },
      ],
    },
    {
      titre: "Véhicule",
      lignes: [
        { cle: "marque_modele", label: "Marque / modèle", valeur: dossier.marque_modele || "" },
        { cle: "immatriculation", label: "Immatriculation", valeur: dossier.immatriculation || "" },
        { cle: "numero_serie", label: "VIN", valeur: dossier.numero_serie || "" },
      ],
    },
    {
      titre: "Sinistre",
      lignes: [
        { cle: "numero_sinistre", label: "N° de sinistre", valeur: dossier.numero_sinistre || "" },
        { cle: "date_sinistre", label: "Date du sinistre", valeur: dossier.date_sinistre ? formatDate(dossier.date_sinistre) : "" },
        { cle: "assureur", label: "Assurance", valeur: dossier.assureur || "" },
        { cle: "numero_police", label: "N° de police", valeur: dossier.numero_police || "" },
        { cle: "assureur_tel", label: "Tél. assurance", valeur: dossier.assureur_tel || "", tel: true },
      ],
    },
    {
      titre: "Expertise",
      lignes: [
        { cle: "cabinet_expert", label: "Cabinet", valeur: dossier.cabinet_expert || "" },
        { cle: "expert_nom", label: "Expert", valeur: dossier.expert_nom || "" },
        { cle: "expert_tel", label: "Tél. expert", valeur: dossier.expert_tel || dossier.cabinet_tel || "", tel: true },
        { cle: "expert_email", label: "Email expert", valeur: dossier.expert_email || dossier.cabinet_email || "", email: true },
        { cle: "date_expertise", label: "Date d'expertise", valeur: dossier.date_expertise ? formatDate(dossier.date_expertise) : "" },
      ],
    },
    // v13.53 — recours direct : le tiers responsable et son assureur.
    ...(dossier.mode_recours
      ? [{
          titre: "Recours direct",
          lignes: [
            { cle: "recours_tiers_nom", label: "Tiers responsable", valeur: dossier.recours_tiers_nom || "" },
            { cle: "recours_tiers_immat", label: "Immat. du tiers", valeur: dossier.recours_tiers_immat || "" },
            { cle: "recours_tiers_assureur", label: "Assureur adverse", valeur: dossier.recours_tiers_assureur || "" },
            { cle: "recours_tiers_assureur_tel", label: "Tél. assureur adverse", valeur: dossier.recours_tiers_assureur_tel || "", tel: true },
            { cle: "recours_tiers_assureur_email", label: "Email assureur adverse", valeur: dossier.recours_tiers_assureur_email || "", email: true },
            { cle: "recours_sinistre_adverse", label: "N° sinistre adverse", valeur: dossier.recours_sinistre_adverse || "" },
            { cle: "recours_etape", label: "Étape", valeur: dossier.recours_etape || "" },
          ],
        }]
      : []),
    {
      titre: "Montant",
      lignes: [
        { cle: "montant_ht", label: "HT", valeur: m.ht != null ? formatEuros(m.ht) : "" },
        { cle: "montant_ttc", label: "TTC", valeur: m.ttc != null ? formatEuros(m.ttc) : "" },
        { cle: "montant_source", label: "Source", valeur: m.source },
      ],
    },
  ];
  return brut.map((s) => ({ ...s, lignes: s.lignes.filter((l) => l.valeur.trim()) })).filter((s) => s.lignes.length);
}

/** Texte brut à coller (WhatsApp, SMS, mail) : lisible sans mise en forme. */
export function texteRecap(dossier: Dossier, documents: Document[], opts?: { sections?: Set<string> }): string {
  const sections = sectionsRecap(dossier, documents).filter((s) => !opts?.sections || opts.sections.has(s.titre));
  const titre = `Dossier ${dossier.numero_sinistre || "sans numéro"}${dossier.immatriculation ? ` — ${dossier.immatriculation}` : ""}`;
  const blocs = sections.map((s) => [`${s.titre.toUpperCase()}`, ...s.lignes.filter((l) => l.cle !== "montant_source").map((l) => `${l.label} : ${l.valeur}`)].join("\n"));
  return [titre, "", ...blocs.flatMap((b) => [b, ""])].join("\n").trim();
}

/** Liens de partage. `sms:` fonctionne sur iPhone et Android avec `?&body=`. */
export function liensPartage(texte: string, tel?: string | null): { whatsapp: string; sms: string; mail: string } {
  const t = encodeURIComponent(texte);
  const num = (tel || "").replace(/[^\d+]/g, "");
  const intl = num.startsWith("0") ? "33" + num.slice(1) : num.replace(/^\+/, "");
  return {
    whatsapp: `https://wa.me/${tel ? intl : ""}?text=${t}`,
    sms: `sms:${tel ? num : ""}?&body=${t}`,
    mail: `mailto:?subject=${encodeURIComponent(texte.split("\n")[0])}&body=${t}`,
  };
}
