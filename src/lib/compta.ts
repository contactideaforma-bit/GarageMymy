// ============================================================
//  EXPORT COMPTABLE (v10.1)
//
//  Ce que demande un comptable, sans qu'il ait à ouvrir l'appli :
//   · le JOURNAL DES VENTES de la période (factures émises, HT / TVA / TTC,
//     n°, client, dossier, échéance, statut, nature : réparation / gardiennage) ;
//   · les ENCAISSEMENTS (date, montant, moyen, référence, facture, client) ;
//   · la TVA collectée par taux ;
//   · la BALANCE CLIENTS (facturé, encaissé, reste dû, plus ancienne échéance).
//  Un classeur Excel à 4 onglets, et un ZIP « pièces » avec le classeur,
//  les factures PDF et les RAPPORTS D'EXPERTISE qui les justifient.
//  RIEN n'est modifié ni effacé : c'est l'inverse de l'archivage.
// ============================================================

import JSZip from "jszip";
import { supabase } from "./supabaseClient";
import { FeuilleExcel, construireClasseur, telechargerBlob } from "./excel";
import { documentPdfBase64Auto } from "./pdf";
import { formatDate, labelStatut } from "./format";
import { labelModeReglement, labelStatutDoc } from "./documents";
import { labelMoyen, resteAPayer, totalPaye } from "./paiements";
import { Document, Dossier, Paiement } from "./types";

export type Periode = { debut: string; fin: string; libelle: string }; // AAAA-MM-JJ inclus

const r2 = (n: number) => Math.round(n * 100) / 100;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function periodeMois(annee: number, mois: number): Periode {
  const d = new Date(annee, mois, 1);
  const f = new Date(annee, mois + 1, 0);
  return { debut: ymd(d), fin: ymd(f), libelle: d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) };
}
export function periodeTrimestre(annee: number, t: number): Periode {
  const d = new Date(annee, (t - 1) * 3, 1);
  const f = new Date(annee, t * 3, 0);
  return { debut: ymd(d), fin: ymd(f), libelle: `T${t} ${annee}` };
}
export function periodeAnnee(annee: number): Periode {
  return { debut: `${annee}-01-01`, fin: `${annee}-12-31`, libelle: `Année ${annee}` };
}

export type DonneesCompta = {
  dossiers: Dossier[];
  documents: Document[];
  paiements: Paiement[];
};

export async function chargerDonneesCompta(): Promise<DonneesCompta> {
  const [d, docs, p] = await Promise.all([
    supabase.from("dossiers").select("*"),
    supabase.from("documents").select("*").eq("type", "facture"),
    supabase.from("paiements").select("*"),
  ]);
  if (d.error) throw d.error;
  return { dossiers: (d.data as Dossier[]) || [], documents: (docs.data as Document[]) || [], paiements: (p.data as Paiement[]) || [] };
}

const dateDoc = (f: Document) => (f.date_document || f.created_at || "").slice(0, 10);
const dans = (iso: string | null | undefined, p: Periode) => Boolean(iso) && iso!.slice(0, 10) >= p.debut && iso!.slice(0, 10) <= p.fin;

export type SyntheseCompta = {
  factures: Document[];
  paiements: Paiement[];
  ht: number;
  tva: number;
  ttc: number;
  encaisse: number;
  resteDuFinPeriode: number;
  parTaux: { taux: number; base: number; tva: number; ttc: number; nb: number }[];
};

