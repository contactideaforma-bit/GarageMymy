"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  DELAI_SAUVEGARDE_JOURS,
  joursDepuisSauvegarde,
  sauvegardeARefaire,
} from "@/lib/sauvegarde";

/**
 * RAPPEL DE SAUVEGARDE (v46) — tableau de bord.
 *
 * Discret mais insistant : une sauvegarde qu'on ne fait jamais ne sert à
 * rien. Masquable pour la journée seulement (localStorage), pour ne pas
 * pouvoir l'écarter définitivement d'un clic distrait.
 */
export default function RappelSauvegarde() {
  const [afficher, setAfficher] = useState(false);
  const [jours, setJours] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      // Masqué pour aujourd'hui ?
      try {
        const jour = new Date().toISOString().slice(0, 10);
        if (window.localStorage.getItem("mea.sauvegarde.masque") === jour) return;
      } catch {
        /* stockage indisponible : on affiche */
      }
      const { data, error } = await supabase
        .from("entreprise")
        .select("derniere_sauvegarde")
        .limit(1)
        .maybeSingle();
      // Migration v46 non passée : on ne dit rien plutôt que d'alarmer.
      if (error) return;
      const d = (data as { derniere_sauvegarde?: string } | null)?.derniere_sauvegarde || null;
      if (!sauvegardeARefaire(d)) return;
      setJours(joursDepuisSauvegarde(d));
      setAfficher(true);
    })();
  }, []);

  if (!afficher) return null;

  function masquerAujourdhui() {
    try {
      window.localStorage.setItem("mea.sauvegarde.masque", new Date().toISOString().slice(0, 10));
    } catch {
      /* ignoré */
    }
    setAfficher(false);
  }

  return (
    <div className="anim-apparition mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-amber-400/50 bg-amber-500/12 px-4 py-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <span aria-hidden className="text-lg leading-none">
          🛡️
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-100">
            {jours === null
              ? "Vos données n'ont jamais été sauvegardées"
              : `Dernière sauvegarde il y a ${jours} jours`}
          </p>
          <p className="text-xs text-amber-100/80">
            Un fichier à garder chez vous, lisible sans My Easy Auto. Une minute suffit
            {jours === null ? "." : ` (rappel tous les ${DELAI_SAUVEGARDE_JOURS} jours).`}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link href="/sauvegarde" className="btn-primary btn-compact">
          Sauvegarder
        </Link>
        <button
          onClick={masquerAujourdhui}
          className="text-xs text-amber-100/60 hover:text-amber-100 hover:underline"
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}
