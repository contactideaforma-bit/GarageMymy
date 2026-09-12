"use client";

// v12.7 — « Remonter en haut » : apparaît tout seul dès qu'on est descendu
// dans une page. Posé au-dessus des bulles du bas-droit (MY-MY, note de
// dossier) pour ne rien chevaucher, et masqué sur /conversation (le fil
// défile dans son propre cadre, le composeur occupe le bas).

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function BoutonHaut() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const surDefilement = () => setVisible(window.scrollY > 500);
    surDefilement();
    window.addEventListener("scroll", surDefilement, { passive: true });
    return () => window.removeEventListener("scroll", surDefilement);
  }, []);

  if (pathname === "/conversation" || !visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Remonter en haut de la page"
      title="Remonter en haut"
      className="bouton-haut fixed right-4 z-30 flex h-10 w-10 items-center justify-center rounded-full text-lg transition hover:-translate-y-0.5 sm:right-5"
      style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
    >
      ↑
    </button>
  );
}
