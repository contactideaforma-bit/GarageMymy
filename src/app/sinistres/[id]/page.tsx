"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  Dossier,
  Evenement,
  Document,
  DocumentLigne,
  DocumentType,
  Paiement,
  Relance,
  OrdreReparation,
  Restitution,
  CessionCreance,
  PieceDossier,
  DemandeAssurance,
} from "@/lib/types";
import { calculeProchaineAction } from "@/lib/actions";
import ProchaineActionCard from "@/components/ProchaineActionCard";
import PiecesPanel from "@/components/PiecesPanel";
import DemandesPanel from "@/components/DemandesPanel";
import CommandesPanel from "@/components/CommandesPanel";
import SignatureDocModal from "@/components/SignatureDocModal";
import ModalShell from "@/components/ModalShell";
import TransfertGarantiePanel from "@/components/TransfertGarantiePanel";
import { archiverDossier } from "@/lib/archive";
import { marquerFactureEnvoyee } from "@/lib/dossierSync";
import { fichierBase64, ouvrirFichier } from "@/lib/storage";
import { formatEuros, formatDate, formatDateTime, messageErreur } from "@/lib/format";
import { badgeStatutDoc, labelStatutDoc, modeParDefaut } from "@/lib/documents";
import ModePaiementModal from "@/components/ModePaiementModal";
import { apercuDocumentPdf, cessionPdfBase64, documentPdfBase64Auto, ordreReparationPdfBase64, ribPdfBase64 } from "@/lib/pdf";
import type { PieceJointeOption } from "@/components/EmailComposer";
import StatutBadge from "@/components/StatutBadge";
import StatutPipeline from "@/components/StatutPipeline";
import ProgressionDossier from "@/components/ProgressionDossier";
import DossierForm from "@/components/DossierForm";
import DocumentEditor from "@/components/DocumentEditor";
import PaiementsPanel from "@/components/PaiementsPanel";
import AtelierPanel, { TypeDocAtelier, labelOrdre } from "@/components/AtelierPanel";
import EmailComposer from "@/components/EmailComposer";
import ConfigBanner from "@/components/ConfigBanner";
import Accordeon from "@/components/Accordeon";
import ParticularitesPanel from "@/components/ParticularitesPanel";
import { useMetier } from "@/components/MetierProvider";
import { termes } from "@/lib/metier";
import { labelTypeVitrage, labelNatureIntervention } from "@/lib/vitrage";

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-white/5 last:border-0">
      <span className="shrink-0 text-sm text-white/50">{label}</span>
      <span className="min-w-0 break-words text-sm font-medium text-white text-right">{value || "—"}</span>
    </div>
  );
}

// Clé de mémorisation stable, dérivée du titre du bloc.
function cleBloc(titre: string): string {
  return (
    "dossier." +
    titre
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  );
}

// Tous les blocs de la fiche sont REPLIABLES (v7.0) : la fiche s'ouvrait avec
// une douzaine de panneaux dépliés, illisible sur téléphone. L'état est
// mémorisé par bloc, donc chacun retrouve sa mise en page.
function Card({
  title,
  children,
  defautOuvert = true,
}: {
  title: string;
  children: React.ReactNode;
  defautOuvert?: boolean;
}) {
  return (
    <Accordeon titre={title} cle={cleBloc(title)} defautOuvert={defautOuvert}>
      {children}
    </Accordeon>
  );
}

