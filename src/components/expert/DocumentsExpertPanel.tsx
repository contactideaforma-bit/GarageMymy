"use client";

/* ====================================================================
 *  DOCUMENTS DU DOSSIER D'EXPERTISE (v13.5)
 *  Ordre de mission, devis / facture du garage, carte grise, constat,
 *  PV… Dépôt de fichier (PDF / image → PDF) ou photo dans l'appli.
 *  Un devis ou une facture peut servir de SOURCE au rapport (bouton
 *  « → Générer le rapport ») : l'onglet Rapport lance l'analyse IA.
 * ==================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import Icone from "@/components/expert/Icone";
import CameraModal from "@/components/CameraModal";
import ModalShell from "@/components/ModalShell";
import { Bloc, Champ, Erreur, Vide } from "@/components/expert/ui";
import { ajouterDocument, chargerDocuments, majDocument, ouvrirFichierExpert, supprimerDocument } from "@/lib/expertise/data";
import { DocumentExpert, TYPES_DOC_EXPERT, TypeDocExpert, labelTypeDoc } from "@/lib/expertise/types";
import { fichierVersPdf, imageDataUrlVersPdf } from "@/lib/photoPdf";
import { formatDateTime, messageErreur } from "@/lib/format";

export default function DocumentsExpertPanel({
  dossierId,
  onUtiliserPourRapport,
  onComparer,
  onChange,
}: {
  dossierId: string;
  onUtiliserPourRapport?: (doc: DocumentExpert, mode: "devis" | "facture") => void;
  /** v13.11 — confronter un devis au pré-rapport (écarts à valider). */
  onComparer?: (doc: DocumentExpert) => void;
  onChange?: (docs: DocumentExpert[]) => void;
}) {
  const [docs, setDocs] = useState<DocumentExpert[]>([]);
  const [type, setType] = useState<TypeDocExpert>("devis_garage");
  const [camera, setCamera] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [edition, setEdition] = useState<DocumentExpert | null>(null);
  const fichier = useRef<HTMLInputElement>(null);

  const recharger = useCallback(() => chargerDocuments(dossierId).then((d) => { setDocs(d); onChange?.(d); }), [dossierId, onChange]);
  useEffect(() => { recharger(); }, [recharger]);

  async function deposer(files: FileList | null) {
    if (!files?.length) return;
    setEnvoi(true); setErreur(null);
    try {
      for (const f of Array.from(files)) {
        const { blob } = await fichierVersPdf(f);
        const nom = f.name.replace(/\.[^.]+$/, "") + ".pdf";
        await ajouterDocument({ dossierId, type, file: blob, nom });
      }
      await recharger();
    } catch (e) { setErreur(messageErreur(e, "Dépôt impossible.")); } finally { setEnvoi(false); }
  }

  async function depuisCamera(dataUrl: string) {
    setEnvoi(true); setErreur(null);
    try {
      const blob = await imageDataUrlVersPdf(dataUrl);
      await ajouterDocument({ dossierId, type, file: blob, nom: `${labelTypeDoc(type)} ${new Date().toLocaleDateString("fr-FR")}.pdf` });
      await recharger();
    } catch (e) { setErreur(messageErreur(e, "Enregistrement impossible.")); } finally { setEnvoi(false); }
  }

  const groupes = TYPES_DOC_EXPERT.map((t) => ({ ...t, docs: docs.filter((d) => d.type === t.code) })).filter((g) => g.docs.length);

  return (
    <div className="space-y-4">
      <Bloc titre="Ajouter un document">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Champ label="Type de document" className="sm:w-64">
            <select className="field-input" value={type} onChange={(e) => setType(e.target.value as TypeDocExpert)}>
              {TYPES_DOC_EXPERT.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </Champ>
          <input ref={fichier} type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={(e) => { deposer(e.target.files); e.target.value = ""; }} />
          <button type="button" className="btn-primary" disabled={envoi} onClick={() => fichier.current?.click()}>{envoi ? "Dépôt…" : <><Icone nom="trombone" /> Choisir un fichier</>}</button>
          <button type="button" className="btn-ghost" disabled={envoi} onClick={() => setCamera(true)}><Icone nom="photo" /> Photographier</button>
        </div>
        <p className="mt-2 text-[11px] text-white/45">Les images sont converties en PDF. Un devis ou une facture du garage peut ensuite générer le rapport en un clic.</p>
        <Erreur message={erreur} />
      </Bloc>

      {docs.length === 0 ? (
        <div className="glass-card p-4"><Vide titre="Aucun document" texte="Dépose l'ordre de mission, le devis du garage, la carte grise, le constat…" /></div>
      ) : (
        groupes.map((g) => (
          <Bloc key={g.code} titre={`${g.label} · ${g.docs.length}`}>
            <div className="space-y-2">
              {g.docs.map((d) => (
                <div key={d.id} className="carte-liste flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{d.nom}</div>
                    <div className="text-xs text-white/50">{formatDateTime(d.created_at)}{d.taille ? ` · ${Math.round(d.taille / 1024)} Ko` : ""}</div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {onComparer && d.type === "devis_garage" && (
                      <button className="btn-primary btn-compact" title="Écarts entre ce devis et le pré-rapport, à accepter ou refuser" onClick={() => onComparer(d)}><Icone nom="check" /> Contrôler ce devis</button>
                    )}
                    {onUtiliserPourRapport && (d.type === "devis_garage" || d.type === "facture_garage") && (
                      <button className="btn-ghost btn-compact" onClick={() => onUtiliserPourRapport(d, d.type === "devis_garage" ? "devis" : "facture")}><Icone nom="ia" /> Générer un rapport</button>
                    )}
                    <button className="btn-ghost btn-compact" onClick={() => ouvrirFichierExpert(d.path)}>Ouvrir</button>
                    <button className="btn-ghost btn-compact" onClick={() => setEdition(d)}>Modifier</button>
                    <button className="btn-danger btn-compact" onClick={async () => { if (confirm(`Supprimer « ${d.nom} » ?`)) { await supprimerDocument(d); recharger(); } }}>×</button>
                  </div>
                </div>
              ))}
            </div>
          </Bloc>
        ))
      )}

      {camera && <CameraModal titre={`Photographier — ${labelTypeDoc(type)}`} onCapture={depuisCamera} onClose={() => setCamera(false)} />}

      {edition && (
        <ModalShell title="Modifier le document" onClose={() => setEdition(null)}>
          <Champ label="Nom"><input className="field-input" value={edition.nom} onChange={(e) => setEdition({ ...edition, nom: e.target.value })} /></Champ>
          <Champ label="Type">
            <select className="field-input" value={edition.type} onChange={(e) => setEdition({ ...edition, type: e.target.value as TypeDocExpert })}>
              {TYPES_DOC_EXPERT.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </Champ>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setEdition(null)}>Annuler</button>
            <button className="btn-primary" onClick={async () => { await majDocument(edition.id, { nom: edition.nom, type: edition.type }); setEdition(null); recharger(); }}>Enregistrer</button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
