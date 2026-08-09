"use client";

// Pliage des blocs (v7.0) : chaque panneau de la fiche dossier peut être
// replié, et l'état est MÉMORISÉ d'une visite à l'autre (localStorage).
// Même clé que le composant Accordeon, pour un comportement homogène.

import { useEffect, useState } from "react";

export function usePliage(cle: string, defautPlie = false) {
  const [plie, setPlie] = useState(defautPlie);

  // Lecture APRÈS le montage : aucun écart entre rendu serveur et client.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(`mea.bloc.${cle}`);
      if (v === "0") setPlie(true);
      else if (v === "1") setPlie(false);
    } catch {
      /* stockage indisponible */
    }
  }, [cle]);

  function basculerPliage() {
    setPlie((p) => {
      const suivant = !p;
      try {
        window.localStorage.setItem(`mea.bloc.${cle}`, suivant ? "0" : "1");
      } catch {
        /* ignoré */
      }
      return suivant;
    });
  }

  return { plie, basculerPliage };
}