export function synthese(data: DonneesCompta, p: Periode): SyntheseCompta {
  const factures = data.documents.filter((f) => f.statut !== "brouillon" && dans(dateDoc(f), p)).sort((a, b) => dateDoc(a).localeCompare(dateDoc(b)));
  const paiements = data.paiements.filter((x) => dans(x.date_paiement, p)).sort((a, b) => (a.date_paiement || "").localeCompare(b.date_paiement || ""));
  const ht = r2(factures.reduce((s, f) => s + (Number(f.total_ht) || 0), 0));
  const tva = r2(factures.reduce((s, f) => s + (Number(f.total_tva) || 0), 0));
  const ttc = r2(factures.reduce((s, f) => s + (Number(f.total_ttc) || 0), 0));
  const encaisse = r2(paiements.reduce((s, x) => s + (Number(x.montant) || 0), 0));
  // Reste dû à la fin de la période : factures émises jusqu'à la fin, paiements jusqu'à la fin.
  const emisesAvantFin = data.documents.filter((f) => f.statut !== "brouillon" && dateDoc(f) <= p.fin);
  const resteDuFinPeriode = r2(
    emisesAvantFin.reduce((s, f) => {
      const paye = totalPaye(data.paiements.filter((x) => x.document_id === f.id && (x.date_paiement || "").slice(0, 10) <= p.fin));
      return s + resteAPayer(f.total_ttc, paye);
    }, 0)
  );
  const taux = new Map<number, { taux: number; base: number; tva: number; ttc: number; nb: number }>();
  for (const f of factures) {
    const t = Number(f.tva) || 0;
    const e = taux.get(t) || { taux: t, base: 0, tva: 0, ttc: 0, nb: 0 };
    e.base += Number(f.total_ht) || 0;
    e.tva += Number(f.total_tva) || 0;
    e.ttc += Number(f.total_ttc) || 0;
    e.nb += 1;
    taux.set(t, e);
  }
  return { factures, paiements, ht, tva, ttc, encaisse, resteDuFinPeriode, parTaux: Array.from(taux.values()).map((x) => ({ ...x, base: r2(x.base), tva: r2(x.tva), ttc: r2(x.ttc) })).sort((a, b) => b.taux - a.taux) };
}

