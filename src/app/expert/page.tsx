"use client";

// TABLEAU DE BORD du mode expert (v13.5).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import StatCard from "@/components/StatCard";
import { BadgeStatutExpert, Bloc, EnTete, Vide } from "@/components/expert/ui";
import { chargerDossiers, chargerTousRapports } from "@/lib/expertise/data";
import { creerDossierDemo } from "@/lib/expertise/demo";
import { synthese } from "@/lib/expertise/chiffrage";
import { DossierExpert, RapportExpert } from "@/lib/expertise/types";
import { formatDate, formatEuros, messageErreur } from "@/lib/format";

export default function TableauDeBordExpert() {
  const [dossiers, setDossiers] = useState<DossierExpert[]>([]);
  const [rapports, setRapports] = useState<RapportExpert[]>([]);
  const [dispo, setDispo] = useState(true);
  const [chargement, setChargement] = useState(true);
  const [creation, setCreation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function charger() {
    const [{ dossiers: d, dispo: ok }, r] = await Promise.all([chargerDossiers(), chargerTousRapports()]);
    setDossiers(d);
    setRapports(r);
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
    const visites = dossiers.filter((d) => d.date_visite && new Date(d.date_visite) >= debutSemaine && new Date(d.date_visite) < finSemaine);
    const mois = new Date().toISOString().slice(0, 7);
    const chiffreMois = rapports
      .filter((r) => (r.date_rapport || r.created_at || "").slice(0, 7) === mois)
      .reduce((s, r) => s + synthese(r).ht, 0);
    return { enCours: enCours.length, aEmettre: aEmettre.length, visites: visites.length, chiffreMois, emis: rapports.filter((r) => r.statut === "emis").length };
  }, [dossiers, rapports]);

  async function demo() {
    setCreation(true);
    setErreur(null);
    try {
      const n = await creerDossierDemo();
      await charger();
      if (!n.dossiers && !n.garages) setErreur("Les données de démonstration sont déjà en place.");
    } catch (e) {
      setErreur(messageErreur(e, "Création du dossier de démonstration impossible (migration v75 exécutée ?)."));
    } finally {
      setCreation(false);
    }
  }

  const recents = dossiers.slice(0, 8);
  const prochainesVisites = dossiers
    .filter((d) => d.date_visite && d.statut !== "cloture" && d.statut !== "emis")
    .sort((a, b) => String(a.date_visite).localeCompare(String(b.date_visite)))
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <EnTete
        titre="Tableau de bord"
        sousTitre="Missions en cours, visites à venir et rapports à émettre."
        actions={
          <>
            <button type="button" className="btn-ghost btn-compact" disabled={creation} onClick={demo} title="Ajoute des réparateurs et des missions fictives (idempotent)">{creation ? "Création…" : "Données de démo"}</button>
            <Link href="/expert/dossiers?nouveau=1" className="btn-primary">+ Nouvelle mission</Link>
          </>
        }
      />

      {!dispo && (
        <div className="alerte alerte-warn text-sm">
          Les tables du mode expert sont absentes : exécute <code className="font-mono">supabase/migration_v75.sql</code> dans Supabase → SQL Editor.
        </div>
      )}
      {erreur && <div className="alerte alerte-danger text-sm">{erreur}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Missions en cours" value={String(stats.enCours)} accent="blue" icone="🗂" />
        <StatCard label="Visites cette semaine" value={String(stats.visites)} accent="teal" icone="📅" />
        <StatCard label="Rapports à émettre" value={String(stats.aEmettre)} accent="amber" icone="✍️" />
        <StatCard label="Chiffré ce mois (HT)" value={formatEuros(stats.chiffreMois)} hint={`${stats.emis} rapport(s) émis au total`} accent="violet" icone="€" />
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{d.numero}</span>
                        <BadgeStatutExpert statut={d.statut} />
                      </div>
                      <div className="truncate text-sm text-white/65">
                        {[d.immatriculation, d.marque, d.modele].filter(Boolean).join(" · ")}
                        {d.lese_nom ? ` — ${d.lese_nom}` : ""}
                      </div>
                    </div>
                    <div className="text-right text-xs text-white/50">
                      <div>{d.mandant_nom || "—"}</div>
                      <div>Mission du {formatDate(d.date_mission)}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Bloc>

        <div className="space-y-4">
          <Bloc titre="Prochaines visites">
            {prochainesVisites.length === 0 ? (
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
              <Link href="/expert/pieces" className="btn-ghost btn-compact text-center">🔎 Pièces & prix</Link>
              <Link href="/expert/annuaire" className="btn-ghost btn-compact text-center">📇 Base de données</Link>
              <Link href="/expert/rapports" className="btn-ghost btn-compact text-center">📄 Rapports</Link>
              <Link href="/expert/cabinet" className="btn-ghost btn-compact text-center">🏢 Cabinet</Link>
            </div>
          </Bloc>
        </div>
      </div>
    </div>
  );
}
