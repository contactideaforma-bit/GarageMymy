"use client";

import { useRef, useState } from "react";

/**
 * Sélecteur de fichier avec un VRAI bouton (v6.7).
 *
 * L'input file natif est quasi invisible sur le thème sombre : on le masque et
 * on pilote une zone de dépôt cliquable + un bouton explicite. Glisser-déposer
 * pris en charge, et « Prendre en photo » sur mobile (capture caméra).
 */
export default function FilePicker({
  value,
  onChange,
  accept = "application/pdf,image/*",
  label = "Choisir un fichier",
  aide = "PDF, JPG ou PNG — ou glisse le document ici",
  avecPhoto = true,
  disabled = false,
}: {
  value: File | null;
  onChange: (f: File | null) => void;
  accept?: string;
  label?: string;
  aide?: string;
  avecPhoto?: boolean;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);

  function taille(o: number): string {
    if (o < 1024) return `${o} o`;
    if (o < 1024 * 1024) return `${Math.round(o / 1024)} Ko`;
    return `${(o / (1024 * 1024)).toFixed(1)} Mo`;
  }

  // Fichier choisi : carte de confirmation + actions
  if (value) {
    return (
      <div className="glass-soft flex flex-wrap items-center justify-between gap-3 rounded-xl p-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-white">{value.name}</div>
          <div className="text-xs text-white/50">
            {taille(value.size)}
            {value.type ? ` · ${value.type.replace("application/", "").toUpperCase()}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="btn-ghost py-1.5 px-3 text-xs"
          >
            Remplacer
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
            className="btn-ghost py-1.5 px-3 text-xs text-rose-200 hover:text-rose-100"
          >
            Retirer
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] || null)}
        />
      </div>
    );
  }

  // Aucun fichier : zone de dépôt cliquable + bouton explicite
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setSurvol(true); }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSurvol(false);
        if (disabled) return;
        const f = e.dataTransfer.files?.[0];
        if (f) onChange(f);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      className={`cursor-pointer rounded-xl border-2 border-dashed px-5 py-7 text-center transition-colors ${
        survol
          ? "border-accent-teal bg-white/10"
          : "border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10"
      }`}
    >
      <div className="text-sm text-white/70">{aide}</div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
          className="btn-primary py-2 px-4 text-sm"
        >
          {label}
        </button>
        {avecPhoto && (
          <button
            type="button"
            disabled={disabled}
            onClick={(e) => { e.stopPropagation(); photoRef.current?.click(); }}
            className="btn-ghost py-2 px-4 text-sm"
          >
            Prendre en photo
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
      />
      {avecPhoto && (
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] || null)}
        />
      )}
    </div>
  );
}
