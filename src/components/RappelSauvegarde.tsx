"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DELAI_SAUVEGARDE_JOURS,
  joursDepuisSauvegarde,
  lireEtatSauvegarde,
  passerSauvegarde,
  sauvegardeARefaire,
} from "@/lib/sauvegarde";

/**
 * RAPPEL DE SAUVEGARDE (v46, tous les 15 jours depuis v13.29) — tableau de bord.
 *
 * Discret mais insistant : une sauvegarde qu'on ne fait jamais ne sert à
 * rien. Trois choix :
 *  · Sauvegarder → page Sauvegarde ;
 *  · Plus tard → masqué pour la journée seulement (localStorage) ;
 *  · Passer cette sauvegarde → le rappel se tait jusqu'à la prochaine
 *    échéance (15 jours), mémorisé sur le compte (tous les appareils).
 */
export default function RappelSauvegarde() {
  const [afficher, setAfficher] = useState(false);
  const [jours, setJours] = useState<number | null>(null);
  const [entrepriseId, setEntrepriseId] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Masqué pour aujourd'hui ?
      try {
        const jour = new Date().toISOString().slice(0, 10);
        if (window.localStorage.getItem("mea.sauvegarde.masque") === jour) return;
      } catch {
        /* stockage indisponible : on affiche */
      }
      const etat = await lireEtatSauvegarde();
      // Migration v46 non passée : on ne dit rien plutôt que d'alarmer.
      if (!etat) return;
      if (!sauvegardeARefaire(etat.derniere, etat.ignoreeLe)) return;
      setEntrepriseId(etat.id);
      setJours(joursDepuisSauvegarde(etat.derniere));
      setAfficher(true);
    })();
  }, []);

  if (!afficher && !info) return null;

  if (info) {
    return (
      <div className="anim-apparition mb-4 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70">
        {info}
      </div>
    );
  }

  function masquerAujourdhui() {
    try {
      window.localStorage.setItem("mea.sauvegarde.masque", new Date().toISOString().slice(0, 10));
    } catch {
      /* ignoré */
    }
    setAfficher(false);
  }

  async function passer() {
    setErreur(null);
    const err = await passerSauvegarde(entrepriseId);
    if (err) { setErreur(err); return; }
    setAfficher(false);
    setInfo(`Sauvegarde passée. Prochain rappel dans ${DELAI_SAUVEGARDE_JOURS} jours — vous pouvez toujours sauvegarder depuis Organisation → Sauvegarde.`);
    setTimeout(() => setInfo(null), 6000);
  }

  return (
    <div className="anim-apparition mb-4 rounded-lg border-2 border-amber-400/50 bg-amber-500/12 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
              {` (rappel tous les ${DELAI_SAUVEGARDE_JOURS} jours).`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link href="/sauvegarde" className="btn-primary btn-compact">
            Sauvegarder
          </Link>
          <button
            onClick={masquerAujourdhui}
            className="text-xs text-amber-100/60 hover:text-amber-100 hover:underline"
          >
            Plus tard
          </button>
          <button
            onClick={() => setConfirmer(true)}
            className="text-xs text-amber-100/60 hover:text-amber-100 hover:underline"
          >
            Passer cette sauvegarde
          </button>
        </div>
      </div>

      {confirmer && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-amber-400/30 pt-3 text-xs text-amber-100">
          <span>
            Passer cette fois ? Le rappel reviendra dans {DELAI_SAUVEGARDE_JOURS} jours.
            {jours === null ? " Attention : vous n'avez encore aucune sauvegarde." : ""}
          </span>
          <span className="flex gap-2">
            <button onClick={() => setConfirmer(false)} className="btn-ghost btn-compact">Annuler</button>
            <button onClick={passer} className="btn-ghost btn-compact">Oui, passer</button>
          </span>
        </div>
      )}
      {erreur && <p className="mt-2 text-xs text-rose-300">{erreur}</p>}
    </div>
  );
}
