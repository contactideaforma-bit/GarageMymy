"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  Dossier,
  Evenement,
  Document,
  Vehicule,
  Paiement,
  Relance,
  OrdreReparation,
  Restitution,
  CessionCreance,
} from "@/lib/types";
import { formatEuros, formatDate, formatDateTime, estActif } from "@/lib/format";
import { totalPaye, resteAPayer } from "@/lib/paiements";
import { calculeProchaineAction, URGENCE_STYLE } from "@/lib/actions";
import StatCard from "@/components/StatCard";
import StatutBadge from "@/components/StatutBadge";
import ProgressionDossier from "@/components/ProgressionDossier";
import GuideProcedure from "@/components/GuideProcedure";
import ConfigBanner from "@/components/ConfigBanner";

export default function DashboardPage() {
  const router = useRouter();
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [relances, setRelances] = useState<Relance[]>([]);
  const [ordres, setOrdres] = useState<OrdreReparation[]>([]);
  const [restitutions, setRestitutions] = useState<Restitution[]>([]);
  const [cessions, setCessions] = useState<CessionCreance[]>([]);
  const [pieces, setPieces] = useState<{ dossier_id: string; type: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [d, e, docs, v, p, r, ors, rests, cess, pcs] = await Promise.all([
        supabase.from("dossiers").select("*").order("created_at", { ascending: false }),
        supabase.from("evenements").select("*").order("date_evenement", { ascending: true }),
        supabase.from("documents").select("*").order("created_at", { ascending: false }),
        supabase.from("vehicules").select("*"),
        supabase.from("paiements").select("*"),
        supabase.from("relances").select("*").order("date_relance", { ascending: false }),
        supabase.from("ordres_reparation").select("*"),
        supabase.from("restitutions").select("*"),
        supabase.from("cessions_creance").select("*"),
        supabase.from("pieces_dossier").select("dossier_id,type"),
      ]);
      if (d.data) setDossiers(d.data as Dossier[]);
      if (e.data) setEvenements(e.data as Evenement[]);
      if (docs.data) setDocuments(docs.data as Document[]);
      if (v.data) setVehicules(v.data as Vehicule[]);
      if (p.data) setPaiements(p.data as Paiement[]);
      if (r.data) setRelances(r.data as Relance[]);
      setOrdres((ors.data as OrdreReparation[]) || []);
      setRestitutions((rests.data as Restitution[]) || []);
      setCessions((cess.data as CessionCreance[]) || []);
      setPieces((pcs.data as { dossier_id: string; type: string }[]) || []);
      setLoading(false);
    })();
  }, []);

  const enCours = dossiers.filter((d) => estActif(d.statut));

  const now = new Date();
  // Véhicules présents au garage : cases "au garage" cochées (dossiers + véhicules hors dossier)
  const presentsDossiers = dossiers.filter((d) => d.au_garage);
  const presentsLibres = vehicules.filter((v) => v.au_garage);
  const presentsCount = presentsDossiers.length + presentsLibres.length;
  const factures = documents.filter((f) => f.type === "facture");
  // Total des factures créées le mois en cours
  const totalMois = factures
    .filter((f) => {
      const ref = f.date_document || f.created_at;
      if (!ref) return false;
      const dt = new Date(ref);
      return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
    })
    .reduce((sum, f) => sum + (Number(f.total_ttc) || 0), 0);

  // Reste à encaisser : somme des restes sur toutes les factures
  const resteEncaisser = factures.reduce((sum, f) => {
    const paye = totalPaye(paiements.filter((p) => p.document_id === f.id));
    return sum + resteAPayer(f.total_ttc, paye);
  }, 0);

  // Total encaissé ce mois : somme des paiements du mois en cours
  const encaisseMois = paiements
    .filter((p) => {
      if (!p.date_paiement) return false;
      const dt = new Date(p.date_paiement);
      return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
    })
    .reduce((sum, p) => sum + (Number(p.montant) || 0), 0);

  const aVenir = evenements.filter((e) => new Date(e.date_evenement) >= now);
  const passes = evenements.filter((e) => new Date(e.date_evenement) < now).reverse();

  // À FAIRE AUJOURD'HUI : le moteur « prochaine action » analyse chaque
  // dossier en cours et remonte ce qui demande une intervention.
  const aFaire = enCours
    .map((d) => ({
      dossier: d,
      action: calculeProchaineAction({
        dossier: d,
        documents: documents.filter((x) => x.dossier_id === d.id),
        paiements: paiements.filter((x) => x.dossier_id === d.id),
        relances: relances.filter((x) => x.dossier_id === d.id),
        ordres: ordres.filter((x) => x.dossier_id === d.id),
        restitutions: restitutions.filter((x) => x.dossier_id === d.id),
        cessions: cessions.filter((x) => x.dossier_id === d.id),
        pieces: pieces.filter((x) => x.dossier_id === d.id),
      }),
    }))
    .filter((x): x is { dossier: Dossier; action: NonNullable<ReturnType<typeof calculeProchaineAction>> } =>
      Boolean(x.action && x.action.urgence !== "attente")
    )
    .sort((a, b) => (a.action.urgence === "haute" ? -1 : 0) - (b.action.urgence === "haute" ? -1 : 0));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-white">Tableau de bord</h1>
        <Link href="/import" className="btn-primary">Importer un rapport</Link>
      </div>

      <ConfigBanner />

      {/* HUD : les 4 compteurs du garage */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Link href="/vehicules">
          <StatCard accent="teal" label="Véhicules au garage" value={String(presentsCount)} hint="actuellement présents" />
        </Link>
        <Link href="/sinistres">
          <StatCard accent="violet" label="Dossiers en cours" value={String(enCours.length)} hint="sinistres actifs" />
        </Link>
        <Link href="/factures">
          <StatCard
            accent="pink"
            label="Facturé ce mois"
            value={formatEuros(totalMois)}
            hint={now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
          />
        </Link>
        <Link href="/finance">
          <StatCard
            accent="emerald"
            label="Encaissé ce mois"
            value={formatEuros(encaisseMois)}
            hint={`reste à encaisser : ${formatEuros(resteEncaisser)}`}
          />
        </Link>
      </div>

      {/* À faire aujourd'hui : guidage automatique selon le processus */}
      {!loading && aFaire.length > 0 && (
        <section className="glass-card p-5 mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-white">
              À faire aujourd&apos;hui
              <span className="ml-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">
                {aFaire.length}
              </span>
            </h2>
            <span className="font-pixel text-[0.5rem] text-white/40">GUIDE AUTO</span>
          </div>
          <ul className="divide-y divide-white/10">
            {aFaire.slice(0, 6).map(({ dossier: d, action }) => {
              const st = URGENCE_STYLE[action.urgence];
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${st.badge}`}>
                        {st.label}
                      </span>
                      <span className="font-medium text-white">{action.titre}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-white/50 truncate">
                      {d.client_nom || "—"} · {d.marque_modele || ""}
                      {d.immatriculation ? ` (${d.immatriculation})` : ""} · dossier {d.numero_sinistre || "—"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Link href={`/sinistres/${d.id}`} className="text-white/50 hover:text-white hover:underline">
                      Dossier
                    </Link>
                    <Link href={action.href} className="btn-ghost py-1.5 px-3 text-xs">
                      {action.ctaLabel}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
          {aFaire.length > 6 && (
            <p className="mt-2 text-xs text-white/40">
              + {aFaire.length - 6} autre{aFaire.length - 6 > 1 ? "s" : ""} action{aFaire.length - 6 > 1 ? "s" : ""} — ouvre les dossiers concernés depuis la liste ci-dessous.
            </p>
          )}
        </section>
      )}

      <div className="space-y-6">
        <section className="glass-card">
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
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="font-semibold text-white">Agenda</h2>
            <Link href="/agenda" className="text-sm text-accent-pink hover:underline">Ouvrir l&apos;agenda</Link>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
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

        {/* Guide du processus sinistre (repliable) */}
        <GuideProcedure />
      </div>
    </div>
  );
}
