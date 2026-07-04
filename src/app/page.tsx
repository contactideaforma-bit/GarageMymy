"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Dossier, Evenement, Document, Vehicule, Paiement, Relance } from "@/lib/types";
import { formatEuros, formatDate, formatDateTime, estActif } from "@/lib/format";
import { totalPaye, resteAPayer } from "@/lib/paiements";
import StatCard from "@/components/StatCard";
import StatutBadge from "@/components/StatutBadge";
import ProgressionDossier from "@/components/ProgressionDossier";
import ConfigBanner from "@/components/ConfigBanner";

export default function DashboardPage() {
  const router = useRouter();
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [relances, setRelances] = useState<Relance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [d, e, docs, v, p, r] = await Promise.all([
        supabase.from("dossiers").select("*").order("created_at", { ascending: false }),
        supabase.from("evenements").select("*").order("date_evenement", { ascending: true }),
        supabase.from("documents").select("*").eq("type", "facture"),
        supabase.from("vehicules").select("*"),
        supabase.from("paiements").select("*"),
        supabase.from("relances").select("*").order("date_relance", { ascending: false }),
      ]);
      if (d.data) setDossiers(d.data as Dossier[]);
      if (e.data) setEvenements(e.data as Evenement[]);
      if (docs.data) setDocuments(docs.data as Document[]);
      if (v.data) setVehicules(v.data as Vehicule[]);
      if (p.data) setPaiements(p.data as Paiement[]);
      if (r.data) setRelances(r.data as Relance[]);
      setLoading(false);
    })();
  }, []);

  const enCours = dossiers.filter((d) => estActif(d.statut));

  const now = new Date();
  // Véhicules présents au garage : cases "au garage" cochées (dossiers + véhicules hors dossier)
  const presentsDossiers = dossiers.filter((d) => d.au_garage);
  const presentsLibres = vehicules.filter((v) => v.au_garage);
  const presentsCount = presentsDossiers.length + presentsLibres.length;
  // Total des factures créées le mois en cours
  const totalMois = documents
    .filter((f) => {
      const ref = f.date_document || f.created_at;
      if (!ref) return false;
      const dt = new Date(ref);
      return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
    })
    .reduce((sum, f) => sum + (Number(f.total_ttc) || 0), 0);

  // Reste à encaisser : somme des restes sur toutes les factures
  const resteEncaisser = documents.reduce((sum, f) => {
    const paye = totalPaye(paiements.filter((p) => p.document_id === f.id));
    return sum + resteAPayer(f.total_ttc, paye);
  }, 0);

  const aVenir = evenements.filter((e) => new Date(e.date_evenement) >= now);
  const passes = evenements.filter((e) => new Date(e.date_evenement) < now).reverse();

  // À relancer aujourd'hui : échéance dépassée, reste à payer, et pas de
  // relance depuis 7 jours (ou jamais relancée).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const aRelancer = documents
    .map((f) => {
      const paye = totalPaye(paiements.filter((p) => p.document_id === f.id));
      const reste = resteAPayer(f.total_ttc, paye);
      const rels = relances.filter((r) => r.document_id === f.id);
      const dossier = dossiers.find((d) => d.id === f.dossier_id) || null;
      return { f, reste, rels, dossier };
    })
    .filter(({ f, reste, rels }) => {
      if (reste <= 0 || !f.date_echeance) return false;
      const ech = new Date(f.date_echeance);
      if (isNaN(ech.getTime()) || ech >= today) return false;
      const derniere = rels[0]?.date_relance ? new Date(rels[0].date_relance!) : null;
      return !derniere || (today.getTime() - derniere.getTime()) / 86400000 >= 7;
    })
    .sort((a, b) => b.reste - a.reste);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-white">Tableau de bord</h1>
        <Link href="/import" className="btn-primary">Importer un rapport</Link>
      </div>

      <ConfigBanner />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Véhicules au garage" value={String(presentsCount)} hint="actuellement présents" />
        <StatCard label="Dossiers en cours" value={String(enCours.length)} />
        <StatCard
          label="Total facturé (mois en cours)"
          value={formatEuros(totalMois)}
          hint={now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
        />
        <Link href="/finance">
          <StatCard label="Reste à encaisser" value={formatEuros(resteEncaisser)} hint="toutes factures" />
        </Link>
      </div>

      {/* À relancer aujourd'hui */}
      {aRelancer.length > 0 && (
        <section className="glass-card p-5 mb-8 border border-amber-400/30">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-white">
              À relancer aujourd&apos;hui
              <span className="ml-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">
                {aRelancer.length}
              </span>
            </h2>
            <Link href="/finance" className="text-sm text-accent-pink hover:underline">Tout gérer</Link>
          </div>
          <ul className="divide-y divide-white/10">
            {aRelancer.slice(0, 5).map(({ f, reste, rels, dossier }) => {
              const joursRetard = Math.floor((today.getTime() - new Date(f.date_echeance!).getTime()) / 86400000);
              const niveau = rels.length + 1;
              return (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <span className="font-medium text-white">{f.numero || "Facture"}</span>
                    <span className="text-white/50">
                      {" "}· {dossier?.client_nom || "—"}{dossier?.assureur ? ` · ${dossier.assureur}` : ""}
                    </span>
                    <div className="text-xs text-white/40">
                      En retard de {joursRetard} j · {rels.length === 0 ? "jamais relancée" : `${rels.length} relance${rels.length > 1 ? "s" : ""}`}
                      {" "}· prochaine étape : {niveau >= 3 ? "mise en demeure" : `relance n°${niveau}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-amber-300">{formatEuros(reste)}</span>
                    <Link href="/finance" className="text-accent-teal hover:underline">Relancer</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Visuel : véhicules présents au garage */}
      <section className="glass-card p-5 mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-white">Véhicules présents au garage</h2>
          <Link href="/vehicules" className="text-sm text-accent-pink hover:underline">Gérer</Link>
        </div>
        {presentsCount === 0 ? (
          <p className="text-sm text-white/40">Aucun véhicule présent. Coche « au garage » dans l&apos;onglet Véhicules.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {presentsDossiers.map((d) => (
              <button
                key={d.id}
                onClick={() => router.push(`/sinistres/${d.id}`)}
                className="glass-soft px-4 py-3 text-left hover:bg-white/10 transition-colors min-w-[12rem]"
              >
                <div className="mt-1 text-sm font-medium text-white truncate">
                  {d.marque_modele || d.numero_sinistre || "Véhicule"}
                </div>
                <div className="text-xs text-white/50 truncate">
                  {d.immatriculation || "—"}{d.reparateur ? ` · ${d.reparateur}` : ""}
                </div>
              </button>
            ))}
            {presentsLibres.map((v) => (
              <div key={v.id} className="glass-soft px-4 py-3 min-w-[12rem]">
                <div className="mt-1 text-sm font-medium text-white truncate">{v.marque_modele || "Véhicule"}</div>
                <div className="text-xs text-white/50 truncate">
                  {v.immatriculation || "—"}{v.proprietaire ? ` · ${v.proprietaire}` : ""} · hors dossier
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 glass-card">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="font-semibold text-white">Dossiers en cours</h2>
            <Link href="/sinistres" className="text-sm text-accent-pink hover:underline">
              Voir tout
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-white/50">
                <tr>
                  <th className="px-5 py-2 font-medium">N° sinistre</th>
                  <th className="px-5 py-2 font-medium">Client</th>
                  <th className="px-5 py-2 font-medium">Véhicule</th>
                  <th className="px-5 py-2 font-medium">Statut</th>
                  <th className="px-5 py-2 font-medium text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={5} className="px-5 py-6 text-center text-white/40">Chargement…</td></tr>
                )}
                {!loading && enCours.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-6 text-center text-white/40">Aucun dossier en cours.</td></tr>
                )}
                {enCours.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => router.push(`/sinistres/${d.id}`)}
                    className="border-t border-white/5 hover:bg-white/5 cursor-pointer"
                  >
                    <td className="px-5 py-3 font-medium text-white">{d.numero_sinistre || "—"}</td>
                    <td className="px-5 py-3 text-white/80">{d.client_nom || "—"}</td>
                    <td className="px-5 py-3 text-white/80">
                      {d.marque_modele || "—"}{d.immatriculation ? ` (${d.immatriculation})` : ""}
                    </td>
                    <td className="px-5 py-3">
                      <StatutBadge statut={d.statut} />
                      <div className="mt-1.5 w-32">
                        <ProgressionDossier statut={d.statut} size="sm" />
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-white/90">{formatEuros(d.montant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="glass-card">
          <div className="px-5 py-4 border-b border-white/10">
            <h2 className="font-semibold text-white">Agenda</h2>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <div className="text-xs font-semibold uppercase text-white/40 mb-2">À venir</div>
              {aVenir.length === 0 && <p className="text-sm text-white/40">Aucun événement.</p>}
              <ul className="space-y-2">
                {aVenir.slice(0, 5).map((e) => (
                  <li key={e.id} className="text-sm">
                    <div className="font-medium text-white">{e.titre}</div>
                    <div className="text-white/40 text-xs">{formatDateTime(e.date_evenement)}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-white/40 mb-2">Passés</div>
              {passes.length === 0 && <p className="text-sm text-white/40">Aucun événement.</p>}
              <ul className="space-y-2">
                {passes.slice(0, 3).map((e) => (
                  <li key={e.id} className="text-sm opacity-60">
                    <div className="font-medium text-white">{e.titre}</div>
                    <div className="text-white/40 text-xs">{formatDate(e.date_evenement)}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