function feuilles(data: DonneesCompta, p: Periode, s: SyntheseCompta): FeuilleExcel[] {
  const parId = new Map(data.dossiers.map((d) => [d.id, d]));
  const ventes = s.factures.map((f) => {
    const d = parId.get(f.dossier_id);
    const paye = totalPaye(data.paiements.filter((x) => x.document_id === f.id));
    return {
      date: formatDate(dateDoc(f)),
      numero: f.numero || "",
      client: d?.client_nom || "",
      siren: d?.client_siren || "",
      dossier: d?.numero_sinistre || "",
      immat: d?.immatriculation || "",
      assureur: d?.assureur || "",
      nature: f.origine === "gardiennage" ? "Gardiennage" : "Réparation",
      ht: Number(f.total_ht) || 0,
      taux: Number(f.tva) || 0,
      tva: Number(f.total_tva) || 0,
      ttc: Number(f.total_ttc) || 0,
      echeance: formatDate(f.date_echeance),
      mode: labelModeReglement(f.mode_paiement),
      statut: labelStatutDoc(f.statut),
      encaisse: paye,
      reste: resteAPayer(f.total_ttc, paye),
    };
  });
  const parDoc = new Map(data.documents.map((f) => [f.id, f]));
  const encaissements = s.paiements.map((x) => {
    const f = x.document_id ? parDoc.get(x.document_id) : undefined;
    const d = x.dossier_id ? parId.get(x.dossier_id) : f ? parId.get(f.dossier_id) : undefined;
    return {
      date: formatDate(x.date_paiement),
      montant: Number(x.montant) || 0,
      moyen: labelMoyen(x.moyen),
      reference: x.reference || "",
      facture: f?.numero || "",
      client: d?.client_nom || "",
      dossier: d?.numero_sinistre || "",
      notes: x.notes || "",
    };
  });
  const tva = s.parTaux.map((t) => ({ taux: t.taux, nb: t.nb, base: t.base, tva: t.tva, ttc: t.ttc }));
  // Balance clients à la fin de la période (toutes factures émises jusque-là)
  const clients = new Map<string, { client: string; nb: number; facture: number; encaisse: number; reste: number; plusAncienne: string }>();
  for (const f of data.documents.filter((x) => x.statut !== "brouillon" && dateDoc(x) <= p.fin)) {
    const d = parId.get(f.dossier_id);
    const nom = d?.client_nom || "(sans nom)";
    const paye = totalPaye(data.paiements.filter((x) => x.document_id === f.id && (x.date_paiement || "").slice(0, 10) <= p.fin));
    const reste = resteAPayer(f.total_ttc, paye);
    const e = clients.get(nom) || { client: nom, nb: 0, facture: 0, encaisse: 0, reste: 0, plusAncienne: "" };
    e.nb += 1;
    e.facture += Number(f.total_ttc) || 0;
    e.encaisse += paye;
    e.reste += reste;
    if (reste > 0.01 && f.date_echeance && (!e.plusAncienne || f.date_echeance < e.plusAncienne)) e.plusAncienne = f.date_echeance;
    clients.set(nom, e);
  }
  const balance = Array.from(clients.values())
    .map((c) => ({ ...c, facture: r2(c.facture), encaisse: r2(c.encaisse), reste: r2(c.reste), plusAncienne: c.plusAncienne ? formatDate(c.plusAncienne) : "" }))
    .sort((a, b) => b.reste - a.reste);

  return [
    {
      nom: "Journal des ventes",
      colonnes: [
        { key: "date", header: "Date", width: 12 }, { key: "numero", header: "N° facture", width: 18 }, { key: "client", header: "Client", width: 26 },
        { key: "siren", header: "SIREN client", width: 12 }, { key: "dossier", header: "N° sinistre", width: 16 }, { key: "immat", header: "Immat.", width: 11 },
        { key: "assureur", header: "Assureur", width: 18 }, { key: "nature", header: "Nature", width: 12 },
        { key: "ht", header: "HT", width: 12, type: "euro" }, { key: "taux", header: "Taux TVA %", width: 10, type: "number" }, { key: "tva", header: "TVA", width: 12, type: "euro" },
        { key: "ttc", header: "TTC", width: 12, type: "euro" }, { key: "echeance", header: "Échéance", width: 12 }, { key: "mode", header: "Mode de règlement", width: 16 },
        { key: "statut", header: "Statut", width: 12 }, { key: "encaisse", header: "Encaissé (à ce jour)", width: 14, type: "euro" }, { key: "reste", header: "Reste dû", width: 12, type: "euro" },
      ],
      lignes: ventes,
    },
    {
      nom: "Encaissements",
      colonnes: [
        { key: "date", header: "Date", width: 12 }, { key: "montant", header: "Montant", width: 12, type: "euro" }, { key: "moyen", header: "Moyen", width: 12 },
        { key: "reference", header: "Référence", width: 18 }, { key: "facture", header: "N° facture", width: 18 }, { key: "client", header: "Client", width: 26 },
        { key: "dossier", header: "N° sinistre", width: 16 }, { key: "notes", header: "Notes", width: 24 },
      ],
      lignes: encaissements,
    },
    {
      nom: "TVA collectée",
      colonnes: [
        { key: "taux", header: "Taux %", width: 10, type: "number" }, { key: "nb", header: "Nb factures", width: 12, type: "number" },
        { key: "base", header: "Base HT", width: 14, type: "euro" }, { key: "tva", header: "TVA", width: 14, type: "euro" }, { key: "ttc", header: "TTC", width: 14, type: "euro" },
      ],
      lignes: tva,
    },
    {
      nom: "Balance clients",
      colonnes: [
        { key: "client", header: "Client", width: 28 }, { key: "nb", header: "Factures", width: 10, type: "number" }, { key: "facture", header: "Facturé TTC", width: 14, type: "euro" },
        { key: "encaisse", header: "Encaissé", width: 14, type: "euro" }, { key: "reste", header: "Reste dû", width: 14, type: "euro" }, { key: "plusAncienne", header: "Plus ancienne échéance impayée", width: 18 },
      ],
      lignes: balance,
    },
  ];
}

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

