"use client";

import { progressionDossier } from "@/lib/format";

/**
 * Barre de progression RÉTRO GAME du dossier (façon barre de vie) :
 * blocs segmentés, couleur qui évolue avec l'avancée, % en police pixel.
 * 100 % = dossier complet et payé.
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
    pct >= 100 ? "#10b981" : pct >= 70 ? "#2dd4bf" : pct >= 40 ? "#f59e0b" : "#ec4899";

  const h = size === "sm" ? "h-2.5" : "h-4";

  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex-1 min-w-[5rem] ${h} rounded-sm border-2 border-white/25 bg-black/30 p-[2px]`}
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
              className="flex-1 rounded-[1px]"
              style={
                i < filled
                  ? { backgroundColor: color, boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.3)" }
                  : { backgroundColor: "rgba(128, 128, 160, 0.18)" }
              }
            />
          ))}
        </div>
      </div>
      {showLabel && (
        <span
          className={`font-pixel shrink-0 ${size === "sm" ? "text-[0.5rem]" : "text-[0.6rem]"}`}
          style={{ color }}
        >
          {pct >= 100 ? "PAYE !" : `${pct}%`}
        </span>
      )}
    </div>
  );
}
