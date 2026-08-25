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
import { montantTtc, tauxTva, totalTtc } from "@/lib/tva";
import { totalPaye, resteAPayer } from "@/lib/paiements";
import { ProchaineAction, calculeProchaineAction } from "@/lib/actions";
import {
  annulerActionFaite,
  cleAction,
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
import BlocAFaire from "@/components/BlocAFaire";
import ConfigBanner from "@/components/ConfigBanner";
import { erreurReseau, dateDuCache, memoriser, relire } from "@/lib/horsLigne";
import RappelSauvegarde from "@/components/RappelSauvegarde";
import { euroRecuperes } from "@/lib/recouvrement";

/** Copie locale du tableau de bord (mode dégradé, v47). */
const CLE_CACHE_DASHBOARD = "tableau-de-bord";

type CopieTableauBord = {
  dossiers: Dossier[];
  evenements: Evenement[];
  documents: Document[];
  vehicules: Vehicule[];
  paiements: Paiement[];
  relances: Relance[];
  ordres: OrdreReparation[];
  restitutions: Restitution[];
  cessions: CessionCreance[];
  pieces: { dossier_id: string; type: string }[];
  demandes: { dossier_id: string; demande: string; date_envoi: string | null }[];
  faites: ActionFaite[];
};

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
  const [loading, setLoading] = useState(true);

  // MODE DÉGRADÉ (v47) : date de la copie locale affichée, si on l'utilise.
  const [copieLocale, setCopieLocale] = useState<string | null>(null);

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
      // Applique un jeu de données, qu'il vienne du serveur ou du cache.
      const appliquer = (x: CopieTableauBord) => {
        setDossiers(x.dossiers);
        setEvenements(x.evenements);
        setDocuments(x.documents);
        setVehicules(x.vehicules);
        setPaiements(x.paiements);
        setRelances(x.relances);
        setOrdres(x.ordres);
        setRestitutions(x.restitutions);
        setCessions(x.cessions);
        setPieces(x.pieces);
        setDemandes(x.demandes);
        setFaites(x.faites);
      };

      // MODE DÉGRADÉ (v47) : plutôt qu'un tableau de bord vide quand le
      // réseau lâche, on réaffiche la dernière copie enregistrée sur
      // l'appareil, en indiquant clairement de quand elle date.
      if (d.error && erreurReseau(d.error)) {
        const cache = await relire<CopieTableauBord>(CLE_CACHE_DASHBOARD);
        if (cache) {
          appliquer(cache.donnees);
          setCopieLocale(cache.le);
          setLoading(false);
          return;
        }
      }

      const copie: CopieTableauBord = {
        dossiers: (d.data as Dossier[]) || [],
        evenements: (e.data as Evenement[]) || [],
        documents: (docs.data as Document[]) || [],
        vehicules: (v.data as Vehicule[]) || [],
        paiements: (p.data as Paiement[]) || [],
        relances: (r.data as Relance[]) || [],
        ordres: (ors.data as OrdreReparation[]) || [],
        restitutions: (rests.data as Restitution[]) || [],
        cessions: (cess.data as CessionCreance[]) || [],
        pieces: (pcs.data as { dossier_id: string; type: string }[]) || [],
        demandes:
          (dem.data as { dossier_id: string; demande: string; date_envoi: string | null }[]) || [],
        faites: (af.data as ActionFaite[]) || [],
      };
      appliquer(copie);
      // Rangement silencieux pour la prochaine coupure.
      memoriser(CLE_CACHE_DASHBOARD, copie);
      setLoading(false);
    })();
  }, []);

  const enCours = dossiers.filter((d) => estActif(d.statut));

  const now = new Date();
  // Véhicules présents au garage : cases "au garage" cochées (dossiers + véhicules hors dossier)
  const presentsDossiers = dossiers.filter((d) => d.au_garage);
  const presentsLibres = vehicules.filter((v) => v.au_garage);
  const presentsCount = presentsDossiers.length + presentsLibres.length;
  // Encours des dossiers actifs, en HT (chiffre du rapport) et en TTC.
  const totalEnCoursHt = enCours.reduce((s, d) => s + (d.montant || 0), 0);
  const totalEnCoursTtc = totalTtc(enCours);
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

  // Même sélection, en HT : le garage veut lire les deux chiffres.
  const totalMoisHt = factures
    .filter((f) => {
      const ref = f.date_document || f.created_at;
      if (!ref) return false;
      const dt = new Date(ref);
      return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
    })
    .reduce((sum, f) => sum + (Number(f.total_ht) || 0), 0);

  // CE QUE LES RELANCES RAPPORTENT (v50) : encaissements survenus APRÈS
  // une relance. Chiffre volontairement prudent (plancher), affiché parce
  // qu'un garage doit VOIR ce que l'outil lui ramène.
  const recupere = euroRecuperes(factures, paiements, relances);

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

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="titre-page">Tableau de bord</h1>
          {copieLocale && (
            <p className="mt-1 text-xs text-amber-300">
              Copie enregistrée sur cet appareil — données du {dateDuCache(copieLocale)}
            </p>
          )}
          <p className="mt-1 text-xs capitalize text-white/45">
            {now.toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <Link href="/import" className="btn-primary">{t.importer}</Link>
      </div>

      <ConfigBanner />

      {/* HUD : les 4 compteurs du garage */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Link href="/vehicules">
          <StatCard accent="teal" icone="🚗" label="Véhicules au garage" value={String(presentsCount)} hint="actuellement présents" />
        </Link>
        <Link href="/sinistres">
          <StatCard
            accent="violet"
            icone="📁"
            label="Dossiers en cours"
            value={String(enCours.length)}
            hint={`${formatEuros(totalEnCoursHt)} HT · ${formatEuros(totalEnCoursTtc)} TTC`}
          />
        </Link>
        <Link href="/factures">
          <StatCard
            accent="pink"
            icone="🧾"
            label="Facturé ce mois"
            value={`${formatEuros(totalMoisHt)} HT`}
            hint={`${formatEuros(totalMois)} TTC · ${now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`}
          />
        </Link>
        <Link href="/finance">
          <StatCard
            accent="emerald"
            icone="💶"
            label="Encaissé ce mois"
            value={formatEuros(encaisseMois)}
            hint={`TTC · reste à encaisser : ${formatEuros(resteEncaisser)}`}
          />
        </Link>
      </div>

      {/* Ce que les relances ont ramené (v50) */}
      {recupere.montant > 0 && (
        <Link
          href="/finance"
          className="anim-apparition mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-emerald-400/40 bg-emerald-500/10 px-4 py-2.5"
        >
          <span className="text-sm text-emerald-100">
            💪 Les relances automatiques ont ramené{" "}
            <span className="font-bold">{formatEuros(recupere.montant)}</span> sur{" "}
            {recupere.factures} facture{recupere.factures > 1 ? "s" : ""}.
          </span>
          <span className="text-xs text-emerald-200/70 hover:underline">Voir le recouvrement →</span>
        </Link>
      )}

      {/* Rappel de sauvegarde (v46) : au-dessus du travail du jour, parce
          qu'une sauvegarde repoussée indéfiniment ne sert à rien. */}
      <RappelSauvegarde />

      {/* BLOC « À FAIRE » (v41) — une seule liste : les rappels AUTOMATIQUES
          calculés depuis les dossiers + les rappels ÉCRITS par le garage
          (ex-« ardoise »). Remplace les deux blocs redondants d'avant. */}
      <BlocAFaire
        auto={aFaireTous}
        dossiers={dossiers}
        faites={faites}
        onBasculerAuto={(dossierId, action, fait) => basculerFait(dossierId, action, fait)}
        loading={loading}
      />

      <div className="space-y-6">
        <section className="glass-card anim-apparition">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="titre-section">Dossiers en cours</h2>
            <Link href="/sinistres" className="text-sm text-accent-pink hover:underline">
              Voir tout
            </Link>
          </div>
          {/* ~5 dossiers visibles, le reste au défilement.
              v9.3 — deux rendus : CARTES sur téléphone (le tableau à 5 colonnes
              débordait), tableau `table-fixed` sur écran large. L'en-tête sticky
              a un fond OPAQUE (--mea-surface) : avec `bg-inherit` il était
              transparent et survolait les lignes au défilement. */}
          <div className="max-h-[360px] overflow-y-auto">
            {/* ----- MOBILE : une carte par dossier ----- */}
            <div className="space-y-2 p-3 sm:hidden">
              {loading &&
                [0, 1, 2].map((i) => (
                  <div key={`skm-${i}`} className="glass-soft p-3">
                    <div className="skeleton h-4 w-40" />
                    <div className="skeleton mt-2 h-3 w-56" />
                    <div className="skeleton mt-3 h-3 w-full" />
                  </div>
                ))}
              {!loading && enCours.length === 0 && (
                <p className="py-4 text-center text-sm text-white/40">Aucun dossier en cours.</p>
              )}
              {enCours.map((d) => (
                <button
                  key={`m-${d.id}`}
                  type="button"
                  onClick={() => router.push(`/sinistres/${d.id}`)}
                  className="glass-soft block w-full p-3 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-white">
                        {d.client_nom || "—"}
                      </span>
                      <span className="block truncate text-xs text-white/55">
                        {d.marque_modele || "—"}
                        {d.immatriculation ? ` · ${d.immatriculation}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="block text-sm font-semibold text-white">
                        {formatEuros(d.montant)} HT
                      </span>
                      <span className="block text-[11px] text-accent-teal" title={`TVA ${tauxTva(d)} %`}>
                        {formatEuros(montantTtc(d))} TTC
                      </span>
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <StatutBadge statut={d.statut} />
                    <span className="truncate text-[11px] text-white/35">{d.numero_sinistre || "sans n°"}</span>
                  </div>
                  <div className="mt-2">
                    <ProgressionDossier statut={d.statut} size="sm" />
                  </div>
                </button>
              ))}
            </div>

            {/* ----- ÉCRAN LARGE : tableau à colonnes fixes ----- */}
            <table className="hidden w-full table-fixed text-sm sm:table">
              <colgroup>
                <col className="hidden w-[16%] md:table-column" />
                <col className="w-[28%] md:w-[22%]" />
                <col className="w-[40%] md:w-[30%]" />
                <col className="w-[32%] md:w-[16%]" />
                <col className="hidden w-[16%] md:table-column" />
              </colgroup>
              <thead
                className="sticky top-0 z-10 text-left text-white/50"
                style={{ backgroundColor: "var(--mea-surface)" }}
              >
                <tr className="border-b border-white/10">
                  <th className="cellule hidden font-medium md:table-cell">N° sinistre</th>
                  <th className="cellule font-medium">Client</th>
                  <th className="cellule font-medium">Véhicule</th>
                  <th className="cellule font-medium">Statut</th>
                  <th className="cellule hidden text-right font-medium md:table-cell">HT / TTC</th>
                </tr>
              </thead>
              <tbody>
                {loading &&
                  [0, 1, 2].map((i) => (
                    <tr key={`sk-${i}`} className="border-t border-white/5">
                      <td className="cellule hidden md:table-cell"><div className="skeleton h-4 w-20" /></td>
                      <td className="cellule"><div className="skeleton h-4 w-28" /></td>
                      <td className="cellule"><div className="skeleton h-4 w-36" /></td>
                      <td className="cellule"><div className="skeleton h-4 w-24" /></td>
                      <td className="cellule hidden md:table-cell"><div className="skeleton ml-auto h-4 w-20" /></td>
                    </tr>
                  ))}
                {!loading && enCours.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-6 text-center text-white/40">Aucun dossier en cours.</td></tr>
                )}
                {enCours.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => router.push(`/sinistres/${d.id}`)}
                    className="border-t border-white/5 hover:bg-white/5 cursor-pointer"
                  >
                    <td className="cellule hidden truncate font-medium text-white md:table-cell" title={d.numero_sinistre || ""}>
                      {d.numero_sinistre || "—"}
                    </td>
                    <td className="cellule truncate text-white/80" title={d.client_nom || ""}>
                      {d.client_nom || "—"}
                    </td>
                    <td className="cellule text-white/80">
                      <div className="truncate" title={d.marque_modele || ""}>{d.marque_modele || "—"}</div>
                      {d.immatriculation && (
                        <div className="truncate text-[11px] text-white/45">{d.immatriculation}</div>
                      )}
                    </td>
                    <td className="cellule">
                      <StatutBadge statut={d.statut} />
                      <div className="mt-1.5 max-w-[8rem]">
                        <ProgressionDossier statut={d.statut} size="sm" />
                      </div>
                    </td>
                    <td className="cellule hidden text-right tabular-nums md:table-cell">
                      <div className="text-white/90">{formatEuros(d.montant)}</div>
                      <div className="text-[11px] text-accent-teal" title={`TVA ${tauxTva(d)} %`}>
                        {formatEuros(montantTtc(d))} TTC
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="glass-card">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="titre-section">Agenda</h2>
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
