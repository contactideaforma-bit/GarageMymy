"use client";

/* ====================================================================
 *  RÉPARATEURS — FICHE DE COMPORTEMENT (mode expert, v13.25)
 *
 *  Pour chaque garage, à partir des contrôles : devis conformes du 1er
 *  coup, écart moyen devis / pré-rapport, montant non retenu, motifs de
 *  refus récurrents, délai de réponse, factures non conformes.
 *  Un argument concret face aux assureurs et aux garages agréés.
 * ==================================================================== */

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import StatCard from "@/components/StatCard";
import { EnTete, Vide } from "@/components/expert/ui";
import { chargerDossiers } from "@/lib/expertise/data";
import { chargerControles } from "@/lib/expertise/controleData";
import { Controle, StatsReparateur, cleGarage, statsReparateurs } from "@/lib/expertise/controle";
import { DossierExpert } from "@/lib/expertise/types";
import { formatDate, formatEuros } from "@/lib/format";

type Tri = "controles" | "conformite" | "ecart" | "nonRetenu" | "delai";

export default function PageReparateurs() {
  const [controles, setControles] = useState<Controle[]>([]);
  const [dossiers, setDossiers] = useState<DossierExpert[]>([]);
  const [chargement, setChargement] = useState(true);
  const [tri, setTri] = useState<Tri>("controles");
  const [ouvert, setOuvert] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([chargerControles(), chargerDossiers()]).then(([c, d]) => { setControles(c.controles); setDossiers(d.dossiers); setChargement(false); });
  }, []);

  const stats = useMemo(() => {
    const l = statsReparateurs(controles, dossiers);
    const val = (s: StatsReparateur) => ({ controles: s.controles + s.factures, conformite: s.tauxConformite ?? -1, ecart: s.ecartMoyenPct ?? -999, nonRetenu: s.nonRetenu, delai: s.delaiReponseJours ?? -1 })[tri];
    return [...l].sort((a, b) => val(b) - val(a));
  }, [controles, dossiers, tri]);

  const global = useMemo(() => {
    const avecTaux = stats.filter((s) => s.tauxConformite !== null);
    return {
      garages: stats.length,
      nonRetenu: stats.reduce((a, s) => a + s.nonRetenu, 0),
      conformite: avecTaux.length ? Math.round(avecTaux.reduce((a, s) => a + (s.tauxConformite || 0), 0) / avecTaux.length) : null,
      factures: stats.reduce((a, s) => a + s.facturesNonConformes, 0),
    };
  }, [stats]);

  const dossiersDe = (cle: string) => dossiers.filter((d) => cleGarage(d) === cle);
  const entete = (code: Tri, label: string, num = true) => (
    <th className={`${num ? "num" : ""} cursor-pointer select-none`} onClick={() => setTri(code)}>{label}{tri === code ? " ▾" : ""}</th>
  );

  return (
    <div className="space-y-4">
      <EnTete titre="Réparateurs" sousTitre="Comment chaque garage chiffre, d'après tes contrôles de devis et de factures." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Réparateurs suivis" value={String(global.garages)} accent="blue" />
        <StatCard label="Conformes du 1er coup" value={global.conformite === null ? "—" : `${global.conformite} %`} hint="moyenne des garages" accent="emerald" />
        <StatCard label="Non retenu (HT)" value={formatEuros(global.nonRetenu)} hint="devis et factures − retenu" accent="teal" />
        <StatCard label="Factures non conformes" value={String(global.factures)} accent="amber" />
      </div>

      {chargement ? <div className="skeleton h-40 rounded-2xl" /> : stats.length === 0 ? (
        <div className="glass-card p-4"><Vide titre="Pas encore de statistiques" texte="Elles se construisent toutes seules au fil des contrôles de devis." action={<Link href="/expert/controles" className="btn-primary">Devis à contrôler</Link>} /></div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="al-table">
            <thead>
              <tr>
                <th>Réparateur</th>
                {entete("controles", "Contrôles")}
                {entete("conformite", "Conformes 1er coup")}
                {entete("ecart", "Écart devis moyen")}
                {entete("nonRetenu", "Non retenu HT")}
                {entete("delai", "Délai de réponse")}
                <th>Refus fréquent</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <Fragment key={s.cle}>
                  <tr className="cursor-pointer hover:bg-white/5" onClick={() => setOuvert((o) => (o === s.cle ? null : s.cle))}>
                    <td>
                      <div className="font-semibold">{s.nom}</div>
                      <div className="text-xs text-white/50">dernier contrôle {formatDate(s.dernier)}</div>
                    </td>
                    <td className="num">{s.controles}{s.factures ? <span className="text-xs text-white/50"> + {s.factures} fact.</span> : null}</td>
                    <td className="num">
                      {s.tauxConformite === null ? "—" : (
                        <span className={s.tauxConformite >= 70 ? "text-emerald-600" : s.tauxConformite >= 40 ? "text-amber-600" : "text-rose-600"}><b>{s.tauxConformite} %</b></span>
                      )}
                    </td>
                    <td className="num">{s.ecartMoyenPct === null ? "—" : <span className={s.ecartMoyenPct > 10 ? "text-rose-600" : ""}>{s.ecartMoyenPct > 0 ? "+" : ""}{s.ecartMoyenPct} %</span>}</td>
                    <td className="num font-semibold">{formatEuros(s.nonRetenu)}</td>
                    <td className="num">{s.delaiReponseJours === null ? "—" : `${s.delaiReponseJours} j`}</td>
                    <td className="max-w-[16rem] truncate text-sm">{s.motifs[0] ? `${s.motifs[0].motif} (${s.motifs[0].n})` : "—"}</td>
                  </tr>
                  {ouvert === s.cle && (
                    <tr>
                      <td colSpan={7} className="bg-white/5">
                        <div className="grid grid-cols-1 gap-3 p-2 text-sm md:grid-cols-3">
                          <div>
                            <div className="text-[11px] uppercase tracking-wider text-white/45">Décisions</div>
                            <div>{s.acceptes} écart(s) accepté(s) · {s.refus} refusé(s)</div>
                            <div>{s.factures} facture(s) contrôlée(s), {s.facturesNonConformes} non conforme(s)</div>
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-wider text-white/45">Motifs de refus</div>
                            {s.motifs.length ? <ul>{s.motifs.map((m) => <li key={m.motif}>{m.motif} · {m.n}</li>)}</ul> : <div className="text-white/50">aucun motif saisi</div>}
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-wider text-white/45">Dossiers</div>
                            <ul>{dossiersDe(s.cle).slice(0, 6).map((d) => <li key={d.id}><Link href={`/expert/dossiers/${d.id}?onglet=controle`} className="hover:underline">{d.immatriculation || d.numero}</Link></li>)}</ul>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-white/45">« Conformes du 1er coup » : premier devis contrôlé sans aucun point refusé. « Écart devis moyen » : devis du garage comparé au pré-rapport, au premier tour.</p>
    </div>
  );
}
