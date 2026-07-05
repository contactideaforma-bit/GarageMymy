"use client";

import { useCallback, useEffect, useState } from "react";
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
import { ouvrirFichier } from "@/lib/storage";
import { formatEuros, formatDate, formatDateTime } from "@/lib/format";
import { badgeStatutDoc, labelStatutDoc } from "@/lib/documents";
import { apercuDocumentPdf } from "@/lib/pdf";
import StatutBadge from "@/components/StatutBadge";
import StatutPipeline from "@/components/StatutPipeline";
import ProgressionDossier from "@/components/ProgressionDossier";
import DossierForm from "@/components/DossierForm";
import DocumentEditor from "@/components/DocumentEditor";
import PaiementsPanel from "@/components/PaiementsPanel";
import AtelierPanel from "@/components/AtelierPanel";
import EmailComposer from "@/components/EmailComposer";
import ConfigBanner from "@/components/ConfigBanner";

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-white/5 last:border-0">
      <span className="text-sm text-white/50">{label}</span>
      <span className="text-sm font-medium text-white text-right">{value || "—"}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass-card">
      <div className="px-5 py-3 border-b border-white/10">
        <h2 className="font-semibold text-white">{title}</h2>
      </div>
      <div className="px-5 py-2">{children}</div>
    </section>
  );
}