/** Classeur Excel seul. */
export async function exporterClasseurCompta(data: DonneesCompta, p: Periode): Promise<void> {
  const s = synthese(data, p);
  const blob = await construireClasseur(feuilles(data, p, s));
  telechargerBlob(blob, `compta-${slug(p.libelle)}.xlsx`);
}

/** ZIP : classeur + factures PDF + rapports d'expertise des dossiers facturés. */
export async function exporterPiecesCompta(
  data: DonneesCompta,
  p: Periode,
  onProgress?: (message: string, pourcent: number) => void
): Promise<{ factures: number; rapports: number }> {
  const s = synthese(data, p);
  const zip = new JSZip();
  const avance = (m: string, pc: number) => onProgress?.(m, pc);
  avance("Classeur…", 5);
  zip.file(`compta-${slug(p.libelle)}.xlsx`, await construireClasseur(feuilles(data, p, s)));
  const parId = new Map(data.dossiers.map((d) => [d.id, d]));
  let nbF = 0;
  for (let i = 0; i < s.factures.length; i += 1) {
    const f = s.factures[i];
    const d = parId.get(f.dossier_id);
    if (!d) continue;
    try {
      const b64 = await documentPdfBase64Auto(f, d);
      zip.file(`factures/${slug(f.numero || f.id.slice(0, 8))}.pdf`, b64, { base64: true });
      nbF += 1;
    } catch {
      /* facture illisible : on continue */
    }
    avance(`Factures PDF… (${i + 1}/${s.factures.length})`, 10 + Math.round((i / Math.max(1, s.factures.length)) * 55));
  }
  // Rapports d'expertise des dossiers facturés dans la période (une fois par dossier)
  const dossiers = Array.from(new Set(s.factures.map((f) => f.dossier_id))).map((id) => parId.get(id)).filter((d): d is Dossier => Boolean(d && d.rapport_path));
  let nbR = 0;
  for (let i = 0; i < dossiers.length; i += 1) {
    const d = dossiers[i];
    try {
      const { data: blob } = await supabase.storage.from("rapports").download(d.rapport_path!);
      if (blob) {
        zip.file(`rapports/${slug(`${d.numero_sinistre || d.immatriculation || d.id.slice(0, 8)}-${d.rapport_nom || "rapport"}`)}.pdf`, blob);
        nbR += 1;
      }
    } catch {
      /* rapport absent */
    }
    avance(`Rapports d'expertise… (${i + 1}/${dossiers.length})`, 66 + Math.round((i / Math.max(1, dossiers.length)) * 28));
  }
  zip.file(
    "LISEZ-MOI.txt",
    [
      `EXPORT COMPTABLE — ${p.libelle} (du ${formatDate(p.debut)} au ${formatDate(p.fin)})`,
      "",
      `compta-*.xlsx        Journal des ventes, encaissements, TVA collectée, balance clients.`,
      `factures/*.pdf       ${nbF} facture(s) émise(s) sur la période.`,
      `rapports/*.pdf       ${nbR} rapport(s) d'expertise justifiant ces factures (nommés par n° de sinistre).`,
      "",
      `Totaux : ${s.ht.toFixed(2)} € HT · ${s.tva.toFixed(2)} € TVA · ${s.ttc.toFixed(2)} € TTC facturés · ${s.encaisse.toFixed(2)} € encaissés · ${s.resteDuFinPeriode.toFixed(2)} € restant dus au ${formatDate(p.fin)}.`,
      "",
      "Cet export ne modifie rien dans l'application (contrairement à l'archivage).",
    ].join("\n")
  );
  avance("Compression…", 96);
  const blob = await zip.generateAsync({ type: "blob" });
  telechargerBlob(blob, `pieces-comptables-${slug(p.libelle)}.zip`);
  avance("Terminé", 100);
  return { factures: nbF, rapports: nbR };
}

export { labelStatut };