export default function DossierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { metier } = useMetier();
  const t = termes(metier);
  const estVitrage = metier === "vitrage";

  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [relances, setRelances] = useState<Relance[]>([]);
  const [ordres, setOrdres] = useState<OrdreReparation[]>([]);
  const [restitutions, setRestitutions] = useState<Restitution[]>([]);
  const [cessions, setCessions] = useState<CessionCreance[]>([]);
  const [pieces, setPieces] = useState<PieceDossier[]>([]);
  const [demandes, setDemandes] = useState<DemandeAssurance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);

  // éditeur de document
  const [editor, setEditor] = useState<
    { type: DocumentType; document?: Document | null; lignes?: DocumentLigne[] } | null
  >(null);

  // composer email (devis/facture)
  const [emailDoc, setEmailDoc] = useState<Document | null>(null);
  // facture en attente du choix du mode de paiement (avant génération du PDF)
  const [pdfDoc, setPdfDoc] = useState<Document | null>(null);
  // document d'atelier à créer (OR / cession / restitution), demandé depuis la
  // barre d'actions unique du bloc « Documents du dossier »
  const [atelierModal, setAtelierModal] = useState<TypeDocAtelier | null>(null);
  // signature d'un document (à l'écran ou lien à distance)
  const [signDoc, setSignDoc] = useState<Document | null>(null);
  const [emailSignature, setEmailSignature] = useState<{ titre: string; token: string } | null>(null);

  // planification de la réparation (dates + réparateur) depuis la fiche
  const [planOpen, setPlanOpen] = useState(false);
  const [planDebut, setPlanDebut] = useState("");
  const [planFin, setPlanFin] = useState("");
  const [planRep, setPlanRep] = useState("");

  function ouvrirPlanif() {
    if (!dossier) return;
    setPlanDebut(dossier.reparation_debut || "");
    setPlanFin(dossier.reparation_fin || "");
    setPlanRep(dossier.reparateur || "");
    setPlanOpen(true);
  }

  async function enregistrerPlanif() {
    if (!dossier) return;
    const { error } = await supabase.from("dossiers").update({
      reparation_debut: planDebut || null,
      reparation_fin: planFin || null,
      reparateur: planRep || null,
    }).eq("id", dossier.id);
    if (error) {
      alert(messageErreur(error, "Planification non enregistrée."));
      return; // on garde la modale ouverte pour ne pas perdre la saisie
    }
    setPlanOpen(false);
    load();
  }

  // mini-form événement
  const [evTitre, setEvTitre] = useState("");
  const [evDate, setEvDate] = useState("");
  const [evDesc, setEvDesc] = useState("");
  const [evSaving, setEvSaving] = useState(false);
  // Vrai dès que le dossier a été chargé une première fois (cf. load()).
  const dossierCharge = useRef(false);

  const load = useCallback(async () => {
    // Écran « Chargement… » UNIQUEMENT au premier affichage : chaque petite
    // mutation (cocher « Acquittée », ajouter un événement…) rappelait load()
    // et blanchissait toute la page en perdant le scroll.
    setLoading((l) => (dossierCharge.current ? l : true));
    const [d, e, docs, pay, rel, ors, rests, cess, pcs, dem] = await Promise.all([
      supabase.from("dossiers").select("*").eq("id", id).single(),
      supabase.from("evenements").select("*").eq("dossier_id", id).order("date_evenement", { ascending: true }),
      supabase.from("documents").select("*").eq("dossier_id", id).order("created_at", { ascending: false }),
      supabase.from("paiements").select("*").eq("dossier_id", id),
      supabase.from("relances").select("*").eq("dossier_id", id).order("date_relance", { ascending: false }),
      supabase.from("ordres_reparation").select("*").eq("dossier_id", id),
      supabase.from("restitutions").select("*").eq("dossier_id", id),
      supabase.from("cessions_creance").select("*").eq("dossier_id", id),
      supabase.from("pieces_dossier").select("*").eq("dossier_id", id).order("created_at", { ascending: false }),
      supabase.from("demandes_assurance").select("*").eq("dossier_id", id).order("created_at", { ascending: false }),
    ]);
    if (d.data) setDossier(d.data as Dossier);
    if (e.data) setEvenements(e.data as Evenement[]);
    if (docs.data) setDocuments(docs.data as Document[]);
    setPaiements((pay.data as Paiement[]) || []);
    setRelances((rel.data as Relance[]) || []);
    setOrdres((ors.data as OrdreReparation[]) || []);
    setRestitutions((rests.data as Restitution[]) || []);
    setCessions((cess.data as CessionCreance[]) || []);
    setPieces((pcs.data as PieceDossier[]) || []);
    setDemandes((dem.data as DemandeAssurance[]) || []);
    dossierCharge.current = true;
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function changeStatut(s: string) {
    if (!dossier) return;
    const avant = dossier;
    setDossier({ ...dossier, statut: s });
    const { error } = await supabase.from("dossiers").update({ statut: s }).eq("id", dossier.id);
    // Rollback si l'écriture échoue : sinon l'écran affichait un statut que la
    // base n'a jamais enregistré (« revenait » tout seul au rechargement).
    if (error) {
      setDossier(avant);
      alert(messageErreur(error, "Changement de statut impossible."));
    }
  }

  // Cession de créance et prise en charge sont deux circuits de paiement direct
  // ALTERNATIFS : activer l'un désactive l'autre (évite un dossier incohérent).
  async function toggleModeCession() {
    if (!dossier) return;
    const next = !dossier.mode_cession;
    const patch = next ? { mode_cession: true, mode_pec: false } : { mode_cession: false };
    setDossier({ ...dossier, ...patch });
    const { error } = await supabase.from("dossiers").update(patch).eq("id", dossier.id);
    if (error) {
      setDossier(dossier);
      alert("Impossible de changer le mode cession (migrations v15 et v32 exécutées ?).");
    }
  }

  async function toggleModePec() {
    if (!dossier) return;
    const next = !dossier.mode_pec;
    const patch = next ? { mode_pec: true, mode_cession: false } : { mode_pec: false };
    setDossier({ ...dossier, ...patch });
    const { error } = await supabase.from("dossiers").update(patch).eq("id", dossier.id);
    if (error) {
      setDossier(dossier);
      alert("Impossible de changer le mode prise en charge (migration v32 exécutée ?).");
    }
  }

  // Référence / n° de l'accord de prise en charge (enregistrée à la sortie du champ)
  async function enregistrerPecRef(ref: string) {
    if (!dossier || (dossier.pec_reference || "") === ref) return;
    const avant = dossier;
    setDossier({ ...dossier, pec_reference: ref || null });
    const { error } = await supabase
      .from("dossiers")
      .update({ pec_reference: ref || null })
      .eq("id", dossier.id);
    if (error) {
      setDossier(avant);
      alert(messageErreur(error, "Référence de l'accord non enregistrée."));
    }
  }

  const [archivage, setArchivage] = useState<string | null>(null);

  async function archiver() {
    if (!dossier) return;
    if (
      !confirm(
        "Archiver ce dossier ?\n\nUn ZIP complet (documents PDF, rapport, pièces, historique) va être téléchargé, puis les fichiers seront retirés du serveur. Le dossier restera visible dans l'onglet Archives.\n\nConserve bien le ZIP : c'est ta copie de référence."
      )
    )
      return;
    try {
      await archiverDossier(dossier, setArchivage);
      setArchivage(null);
      router.push("/archives");
    } catch (err: unknown) {
      setArchivage(null);
      alert(messageErreur(err, "Archivage impossible (migration v24 + npm install jszip ?)."));
    }
  }

  async function supprimer() {
    if (!dossier) return;
    if (!confirm("Supprimer définitivement ce dossier ? Les fichiers associés (rapport, pièces) seront aussi effacés.")) return;
    // On supprime la LIGNE D'ABORD : si le delete échoue (RLS, contrainte),
    // les fichiers sont toujours là et le dossier reste consultable.
    // (L'ancien ordre purgeait le Storage avant, ce qui pouvait laisser un
    // dossier vivant mais amputé de son rapport et de ses pièces.)
    const { error } = await supabase.from("dossiers").delete().eq("id", dossier.id);
    if (error) {
      alert(messageErreur(error, "Suppression impossible — le dossier n'a PAS été supprimé."));
      return;
    }
    const cheminsPieces = pieces.map((p) => p.path).filter(Boolean);
    if (cheminsPieces.length) await supabase.storage.from("pieces").remove(cheminsPieces);
    if (dossier.rapport_path) await supabase.storage.from("rapports").remove([dossier.rapport_path]);
    router.push("/sinistres");
  }


  async function ajouterEvenement(e: React.FormEvent) {
    e.preventDefault();
    if (!evTitre || !evDate || evSaving) return; // garde anti double-soumission
    setEvSaving(true);
    const { error } = await supabase.from("evenements").insert({
      dossier_id: id, titre: evTitre, description: evDesc || null,
      date_evenement: new Date(evDate).toISOString(),
    });
    setEvSaving(false);
    if (error) {
      alert(messageErreur(error, "Événement non ajouté."));
      return;
    }
    setEvTitre(""); setEvDate(""); setEvDesc("");
    load();
  }

  async function ouvrirEdition(doc: Document) {
    const { data } = await supabase
      .from("document_lignes").select("*").eq("document_id", doc.id).order("ordre", { ascending: true });
    setEditor({ type: doc.type, document: doc, lignes: (data as DocumentLigne[]) || [] });
  }

  // Ouvre le PDF dans un nouvel onglet (visualisation ; téléchargement
  // possible depuis la visionneuse du navigateur).
  // FACTURE : on demande d'abord le mode de paiement à imprimer (v34).
  async function exporterPdf(doc: Document) {
    if (!dossier) return;
    if (doc.type === "facture") {
      setPdfDoc(doc);
      return;
    }
    const { data } = await supabase
      .from("document_lignes").select("*").eq("document_id", doc.id).order("ordre", { ascending: true });
    await apercuDocumentPdf(doc, (data as DocumentLigne[]) || [], dossier);
  }

  // Génère la facture avec le mode de règlement choisi, et le mémorise sur
  // le document (réutilisé pour les pièces jointes des emails suivants).
  async function genererFacturePdf(doc: Document, mode: string) {
    if (!dossier) return;
    const { data } = await supabase
      .from("document_lignes").select("*").eq("document_id", doc.id).order("ordre", { ascending: true });
    await supabase.from("documents").update({ mode_paiement: mode }).eq("id", doc.id);
    await apercuDocumentPdf(doc, (data as DocumentLigne[]) || [], dossier, mode);
    setPdfDoc(null);
    load();
  }

  async function supprimerDoc(doc: Document) {
    if (!confirm("Supprimer ce document ?")) return;
    await supabase.from("documents").delete().eq("id", doc.id);
    load();
  }

  // Coche/décoche la mention « Acquittée » (apposée sur le PDF de la facture).
  // C'est un marqueur interne (chèque de caution) : SANS AUCUN impact sur le
  // statut de paiement de la facture ni sur celui du dossier.
  async function toggleAcquitte(doc: Document) {
    const { error } = await supabase
      .from("documents")
      .update({ acquitte: !doc.acquitte })
      .eq("id", doc.id);
    if (error) {
      alert(messageErreur(error, "Impossible de mettre à jour la mention « Acquittée »."));
      return;
    }
    load();
  }


  if (loading) return <p className="text-white/40">Chargement…</p>;

  if (!dossier) {
    return (
      <div>
        <ConfigBanner />
        <p className="text-white/70">
          Dossier introuvable.{" "}
          <Link href="/sinistres" className="text-accent-pink hover:underline">Retour à la liste</Link>
        </p>
      </div>
    );
  }

  const action = calculeProchaineAction({ dossier, documents, paiements, relances, ordres, restitutions, cessions, pieces, demandes, metier });
  // Destinataires d'envoi des documents selon le processus :
  // cas normal → expert + client ; cession de créance OU prise en charge →
  // expert + assurance (le garage est payé directement).
  const enCession = Boolean(dossier.mode_cession) || cessions.some((c) => c.statut === "signe");
  // Prise en charge : accord fourni par l'expert, rempli par le garage et
  // joint à la facture → paiement direct (ce n'est PAS une cession de créance).
  const enPec = Boolean(dossier.mode_pec);
  const pecPieces = pieces.filter((p) => p.type === "prise_en_charge");
  const pecJointe = pecPieces.length > 0;

  // Autres pièces joignables au même email (cochables, décochées par défaut)
  const pjPourDoc = (docCourant: Document): PieceJointeOption[] => [
    ...documents
      .filter((d) => d.id !== docCourant.id)
      .map((d) => ({
        label: `${d.type === "devis" ? "Devis" : "Facture"} ${d.numero || ""} (PDF)`,
        filename: `${d.numero || d.type}.pdf`,
        getBase64: () => documentPdfBase64Auto(d, dossier),
        coche: false,
      })),
    ...ordres.map((o) => ({
      label: `Ordre de réparation ${o.numero || ""} (PDF)`,
      filename: `${o.numero || "ordre-reparation"}.pdf`,
      getBase64: () => ordreReparationPdfBase64(o, dossier),
      coche: false,
    })),
    ...cessions.map((c) => ({
      label: "Cession de créance (PDF)",
      filename: `cession-creance-${dossier.numero_sinistre || "dossier"}.pdf`,
      getBase64: () => cessionPdfBase64(c, dossier),
      coche: false,
    })),
    // Accord de prise en charge rempli (pièce du dossier) : coché d'office
    // quand on envoie une facture d'un dossier en prise en charge.
    ...pecPieces.map((p) => ({
      label: "Accord de prise en charge (rempli)",
      filename: p.nom || "accord-prise-en-charge.pdf",
      getBase64: () => fichierBase64("pieces", p.path),
      coche: enPec && docCourant.type === "facture",
    })),
    { label: "RIB du garage", filename: "RIB.pdf", getBase64: ribPdfBase64, coche: false },
  ];

  // Ordre d'affichage de la liste unique : devis, puis factures (du plus
  // récent au plus ancien), puis les documents d'atelier (OR, cession,
  // restitution) rendus par AtelierPanel à la suite.
  const documentsTries = [...documents].sort((a, b) => {
    if (a.type !== b.type) return a.type === "devis" ? -1 : 1;
    const da = a.date_document || a.created_at || "";
    const db = b.date_document || b.created_at || "";
    return db.localeCompare(da);
  });

  const libelleOR = labelOrdre(metier);
  const aucunDocument =
    documents.length + ordres.length + cessions.length + restitutions.length === 0;

  const destinatairesDocument = (doc: Document): string =>
    [dossier.expert_email || dossier.cabinet_email, doc.type === "facture" && (enCession || enPec) ? dossier.assureur_email : dossier.client_email]
      .filter(Boolean)
      .join(", ");

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* En-tête */}
      <div>
        <Link href="/sinistres" className="text-sm text-accent-pink hover:underline">← {t.dossiers}</Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="titre-page">
              Dossier {dossier.numero_sinistre || "sans numéro"}
            </h1>
            <StatutBadge statut={dossier.statut} />
            {dossier.mode_cession && (
              <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold bg-teal-100 text-teal-700">
                CESSION DE CRÉANCE
              </span>
            )}
            {dossier.mode_pec && (
              <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold bg-violet-100 text-violet-700">
                PRISE EN CHARGE
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {(dossier.statut === "paye" || dossier.statut === "cloture") && !dossier.archive && (
              <button onClick={archiver} disabled={Boolean(archivage)} className="btn-ghost">
                {archivage || "Archiver (ZIP)"}
              </button>
            )}
            <button onClick={() => setShowEdit(true)} className="btn-ghost">Modifier</button>
            <button onClick={supprimer} className="btn-danger">Supprimer</button>
          </div>
        </div>
      </div>

      {/* Prochaine action : le guide dit quoi faire maintenant */}
      <ProchaineActionCard action={action} avecCta={action?.href !== `/sinistres/${dossier.id}`} />

      {/* Pipeline */}
      <section className="glass-card p-3 sm:p-4">
        <div className="mb-3 text-sm font-medium text-white/60">Avancement du dossier</div>
        <div className="mb-4">
          <ProgressionDossier statut={dossier.statut} size="md" />
        </div>
        <StatutPipeline statut={dossier.statut} onChange={changeStatut} />
        <p className="mt-3 text-xs text-white/40">Clique sur une étape pour mettre à jour le statut.</p>

        <div className="mt-4 border-t border-white/10 pt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-white/70">
            <span className="font-semibold text-white">Cession de créance</span>
            <span className="text-white/50"> — l&apos;assurance paie directement le garage (facture envoyée à l&apos;assurance, pas au client).</span>
          </div>
          <button
            onClick={toggleModeCession}
            className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
            aria-pressed={Boolean(dossier.mode_cession)}
          >
            {dossier.mode_cession ? "Activée" : "Désactivée"}
            <span
              className={`relative h-5 w-9 rounded-full transition-colors ${
                dossier.mode_cession ? "bg-accent-teal" : "bg-white/20"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                  dossier.mode_cession ? "left-[1.15rem]" : "left-0.5"
                }`}
              />
            </span>
          </button>
        </div>

        {/* Prise en charge : accord fourni par l'expert, rempli par le garage
            et joint à la facture → paiement direct (PAS une cession de créance,
            rien à faire signer au client). */}
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-white/70">
              <span className="font-semibold text-white">Prise en charge</span>
              <span className="text-white/50"> — l&apos;expert fournit un accord de prise en charge : rempli et joint à la facture, le garage est payé directement (ce n&apos;est pas une cession de créance).</span>
            </div>
            <button
              onClick={toggleModePec}
              className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
              aria-pressed={Boolean(dossier.mode_pec)}
            >
              {dossier.mode_pec ? "Activée" : "Désactivée"}
              <span
                className={`relative h-5 w-9 rounded-full transition-colors ${
                  dossier.mode_pec ? "bg-accent-violet" : "bg-white/20"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                    dossier.mode_pec ? "left-[1.15rem]" : "left-0.5"
                  }`}
                />
              </span>
            </button>
          </div>
          {dossier.mode_pec && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="field-label">Référence de l&apos;accord (optionnel)</label>
                <input
                  className="field-input"
                  defaultValue={dossier.pec_reference || ""}
                  placeholder="Ex. PEC-2026-1234"
                  onBlur={(e) => enregistrerPecRef(e.target.value.trim())}
                />
              </div>
              <div className="flex items-end pb-1 text-xs">
                {pecJointe ? (
                  <span className="text-emerald-300">
                    ✓ Accord rempli joint au dossier — il sera coché d&apos;office en pièce jointe à l&apos;envoi de la facture.
                  </span>
                ) : (
                  <span className="text-amber-300">
                    Accord à joindre : remplis le document de l&apos;expert puis ajoute-le dans « Pièces du dossier », ligne « Accord de prise en charge ».
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Infos */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Véhicule">
          <InfoRow label="Immatriculation" value={dossier.immatriculation} />
          <InfoRow label="Marque et modèle" value={dossier.marque_modele} />
          <InfoRow label="N° de série (VIN)" value={dossier.numero_serie} />
          <InfoRow label="1ère mise en circulation" value={formatDate(dossier.premiere_circulation)} />
        </Card>

        {estVitrage && (
          <Card title="Vitrage & intervention">
            <InfoRow label="Vitrage concerné" value={labelTypeVitrage(dossier.type_vitrage)} />
            <InfoRow label="Nature" value={labelNatureIntervention(dossier.nature_intervention)} />
            <InfoRow
              label="Calibrage ADAS"
              value={
                dossier.calibrage_requis
                  ? dossier.calibrage_fait
                    ? "Requis — réalisé"
                    : "Requis — à faire"
                  : "Non nécessaire"
              }
            />
            <InfoRow label="Franchise client" value={dossier.franchise != null ? formatEuros(dossier.franchise) : "—"} />
          </Card>
        )}

        <Card title={estVitrage ? "Bris de glace" : "Sinistre"}>
          <InfoRow label={estVitrage ? "Date du bris" : "Date du sinistre"} value={formatDate(dossier.date_sinistre)} />
          <InfoRow label="N° de dossier" value={dossier.numero_sinistre} />
          {!estVitrage && <InfoRow label="Date d'expertise" value={formatDate(dossier.date_expertise)} />}
          <InfoRow label="N° police" value={dossier.numero_police} />
        </Card>

        {(!estVitrage || dossier.cabinet_expert || dossier.expert_nom || dossier.date_expertise) && (
          <Card title="Cabinet d'expert & expert">
            <InfoRow label="Cabinet" value={dossier.cabinet_expert} />
            <InfoRow label="Adresse cabinet" value={dossier.cabinet_adresse} />
            <InfoRow label="Tél cabinet" value={dossier.cabinet_tel} />
            <InfoRow label="Email cabinet" value={dossier.cabinet_email} />
            <InfoRow label="Expert" value={dossier.expert_nom} />
            <InfoRow label="Tél expert" value={dossier.expert_tel} />
            <InfoRow label="Email expert" value={dossier.expert_email} />
          </Card>
        )}

        <Card title="Assurance">
          <InfoRow label="Assureur" value={dossier.assureur} />
          <InfoRow label="Adresse" value={dossier.assureur_adresse} />
          <InfoRow label="Téléphone" value={dossier.assureur_tel} />
          <InfoRow label="Email" value={dossier.assureur_email} />
          <InfoRow label="N° police" value={dossier.numero_police} />
        </Card>

        <Card title={t.reparation}>
          <InfoRow label="Début" value={formatDate(dossier.reparation_debut)} />
          <InfoRow label="Fin" value={formatDate(dossier.reparation_fin)} />
          <InfoRow label={t.reparateur} value={dossier.reparateur} />
          <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <button onClick={ouvrirPlanif} className="btn-ghost py-1.5 px-3 text-xs">
              {dossier.reparation_debut ? "Modifier la planification" : `Planifier ${t.reparation === "Intervention" ? "l'intervention" : "la réparation"}`}
            </button>
            <Link href="/planning" className="text-sm text-accent-teal hover:underline">
              Voir le planning
            </Link>
          </div>
        </Card>

        <Card title="Client">
          <InfoRow label="Nom et prénom" value={dossier.client_nom} />
          <InfoRow label="Email" value={dossier.client_email} />
          <InfoRow label="Téléphone" value={dossier.client_tel} />
          <InfoRow label="Adresse" value={dossier.client_adresse} />
          <InfoRow label="Code postal" value={dossier.client_code_postal} />
          <InfoRow label="Ville" value={dossier.client_ville} />
        </Card>

        <Card title="Suivi & documents">
          <InfoRow label="Montant (HT)" value={formatEuros(dossier.montant)} />
          <InfoRow label="Créé le" value={formatDate(dossier.created_at)} />
          <div className="flex justify-between gap-4 py-2">
            <span className="text-sm text-white/50">{t.rapport}</span>
            {dossier.rapport_path ? (
              <button
                onClick={() => ouvrirFichier("rapports", dossier.rapport_path!)}
                className="text-sm font-medium text-accent-teal hover:underline text-right"
              >
                {dossier.rapport_nom || "Voir le PDF"}
              </button>
            ) : (
              <span className="text-sm text-white/40">Aucun</span>
            )}
          </div>
        </Card>
      </div>

      {/* Particularités : courtier, agrément, apporteur… (v7.0) */}
      <Card title="Particularités du dossier">
        <ParticularitesPanel dossierId={dossier.id} />
      </Card>

      {/* Documents du dossier : devis, facture, OR, cession, restitution —
          générés automatiquement à l'import, conformes au chiffrage,
          modifiables et signables (à l'écran ou à distance) */}
      <Accordeon
        titre="Documents du dossier"
        sousTitre="Générés à l'import du chiffrage — modifiables, envoyables et signables."
        cle="dossier.documents"
        compteur={documents.length + ordres.length + cessions.length + restitutions.length || null}
      >
        {/* BARRE D'ACTIONS UNIQUE : tous les documents du dossier se créent
            depuis ici (devis, facture, OR, cession, restitution). */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setEditor({ type: "devis" })} className="btn-ghost py-1.5 px-3 text-xs">
            + Devis
          </button>
          <button onClick={() => setEditor({ type: "facture" })} className="btn-primary py-1.5 px-3 text-xs">
            + Facture
          </button>
          <button onClick={() => setAtelierModal("or")} className="btn-ghost py-1.5 px-3 text-xs">
            + {libelleOR}
          </button>
          <button
            onClick={() => setAtelierModal("cession")}
            className={`${dossier.mode_cession && cessions.length === 0 ? "btn-primary" : "btn-ghost"} py-1.5 px-3 text-xs`}
            title={
              dossier.mode_cession && cessions.length === 0
                ? "Mode cession activé : fais signer la cession"
                : undefined
            }
          >
            + Cession de créance
          </button>
          <button onClick={() => setAtelierModal("restitution")} className="btn-ghost py-1.5 px-3 text-xs">
            + Restitution
          </button>
        </div>

        {/* UNE SEULE LISTE, les documents les uns sous les autres :
            devis · factures · ordre de réparation · cession · restitution.
            Toutes les cartes ont la même structure (titre + statut, détails,
            actions à droite). */}
        <div className="mt-3 space-y-2">
          {aucunDocument && (
            <p className="text-sm text-white/40">
              Aucun document pour l&apos;instant. Génère un devis ou une facture, puis fais signer
              {" "}{libelleOR.toLowerCase()}, la cession de créance et le PV de restitution.
            </p>
          )}
          {documentsTries.map((doc) => {
            const fem = doc.type === "facture"; // accords : émise / signée
            return (
              <div key={doc.id} className="glass-soft p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-white">
                        {fem ? "Facture" : "Devis"} {doc.numero || ""}
                      </span>
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeStatutDoc(doc.statut)}`}>
                        {labelStatutDoc(doc.statut)}
                      </span>
                      {doc.signature && (
                        <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700">
                          Signé{fem ? "e" : ""}
                        </span>
                      )}
                      {fem && (
                        <label
                          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-2.5 py-0.5 text-xs text-white/70 cursor-pointer select-none hover:border-emerald-400/50"
                          title="Coche pour apposer la mention « Acquittée » sur le PDF de la facture"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(doc.acquitte)}
                            onChange={() => toggleAcquitte(doc)}
                            className="h-3.5 w-3.5 accent-emerald-500"
                          />
                          Acquittée
                        </label>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-white/50">
                      {fem ? "Émise" : "Émis"} le {formatDate(doc.date_document)}
                      {doc.total_ttc != null ? ` · ${formatEuros(doc.total_ttc)} TTC` : ""}
                      {doc.signe_le
                        ? ` · signé${fem ? "e" : ""} le ${formatDate(doc.signe_le)} par ${doc.signataire_nom || "le client"}`
                        : " · en attente de signature"}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-sm">
                    <button onClick={() => exporterPdf(doc)} className="text-accent-teal hover:underline">PDF</button>
                    <button onClick={() => setEmailDoc(doc)} className="text-accent-teal hover:underline">Envoyer</button>
                    {!doc.signature && (
                      <button onClick={() => setSignDoc(doc)} className="text-accent-teal hover:underline">Signer</button>
                    )}
                    <button onClick={() => ouvrirEdition(doc)} className="text-accent-pink hover:underline">Modifier</button>
                    <button onClick={() => supprimerDoc(doc)} className="text-white/40 hover:text-rose-300">Suppr.</button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Documents d'atelier (OR, cession, restitution) : mêmes cartes,
              rendus à la suite dans cette même liste. */}
          <AtelierPanel
            dossier={dossier}
            onChanged={load}
            integre
            documents={documents}
            ouvrir={atelierModal}
            onOuvert={() => setAtelierModal(null)}
          />
        </div>
      </Accordeon>

      {/* Commande de pièces (suivi non bloquant) */}
      <CommandesPanel dossier={dossier} />

      {/* Finance : paiements & relances */}
      <PaiementsPanel dossier={dossier} onChanged={load} />

      {/* Demandes de documents complémentaires (assurance / expert) */}
      <DemandesPanel dossier={dossier} demandes={demandes} pieces={pieces} onChanged={load} />

      {/* Véhicule de prêt & transfert de garantie */}
      <TransfertGarantiePanel dossier={dossier} onChanged={load} />

      {/* Pièces du dossier (checklist) — placé en fin de fiche (v7.0) */}
      <PiecesPanel dossier={dossier} pieces={pieces} onChanged={load} />

      {/* Événements liés */}
      <Card title="Événements liés à ce dossier" defautOuvert={false}>
        <form onSubmit={ajouterEvenement} className="grid grid-cols-1 sm:grid-cols-4 gap-3 py-3">
          <input className="field-input" placeholder="Titre (ex. RDV expertise)" value={evTitre} onChange={(e) => setEvTitre(e.target.value)} />
          <input type="datetime-local" className="field-input" value={evDate} onChange={(e) => setEvDate(e.target.value)} />
          <input className="field-input" placeholder="Description (optionnel)" value={evDesc} onChange={(e) => setEvDesc(e.target.value)} />
          <button type="submit" disabled={evSaving} className="btn-primary">
            {evSaving ? "Ajout…" : "+ Ajouter"}
          </button>
        </form>
        <ul className="divide-y divide-white/10">
          {evenements.length === 0 && <li className="py-3 text-sm text-white/40">Aucun événement.</li>}
          {evenements.map((ev) => (
            <li key={ev.id} className="py-3 flex justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-white">{ev.titre}</div>
                {ev.description && <div className="text-sm text-white/60">{ev.description}</div>}
              </div>
              <div className="text-xs text-white/40 whitespace-nowrap">{formatDateTime(ev.date_evenement)}</div>
            </li>
          ))}
        </ul>
      </Card>

      {showEdit && (
        <DossierForm dossier={dossier} onClose={() => setShowEdit(false)} onSaved={load} />
      )}
      {pdfDoc && (
        <ModePaiementModal
          defaut={modeParDefaut(pdfDoc, dossier)}
          titre={`Générer la facture ${pdfDoc.numero || ""}`.trim()}
          onClose={() => setPdfDoc(null)}
          onValider={(mode) => genererFacturePdf(pdfDoc, mode)}
        />
      )}
      {editor && (
        <DocumentEditor
          dossier={dossier}
          type={editor.type}
          document={editor.document}
          lignes={editor.lignes}
          onClose={() => setEditor(null)}
          onSaved={load}
        />
      )}
      {emailDoc && (
        <EmailComposer
          dossier={dossier}
          document={emailDoc}
          piecesJointes={pjPourDoc(emailDoc)}
          defaultTo={destinatairesDocument(emailDoc)}
          defaultSubject={`${emailDoc.type === "devis" ? "Devis" : "Facture"} ${emailDoc.numero || ""} — ${
            dossier.marque_modele || ""
          }${dossier.immatriculation ? ` (${dossier.immatriculation})` : ""}`}
          defaultBody={`Bonjour,\n\nVeuillez trouver ci-joint ${
            emailDoc.type === "devis" ? "notre devis" : "notre facture"
          } ${emailDoc.numero || ""} concernant le dossier ${dossier.numero_sinistre || ""}${
            dossier.client_nom ? ` (${dossier.client_nom})` : ""
          }.${
            emailDoc.type === "facture" && enPec
              ? `\n\nVous trouverez également ci-joint l'accord de prise en charge complété${
                  dossier.pec_reference ? ` (réf. ${dossier.pec_reference})` : ""
                } : le règlement est à effectuer directement auprès du garage.`
              : ""
          }\n\nRestant à votre disposition,\nCordialement.`}
          onClose={() => setEmailDoc(null)}
          onSent={async () => {
            // v6.7 : envoyer la facture fait avancer le dossier à l'étape 5
            // « Facture envoyée » (et marque le document comme envoyé).
            if (emailDoc.type === "facture") {
              await marquerFactureEnvoyee(emailDoc, dossier);
            }
            load();
          }}
        />
      )}
      {signDoc && (
        <SignatureDocModal
          dossier={dossier}
          document={signDoc}
          onClose={() => setSignDoc(null)}
          onSaved={() => { setSignDoc(null); load(); }}
          onEnvoyerLien={() => {
            const d = signDoc;
            setSignDoc(null);
            if (d?.sign_token) {
              setEmailSignature({
                titre: `${d.type === "devis" ? "le devis" : "la facture"} ${d.numero || ""}`,
                token: d.sign_token,
              });
            }
          }}
        />
      )}
      {planOpen && (
        <ModalShell title="Planifier la réparation" onClose={() => setPlanOpen(false)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Début des travaux</label>
              <input type="date" className="field-input" value={planDebut} onChange={(e) => setPlanDebut(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Fin prévue</label>
              <input type="date" className="field-input" value={planFin} onChange={(e) => setPlanFin(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="field-label">Réparateur attitré</label>
            <input className="field-input" value={planRep} onChange={(e) => setPlanRep(e.target.value)} placeholder="Nom du réparateur" />
          </div>
          <p className="text-xs text-white/40">
            Le véhicule apparaîtra sur le calendrier du Planning atelier sur toute la période.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setPlanOpen(false)} className="btn-ghost">Annuler</button>
            <button onClick={enregistrerPlanif} className="btn-primary">Enregistrer</button>
          </div>
        </ModalShell>
      )}
      {emailSignature && (
        <EmailComposer
          dossier={dossier}
          defaultTo={dossier.client_email || ""}
          defaultSubject={`Signature requise — ${dossier.marque_modele || "votre véhicule"}${
            dossier.immatriculation ? ` (${dossier.immatriculation})` : ""
          }`}
          defaultBody={`Bonjour${dossier.client_nom ? ` ${dossier.client_nom}` : ""},\n\nMerci de signer ${
            emailSignature.titre
          } concernant votre dossier${dossier.numero_sinistre ? ` n° ${dossier.numero_sinistre}` : ""} en cliquant sur ce lien sécurisé :\n\n${
            typeof window !== "undefined" ? window.location.origin : ""
          }/signer/${emailSignature.token}\n\nLa signature se fait en 30 secondes, directement depuis votre téléphone.\n\nCordialement.`}
          onClose={() => setEmailSignature(null)}
          onSent={load}
        />
      )}
    </div>
  );
}
