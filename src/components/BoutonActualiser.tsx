"use client";

// v13.21 — « Actualiser » : recharge la page courante, sur TOUTES les pages
// de l'appli. Sur grand écran : pastille fixe en haut à droite ; sur mobile :
// dans la barre du haut (variante `inline`). Un tour de flèche pendant le
// rechargement pour montrer que ça part.

import { useState } from "react";

export default function BoutonActualiser({ inline = false }: { inline?: boolean }) {
  const [enCours, setEnCours] = useState(false);

  function recharger() {
    setEnCours(true);
    // Petit délai : l'animation démarre avant que le navigateur ne fige la page.
    window.setTimeout(() => window.location.reload(), 80);
  }

  const fleche = <span className={`inline-block ${enCours ? "animate-spin" : ""}`} aria-hidden>↻</span>;

  if (inline) {
    return (
      <button type="button" onClick={recharger} aria-label="Actualiser la page" title="Actualiser la page" className="btn-ghost btn-compact ml-auto px-2.5 text-lg leading-none">
        {fleche}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={recharger}
      aria-label="Actualiser la page"
      title="Actualiser la page"
      className="bouton-haut fixed right-4 top-4 z-30 hidden h-10 w-10 items-center justify-center rounded-full text-lg transition hover:-translate-y-0.5 lg:flex"
    >
      {fleche}
    </button>
  );
}
