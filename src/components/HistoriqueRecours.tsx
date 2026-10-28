"use client";

// ============================================================
//  HISTORIQUE D'UN RECOURS DIRECT TERMINÉ (v13.54)
//  Une fois le recours réglé ou levé, le dossier garde une trace visible :
//  dates, assureur adverse, montant réclamé, et le journal complet de ce
//  qui a été fait (mandat, courriers, relances, étapes). Rouvrable.
// ============================================================

import { useEffect, useState } from "react";
import type { Dossier } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { chargerJournalRecours, etapeRecours, type LigneJournalRecours } from "@/lib/recours";
import { JournalRecours } from "@/components/RecoursDirectPanel";

export default function HistoriqueRecours({ dossier, onRouvrir }: { dossier: Dossier; onRouvrir: () => void }) {
  const [journal, setJournal] = useState<LigneJournalRecours[]>([]);
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => { chargerJournalRecours(dossier.id).then(setJournal); }, [dossier.id]);
  const regle = dossier.recours_etape === "regle";

  return (
    <section className="glass-card p-3 sm:p-4" style={{ borderColor: regle ? "rgba(16, 185, 129, 0.4)" : "var(--mea-bordure)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="titre-bloc text-white">{regle ? "✅ Recours direct réglé" : "⏹️ Recours direct levé"}</h2>
          <p className="mt-1 text-xs text-white/60">
            Ouvert le {formatDate(dossier.recours_depuis)}{dossier.recours_resolu_le ? ` · ${regle ? "réglé" : "clos"} le ${formatDate(dossier.recours_resolu_le)}` : ""}
            {dossier.recours_tiers_assureur ? ` · assureur adverse : ${dossier.recours_tiers_assureur}` : ""}
            {dossier.recours_sinistre_adverse ? ` · sinistre n° ${dossier.recours_sinistre_adverse}` : ""}
            {" · dernière étape : "}{etapeRecours(dossier.recours_etape).label}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setOuvert((o) => !o)} className="btn-ghost btn-compact">{ouvert ? "Masquer l'historique" : `Voir l'historique (${journal.length})`}</button>
          <button type="button" onClick={onRouvrir} className="btn-ghost btn-compact" title="Réactiver le recours (toutes les informations sont conservées)">Rouvrir</button>
        </div>
      </div>
      {ouvert && <JournalRecours lignes={journal} />}
    </section>
  );
}
