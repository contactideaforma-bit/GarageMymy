"use client";

import { useState } from "react";
import { formatEuros } from "@/lib/format";
import { type MentionRapport, mentionsDepuisJson } from "@/lib/mentionsRapport";

/**
 * ALERTES « MENTIONS PARTICULIÈRES » du rapport d'expertise (v11.2).
 *
 * Affiche, du plus grave au plus anodin, ce que l'analyse a relevé dans le
 * rapport : expertise à titre conservatoire, sursis à travaux, procédure
 * VGE, règlement direct absent, TVA récupérable, franchise, vétusté…
 * Rouge = ne pas facturer / ne pas engager les travaux sans accord ;
 * ambre = condition à vérifier avant de facturer ; gris = bon à savoir.
 *
 * `compact` : une ligne par mention (éditeur de facture, formulaire).
 * Les mentions « info » sont repliées par défaut pour ne pas noyer les
 * vraies alertes ; un lien les déplie.
 */
export default function MentionsRapport({
  mentions,
  compact = false,
  titre = "Mentions particulières du rapport",
  className = "",
}: {
  mentions: MentionRapport[] | unknown;
  compact?: boolean;
  titre?: string | null;
  className?: string;
}) {
  const liste = Array.isArray(mentions) ? mentionsDepuisJson(mentions) : [];
  const [toutVoir, setToutVoir] = useState(false);
  if (liste.length === 0) return null;

  const importantes = liste.filter((m) => m.gravite !== "info");
  const infos = liste.filter((m) => m.gravite === "info");
  const visibles = toutVoir || importantes.length === 0 ? liste : importantes;
  const bloquantes = importantes.some((m) => m.gravite === "danger");

  return (
    <div
      className={`alerte ${bloquantes ? "alerte-danger" : importantes.length ? "alerte-warn" : "alerte-info"} ${className}`}
      role={bloquantes ? "alert" : undefined}
    >
      {titre && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="alerte-titre">
            {bloquantes ? "⛔" : importantes.length ? "⚠" : "ℹ"} {titre}
          </span>
          {bloquantes && !compact && (
            <span className="badge badge-danger">Ne pas facturer sans accord</span>
          )}
        </div>
      )}
      <ul className={`mt-1 space-y-1.5 ${compact ? "text-xs" : "text-sm"}`}>
        {visibles.map((m) => (
          <li key={m.code} className={`flex min-w-0 gap-2 ${compact ? "items-center" : "items-start"}`}>
            <span className={`badge shrink-0 ${m.gravite === "danger" ? "badge-danger" : m.gravite === "warn" ? "badge-warn" : "badge-neutral"}`}>
              {m.gravite === "danger" ? "STOP" : m.gravite === "warn" ? "À vérifier" : "Info"}
            </span>
            <span className="min-w-0 break-words">
              <span className="font-semibold">
                {m.libelle}
                {m.montant != null ? ` — ${formatEuros(m.montant)}` : ""}
              </span>
              {!compact && m.conseil && <span className="block text-[0.8em] opacity-90">{m.conseil}</span>}
              {!compact && m.extrait && (
                <span className="block text-[0.75em] italic opacity-70" title="Extrait du rapport">
                  « {m.extrait} »
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {infos.length > 0 && importantes.length > 0 && (
        <button type="button" onClick={() => setToutVoir((v) => !v)} className="mt-1.5 text-xs underline opacity-80 hover:opacity-100">
          {toutVoir ? "Masquer les informations" : `${infos.length} information${infos.length > 1 ? "s" : ""} en plus`}
        </button>
      )}
    </div>
  );
}
