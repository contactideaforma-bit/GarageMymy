"use client";

/**
 * EMAILS ENVOYÉS SUR LE DOSSIER (v13.21)
 *
 * Tout email parti depuis l'appli (facture, relance, lien de signature,
 * courrier de recouvrement…) est journalisé côté serveur dans `emails`.
 * Ce bloc les liste pour le dossier et permet de RELIRE le message tel
 * qu'il a été envoyé — utile face à un client qui « n'a rien reçu », ou
 * pour vérifier ce qui a été dit à l'assureur.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Email } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { usePliage } from "@/lib/pliage";
import ModalShell from "@/components/ModalShell";

export default function EmailsDossier({ dossierId }: { dossierId: string }) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [charge, setCharge] = useState(false);
  const [ouvert, setOuvert] = useState<Email | null>(null);
  const { plie, basculerPliage } = usePliage("dossier.emails", true);

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from("emails")
      .select("*")
      .eq("dossier_id", dossierId)
      .order("created_at", { ascending: false })
      .limit(100);
    setEmails((data as Email[]) || []);
    setCharge(true);
  }, [dossierId]);

  useEffect(() => { charger(); }, [charger]);
  // Un email vient de partir depuis un autre bloc : on se met à jour.
  useEffect(() => {
    if (plie) return;
    charger();
  }, [plie, charger]);

  const echecs = emails.filter((m) => m.statut === "echec").length;

  return (
    <section className="glass-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 sm:px-4 sm:py-2.5">
        <button onClick={basculerPliage} className="flex min-w-0 items-center gap-2 text-left" aria-expanded={!plie} title={plie ? "Déplier" : "Replier"}>
          <span className={`shrink-0 text-white/40 transition-transform ${plie ? "" : "rotate-90"}`} aria-hidden>▸</span>
          <h2 className="titre-bloc truncate">✉ Emails envoyés{charge ? ` (${emails.length})` : ""}</h2>
        </button>
        {echecs > 0 && <span className="badge badge-danger">{echecs} en échec</span>}
        {!plie && (
          <div className="flex flex-1 justify-end">
            <button onClick={charger} className="btn-ghost btn-compact" title="Recharger la liste">↻</button>
          </div>
        )}
      </div>

      {!plie && (
        <div className="px-3 py-3 sm:px-4">
          {!charge && <p className="text-sm text-white/40">Chargement…</p>}
          {charge && emails.length === 0 && (
            <p className="text-sm text-white/40">Aucun email envoyé depuis l&apos;appli pour ce dossier.</p>
          )}
          {emails.length > 0 && (
            <ul className="divide-y divide-white/10">
              {emails.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-white">{m.objet || "(sans objet)"}</span>
                      <span className={`badge ${m.statut === "echec" ? "badge-danger" : "badge-ok"}`}>{m.statut === "echec" ? "Échec" : "Envoyé"}</span>
                    </div>
                    <div className="truncate text-xs text-white/50">
                      → {m.destinataire || "—"} · <span className="text-white/40">{formatDateTime(m.created_at)}</span>
                    </div>
                  </div>
                  <button onClick={() => setOuvert(m)} className="btn-ghost btn-compact">👁 Visualiser</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {ouvert && (
        <ModalShell title={ouvert.objet || "Email"} onClose={() => setOuvert(null)} maxWidth="max-w-2xl">
          <div className="space-y-3 text-sm">
            <div className="glass-soft space-y-1 p-3 text-xs text-white/60">
              <div><span className="text-white/40">À : </span><span className="text-white/90">{ouvert.destinataire || "—"}</span></div>
              <div><span className="text-white/40">Envoyé le : </span><span className="text-white/90">{formatDateTime(ouvert.created_at)}</span></div>
              <div>
                <span className="text-white/40">Statut : </span>
                <span className={ouvert.statut === "echec" ? "text-rose-300" : "text-emerald-300"}>{ouvert.statut === "echec" ? `Échec${ouvert.erreur ? ` — ${ouvert.erreur}` : ""}` : "Envoyé"}</span>
              </div>
            </div>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-white/5 p-3 font-sans text-sm leading-relaxed text-white/85">
              {ouvert.corps || "(message vide)"}
            </pre>
            <p className="text-xs text-white/40">Les pièces jointes (PDF) ne sont pas conservées dans le journal : elles restent disponibles dans les documents du dossier.</p>
          </div>
        </ModalShell>
      )}
    </section>
  );
}
