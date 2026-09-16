"use client";

// JOURNAL DES CONTACTS D'UN PROSPECT (v12.9) — la chronologie de tout ce qui
// s'est passé avec ce garage : appels, messages, RDV, refus et leur motif.

import { useEffect, useState } from "react";
import InteractionModal from "@/components/InteractionModal";
import { formatDateTime, formatDate, messageErreur } from "@/lib/format";
import { CANAUX_CONTACT, MOTIFS_REFUS, Prospect, ProspectInteraction, RESULTATS_CONTACT, chargerInteractions, supprimerInteraction } from "@/lib/prospects";

export default function JournalProspect({ prospect, onProspectChange }: { prospect: Prospect; onProspectChange: (p: Prospect) => void }) {
  const [liste, setListe] = useState<ProspectInteraction[]>([]);
  const [modal, setModal] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const recharger = () => chargerInteractions(prospect.id).then(setListe).catch((e) => setErr(messageErreur(e, "Journal indisponible (migration v71 ?).")));
  useEffect(() => { recharger(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [prospect.id]);

  return (
    <div className="glass-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="titre-bloc">Suivi du démarchage</h2>
          <p className="text-xs text-white/50">
            {prospect.nb_appels ? `${prospect.nb_appels} appel${prospect.nb_appels > 1 ? "s" : ""}` : "Jamais appelé"}
            {prospect.dernier_contact ? ` · dernier contact ${formatDateTime(prospect.dernier_contact)}` : ""}
            {prospect.rdv_le ? ` · RDV ${formatDateTime(prospect.rdv_le)}` : ""}
          </p>
        </div>
        <button className="btn-primary btn-compact" onClick={() => setModal(true)}>📞 Noter un contact</button>
      </div>

      {prospect.statut === "perdu" && prospect.motif_refus && (
        <p className="mt-3 rounded-xl border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-sm">
          ✕ A dit non : <span className="font-medium">{MOTIFS_REFUS[prospect.motif_refus]}</span>{prospect.motif_refus_detail ? ` — ${prospect.motif_refus_detail}` : ""}
        </p>
      )}
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}

      {liste.length === 0 ? (
        <p className="mt-3 text-sm text-white/45">Aucun contact noté. Chaque appel noté ici alimente vos alertes et vos statistiques.</p>
      ) : (
        <ul className="mt-3 divide-y divide-white/10">
          {liste.map((i) => {
            const r = RESULTATS_CONTACT[i.resultat];
            return (
              <li key={i.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <span className="mr-2 text-xs text-white/45">{formatDateTime(i.created_at)}</span>
                  <span className="mr-2">{CANAUX_CONTACT[i.canal].icone}</span>
                  <span className={r.badge}>{r.label}</span>
                  {i.motif_refus && <span className="ml-2 text-white/70">{MOTIFS_REFUS[i.motif_refus]}</span>}
                  {i.rdv_le && <span className="ml-2 text-white/70">le {formatDateTime(i.rdv_le)}</span>}
                  {!i.rdv_le && i.prochaine_date && <span className="ml-2 text-white/50">→ rappel {formatDate(i.prochaine_date)}</span>}
                  {i.commentaire && <div className="text-white/70">« {i.commentaire} »</div>}
                </div>
                <button className="text-xs text-white/35 hover:text-rose-300" onClick={async () => { if (confirm("Supprimer cette ligne du journal ?")) { await supprimerInteraction(i.id); recharger(); } }}>supprimer</button>
              </li>
            );
          })}
        </ul>
      )}

      {modal && <InteractionModal prospect={prospect} onClose={() => setModal(false)} onSaved={(p) => { setModal(false); onProspectChange(p); recharger(); }} />}
    </div>
  );
}
