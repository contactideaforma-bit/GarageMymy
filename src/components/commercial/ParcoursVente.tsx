"use client";

// ============================================================
//  PARCOURS DE VENTE (v13.37) — en tête de la fiche client du commercial.
//
//  8 étapes, du premier contact au compte du garage. En haut, UNE seule
//  carte « Prochaine étape » avec un gros bouton : le commercial n'a pas
//  à chercher dans quel onglet aller. En dessous, la frise des étapes
//  (verticale sur téléphone, horizontale sur grand écran), chacune
//  cliquable pour y revenir.
// ============================================================

import { useMemo, useState } from "react";
import type { Prospect, ProspectDocument } from "@/lib/prospects";
import { CleEtape, EtapeParcours, VenteParcours, avancement, calculerParcours } from "@/lib/venteParcours";

export default function ParcoursVente({
  prospect,
  docs,
  vente,
  onAction,
}: {
  prospect: Prospect;
  docs: ProspectDocument[];
  vente: VenteParcours | null;
  onAction: (cle: CleEtape) => void;
}) {
  const etapes = useMemo(() => calculerParcours(prospect, docs, vente), [prospect, docs, vente]);
  const courante = etapes.find((e) => e.etat === "courant") || null;
  const pct = avancement(etapes);
  const termine = !courante && etapes.every((e) => e.etat === "fait");
  const [ouvert, setOuvert] = useState(false);

  if (prospect.statut === "perdu") return null;

  return (
    <section className="glass-card mb-4 overflow-hidden" aria-label="Parcours de vente">
      {/* En-tête : avancement */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <h2 className="titre-bloc">Parcours de vente</h2>
        <span className="text-xs font-semibold text-white/60">
          {termine ? "Terminé ✓" : `Étape ${courante?.numero ?? "—"} sur ${etapes.length}`} · {pct} %
        </span>
      </div>
      <div className="mx-4 mt-2 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-teal-400 transition-all" style={{ width: `${pct}%` }} />
      </div>

      {/* Prochaine étape : une carte, un bouton */}
      {courante ? (
        <div className="m-4 rounded-xl border-2 border-accent-pink/50 bg-accent-pink/10 p-4">
          <div className="text-[11px] font-bold uppercase tracking-widest text-accent-pink">Prochaine étape · {courante.numero}/{etapes.length}</div>
          <div className="mt-1 text-lg font-bold text-white">{courante.titre}</div>
          <p className="mt-0.5 text-sm text-white/75">{courante.detail}</p>
          <button type="button" onClick={() => onAction(courante.cle)} className="btn-primary mt-3 w-full justify-center !py-3 !text-base sm:w-auto">
            {courante.action} →
          </button>
          <p className="mt-2 text-xs text-white/55">{courante.aide}</p>
        </div>
      ) : (
        <div className="m-4 rounded-xl border-2 border-emerald-400/50 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          🎉 Tout est fait : contrat signé, paiement reçu et compte du garage créé. Pense à programmer un appel de suivi dans un mois.
        </div>
      )}

      {/* Frise : grand écran = 8 pastilles en ligne ; téléphone = liste repliable */}
      <ol className="hidden grid-cols-8 gap-1 px-4 pb-4 md:grid">
        {etapes.map((e) => (
          <li key={e.cle}>
            <PastilleEtape e={e} courante={courante} onClick={() => onAction(e.cle)} />
          </li>
        ))}
      </ol>

      <div className="px-4 pb-3 md:hidden">
        <button type="button" onClick={() => setOuvert((o) => !o)} className="w-full py-1 text-left text-xs font-semibold text-accent-teal" aria-expanded={ouvert}>
          {ouvert ? "▲ Masquer les étapes" : "▼ Voir toutes les étapes"}
        </button>
        {ouvert && (
          <ol className="mt-2 space-y-1.5">
            {etapes.map((e) => (
              <li key={e.cle}>
                <LigneEtape e={e} courante={courante} onClick={() => onAction(e.cle)} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function style(e: EtapeParcours, courante: EtapeParcours | null) {
  const aCompleter = e.etat === "a_venir" && courante && e.numero < courante.numero;
  if (e.etat === "fait") return { rond: "bg-emerald-500 text-white", texte: "text-white/80", symbole: "✓" };
  if (e.etat === "courant") return { rond: "bg-accent-pink text-white ring-4 ring-accent-pink/25", texte: "text-white font-semibold", symbole: String(e.numero) };
  if (aCompleter) return { rond: "bg-amber-400 text-slate-900", texte: "text-amber-200", symbole: "!" };
  return { rond: "border-2 border-white/25 text-white/50", texte: "text-white/45", symbole: String(e.numero) };
}

function PastilleEtape({ e, courante, onClick }: { e: EtapeParcours; courante: EtapeParcours | null; onClick: () => void }) {
  const s = style(e, courante);
  return (
    <button type="button" onClick={onClick} title={`${e.titre} — ${e.detail}`} className="group flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-center hover:bg-white/5">
      <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${s.rond}`}>{s.symbole}</span>
      <span className={`text-[11px] leading-tight ${s.texte}`}>{e.titre}</span>
    </button>
  );
}

function LigneEtape({ e, courante, onClick }: { e: EtapeParcours; courante: EtapeParcours | null; onClick: () => void }) {
  const s = style(e, courante);
  return (
    <button type="button" onClick={onClick} className="glass-soft flex w-full items-center gap-3 px-3 py-2.5 text-left">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${s.rond}`}>{s.symbole}</span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${s.texte}`}>{e.titre}</span>
        <span className="block truncate text-xs text-white/50">{e.detail}</span>
      </span>
      <span className="shrink-0 text-white/30" aria-hidden="true">›</span>
    </button>
  );
}
