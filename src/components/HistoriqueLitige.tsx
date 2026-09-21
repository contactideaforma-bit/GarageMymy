"use client";

/**
 * LITIGE RÉSOLU (v13.20) — trace visible d'un litige levé.
 *
 * Une fois le litige levé, le dossier ne doit pas « oublier » qu'il a été
 * bloqué : ce bloc rappelle les dates, le problème, le plan de déblocage,
 * la conclusion saisie à la levée et les courriers de déblocage envoyés
 * (accord de réparation → expert, mise en demeure → assureur). Replié par
 * défaut, une ligne suffit pour signaler le litige passé ; un clic déroule
 * le détail. Le litige peut être rouvert d'ici si le blocage revient.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CourrierRecouvrement, Dossier, LitigePasse } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/format";
import { LIBELLE_COURRIER_LITIGE, TypeCourrierLitige } from "@/lib/courriersLitige";
import { apercuCourrierRecouvrementPdf, generateCourrierRecouvrementPdf } from "@/lib/pdf";

const TYPES: TypeCourrierLitige[] = ["accord_reparation_expert", "position_assureur"];

function joursEntre(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
  return Number.isFinite(d) ? Math.max(0, Math.round(d)) : null;
}

export default function HistoriqueLitige({ dossier, onReouvrir }: { dossier: Dossier; onReouvrir: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [courriers, setCourriers] = useState<CourrierRecouvrement[]>([]);

  useEffect(() => {
    let actif = true;
    supabase
      .from("courriers_recouvrement")
      .select("*")
      .eq("dossier_id", dossier.id)
      .in("type", TYPES)
      .order("created_at", { ascending: false })
      .then(({ data }) => { if (actif) setCourriers((data as CourrierRecouvrement[]) || []); });
    return () => { actif = false; };
  }, [dossier.id]);

  // Historique (migration v84) ; à défaut, on reconstitue le dernier litige
  // depuis les colonnes v60 pour que la trace existe même sans la migration.
  const passes: LitigePasse[] = (dossier.litige_historique || []).length
    ? [...(dossier.litige_historique || [])].reverse()
    : [{
        depuis: dossier.litige_depuis || null,
        resolu_le: dossier.litige_resolu_le || "",
        probleme: dossier.litige_probleme || null,
        deblocage: dossier.litige_deblocage || null,
        conclusion: null,
      }];
  const dernier = passes[0];
  const duree = joursEntre(dernier.depuis, dernier.resolu_le || undefined);

  return (
    <section className="rounded-2xl border border-emerald-400/30 bg-emerald-500/5 p-3">
      <button type="button" onClick={() => setOuvert((o) => !o)} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
        <div className="min-w-0">
          <span className="badge badge-ok">✓ Litige résolu</span>{" "}
          <span className="text-sm text-white/80">
            {passes.length > 1 ? `${passes.length} litiges sur ce dossier · dernier ` : "Ce dossier a connu un litige, "}
            {dernier.depuis ? `du ${formatDate(dernier.depuis)}` : ""}
            {dernier.resolu_le ? ` au ${formatDate(dernier.resolu_le)}` : ""}
            {duree !== null ? ` (${duree} j)` : ""}
          </span>
        </div>
        <span className="text-xs text-white/50">{ouvert ? "Replier ▴" : "Voir le détail ▾"}</span>
      </button>

      {ouvert && (
        <div className="mt-3 space-y-3 text-sm">
          {passes.map((p, i) => (
            <div key={`${p.resolu_le}-${i}`} className="carte-liste space-y-1.5">
              <div className="text-xs text-white/50">
                Litige {p.depuis ? `ouvert le ${formatDateTime(p.depuis)}` : ""}{p.resolu_le ? ` · levé le ${formatDateTime(p.resolu_le)}` : ""}
              </div>
              {p.probleme && (
                <p><span className="font-semibold text-white">Problème :</span> <span className="whitespace-pre-line text-white/85">{p.probleme}</span></p>
              )}
              {p.deblocage && (
                <p><span className="font-semibold text-white">Plan de déblocage :</span> <span className="whitespace-pre-line text-white/85">{p.deblocage}</span></p>
              )}
              {p.conclusion && (
                <p><span className="font-semibold text-emerald-200">Résolution :</span> <span className="whitespace-pre-line text-white/85">{p.conclusion}</span></p>
              )}
              {!p.probleme && !p.deblocage && !p.conclusion && <p className="text-white/60">Aucun détail enregistré.</p>}
            </div>
          ))}

          {courriers.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/60">Courriers de déblocage</div>
              <ul className="space-y-1.5">
                {courriers.map((c) => (
                  <li key={c.id} className="carte-liste flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-semibold text-white">{LIBELLE_COURRIER_LITIGE[c.type as TypeCourrierLitige]}</span>
                      <span className="text-white/60"> → {c.destinataire_nom || c.destinataire} · {formatDate(c.date_courrier)}</span>{" "}
                      <span className={c.statut === "envoye" ? "badge badge-ok" : "badge badge-neutral"}>
                        {c.statut === "envoye" ? `Envoyé${c.canal_envoi === "lrar" ? ` · recommandé${c.numero_suivi ? ` n° ${c.numero_suivi}` : ""}` : c.canal_envoi === "email" ? " par email" : ""}` : "Brouillon"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => apercuCourrierRecouvrementPdf(c, dossier, dossier.numero_sinistre)} className="btn-ghost btn-compact">Aperçu</button>
                      <button onClick={() => generateCourrierRecouvrementPdf(c, dossier, dossier.numero_sinistre)} className="btn-ghost btn-compact">⬇ PDF</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end">
            <button type="button" onClick={onReouvrir} className="btn-ghost btn-compact">⚠ Rouvrir le litige</button>
          </div>
        </div>
      )}
    </section>
  );
}
