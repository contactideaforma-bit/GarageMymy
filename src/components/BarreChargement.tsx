"use client";

import { useEffect, useState } from "react";

/**
 * Barre de progression rétro pendant l'analyse IA du rapport.
 * L'API ne renvoie pas d'avancement réel : la barre progresse toute seule
 * et plafonne à 90 % jusqu'à la réponse (le composant disparaît à la fin).
 */
export default function BarreChargement({
  actif,
  label = "ANALYSE DU RAPPORT",
}: {
  actif: boolean;
  label?: string;
}) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!actif) {
      setPct(0);
      return;
    }
    setPct(4);
    const t = setInterval(() => {
      setPct((p) => (p >= 90 ? 90 : p + Math.max(1, Math.round((90 - p) / 10))));
    }, 600);
    return () => clearInterval(t);
  }, [actif]);

  if (!actif) return null;

  const blocks = 20;
  const filled = Math.max(1, Math.round((pct / 100) * blocks));
  const etape =
    pct < 30 ? "Lecture du rapport…" : pct < 60 ? "Extraction du chiffrage…" : "Coordonnées et détails…";

  return (
    <div className="mt-3 space-y-1.5" role="status" aria-live="polite">
      <div className="flex items-center justify-between">
        <span className="font-pixel text-[0.55rem]" style={{ color: "#2dd4bf" }}>{label}</span>
        <span className="font-pixel text-[0.55rem]" style={{ color: "#2dd4bf" }}>{pct}%</span>
      </div>
      <div className="retro-bar h-4 rounded-sm p-[2px]">
        <div className="flex h-full gap-[2px]">
          {Array.from({ length: blocks }).map((_, i) => (
            <span
              key={i}
              className={`flex-1 rounded-[1px] ${i < filled ? "" : "retro-bar-vide"}`}
              style={
                i < filled
                  ? { backgroundColor: "#2dd4bf", boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.35)" }
                  : undefined
              }
            />
          ))}
        </div>
      </div>
      <div className="text-xs text-white/50">{etape}</div>
    </div>
  );
}
