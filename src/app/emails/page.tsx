"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Email } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import ConfigBanner from "@/components/ConfigBanner";

const STATUT: Record<string, { label: string; badge: string }> = {
  envoye: { label: "Envoyé", badge: "bg-emerald-100 text-emerald-700" },
  echec: { label: "Échec", badge: "bg-rose-100 text-rose-700" },
  brouillon: { label: "Brouillon", badge: "bg-slate-100 text-slate-700" },
};

export default function EmailsPage() {
  const router = useRouter();
  const [emails, setEmails] = useState<(Email & { dossier_id: string | null })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("emails")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) setEmails(data as Email[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white mb-6">Journal des emails</h1>
      <ConfigBanner />

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-white/50">
            <tr>
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Destinataire</th>
              <th className="px-5 py-3 font-medium">Objet</th>
              <th className="px-5 py-3 font-medium">Statut</th>
              <th className="px-5 py-3 font-medium text-right">Dossier</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-white/40">Chargement…</td></tr>
            )}
            {!loading && emails.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-white/40">
                Aucun email envoyé. Envoie un devis, une facture ou une relance depuis un dossier.
              </td></tr>
            )}
            {emails.map((m) => {
              const st = STATUT[m.statut] || STATUT.brouillon;
              return (
                <tr key={m.id} className="border-t border-white/5 hover:bg-white/5 align-top">
                  <td className="px-5 py-3 text-white/70 whitespace-nowrap">{formatDateTime(m.created_at)}</td>
                  <td className="px-5 py-3 text-white/80">{m.destinataire || "—"}</td>
                  <td className="px-5 py-3 text-white/80">
                    {m.objet || "—"}
                    {m.statut === "echec" && m.erreur && (
                      <div className="text-xs text-rose-300 mt-0.5">{m.erreur}</div>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${st.badge}`}>
                      {st.label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    {m.dossier_id ? (
                      <button
                        onClick={() => router.push(`/sinistres/${m.dossier_id}`)}
                        className="text-accent-teal hover:underline"
                      >
                        Voir
                      </button>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
