"use client";

import { STATUTS_ORDRE, STATUTS_INFO } from "@/lib/format";

/**
 * Frise (stepper) du cycle de vie d'un dossier.
 * Cliquer sur une étape change le statut (si onChange fourni).
 */
export default function StatutPipeline({
  statut,
  onChange,
  disabled,
}: {
  statut: string;
  onChange?: (s: string) => void;
  disabled?: boolean;
}) {
  // index courant (les statuts hérités tombent à -1 = aucune étape active)
  const currentIndex = STATUTS_ORDRE.indexOf(statut as never);

  return (
    <div className="flex w-full items-center">
      {STATUTS_ORDRE.map((s, i) => {
        const info = STATUTS_INFO[s];
        const done = currentIndex >= 0 && i < currentIndex;
        const active = i === currentIndex;
        const clickable = Boolean(onChange) && !disabled;

        return (
          <div key={s} className="flex flex-1 items-center last:flex-none">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onChange?.(s)}
              className={`group flex flex-col items-center gap-1 ${
                clickable ? "cursor-pointer" : "cursor-default"
              }`}
              title={info.label}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors ${
                  active
                    ? "border-brand bg-brand text-white"
                    : done
                    ? "border-brand bg-brand/15 text-brand"
                    : "border-surface-line bg-white text-ink-faint group-hover:border-brand-light"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={`text-[11px] whitespace-nowrap ${
                  active ? "font-semibold text-brand" : "text-ink-soft"
                }`}
              >
                {info.label}
              </span>
            </button>

            {i < STATUTS_ORDRE.length - 1 && (
              <div
                className={`mx-1 h-0.5 flex-1 ${
                  done ? "bg-brand" : "bg-surface-line"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
