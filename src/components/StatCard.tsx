// Compteur façon HUD d'arcade : liseré coloré, libellé en police pixel,
// grosse valeur lisible.
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
    <div className="glass-card relative overflow-hidden p-5">
      <span className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: color }} />
      <div className="font-pixel text-[0.5rem] leading-relaxed text-white/60">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-white/40">{hint}</div>}
    </div>
  );
}
