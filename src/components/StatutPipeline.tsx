"use client";

import { STATUTS_ORDRE, libelleStatut } from "@/lib/format";
import { useMetier } from "@/components/MetierProvider";

export default function StatutPipeline({
  statut,
  onChange,
  disabled,
}: {
  statut: string;
  onChange?: (s: string) => void;
  disabled?: boolean;
}) {
  const { metier } = useMetier();
  const currentIndex = STATUTS_ORDRE.indexOf(statut as never);

  return (
    // overflow-x-auto : sur mobile, le pipeline se fait défiler au doigt
    // au lieu de déborder de la carte.
    <div className="flex w-full items-center overflow-x-auto pb-2 -mb-2">
      {STATUTS_ORDRE.map((s, i) => {
        const label = libelleStatut(s, metier);
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
              title={label}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-all ${
                  active
                    ? "border-transparent bg-gradient-to-br from-accent-violet to-accent-pink text-white shadow-[0_0_16px_rgba(236,72,153,0.55)]"
                    : done
                    ? "border-accent-violet/50 bg-accent-violet/20 text-accent-violet"
                    : "border-white/20 bg-white/5 text-white/40 group-hover:border-accent-pink/60"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={`text-[11px] whitespace-nowrap ${
                  active ? "font-semibold text-white" : "text-white/50"
                }`}
              >
                {label}
              </span>
            </button>

            {i < STATUTS_ORDRE.length - 1 && (
              <div
                className={`mx-1 h-0.5 flex-1 ${
                  done ? "bg-gradient-to-r from-accent-violet/70 to-accent-pink/50" : "bg-white/10"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
