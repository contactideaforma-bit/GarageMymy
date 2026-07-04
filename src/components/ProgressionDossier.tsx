"use client";

import { progressionDossier } from "@/lib/format";

/**
 * Barre de progression RÉTRO GAME du dossier (façon barre de vie) :
 * blocs segmentés, couleur qui évolue avec l'avancée, % en police pixel.
 * 100 % = dossier complet et payé.
 * Contraste géré par les classes .retro-bar / .retro-bar-vide (globals.css),
 * lisible dans les deux thèmes.
 */
export default function ProgressionDossier({
  statut,
  size = "md",
  showLabel = true,
}: {
  statut: string;
  size?: "sm" | "md";
  showLabel?: boolean;
}) {
  const pct = progressionDossier(statut);
  const blocks = 20;
  const filled = Math.max(1, Math.round((pct / 100) * blocks));

  // Couleur façon barre de vie : rose (début) → ambre → teal → vert (payé)
  const color =
    pct >= 100 ? "#10b981" : pct >= 70 ? "#14b8a6" : pct >= 40 ? "#f59e0b" : "#ec4899";

  const h = size === "sm" ? "h-3.5" : "h-5";

  return (
    <div className="flex items-center gap-2">
      <div
        className={`retro-bar flex-1 min-w-[6rem] ${h} rounded-sm p-[2px]`}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Avancement du dossier : ${pct}%`}
        title={`${pct}% — 100% = dossier payé`}
      >
        <div className="flex h-full gap-[2px]">
          {Array.from({ length: blocks }).map((_, i) => (
            <span
              key={i}
              className={`flex-1 rounded-[1px] ${i < filled ? "" : "retro-bar-vide"}`}
              style={
                i < filled
                  ? { backgroundColor: color, boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.35)" }
                  : undefined
              }
            />
          ))}
        </div>
      </div>
      {showLabel && (
        <span
          className={`font-pixel shrink-0 ${size === "sm" ? "text-[0.6rem]" : "text-[0.7rem]"}`}
          style={{ color, textShadow: "1px 1px 0 rgba(0,0,0,0.25)" }}
        >
          {pct >= 100 ? "PAYE !" : `${pct}%`}
        </span>
      )}
    </div>
  );
}
