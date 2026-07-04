"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Dossier, PieceDossier } from "@/lib/types";
import { formatDate, messageErreur } from "@/lib/format";
import { TYPES_PIECES, completudePieces } from "@/lib/pieces";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [typeEnCours, setTypeEnCours] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const comp = completudePieces(dossier, pieces);
  const complet = comp.presentes === comp.total;

  function demanderFichier(type: string) {
    setTypeEnCours(type);
    setError(null);
    inputRef.current?.click();
  }

  async function uploader(file: File) {
    if (!typeEnCours) return;
    setUploading(true);
    setError(null);
    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const path = `${dossier.id}/${typeEnCours}-${Date.now()}.${ext}`;
      const { error: e1 } = await supabase.storage.from("pieces").upload(path, file);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("pieces_dossier").insert({
        dossier_id: dossier.id,
        type: typeEnCours,
        nom: file.name,
        path,
      });
      if (e2) throw e2;
      onChanged?.();
    } catch (err: unknown) {
      setError(messageErreur(err, "Envoi impossible (migration v14 exécutée ? bucket « pieces » créé ?)."));
    } finally {
      setUploading(false);
      setTypeEnCours(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function supprimer(p: PieceDossier) {
    if (!confirm(`Supprimer cette pièce (${p.nom || p.type}) ?`)) return;
    await supabase.storage.from("pieces").remove([p.path]);
    await supabase.from("pieces_dossier").delete().eq("id", p.id);
    onChanged?.();
  }

  function urlPiece(path: string): string {
    return supabase.storage.from("pieces").getPublicUrl(path).data.publicUrl;
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
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
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
            <a
              href={supabase.storage.from("rapports").getPublicUrl(dossier.rapport_path).data.publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent-teal hover:underline"
            >
              Voir
            </a>
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
                <button
                  onClick={() => demanderFichier(t.type)}
                  disabled={uploading}
                  className="btn-ghost py-1.5 px-3 text-xs"
                >
                  {uploading && typeEnCours === t.type ? "Envoi…" : "Ajouter (photo ou PDF)"}
                </button>
              </div>
              {liste.length > 0 && (
                <ul className="mt-2 divide-y divide-white/10 border-t border-white/10">
                  {liste.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                      <a
                        href={urlPiece(p.path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-accent-teal hover:underline"
                      >
                        {p.nom || p.type}
                      </a>
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
          Sur téléphone, « Ajouter » ouvre directement l&apos;appareil photo : photographie la pièce, c&apos;est rangé.
        </p>
      </div>
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
