"use client";

import { useEffect, useState } from "react";
import { Parametres, fusionnerParametres } from "@/lib/admin/economie";

/** Grille tarifaire publique : défauts du code tout de suite, puis celle de l'éditeur (/api/tarifs). */
export function useGrille(): Parametres {
  const [params, setParams] = useState<Parametres>(() => fusionnerParametres(null));
  useEffect(() => {
    let actif = true;
    fetch("/api/tarifs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (actif && d?.formules) setParams(fusionnerParametres(d as Partial<Parametres>));
      })
      .catch(() => {
        /* la grille par défaut reste affichée */
      });
    return () => {
      actif = false;
    };
  }, []);
  return params;
}

export const eur = (n: number) =>
  `${n.toLocaleString("fr-FR", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;