export default function DossierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

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
  // signature d'un document (à l'écran ou lien à distance)
  const [signDoc, setSignDoc] = useState<Document | null>(null);
  const [emailSignature, setEmailSignature] = useState<{ titre: string; token: string } | null>(null);

  // mini-form événement
  const [evTitre, setEvTitre] = useState("");
  const [evDate, setEvDate] = useState("");
  const [evDesc, setEvDesc] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
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
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function changeStatut(s: string) {
    if (!dossier) return;
    setDossier({ ...dossier, statut: s });
    await supabase.from("dossiers").update({ statut: s }).eq("id", dossier.id);
  }

  async function toggleModeCession() {
    if (!dossier) return;
    const next = !dossier.mode_cession;
    setDossier({ ...dossier, mode_cession: next });
    const { error } = await supabase.from("dossiers").update({ mode_cession: next }).eq("id", dossier.id);
    if (error) {
      setDossier({ ...dossier, mode_cession: !next });
      alert("Impossible de changer le mode cession (migration v15 exécutée ?).");
    }
  }

  async function supprimer() {
    if (!dossier) return;
    if (!confirm("Supprimer définitivement ce dossier ? Les fichiers associés (rapport, pièces) seront aussi effacés.")) return;
    // Purge du Storage AVANT la suppression (sinon fichiers orphelins + données perso conservées)
    const cheminsPieces = pieces.map((p) => p.path);
    if (cheminsPieces.length) await supabase.storage.from("pieces").remove(cheminsPieces);
    if (dossier.rapport_path) await supabase.storage.from("rapports").remove([dossier.rapport_path]);
    await supabase.from("dossiers").delete().eq("id", dossier.id);
    router.push("/sinistres");
  }


  async function ajouterEvenement(e: React.FormEvent) {
    e.preventDefault();
    if (!evTitre || !evDate) return;
    await supabase.from("evenements").insert({
      dossier_id: id, titre: evTitre, description: evDesc || null,
      date_evenement: new Date(evDate).toISOString(),
    });
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
  async function exporterPdf(doc: Document) {
    if (!dossier) return;
    const { data } = await supabase
      .from("document_lignes").select("*").eq("document_id", doc.id).order("ordre", { ascending: true });
    await apercuDocumentPdf(doc, (data as DocumentLigne[]) || [], dossier);
  }

  async function supprimerDoc(doc: Document) {
    if (!confirm("Supprimer ce document ?")) return;
    await supabase.from("documents").delete().eq("id", doc.id);
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

  const action = calculeProchaineAction({ dossier, documents, paiements, relances, ordres, restitutions, cessions, pieces, demandes });
  // Destinataires d'envoi des documents selon le processus :
  // cas normal → expert + client ; cession de créance → expert + assurance.
  const enCession = Boolean(dossier.mode_cession) || cessions.some((c) => c.statut === "signe");
  const destinatairesDocument = (doc: Document): string =>
    [dossier.expert_email || dossier.cabinet_email, doc.type === "facture" && enCession ? dossier.assureur_email : dossier.client_email]
      .filter(Boolean)
      .join(", ");

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div>
        <Link href="/sinistres" className="text-sm text-accent-pink hover:underline">← Sinistres</Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-white">
              Dossier {dossier.numero_sinistre || "sans numéro"}
            </h1>
            <StatutBadge statut={dossier.statut} />
            {dossier.mode_cession && (
              <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold bg-teal-100 text-teal-700">
                CESSION DE CRÉANCE
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowEdit(true)} className="btn-ghost">Modifier</button>
            <button onClick={supprimer} className="btn-danger">Supprimer</button>
          </div>
        </div>
      </div>

      {/* Prochaine action : le guide dit quoi faire maintenant */}
      <ProchaineActionCard action={action} avecCta={action?.href !== `/sinistres/${dossier.id}`} />

      {/* Pipeline */}
      <section className="glass-card p-5">
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
      </section>

      {/* Infos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Véhicule">
          <InfoRow label="Immatriculation" value={dossier.immatriculation} />
          <InfoRow label="Marque et modèle" value={dossier.marque_modele} />
          <InfoRow label="N° de série (VIN)" value={dossier.numero_serie} />
          <InfoRow label="1ère mise en circulation" value={formatDate(dossier.premiere_circulation)} />
        </Card>

        <Card title="Sinistre">
          <InfoRow label="Date du sinistre" value={formatDate(dossier.date_sinistre)} />
          <InfoRow label="N° de sinistre" value={dossier.numero_sinistre} />
          <InfoRow label="Date d'expertise" value={formatDate(dossier.date_expertise)} />
          <InfoRow label="N° police" value={dossier.numero_police} />
        </Card>

        <Card title="Cabinet d'expert & expert">
          <InfoRow label="Cabinet" value={dossier.cabinet_expert} />
          <InfoRow label="Adresse cabinet" value={dossier.cabinet_adresse} />
          <InfoRow label="Tél cabinet" value={dossier.cabinet_tel} />
          <InfoRow label="Email cabinet" value={dossier.cabinet_email} />
          <InfoRow label="Expert" value={dossier.expert_nom} />
          <InfoRow label="Tél expert" value={dossier.expert_tel} />
          <InfoRow label="Email expert" value={dossier.expert_email} />
        </Card>

        <Card title="Assurance">
          <InfoRow label="Assureur" value={dossier.assureur} />
          <InfoRow label="Adresse" value={dossier.assureur_adresse} />
          <InfoRow label="Téléphone" value={dossier.assureur_tel} />
          <InfoRow label="Email" value={dossier.assureur_email} />
          <InfoRow label="N° police" value={dossier.numero_police} />
        </Card>

        <Card title="Réparation">
          <InfoRow label="Début" value={formatDate(dossier.reparation_debut)} />
          <InfoRow label="Fin" value={formatDate(dossier.reparation_fin)} />
          <InfoRow label="Réparateur" value={dossier.reparateur} />
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
          <InfoRow label="Montant" value={formatEuros(dossier.montant)} />
          <InfoRow label="Créé le" value={formatDate(dossier.created_at)} />
          <div className="flex justify-between gap-4 py-2">
            <span className="text-sm text-white/50">Rapport d&apos;expertise</span>
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

      {/* Pièces du dossier (checklist) */}
      <PiecesPanel dossier={dossier} pieces={pieces} onChanged={load} />

      {/* Documents du dossier : devis, facture, OR, cession, restitution —
          générés automatiquement à l'import, conformes au chiffrage,
          modifiables et signables (à l'écran ou à distance) */}
      <section className="glass-card">
        <div className="px-5 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-white">Documents du dossier</h2>
            <p className="text-xs text-white/40 normal-case">
              Générés automatiquement à l&apos;import du chiffrage — modifiables, envoyables et signables.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditor({ type: "devis" })} className="btn-ghost py-1.5 px-3 text-xs">+ Devis</button>
            <button onClick={() => setEditor({ type: "facture" })} className="btn-primary py-1.5 px-3 text-xs">+ Facture</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-white/50">
              <tr>
                <th className="px-5 py-2 font-medium">Type</th>
                <th className="px-5 py-2 font-medium">N°</th>
                <th className="px-5 py-2 font-medium">Date</th>
                <th className="px-5 py-2 font-medium">Statut</th>
                <th className="px-5 py-2 font-medium text-right">Total TTC</th>
                <th className="px-5 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-white/40">
                  Aucun document. Génère un devis ou une facture.
                </td></tr>
              )}
              {documents.map((doc) => (
                <tr key={doc.id} className="border-t border-white/5">
                  <td className="px-5 py-3 capitalize text-white/80">{doc.type}</td>
                  <td className="px-5 py-3 font-medium text-white">{doc.numero || "—"}</td>
                  <td className="px-5 py-3 text-white/80">{formatDate(doc.date_document)}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeStatutDoc(doc.statut)}`}>
                      {labelStatutDoc(doc.statut)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-white/90">{formatEuros(doc.total_ttc)}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button onClick={() => exporterPdf(doc)} className="text-accent-teal hover:underline mr-3">PDF</button>
                    <button onClick={() => setEmailDoc(doc)} className="text-accent-teal hover:underline mr-3">Envoyer</button>
                    <button onClick={() => setSignDoc(doc)} className="text-accent-teal hover:underline mr-3">
                      {doc.signature ? "Signé ✓" : "Signer"}
                    </button>
                    <button onClick={() => ouvrirEdition(doc)} className="text-accent-pink hover:underline mr-3">Modifier</button>
                    <button onClick={() => supprimerDoc(doc)} className="text-white/40 hover:text-rose-300">Suppr.</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Ordre de réparation, cession de créance & restitution (même bloc) */}
        <AtelierPanel dossier={dossier} onChanged={load} integre />
      </section>

      {/* Commande de pièces (suivi non bloquant) */}
      <CommandesPanel dossier={dossier} />

      {/* Finance : paiements & relances */}
      <PaiementsPanel dossier={dossier} onChanged={load} />

      {/* Demandes de documents complémentaires (assurance / expert) */}
      <DemandesPanel dossier={dossier} demandes={demandes} onChanged={load} />

      {/* Événements liés */}
      <Card title="Événements liés à ce dossier">
        <form onSubmit={ajouterEvenement} className="grid grid-cols-1 sm:grid-cols-4 gap-3 py-3">
          <input className="field-input" placeholder="Titre (ex. RDV expertise)" value={evTitre} onChange={(e) => setEvTitre(e.target.value)} />
          <input type="datetime-local" className="field-input" value={evDate} onChange={(e) => setEvDate(e.target.value)} />
          <input className="field-input" placeholder="Description (optionnel)" value={evDesc} onChange={(e) => setEvDesc(e.target.value)} />
          <button type="submit" className="btn-primary">+ Ajouter</button>
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
          defaultTo={destinatairesDocument(emailDoc)}
          defaultSubject={`${emailDoc.type === "devis" ? "Devis" : "Facture"} ${emailDoc.numero || ""} — ${
            dossier.marque_modele || ""
          }${dossier.immatriculation ? ` (${dossier.immatriculation})` : ""}`}
          defaultBody={`Bonjour,\n\nVeuillez trouver ci-joint ${
            emailDoc.type === "devis" ? "notre devis" : "notre facture"
          } ${emailDoc.numero || ""} concernant le dossier ${dossier.numero_sinistre || ""}${
            dossier.client_nom ? ` (${dossier.client_nom})` : ""
          }.\n\nRestant à votre disposition,\nCordialement.`}
          onClose={() => setEmailDoc(null)}
          onSent={load}
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
