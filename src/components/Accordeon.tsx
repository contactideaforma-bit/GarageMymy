"use client";

import { useEffect, useState } from "react";

/**
 * Bloc REPLIABLE (v7.0).
 *
 * La fiche dossier affichait une douzaine de blocs tous ouverts : il fallait
 * défiler longtemps pour rien. Chaque bloc se replie maintenant d'un clic, et
 * l'état est MÉMORISÉ (localStorage) — on retrouve sa mise en page d'un dossier
 * à l'autre et d'une session à l'autre.
 *
 * `cle` doit être stable et unique par bloc (ex. "dossier.vehicule").
 */
export default function Accordeon({
  titre,
  sousTitre,
  cle,
  defautOuvert = true,
  actions,
  compteur,
  children,
}: {
  titre: string;
  sousTitre?: string;
  cle: string;
  defautOuvert?: boolean;
  /** Boutons affichés à droite du titre (visibles seulement quand c'est ouvert). */
  actions?: React.ReactNode;
  /** Petit compteur affiché à côté du titre (ex. nombre de documents). */
  compteur?: number | string | null;
  children: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(defautOuvert);

  // Lecture de la préférence APRÈS le montage : évite tout écart entre le
  // rendu serveur et le rendu client (hydratation).
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(`mea.bloc.${cle}`);
      if (v === "0") setOuvert(false);
      else if (v === "1") setOuvert(true);
    } catch {
      /* stockage indisponible : on garde la valeur par défaut */
    }
  }, [cle]);

  function basculer() {
    setOuvert((o) => {
      const suivant = !o;
      try {
        window.localStorage.setItem(`mea.bloc.${cle}`, suivant ? "1" : "0");
      } catch {
        /* ignoré */
      }
      return suivant;
    });
  }

  return (
    <section className="glass-card">
      <div className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5">
        <button
          onClick={basculer}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={ouvert}
          title={ouvert ? "Replier" : "Déplier"}
        >
          <span
            className={`shrink-0 text-white/40 transition-transform ${ouvert ? "rotate-90" : ""}`}
            aria-hidden
          >
            ▸
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white sm:text-base">
              {titre}
              {compteur != null && compteur !== "" && (
                <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/60">
                  {compteur}
                </span>
              )}
            </span>
            {sousTitre && ouvert && (
              <span className="mt-0.5 block truncate text-[11px] font-normal text-white/40">
                {sousTitre}
              </span>
            )}
          </span>
        </button>
        {ouvert && actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>

      {ouvert && (
        <div className="border-t border-white/10 px-3 py-2.5 sm:px-4 sm:py-3">{children}</div>
      )}
    </section>
  );
}
