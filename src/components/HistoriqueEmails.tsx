"use client";

// ====================================================================
//  HISTORIQUE DES EMAILS DU DOSSIER (v11.6)
//
//  Tout envoi depuis l'appli est déjà journalisé dans la table `emails`
//  (par /api/send-email et /api/relances-auto) avec son `dossier_id` —
//  mais rien ne l'affichait sur la fiche. Demande de l'éditeur : « dans
//  l'onglet sinistre on doit pouvoir voir l'historique des mails envoyés
//  sur le dossier depuis l'appli ».
//
//  Utile en cas de litige : savoir QUAND on a relancé l'assurance, et
//  avec quel texte, vaut mieux que la mémoire de chacun.
// ====================================================================

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Email } from "@/lib/types";
import { formatDateTime, messageErreur } from "@/lib/format";
import { usePliage } from "@/lib/pliage";

export default function HistoriqueEmails({ dossierId }: { dossierId: string }) {
  const { plie, basculerPliage } = usePliage(`emails-${dossierId}`, true);
  const [emails, setEmails] = useState<Email[]>([]);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [charge, setCharge] = useState(false);

  useEffect(() => {
    let actif = true;
    (async () => {
      const { data, error } = await supabase
        .from("emails")
        .select("*")
        .eq("dossier_id", dossierId)
        .order("created_at", { ascending: false });
      if (!actif) return;
      if (error) setErreur(messageErreur(error, "Historique indisponible."));
      else setEmails((data as Email[]) || []);
      setCharge(true);
    })();
    return () => {
      actif = false;
    };
  }, [dossierId]);

  // Pas d'email et rien à dire : on n'encombre pas la fiche.
  if (charge && emails.length === 0 && !erreur) return null;

  const echecs = emails.filter((e) => e.statut !== "envoye").length;

  return (
    <section className="glass-card p-3 sm:p-4">
      <button
        type="button"
        onClick={basculerPliage}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="titre-bloc">
          Emails envoyés{" "}
          <span className="text-sm font-normal text-white/45">
            ({emails.length}
            {echecs > 0 ? ` · ${echecs} en échec` : ""})
          </span>
        </span>
        <span className="shrink-0 text-white/40">{plie ? "▾" : "▴"}</span>
      </button>

      {!plie && (
        <>
          {erreur && <p className="badge badge-danger mt-2">{erreur}</p>}
          <ul className="mt-2 divide-y divide-white/10">
            {emails.map((e) => (
              <li key={e.id} className="py-2">
                <button
                  type="button"
                  onClick={() => setOuvert(ouvert === e.id ? null : e.id)}
                  className="w-full text-left"
                >
                  <div className="break-words text-sm text-white/85">{e.objet || "(sans objet)"}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                    <span className={`badge ${e.statut === "envoye" ? "badge-ok" : "badge-danger"}`}>
                      {e.statut === "envoye" ? "Envoyé" : "Échec"}
                    </span>
                    <span className="text-white/45">{formatDateTime(e.created_at)}</span>
                    {e.destinataire && <span className="min-w-0 break-all text-white/45">→ {e.destinataire}</span>}
                  </div>
                </button>
                {ouvert === e.id && (
                  <div className="mt-2 rounded-lg border border-white/10 bg-white/5 p-2 text-xs text-white/70">
                    {e.erreur && <p className="mb-1 text-rose-300">Erreur : {e.erreur}</p>}
                    <pre className="whitespace-pre-wrap break-words font-sans">{e.corps || "(vide)"}</pre>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
