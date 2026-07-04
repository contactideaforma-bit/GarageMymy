"use client";

import Link from "next/link";
import { ProchaineAction, URGENCE_STYLE } from "@/lib/actions";

/**
 * Bannière « Prochaine action » : dit clairement au garagiste
 * quoi faire maintenant sur ce dossier.
 */
export default function ProchaineActionCard({
  action,
  avecCta = true,
}: {
  action: ProchaineAction | null;
  avecCta?: boolean;
}) {
  if (!action) return null;
  const st = URGENCE_STYLE[action.urgence];
  return (
    <section
      className="glass-card flex flex-wrap items-center gap-4 p-4"
      style={{ borderLeft: `8px solid ${st.couleur}` }}
    >
      <div className="min-w-[16rem] flex-1">
        <div className="flex items-center gap-2">
          <span className="font-pixel text-[0.5rem] text-white/50">PROCHAINE ACTION</span>
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${st.badge}`}>
            {st.label}
          </span>
        </div>
        <div className="mt-1 font-semibold text-white">{action.titre}</div>
        {action.detail && <div className="text-sm text-white/60">{action.detail}</div>}
      </div>
      {avecCta && (
        <Link href={action.href} className="btn-primary shrink-0">
          {action.ctaLabel}
        </Link>
      )}
    </section>
  );
}
