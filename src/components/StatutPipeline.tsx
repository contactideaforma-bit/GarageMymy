"use client";

import { STATUTS_ORDRE, STATUTS_INFO } from "@/lib/format";

export default function StatutPipeline({
  statut,
  onChange,
  disabled,
}: {
  statut: string;
  onChange?: (s: string) => void;
  disabled?: boolean;
}) {
  const currentIndex = STATUTS_ORDRE.indexOf(statut as never);

  return (
    // overflow-x-auto : sur mobile, le pipeline se fait défiler au doigt
    // au lieu de déborder de la carte.
    <div className="flex w-full items-center overflow-x-auto pb-2 -mb-2">
      {STATUTS_ORDRE.map((s, i) => {
        const info = STATUTS_INFO[s];
        const done = currentIndex >= 0 && i < currentIndex;
        const active = i === currentIndex;
        const clickable = Boolean(onChange) && !disabled;

        return (
          <div key={s} className="flex min-w-fit flex-1 items-center last:flex-none">
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
                    ? "border-transparent bg-gradient-to-br from-accent-violet to-accent-pink text-white"
                    : done
                    ? "border-accent-violet/50 bg-accent-violet/20 text-white"
                    : "border-white/20 bg-white/5 text-white/40 group-hover:border-accent-violet/60"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={`text-[11px] whitespace-nowrap ${
                  active ? "font-semibold text-white" : "text-white/50"
                }`}
              >
                {info.label}
              </span>
            </button>

            {i < STATUTS_ORDRE.length - 1 && (
              <div
                className={`mx-1 h-0.5 flex-1 ${
                  done ? "bg-accent-violet/60" : "bg-white/10"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
