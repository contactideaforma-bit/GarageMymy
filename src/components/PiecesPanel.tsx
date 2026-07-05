"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Dossier, PieceDossier } from "@/lib/types";
import { formatDate, messageErreur } from "@/lib/format";
import { TYPES_PIECES, completudePieces } from "@/lib/pieces";
import { ouvrirFichier } from "@/lib/storage";
import { fichierVersPdf, imageDataUrlVersPdf } from "@/lib/photoPdf";
import CameraModal from "@/components/CameraModal";

/**
 * Checklist des pièces du dossier : carte grise, constat amiable,
 * rapport définitif… Upload en photo (téléphone) ou PDF.
 * « Dossier complet » = carte grise + constat + rapport d'expertise.
 */
export default function PiecesPanel({
  dossier,
  pieces,
  onChanged,
}: {
  dossier: Dossier;
  pieces: PieceDossier[];
  onChanged?: () => void;
}) {
  const inputPhotoRef = useRef<HTMLInputElement>(null);
  const inputFichierRef = useRef<HTMLInputElement>(null);
  const [typeEnCours, setTypeEnCours] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const comp = completudePieces(dossier, pieces);
  const complet = comp.presentes === comp.total;

  const [cameraOuverte, setCameraOuverte] = useState(false);

  // mode "photo" = caméra DANS l'appli (autorisation demandée au téléphone) ;
  // "fichier" = explorateur classique.
  function demanderFichier(type: string, mode: "photo" | "fichier") {
    setTypeEnCours(type);
    setError(null);
    if (mode === "photo") {
      // Caméra in-app si disponible, sinon repli sur l'appareil photo natif
      if (typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function") {
        setCameraOuverte(true);
      } else {
        inputPhotoRef.current?.click();
      }
    } else {
      inputFichierRef.current?.click();
    }
  }

  // Enregistre un Blob PDF dans le dossier
  async function uploaderPdf(blob: Blob, type: string) {
    setUploading(true);
    setError(null);
    try {
      const path = `${dossier.id}/${type}-${Date.now()}.pdf`;
      const { error: e1 } = await supabase.storage
        .from("pieces")
        .upload(path, blob, { contentType: "application/pdf" });
      if (e1) throw e1;
      const label = TYPES_PIECES.find((t) => t.type === type)?.label || type;
      const { error: e2 } = await supabase.from("pieces_dossier").insert({
        dossier_id: dossier.id,
        type,
        nom: `${label} — ${new Date().toLocaleDateString("fr-FR")}.pdf`,
        path,
      });
      if (e2) throw e2;
      onChanged?.();
    } catch (err: unknown) {
      setError(messageErreur(err, "Envoi impossible (migration v14 exécutée ? bucket « pieces » créé ?)."));
    } finally {
      setUploading(false);
      setTypeEnCours(null);
      if (inputPhotoRef.current) inputPhotoRef.current.value = "";
      if (inputFichierRef.current) inputFichierRef.current.value = "";
    }
  }

  // Fichier choisi (image → converti en PDF ; PDF conservé tel quel)
  async function uploader(file: File) {
    if (!typeEnCours) return;
    const type = typeEnCours;
    setUploading(true);
    setError(null);
    try {
      const { blob } = await fichierVersPdf(file);
      await uploaderPdf(blob, type);
    } catch (err: unknown) {
      setError(messageErreur(err, "Conversion impossible : réessaie avec une autre photo."));
      setUploading(false);
      setTypeEnCours(null);
    }
  }

  // Photo capturée dans l'appli → PDF
  async function photoCapturee(dataUrl: string) {
    if (!typeEnCours) return;
    const type = typeEnCours;
    try {
      const blob = await imageDataUrlVersPdf(dataUrl);
      await uploaderPdf(blob, type);
    } catch (err: unknown) {
      setError(messageErreur(err, "Conversion impossible : réessaie."));
      setTypeEnCours(null);
    }
  }

  async function supprimer(p: PieceDossier) {
    if (!confirm(`Supprimer cette pièce (${p.nom || p.type}) ?`)) return;
    await supabase.storage.from("pieces").remove([p.path]);
    await supabase.from("pieces_dossier").delete().eq("id", p.id);
    onChanged?.();
  }


  return (
    <section className="glass-card">
      <div className="px-5 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-white">Pièces du dossier</h2>
        <span
          className={`font-pixel text-[0.55rem] ${complet ? "" : ""}`}
          style={{ color: complet ? "#10b981" : "#f59e0b" }}
        >
          {complet ? "DOSSIER COMPLET" : `${comp.presentes}/${comp.total} PIECES`}
        </span>
      </div>

      <div className="px-5 py-4 space-y-3">
        <input
          ref={inputPhotoRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploader(f);
          }}
        />
        <input
          ref={inputFichierRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploader(f);
          }}
        />

        {/* Rapport d'expertise : déjà géré à l'import du dossier */}
        <div className="flex flex-wrap items-center justify-between gap-2 glass-soft p-3">
          <div className="flex items-center gap-2">
            <Coche ok={Boolean(dossier.rapport_path)} />
            <span className="text-sm font-medium text-white">Rapport d&apos;expertise</span>
          </div>
          {dossier.rapport_path ? (
            <button
              onClick={() => ouvrirFichier("rapports", dossier.rapport_path!)}
              className="text-sm text-accent-teal hover:underline"
            >
              Voir
            </button>
          ) : (
            <span className="text-xs text-white/40">À importer (bouton « Importer un rapport »)</span>
          )}
        </div>

        {TYPES_PIECES.map((t) => {
          const liste = pieces.filter((p) => p.type === t.type);
          const present = liste.length > 0;
          return (
            <div key={t.type} className="glass-soft p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Coche ok={present} optionnel={!t.essentiel} />
                  <span className="text-sm font-medium text-white">{t.label}</span>
                  {!t.essentiel && <span className="text-xs text-white/40">(si concerné)</span>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => demanderFichier(t.type, "photo")}
                    disabled={uploading}
                    className="btn-primary py-1.5 px-3 text-xs"
                  >
                    {uploading && typeEnCours === t.type ? "Envoi…" : "Prendre une photo"}
                  </button>
                  <button
                    onClick={() => demanderFichier(t.type, "fichier")}
                    disabled={uploading}
                    className="btn-ghost py-1.5 px-3 text-xs"
                  >
                    Fichier
                  </button>
                </div>
              </div>
              {liste.length > 0 && (
                <ul className="mt-2 divide-y divide-white/10 border-t border-white/10">
                  {liste.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                      <button
                        onClick={() => ouvrirFichier("pieces", p.path)}
                        className="truncate text-accent-teal hover:underline text-left"
                      >
                        {p.nom || p.type}
                      </button>
                      <span className="flex shrink-0 items-center gap-3 text-xs text-white/40">
                        {formatDate(p.created_at)}
                        <button onClick={() => supprimer(p)} className="text-white/40 hover:text-rose-300">
                          Suppr.
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        {error && (
          <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">{error}</div>
        )}
        <p className="text-xs text-white/40">
          « Prendre une photo » ouvre l&apos;appareil photo (l&apos;autorisation t&apos;est demandée la première
          fois) : la photo est automatiquement enregistrée en PDF dans le dossier.
        </p>
      </div>

      {cameraOuverte && (
        <CameraModal
          titre={`Photo — ${TYPES_PIECES.find((t) => t.type === typeEnCours)?.label || "pièce"}`}
          onCapture={photoCapturee}
          onClose={() => setCameraOuverte(false)}
        />
      )}
    </section>
  );
}

function Coche({ ok, optionnel = false }: { ok: boolean; optionnel?: boolean }) {
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-xs font-bold text-white"
      style={{
        backgroundColor: ok ? "#10b981" : optionnel ? "rgba(128,128,160,0.35)" : "#e11d48",
        boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.3)",
      }}
      aria-label={ok ? "Présent" : "Manquant"}
    >
      {ok ? "✓" : optionnel ? "·" : "✗"}
    </span>
  );
}
