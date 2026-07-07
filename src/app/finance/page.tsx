"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Document, Dossier, Paiement, Relance } from "@/lib/types";
import { formatEuros, formatDate } from "@/lib/format";
import {
  totalPaye,
  statutPaiement,
  resteAPayer,
  enRetard,
  labelCanal,
  STATUT_PAIEMENT,
  StatutPaiementKey,
  templateRelance,
} from "@/lib/paiements";
import StatCard from "@/components/StatCard";
import ConfigBanner from "@/components/ConfigBanner";
import EmailComposer from "@/components/EmailComposer";
import { destinataireRelance } from "@/lib/dossierSync";

type Row = Document & {
  dossier: Dossier | null;
  paiements: Paiement[];
  relances: Relance[];
};

type Filtre = "tous" | "impaye" | "partiel" | "paye" | "retard";

export default function FinancePage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [emailRow, setEmailRow] = useState<{ row: Row; to: string; pro: boolean } | null>(null);

  async function ouvrirRelance(r: Row) {
    if (!r.dossier) return;
    const dest = await destinataireRelance(r.dossier);
    setEmailRow({ row: r, ...dest });
  }

  const load = useCallback(() => {
    (async () => {
      setLoading(true);
      const [docsRes, payRes, relRes] = await Promise.all([
        supabase.from("documents").select("*, dossier:dossiers(*)").eq("type", "facture").order("date_document", { ascending: false }),
        supabase.from("paiements").select("*"),
        supabase.from("relances").select("*").order("date_relance", { ascending: false }),
      ]);
      const docs = (docsRes.data as (Document & { dossier: Dossier | null })[]) || [];
      const paiements = (payRes.data as Paiement[]) || [];
      const relances = (relRes.data as Relance[]) || [];
      setRows(
        docs.map((d) => ({
          ...d,
          paiements: paiements.filter((p) => p.document_id === d.id),
          relances: relances.filter((r) => r.document_id === d.id),
        }))
      );
      setLoading(false);
    })();
  }, []);

  useEffect(() => { load(); }, [load]);

  const enrichies = useMemo(
    () =>
      rows.map((r) => {
        const paye = totalPaye(r.paiements);
        const reste = resteAPayer(r.total_ttc, paye);
        const sp = statutPaiement(r.total_ttc, paye);
        const retard = enRetard(r, reste);
        return { ...r, paye, reste, sp, retard };
      }),
    [rows]
  );

  const kpi = useMemo(() => {
    let facture = 0, encaisse = 0, reste = 0, retardMontant = 0, retardCount = 0;
    for (const r of enrichies) {
      facture += Number(r.total_ttc) || 0;
      encaisse += r.paye;
      reste += r.reste;
      if (r.retard) {
        retardMontant += r.reste;
        retardCount += 1;
      }
    }
    return { facture, encaisse, reste, retardMontant, retardCount };
  }, [enrichies]);

  const filtrees = enrichies.filter((r) => {
    if (filtre === "tous") return true;
    if (filtre === "retard") return r.retard;
    return r.sp === (filtre as StatutPaiementKey);
  });

  const FILTRES: { key: Filtre; label: string }[] = [
    { key: "tous", label: "Toutes" },
    { key: "impaye", label: "Impayées" },
    { key: "partiel", label: "Partielles" },
    { key: "paye", label: "Payées" },
    { key: "retard", label: "En retard" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white mb-6">Finance</h1>
      <ConfigBanner />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total facturé" value={formatEuros(kpi.facture)} hint="toutes factures · TTC" />
        <StatCard label="Encaissé" value={formatEuros(kpi.encaisse)} hint="TTC" />
        <StatCard label="Reste à encaisser" value={formatEuros(kpi.reste)} hint="TTC" />
        <StatCard
          label="En retard"
          value={formatEuros(kpi.retardMontant)}
          hint={`${kpi.retardCount} facture${kpi.retardCount > 1 ? "s" : ""}`}
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTRES.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltre(f.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filtre === f.key ? "bg-white/20 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-white/50">
            <tr>
              <th className="px-5 py-3 font-medium">Facture</th>
              <th className="px-5 py-3 font-medium">Client</th>
              <th className="px-5 py-3 font-medium">Échéance</th>
              <th className="px-5 py-3 font-medium">Statut</th>
              <th className="px-5 py-3 font-medium text-right">Total TTC</th>
              <th className="px-5 py-3 font-medium text-right">Encaissé</th>
              <th className="px-5 py-3 font-medium text-right">Reste</th>
              <th className="px-5 py-3 font-medium">Relances</th>
              <th className="px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} className="px-5 py-8 text-center text-white/40">Chargement…</td></tr>
            )}
            {!loading && filtrees.length === 0 && (
              <tr><td colSpan={9} className="px-5 py-8 text-center text-white/40">Aucune facture pour ce filtre.</td></tr>
            )}
            {filtrees.map((r) => {
              const derniere = r.relances[0];
              return (
                <tr key={r.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-5 py-3 font-medium text-white">{r.numero || "—"}</td>
                  <td className="px-5 py-3 text-white/80">{r.dossier?.client_nom || "—"}</td>
                  <td className={`px-5 py-3 ${r.retard ? "text-rose-300" : "text-white/80"}`}>
                    {formatDate(r.date_echeance)}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUT_PAIEMENT[r.sp].badge}`}>
                      {STATUT_PAIEMENT[r.sp].label}
                    </span>
                    {r.retard && (
                      <span className="ml-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-rose-500/20 text-rose-200">
                        retard
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-white/90">{formatEuros(r.total_ttc)}</td>
                  <td className="px-5 py-3 text-right text-emerald-300">{formatEuros(r.paye)}</td>
                  <td className={`px-5 py-3 text-right ${r.reste > 0 ? "text-amber-300" : "text-white/50"}`}>
                    {formatEuros(r.reste)}
                  </td>
                  <td className="px-5 py-3 text-white/60 text-xs">
                    {r.relances.length === 0
                      ? "—"
                      : `${r.relances.length} · ${labelCanal(derniere.canal)} ${formatDate(derniere.date_relance)}`}
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    {r.dossier ? (
                      <>
                        {r.reste > 0 && (
                          <button
                            onClick={() => ouvrirRelance(r)}
                            className="text-accent-pink hover:underline mr-3"
                            title={
                              r.relances.length >= 2
                                ? "Mise en demeure"
                                : r.relances.length === 1
                                  ? "Relance ferme (n°2)"
                                  : "Première relance"
                            }
                          >
                            Relancer
                          </button>
                        )}
                        <button
                          onClick={() => router.push(`/sinistres/${r.dossier!.id}`)}
                          className="text-accent-teal hover:underline"
                        >
                          Gérer
                        </button>
                      </>
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

      <p className="mt-4 text-xs text-white/40">
        « Relancer » adapte automatiquement le ton : 1ʳᵉ relance courtoise, 2ᵉ ferme, puis mise en demeure.
        Les paiements se saisissent depuis la fiche du dossier (bouton « Gérer »).{" "}
        <Link href="/sinistres" className="text-accent-pink hover:underline">Voir les dossiers</Link>
      </p>

      {emailRow && emailRow.row.dossier && (
        <EmailComposer
          dossier={emailRow.row.dossier}
          document={emailRow.row}
          defaultTo={emailRow.to}
          defaultSubject={
            templateRelance(emailRow.row.relances.length + 1, emailRow.row, emailRow.row.dossier, emailRow.pro).subject
          }
          defaultBody={
            templateRelance(emailRow.row.relances.length + 1, emailRow.row, emailRow.row.dossier, emailRow.pro).body
          }
          onClose={() => setEmailRow(null)}
          onSent={async () => {
            await supabase.from("relances").insert({
              dossier_id: emailRow.row.dossier!.id,
              document_id: emailRow.row.id,
              date_relance: new Date().toISOString().slice(0, 10),
              canal: "email",
              notes: `Relance n°${emailRow.row.relances.length + 1} envoyée par email`,
            });
            load();
          }}
        />
      )}
    </div>
  );
}
