"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Coque de modale PARTAGÉE, rendue via un portail React sur <body>.
 *
 * Pourquoi un portail : les cartes .glass-card utilisent backdrop-filter
 * (effet verre), qui transforme la carte en « containing block » — une
 * modale en position:fixed rendue À L'INTÉRIEUR reste alors piégée dans
 * la carte (illisible, coupée). Le portail sort la modale du flux : elle
 * couvre toujours tout l'écran, correctement centrée.
 */
export default function ModalShell({
  title,
  onClose,
  children,
  maxWidth = "max-w-lg",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Bloque le scroll de la page derrière la modale.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Échap pour fermer.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`w-full ${maxWidth} glass-card my-8 modal-panel`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
