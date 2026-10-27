"use client";

// ============================================================
//  FEUILLE DU BAS (v13.50) — le panneau mobile qui monte depuis le bas de
//  l'écran (actions rapides, filtres, contact client…). Rendue en portail
//  dans <body> (jamais piégée par une carte), calée sur la zone visible du
//  téléphone (clavier compris) grâce à useZoneVisible. Échap / voile / poignée
//  pour fermer. Sur grand écran, elle se comporte comme une modale centrée.
// ============================================================

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useZoneVisible } from "@/lib/cadreMobile";

export default function Feuille({
  titre,
  onClose,
  children,
  pleine = false,
  pied,
}: {
  titre?: string;
  onClose: () => void;
  children: ReactNode;
  /** Plein écran (recherche) plutôt que panneau partiel. */
  pleine?: boolean;
  pied?: ReactNode;
}) {
  const { style } = useZoneVisible(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const precedent = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = precedent;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="feuille-voile" style={style} onMouseDown={onClose} aria-hidden={false}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        className={`feuille ${pleine ? "feuille-pleine" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {!pleine && <div className="feuille-poignee" aria-hidden />}
        {(titre || pleine) && (
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-2">
            <h2 className="titre-bloc truncate" style={{ color: "var(--mea-texte)" }}>{titre}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg"
              style={{ background: "var(--mea-surface-2)", color: "var(--mea-texte-2)" }}
            >
              ×
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {pied && <div className="border-t px-4 py-3" style={{ borderColor: "var(--mea-bordure)" }}>{pied}</div>}
      </div>
    </div>,
    document.body
  );
}
