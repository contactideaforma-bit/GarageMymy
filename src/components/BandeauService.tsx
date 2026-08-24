"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Incident, chargerEtat, depuis, infoNiveau } from "@/lib/etatService";

/**
 * BANDEAU D'INCIDENT (v45).
 *
 * Affiché en haut de l'appli quand un incident est publié. Objectif :
 * qu'un garage qui voit un écran bloqué comprenne en une seconde que ça
 * ne vient pas de lui — et sache quoi faire en attendant.
 *
 * Le bandeau peut être masqué pour la session en cours (croix) ; il
 * revient au rechargement tant que l'incident n'est pas résolu.
 */
export default function BandeauService() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [masques, setMasques] = useState<string[]>([]);

  useEffect(() => {
    let vivant = true;
    const rafraichir = async () => {
      const { actifs } = await chargerEtat();
      if (vivant) setIncidents(actifs);
    };
    rafraichir();
    // Relecture toutes les 5 minutes : assez pour suivre un incident,
    // assez rare pour ne rien coûter.
    const t = setInterval(rafraichir, 5 * 60 * 1000);
    return () => {
      vivant = false;
      clearInterval(t);
    };
  }, []);

  const visibles = incidents.filter((i) => !masques.includes(i.id));
  if (visibles.length === 0) return null;

  return (
    <div className="space-y-2 px-3 pt-3 sm:px-4 lg:px-6">
      {visibles.map((i) => {
        const n = infoNiveau(i.niveau);
        return (
          <div
            key={i.id}
            className={`anim-apparition flex flex-wrap items-start justify-between gap-2 rounded-lg border-2 px-3 py-2 ${n.bandeau}`}
          >
            <div className="flex min-w-0 items-start gap-2">
              <span aria-hidden className="text-base leading-none">
                {n.icone}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {i.titre}
                  {i.perimetre && <span className="font-normal opacity-80"> · {i.perimetre}</span>}
                </p>
                <p className="mt-0.5 text-xs opacity-90">{i.suivi || i.message}</p>
                <p className="mt-0.5 text-[11px] opacity-70">
                  {depuis(i.debut)} ·{" "}
                  <Link href="/etat" className="underline">
                    voir l&apos;état du service
                  </Link>
                </p>
              </div>
            </div>
            <button
              onClick={() => setMasques((m) => [...m, i.id])}
              className="shrink-0 opacity-60 hover:opacity-100"
              title="Masquer pour cette session"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
