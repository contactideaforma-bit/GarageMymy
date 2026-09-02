import type { CSSProperties } from "react";

// Compteur façon HUD d'arcade : liseré coloré, libellé en police pixel,
// grosse valeur lisible.
// v7.0 : bloc COMPACT et typographie fluide — sur téléphone, la valeur ne se
// casse plus sur deux lignes et la carte ne mange plus la moitié de l'écran.
// v8.2 : montée en gamme — liseré en dégradé, halo de couleur, pastille
// d'icône et léger relief au survol quand la carte est cliquable.
const ACCENTS: Record<string, { couleur: string; clair: string }> = {
  violet: { couleur: "#8b5cf6", clair: "#c4b5fd" },
  pink: { couleur: "#ec4899", clair: "#f9a8d4" },
  teal: { couleur: "#2dd4bf", clair: "#99f6e4" },
  amber: { couleur: "#f59e0b", clair: "#fcd34d" },
  emerald: { couleur: "#10b981", clair: "#6ee7b7" },
  blue: { couleur: "#3b82f6", clair: "#93c5fd" },
};

export default function StatCard({
  label,
  value,
  hint,
  accent = "violet",
  icone,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: keyof typeof ACCENTS;
  /** Petit pictogramme (emoji) affiché en pastille à droite. */
  icone?: string;
}) {
  const a = ACCENTS[accent] || ACCENTS.violet;
  return (
    <div
      className="glass-card hud relative overflow-hidden p-3 sm:p-4"
      style={{ "--hud-teinte": `${a.couleur}33` } as CSSProperties}
    >
      <span
        className="hud-barre"
        style={{ backgroundImage: `linear-gradient(90deg, ${a.couleur}, ${a.clair})` }}
      />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="etiquette truncate" title={label}>{label}</div>
          <div className="valeur-hud mt-1 truncate" title={value}>
            {value}
          </div>
          {hint && <div className="mt-0.5 truncate text-[11px] text-white/45">{hint}</div>}
        </div>
        {icone && (
          <span
            className="hud-icone shrink-0"
            style={{ borderColor: `${a.couleur}55`, color: a.couleur, background: `${a.couleur}1f` }}
            aria-hidden
          >
            {icone}
          </span>
        )}
      </div>
    </div>
  );
}
