"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ActionFaite,
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
import { formatEuros, formatDate, formatDateTime, estActif, messageErreur } from "@/lib/format";
import { totalPaye, resteAPayer } from "@/lib/paiements";
import { ProchaineAction, calculeProchaineAction, URGENCE_STYLE } from "@/lib/actions";
import {
  annulerActionFaite,
  cleAction,
  estActionFaite,
  marquerActionFaite,
  marquesObsoletes,
  purgerMarques,
} from "@/lib/aFaire";
import { useMetier } from "@/components/MetierProvider";
import { termes } from "@/lib/metier";
import StatCard from "@/components/StatCard";
import StatutBadge from "@/components/StatutBadge";
import ProgressionDossier from "@/components/ProgressionDossier";
import GuideProcedure from "@/components/GuideProcedure";
import Ardoise from "@/components/Ardoise";
import ConfigBanner from "@/components/ConfigBanner";

export default function DashboardPage() {
  const router = useRouter();
  const { metier } = useMetier();
  const t = termes(metier);
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
  const [demandes, setDemandes] = useState<{ dossier_id: string; demande: string; date_envoi: string | null }[]>([]);
  // Actions cochées « faites » sur le tableau de bord (v35)
  const [faites, setFaites] = useState<ActionFaite[]>([]);
  const [voirFaites, setVoirFaites] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [d, e, docs, v, p, r, ors, rests, cess, pcs, dem, af] = await Promise.all([
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
        supabase.from("demandes_assurance").select("dossier_id,demande,date_envoi"),
        // Migration v35 non exécutée => erreur ignorée, la liste reste utilisable
        supabase.from("actions_faites").select("*"),
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
      setDemandes((dem.data as { dossier_id: string; demande: string; date_envoi: string | null }[]) || []);
      setFaites((af.data as ActionFaite[]) || []);
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

  // Contexte du dossier rattaché à un événement : « Envoyer la facture » tout
  // seul ne dit pas DE QUEL dossier il s'agit. On affiche véhicule,
  // immatriculation et client, et la ligne devient cliquable.
  const dossierParId = useMemo(() => {
    const m = new Map<string, Dossier>();
    for (const d of dossiers) m.set(d.id, d);
    return m;
  }, [dossiers]);

  const contexteEvenement = (dossierId: string | null): string => {
    if (!dossierId) return "";
    const d = dossierParId.get(dossierId);
    if (!d) return "";
    return [d.marque_modele, d.immatriculation, d.client_nom].filter(Boolean).join(" · ");
  };

  // Une ligne d'agenda : titre + date à droite, dossier concerné en dessous.
  const renderEvenement = (e: Evenement, passe = false) => {
    const ctx = contexteEvenement(e.dossier_id);
    const contenu = (
      <>
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-medium text-white">{e.titre}</span>
          <span className="shrink-0 text-[11px] text-white/45">
            {passe ? formatDate(e.date_evenement) : formatDateTime(e.date_evenement)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-white/55">
          {ctx || "Sans dossier rattaché"}
        </span>
      </>
    );
    return (
      <li key={e.id} className={passe ? "opacity-70" : ""}>
        {e.dossier_id ? (
          <button
            onClick={() => router.push(`/sinistres/${e.dossier_id}`)}
            className="glass-soft block w-full rounded-lg p-2.5 text-left transition hover:brightness-105"
            title={`${e.titre}${ctx ? ` — ${ctx}` : ""}`}
          >
            {contenu}
          </button>
        ) : (
          <div className="glass-soft rounded-lg p-2.5">{contenu}</div>
        )}
      </li>
    );
  };

  const aVenir = evenements.filter((e) => new Date(e.date_evenement) >= now);
  const passes = evenements.filter((e) => new Date(e.date_evenement) < now).reverse();

  // À FAIRE AUJOURD'HUI : le moteur « prochaine action » analyse chaque
  // dossier en cours et remonte ce qui demande une intervention.
  // useMemo : la liste sert aussi de référence à l'effet de purge ci-dessous.
  const aFaireTous = useMemo(
    () =>
      dossiers
        .filter((d) => estActif(d.statut))
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
            demandes: demandes.filter((x) => x.dossier_id === d.id),
            metier,
          }),
        }))
        .filter((x): x is { dossier: Dossier; action: ProchaineAction } =>
          Boolean(x.action && x.action.urgence !== "attente")
        )
        .sort((a, b) => (a.action.urgence === "haute" ? -1 : 0) - (b.action.urgence === "haute" ? -1 : 0)),
    [dossiers, documents, paiements, relances, ordres, restitutions, cessions, pieces, demandes, metier]
  );

  // NETTOYAGE : une coche ne survit pas à l'avancement du dossier. Dès que le
  // code d'action change (le travail a réellement été fait), la marque devient
  // obsolète et disparaît — sinon la même action, revenue plus tard, resterait
  // masquée à tort.
  useEffect(() => {
    if (loading || faites.length === 0) return;
    const valides = new Set(aFaireTous.map((x) => cleAction(x.dossier.id, x.action.code)));
    const obsoletes = marquesObsoletes(faites, valides);
    if (obsoletes.length === 0) return;
    setFaites((prev) => prev.filter((f) => valides.has(cleAction(f.dossier_id, f.code))));
    purgerMarques(obsoletes.map((f) => f.id).filter((id) => !id.startsWith("temp-")));
  }, [loading, aFaireTous, faites]);

  const aFaire = aFaireTous.filter((x) => !estActionFaite(faites, x.dossier.id, x.action.code));
  const dejaFaites = aFaireTous.filter((x) => estActionFaite(faites, x.dossier.id, x.action.code));

  // Coche / décoche une action. Mise à jour optimiste + rollback si erreur.
  const basculerFait = useCallback(
    async (dossierId: string, action: ProchaineAction, fait: boolean) => {
      const avant = faites;
      if (fait) {
        const provisoire: ActionFaite = {
          id: `temp-${dossierId}-${action.code}`,
          created_at: new Date().toISOString(),
          dossier_id: dossierId,
          code: action.code,
          fait_le: new Date().toISOString(),
        };
        setFaites((prev) => [...prev, provisoire]);
        try {
          const ligne = await marquerActionFaite(dossierId, action.code);
          setFaites((prev) => prev.map((f) => (f.id === provisoire.id ? ligne : f)));
        } catch (err) {
          setFaites(avant);
          alert(messageErreur(err, "Impossible de marquer cette action comme faite (migration v35 exécutée ?)."));
        }
      } else {
        setFaites((prev) => prev.filter((f) => !(f.dossier_id === dossierId && f.code === action.code)));
        try {
          await annulerActionFaite(dossierId, action.code);
        } catch (err) {
          setFaites(avant);
          alert(messageErreur(err, "Impossible de décocher cette action."));
        }
      }
    },
    [faites]
  );

  // Une ligne de la liste (fonction de rendu, pas un sous-composant : un
  // composant redéclaré à chaque rendu serait remonté à chaque clic).
  const renderAction = (d: Dossier, action: ProchaineAction, fait: boolean) => {
    const st = URGENCE_STYLE[action.urgence];
    return (
      <li
        key={`${d.id}-${action.code}`}
        className={`flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm ${fait ? "opacity-50" : ""}`}
      >
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={fait}
            onChange={(e) => basculerFait(d.id, action, e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-emerald-500"
            title={fait ? "Remettre dans la liste à faire" : "Marquer comme fait"}
          />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              {!fait && (
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${st.badge}`}>
                  {st.label}
                </span>
              )}
              <span className={`font-medium text-white ${fait ? "line-through" : ""}`}>{action.titre}</span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-white/50">
              {d.client_nom || "—"} · {d.marque_modele || ""}
              {d.immatriculation ? ` (${d.immatriculation})` : ""} · dossier {d.numero_sinistre || "—"}
            </span>
          </span>
        </label>
        <span className="flex shrink-0 items-center gap-3">
          <Link href={`/sinistres/${d.id}`} className="text-white/50 hover:text-white hover:underline">
            Dossier
          </Link>
          {!fait && (
            <Link href={action.href} className="btn-ghost py-1.5 px-3 text-xs">
              {action.ctaLabel}
            </Link>
          )}
        </span>
      </li>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="titre-page">Tableau de bord</h1>
        <Link href="/import" className="btn-primary">{t.importer}</Link>
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
            hint={`${now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })} · TTC`}
          />
        </Link>
        <Link href="/finance">
          <StatCard
            accent="emerald"
            label="Encaissé ce mois"
            value={formatEuros(encaisseMois)}
            hint={`TTC · reste à encaisser : ${formatEuros(resteEncaisser)}`}
          />
        </Link>
      </div>

      {/* Ardoise : le pense-bête libre du garage (v7.2) */}
      <Ardoise />

      {/* À faire aujourd'hui : guidage automatique selon le processus.
          Chaque ligne se coche pour être considérée comme faite (v35). */}
      {!loading && aFaireTous.length > 0 && (
        <section className="glass-card p-5 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="font-semibold text-white">
              À faire aujourd&apos;hui
              <span className="ml-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">
                {aFaire.length}
              </span>
            </h2>
            <div className="flex items-center gap-3">
              {dejaFaites.length > 0 && (
                <button
                  onClick={() => setVoirFaites((v) => !v)}
                  className="text-xs text-emerald-300/80 hover:text-emerald-200 hover:underline"
                >
                  {voirFaites ? "Masquer" : "Voir"} les {dejaFaites.length} faite
                  {dejaFaites.length > 1 ? "s" : ""}
                </button>
              )}
              <span className="font-pixel text-[0.5rem] text-white/40">GUIDE AUTO</span>
            </div>
          </div>

          {aFaire.length === 0 ? (
            <p className="py-3 text-sm text-emerald-300/80">
              Tout est coché — plus rien à faire pour l&apos;instant.
            </p>
          ) : (
            <>
              {/* Liste déroulante : ~5 lignes visibles, le reste au défilement */}
              <ul className="divide-y divide-white/10 max-h-[300px] overflow-y-auto pr-1">
                {aFaire.map(({ dossier: d, action }) => renderAction(d, action, false))}
              </ul>
              {aFaire.length > 5 && (
                <p className="mt-2 text-xs text-white/40">Fais défiler pour voir les {aFaire.length} actions.</p>
              )}
            </>
          )}

          {voirFaites && dejaFaites.length > 0 && (
            <div className="mt-4 border-t border-white/10 pt-3">
              <div className="mb-1 text-xs font-semibold uppercase text-white/40">Faites</div>
              <ul className="divide-y divide-white/5 max-h-[220px] overflow-y-auto pr-1">
                {dejaFaites.map(({ dossier: d, action }) => renderAction(d, action, true))}
              </ul>
              <p className="mt-2 text-xs text-white/30">
                Décoche une ligne pour la remettre à faire. Une coche disparaît d&apos;elle-même dès que le dossier avance.
              </p>
            </div>
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
          {/* ~5 dossiers visibles, le reste au défilement */}
          <div className="overflow-x-auto max-h-[330px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-white/50 sticky top-0 bg-inherit">
                <tr>
                  <th className="px-5 py-2 font-medium">N° sinistre</th>
                  <th className="px-5 py-2 font-medium">Client</th>
                  <th className="px-5 py-2 font-medium">Véhicule</th>
                  <th className="px-5 py-2 font-medium">Statut</th>
                  <th className="px-5 py-2 font-medium text-right">Montant HT</th>
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
            <h2 className="titre-bloc">Agenda</h2>
            <Link href="/agenda" className="text-sm text-accent-pink hover:underline">Ouvrir l&apos;agenda</Link>
          </div>
          <div className="grid grid-cols-1 gap-4 p-3 sm:p-4 md:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                À venir
              </div>
              {aVenir.length === 0 && <p className="text-sm text-white/40">Aucun événement.</p>}
              <ul className="space-y-1.5">{aVenir.slice(0, 5).map((e) => renderEvenement(e))}</ul>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                Passés
              </div>
              {passes.length === 0 && <p className="text-sm text-white/40">Aucun événement.</p>}
              <ul className="space-y-1.5">{passes.slice(0, 3).map((e) => renderEvenement(e, true))}</ul>
            </div>
          </div>
        </section>

        {/* Guide du processus sinistre (repliable) */}
        <GuideProcedure />
      </div>
    </div>
  );
}
