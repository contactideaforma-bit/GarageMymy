// Compteur façon HUD d'arcade : liseré coloré, libellé en police pixel,
// grosse valeur lisible.
// v7.0 : bloc COMPACT et typographie fluide — sur téléphone, la valeur ne se
// casse plus sur deux lignes et la carte ne mange plus la moitié de l'écran.
const ACCENTS: Record<string, string> = {
  violet: "#8b5cf6",
  pink: "#ec4899",
  teal: "#2dd4bf",
  amber: "#f59e0b",
  emerald: "#10b981",
  blue: "#3b82f6",
};

export default function StatCard({
  label,
  value,
  hint,
  accent = "violet",
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: keyof typeof ACCENTS;
}) {
  const color = ACCENTS[accent] || ACCENTS.violet;
  return (
    <div className="glass-card relative overflow-hidden p-3 sm:p-4">
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: color }} />
      <div className="font-pixel text-[0.42rem] leading-relaxed text-white/60 sm:text-[0.5rem]">
        {label}
      </div>
      <div className="valeur-hud mt-1 truncate" title={value}>
        {value}
      </div>
      {hint && <div className="mt-0.5 truncate text-[11px] text-white/40">{hint}</div>}
    </div>
  );
}
