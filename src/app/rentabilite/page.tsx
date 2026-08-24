"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Document, Dossier, Paiement } from "@/lib/types";
import { formatEuros } from "@/lib/format";
import { resteAPayer, totalPaye } from "@/lib/paiements";
import { PERIODES, dansPeriode, statsParAssureur } from "@/lib/rentabilite";
import StatCard from "@/components/StatCard";

/**
 * RENTABILITÉ (v49, resserrée en v8.6).
 *
 * Le tableau « marge par dossier » a été RETIRÉ à la demande de
 * l'utilisateur : il reposait sur une saisie manuelle des heures passées
 * et du coût horaire, donc sur des chiffres que personne ne tient à jour.
 * ⚠️ Ne pas le réintroduire sans demande explicite.
 *
 * Reste ce qui se calcule tout seul et qui sert vraiment : combien on
 * facture, combien on a encaissé, et surtout QUI paie en combien de
 * temps. C'est la donnée à sortir quand un assureur discute les tarifs.
 */
export default function RentabilitePage() {
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [factures, setFactures] = useState<Document[]>([]);
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [periode, setPeriode] = useState<string>("annee");
  const [loading, setLoading] = useState(true);

  const charger = useCallback(async () => {
    const [d, doc, pay] = await Promise.all([
      supabase.from("dossiers").select("*"),
      supabase.from("documents").select("*").eq("type", "facture"),
      supabase.from("paiements").select("*"),
    ]);
    setDossiers((d.data as Dossier[]) || []);
    setFactures((doc.data as Document[]) || []);
    setPaiements((pay.data as Paiement[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const facturesPeriode = useMemo(
    () => factures.filter((f) => dansPeriode(f.date_document || f.created_at, periode)),
    [factures, periode]
  );

  const assureurs = useMemo(
    () => statsParAssureur(dossiers, facturesPeriode, paiements),
    [dossiers, facturesPeriode, paiements]
  );

  const caHt = facturesPeriode.reduce((s, f) => s + (Number(f.total_ht) || 0), 0);
  const caTtc = facturesPeriode.reduce((s, f) => s + (Number(f.total_ttc) || 0), 0);
  const encaisse = facturesPeriode.reduce(
    (s, f) => s + totalPaye(paiements.filter((p) => p.document_id === f.id)),
    0
  );
  const reste = facturesPeriode.reduce((s, f) => {
    const paye = totalPaye(paiements.filter((p) => p.document_id === f.id));
    return s + resteAPayer(f.total_ttc, paye);
  }, 0);

  const delaisConnus = assureurs.map((a) => a.delaiMoyen).filter((x): x is number => x !== null);
  const delaiMoyen =
    delaisConnus.length > 0
      ? Math.round(delaisConnus.reduce((s, x) => s + x, 0) / delaisConnus.length)
      : null;
  const facturesEnRetard = assureurs.reduce((s, a) => s + a.enRetard, 0);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titre-page">Rentabilité</h1>
          <p className="mt-1 text-xs text-white/50">
            Ce qui est facturé, ce qui est rentré, et qui vous fait attendre.
          </p>
        </div>
        <div className="segment">
          {PERIODES.map((p) => (
            <button
              key={p.code}
              onClick={() => setPeriode(p.code)}
              className={`segment-btn ${periode === p.code ? "actif" : ""}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          accent="pink"
          icone="🧾"
          label="Facturé"
          value={`${formatEuros(caHt)} HT`}
          hint={`${formatEuros(caTtc)} TTC · ${facturesPeriode.length} facture(s)`}
        />
        <StatCard accent="emerald" icone="💶" label="Encaissé" value={formatEuros(encaisse)} hint="TTC sur la période" />
        <StatCard
          accent={reste > 0 ? "amber" : "teal"}
          icone="⏳"
          label="Reste dû"
          value={formatEuros(reste)}
          hint={facturesEnRetard > 0 ? `${facturesEnRetard} facture(s) > 45 j` : "rien en retard"}
        />
        <StatCard
          accent="violet"
          icone="🏦"
          label="Délai d'encaissement"
          value={delaiMoyen === null ? "—" : `${delaiMoyen} j`}
          hint="moyenne des règlements reçus"
        />
      </div>

      <section className="glass-card p-3 sm:p-4">
        <h2 className="titre-section mb-1">Qui vous paie, et en combien de temps</h2>
        <p className="mb-3 text-xs text-white/45">
          Classement par délai moyen de règlement, le plus lent en tête.
        </p>

        {loading ? (
          <div className="space-y-2">
            <div className="skeleton h-10 w-full" />
            <div className="skeleton h-10 w-full" />
            <div className="skeleton h-10 w-full" />
          </div>
        ) : assureurs.length === 0 ? (
          <p className="py-6 text-center text-sm text-white/45">Aucune facture sur cette période.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-white/45">
                <tr>
                  <th className="cellule font-medium">Assurance</th>
                  <th className="cellule font-medium text-right">Dossiers</th>
                  <th className="cellule font-medium text-right">Facturé TTC</th>
                  <th className="cellule font-medium text-right">Reste dû</th>
                  <th className="cellule font-medium text-right">Délai moyen</th>
                </tr>
              </thead>
              <tbody>
                {assureurs.map((a) => (
                  <tr key={a.assureur} className="border-t border-white/5">
                    <td className="cellule">
                      <span className="font-medium text-white">{a.assureur}</span>
                      {a.enRetard > 0 && (
                        <span className="badge badge-danger ml-2">
                          {a.enRetard} facture{a.enRetard > 1 ? "s" : ""} en retard
                        </span>
                      )}
                    </td>
                    <td className="cellule text-right tabular-nums text-white/70">{a.dossiers}</td>
                    <td className="cellule text-right tabular-nums text-white/85">
                      {formatEuros(a.caTtc)}
                    </td>
                    <td className="cellule text-right tabular-nums">
                      <span className={a.resteDu > 0.01 ? "text-rose-300" : "text-white/45"}>
                        {formatEuros(a.resteDu)}
                      </span>
                    </td>
                    <td className="cellule text-right tabular-nums">
                      {a.delaiMoyen === null ? (
                        <span className="text-white/35">jamais soldé</span>
                      ) : (
                        <span
                          className={
                            a.delaiMoyen > 60
                              ? "badge badge-danger"
                              : a.delaiMoyen > 30
                                ? "badge badge-warn"
                                : "badge badge-ok"
                          }
                        >
                          {a.delaiMoyen} j
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
