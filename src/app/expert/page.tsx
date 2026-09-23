"use client";

// TABLEAU DE BORD du mode expert (v13.5 → v13.23 : le contrôle des devis en tête).

import { useEffect, useMemo, useState } from "react";
import Icone from "@/components/expert/Icone";
import Link from "next/link";
import StatCard from "@/components/StatCard";
import { BadgeStatutExpert, Bloc, EnTete, Vide } from "@/components/expert/ui";
import { chargerDossiers, chargerRdv, chargerTousRapports } from "@/lib/expertise/data";
import { creerDossierDemo } from "@/lib/expertise/demo";
import { creerControleDemo } from "@/lib/expertise/controleDemo";
import { chargerControles } from "@/lib/expertise/controleData";
import { Controle, STATUTS_CONTROLE, aRelancer, resumer } from "@/lib/expertise/controle";
import { synthese } from "@/lib/expertise/chiffrage";
import { DossierExpert, RapportExpert, RdvExpert, labelTypeRdv } from "@/lib/expertise/types";
import { formatDate, formatEuros, messageErreur } from "@/lib/format";

export default function TableauDeBordExpert() {
  const [dossiers, setDossiers] = useState<DossierExpert[]>([]);
  const [rapports, setRapports] = useState<RapportExpert[]>([]);
  const [rdvs, setRdvs] = useState<RdvExpert[]>([]);
  const [controles, setControles] = useState<Controle[]>([]);
  const [dispo, setDispo] = useState(true);
  const [chargement, setChargement] = useState(true);
  const [creation, setCreation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function charger() {
    const [{ dossiers: d, dispo: ok }, r, { rdv }, { controles: c }] = await Promise.all([chargerDossiers(), chargerTousRapports(), chargerRdv({ de: new Date().toISOString().slice(0, 10) }), chargerControles()]);
    setControles(c);
    setDossiers(d);
    setRapports(r);
    setRdvs(rdv.filter((x) => x.statut === "planifie"));
    setDispo(ok);
    setChargement(false);
  }
  useEffect(() => {
    charger();
  }, []);

  const stats = useMemo(() => {
    const enCours = dossiers.filter((d) => d.statut !== "cloture" && d.statut !== "emis");
    const aEmettre = dossiers.filter((d) => d.statut === "chiffrage" || d.statut === "rapport");
    const debutSemaine = new Date(); debutSemaine.setHours(0, 0, 0, 0);
    const finSemaine = new Date(debutSemaine); finSemaine.setDate(finSemaine.getDate() + 7);
    const visites = rdvs.length
      ? rdvs.filter((r) => new Date(r.date) >= debutSemaine && new Date(r.date) < finSemaine)
      : dossiers.filter((d) => d.date_visite && new Date(d.date_visite) >= debutSemaine && new Date(d.date_visite) < finSemaine);
    const mois = new Date().toISOString().slice(0, 7);
    const chiffreMois = rapports
      .filter((r) => (r.date_rapport || r.created_at || "").slice(0, 7) === mois)
      .reduce((s, r) => s + synthese(r).ht, 0);
    return { enCours: enCours.length, aEmettre: aEmettre.length, visites: visites.length, chiffreMois, emis: rapports.filter((r) => r.statut === "emis").length };
  }, [dossiers, rapports, rdvs]);

  async function demo() {
    setCreation(true);
    setErreur(null);
    try {
      const n = await creerDossierDemo();
      const ctl = await creerControleDemo().catch(() => false);
      await charger();
      if (!n.dossiers && !n.garages && !ctl) setErreur("Les données de démonstration sont déjà en place.");
    } catch (e) {
      setErreur(messageErreur(e, "Création du dossier de démonstration impossible (migration v75 exécutée ?)."));
    } finally {
      setCreation(false);
    }
  }

  const recents = dossiers.slice(0, 8);

  // v13.23 — contrôles de devis : dernier tour de chaque dossier.
  const derniersControles = useMemo(() => {
    const m = new Map<string, Controle>();
    for (const c of controles) { const x = m.get(c.dossier_id); if (!x || c.created_at > x.created_at) m.set(c.dossier_id, c); }
    return Array.from(m.values()).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [controles]);
  const statsCtl = useMemo(() => {
    const mois = new Date().toISOString().slice(0, 7);
    const valides = derniersControles.filter((c) => c.statut === "valide" && (c.cloture_le || "").slice(0, 7) === mois);
    return {
      aTrancher: derniersControles.filter((c) => c.statut === "a_trancher").length,
      attente: derniersControles.filter((c) => c.statut === "attente_garage").length,
      valides: valides.length,
      economie: valides.reduce((s, c) => s + Math.max(0, resumer(c).economie), 0),
      reponses: derniersControles.filter((c) => c.reponse_garage && !c.reponse_garage.traitee_le).length,
      relances: derniersControles.filter((c) => aRelancer(c, 5)).length,
    };
  }, [derniersControles]);
  const enCoursCtl = derniersControles.filter((c) => c.statut !== "valide").slice(0, 6);
  const prochainesVisites = dossiers
    .filter((d) => d.date_visite && d.statut !== "cloture" && d.statut !== "emis")
    .sort((a, b) => String(a.date_visite).localeCompare(String(b.date_visite)))
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <EnTete
        titre="Tableau de bord"
        sousTitre="Devis à contrôler, réponses des garages, missions en cours."
        actions={
          <>
            <button type="button" className="btn-ghost btn-compact" disabled={creation} onClick={demo} title="Ajoute des réparateurs et des missions fictives (idempotent)">{creation ? "Création…" : "Données de démo"}</button>
            <Link href="/expert/controles?nouveau=1" className="btn-primary">+ Nouveau contrôle</Link>
          </>
        }
      />

      {!dispo && (
        <div className="alerte alerte-warn text-sm">
          Les tables du mode expert sont absentes : exécute <code className="font-mono">supabase/migration_v75.sql</code> dans Supabase → SQL Editor.
        </div>
      )}
      {erreur && <div className="alerte alerte-danger text-sm">{erreur}</div>}

      {/* v13.23 — le contrôle des devis en premier */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Devis à trancher" value={String(statsCtl.aTrancher)} accent="amber" />
        <StatCard label="En attente du garage" value={String(statsCtl.attente)} accent="blue" />
        <StatCard label="Devis validés ce mois" value={String(statsCtl.valides)} accent="emerald" />
        <StatCard label="Non retenu ce mois (HT)" value={formatEuros(statsCtl.economie)} hint="devis − montant retenu" accent="teal" />
      </div>

      {(statsCtl.reponses > 0 || statsCtl.relances > 0) && (
        <Link href="/expert/controles" className="alerte alerte-warn flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            {statsCtl.reponses > 0 && <><b>{statsCtl.reponses}</b> réponse(s) de garage à traiter</>}
            {statsCtl.reponses > 0 && statsCtl.relances > 0 && " · "}
            {statsCtl.relances > 0 && <><b>{statsCtl.relances}</b> garage(s) à relancer</>}
          </span>
          <span className="underline">Voir</span>
        </Link>
      )}

      <Bloc titre="Devis à contrôler" actions={<Link href="/expert/controles" className="btn-ghost btn-compact">Tout voir</Link>}>
        {chargement ? (
          <div className="skeleton h-16 rounded-xl" />
        ) : enCoursCtl.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-white/60">
            <span>Aucun devis en cours de contrôle.</span>
            <Link href="/expert/controles?nouveau=1" className="btn-primary btn-compact">+ Nouveau contrôle</Link>
          </div>
        ) : (
          <div className="space-y-2">
            {enCoursCtl.map((c) => {
              const d = dossiers.find((x) => x.id === c.dossier_id);
              const r = resumer(c);
              return (
                <Link key={c.id} href={`/expert/dossiers/${c.dossier_id}?onglet=controle`} className="carte-liste block">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-semibold">{d?.immatriculation || d?.numero || "Dossier"}</span>
                      <span className="text-sm text-white/60"> · {d?.reparateur_nom || "réparateur ?"}{c.tour > 1 ? ` · tour ${c.tour}` : ""}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      {c.devis && c.reference && <span className="tabular-nums">{formatEuros(r.totalDevis)} → <b>{formatEuros(r.totalRetenu)}</b></span>}
                      {c.devis && c.reference && r.total > 0 && c.statut === "a_trancher" && <span className="text-xs text-white/55">{r.aTrancher} à trancher</span>}
                      <span className={`badge ${STATUTS_CONTROLE[c.statut]?.badge}`}>{STATUTS_CONTROLE[c.statut]?.label}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Bloc>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Missions en cours" value={String(stats.enCours)} accent="blue" />
        <StatCard label="Visites cette semaine" value={String(stats.visites)} accent="teal" />
        <StatCard label="Rapports à émettre" value={String(stats.aEmettre)} accent="amber" />
        <StatCard label="Chiffré ce mois (HT)" value={formatEuros(stats.chiffreMois)} hint={`${stats.emis} rapport(s) émis au total`} accent="violet" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Bloc titre="Dernières missions" className="lg:col-span-2" actions={<Link href="/expert/dossiers" className="btn-ghost btn-compact">Tout voir</Link>}>
          {chargement ? (
            <div className="skeleton h-24 rounded-xl" />
          ) : recents.length === 0 ? (
            <Vide
              titre="Aucune mission pour l'instant"
              texte="Crée ta première mission, ou charge les données de démonstration : 6 réparateurs et 7 missions à chaque étape (dont le rapport AE00034914 du modèle)."
              action={
                <div className="flex flex-wrap gap-2">
                  <Link href="/expert/dossiers?nouveau=1" className="btn-primary">+ Nouvelle mission</Link>
                  <button type="button" className="btn-ghost" disabled={creation} onClick={demo}>{creation ? "Création…" : "Charger la démonstration"}</button>
                </div>
              }
            />
          ) : (
            <div className="space-y-2">
              {recents.map((d) => (
                <Link key={d.id} href={`/expert/dossiers/${d.id}`} className="carte-liste block">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{d.numero}</span>
                        <BadgeStatutExpert statut={d.statut} />
                      </div>
                      <div className="mt-1 truncate text-sm text-white/65">
                        {[d.immatriculation, d.marque, d.modele].filter(Boolean).join(" · ")}
                        {d.lese_nom ? ` — ${d.lese_nom}` : ""}
                      </div>
                    </div>
                    <div className="w-40 shrink-0 text-right text-xs leading-5 text-white/50 sm:w-48">
                      <div className="truncate" title={d.mandant_nom || ""}>{d.mandant_nom || "—"}</div>
                      <div className="whitespace-nowrap">Mission du {formatDate(d.date_mission)}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Bloc>

        <div className="space-y-4">
          <Bloc titre="Prochains rendez-vous" actions={<Link href="/expert/agenda" className="btn-ghost btn-compact">Agenda</Link>}>
            {rdvs.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {rdvs.slice(0, 6).map((r) => {
                  const d = r.dossier_id ? dossiers.find((x) => x.id === r.dossier_id) : null;
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <Link href={d ? `/expert/dossiers/${d.id}` : "/expert/agenda"} className="min-w-0 truncate hover:underline">
                        {r.lieu || labelTypeRdv(r.type)}{d ? ` · ${d.immatriculation || d.numero}` : ""}
                      </Link>
                      <span className="shrink-0 text-xs text-white/55">{r.date.split("-").reverse().slice(0, 2).join("/")}{r.heure ? ` ${r.heure.slice(0, 5)}` : ""}</span>
                    </li>
                  );
                })}
              </ul>
            ) : prochainesVisites.length === 0 ? (
              <p className="text-sm text-white/50">Aucune visite planifiée.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {prochainesVisites.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <Link href={`/expert/dossiers/${d.id}`} className="min-w-0 truncate hover:underline">
                      {d.immatriculation || d.numero} · {d.reparateur_nom || d.lieu_expertise}
                    </Link>
                    <span className="shrink-0 text-xs text-white/55">{formatDate(d.date_visite)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Bloc>
          <Bloc titre="Raccourcis">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Link href="/expert/pieces" className="btn-ghost btn-compact text-center"><Icone nom="recherche" /> Pièces & prix</Link>
              <Link href="/expert/annuaire" className="btn-ghost btn-compact text-center"><Icone nom="base" /> Base de données</Link>
              <Link href="/expert/rapports" className="btn-ghost btn-compact text-center"><Icone nom="rapport" /> Rapports</Link>
              <Link href="/expert/agenda" className="btn-ghost btn-compact text-center"><Icone nom="agenda" /> RDV expert</Link>
            </div>
          </Bloc>
        </div>
      </div>
    </div>
  );
}
