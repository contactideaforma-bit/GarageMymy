"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Dossier } from "@/lib/types";
import {
  estActif,
  formatEuros,
  formatDate,
  indexStatut,
  libelleStatut,
  ymd,
} from "@/lib/format";
import { exporterXlsx, type ColonneExcel } from "@/lib/excel";
import DossierForm from "@/components/DossierForm";
import StatutBadge from "@/components/StatutBadge";
import ProgressionDossier from "@/components/ProgressionDossier";
import ConfigBanner from "@/components/ConfigBanner";
import StatCard from "@/components/StatCard";
import { ouvrirFichier } from "@/lib/storage";
import { useMetier } from "@/components/MetierProvider";
import { termes } from "@/lib/metier";
import {
  Particularite,
  badgeParticularite,
  chargerLiens,
  chargerParticularites,
  indexParDossier,
} from "@/lib/particularites";

// Identité « expert » d'un dossier = le CABINET d'expertise (identifiant fiable).
// On n'utilise pas expert_nom : ce champ contient souvent le nom du client
// (rempli ainsi lors de l'import IA des rapports).
function cabinetExpert(d: Dossier): string {
  return (d.cabinet_expert || "").trim();
}

// Clés de tri disponibles (colonnes cliquables).
type CleTri =
  | "created_at"
  | "numero_sinistre"
  | "client_nom"
  | "marque_modele"
  | "immatriculation"
  | "assureur"
  | "expert"
  | "date_sinistre"
  | "statut"
  | "montant";

type Tri = { cle: CleTri; sens: "asc" | "desc" };

// Combinaisons proposées dans le select « Trier par ».
const TRIS_PREDEFINIS = [
  "created_at:desc",
  "date_sinistre:desc",
  "date_sinistre:asc",
  "statut:asc",
  "statut:desc",
  "expert:asc",
  "montant:desc",
  "client_nom:asc",
];

const LIBELLE_COLONNE: Record<string, string> = {
  created_at: "date de création",
  numero_sinistre: "n° de sinistre",
  client_nom: "client",
  marque_modele: "véhicule",
  immatriculation: "immatriculation",
  assureur: "assureur",
  expert: "cabinet d'expert",
  date_sinistre: "date du sinistre",
  statut: "statut",
  montant: "montant HT",
};

// Valeur comparable d'un dossier selon la clé de tri.
function valeurTri(d: Dossier, cle: CleTri): string | number {
  switch (cle) {
    case "statut":
      return indexStatut(d.statut);
    case "montant":
      // -1 (et pas -Infinity) : deux montants absents donnaient
      // (-Infinity) - (-Infinity) = NaN → comparateur invalide, ordre aléatoire.
      return d.montant ?? -1;
    case "date_sinistre":
      return d.date_sinistre || "";
    case "created_at":
      return d.created_at || "";
    case "expert":
      return cabinetExpert(d).toLowerCase();
    default:
      return String(d[cle] ?? "").toLowerCase();
  }
}

export default function SinistresPage() {
  const router = useRouter();
  const { metier } = useMetier();
  const t = termes(metier);
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [q, setQ] = useState("");

  // Organisation des dossiers : filtres + tri.
  const [filtreStatut, setFiltreStatut] = useState<string>("");
  const [filtreExpert, setFiltreExpert] = useState<string>("");
  // Période : du … au …, sur la date du sinistre OU la date d'ajout (v7.0)
  const [champDate, setChampDate] = useState<"date_sinistre" | "created_at">("date_sinistre");
  const [du, setDu] = useState("");
  const [au, setAu] = useState("");
  // Particularités (courtier, agrément…) — v7.0
  const [catalogue, setCatalogue] = useState<Particularite[]>([]);
  const [liens, setLiens] = useState<{ dossier_id: string; particularite_id: string }[]>([]);
  const [filtrePart, setFiltrePart] = useState<string>("");
  const [tri, setTri] = useState<Tri>({ cle: "created_at", sens: "desc" });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("dossiers")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setDossiers(data as Dossier[]);
    // Étiquettes : si la migration v37 n'est pas passée, on reste silencieux.
    try {
      const [cat, lns] = await Promise.all([chargerParticularites(), chargerLiens()]);
      setCatalogue(cat);
      setLiens(lns);
    } catch {
      /* particularités indisponibles */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Les dossiers archivés vivent dans l'onglet Archives.
  const actifs = useMemo(() => dossiers.filter((d) => !d.archive), [dossiers]);

  // Statuts réellement présents, ordonnés selon le pipeline.
  const statutsPresents = useMemo(() => {
    const set = new Set(actifs.map((d) => d.statut).filter(Boolean));
    return Array.from(set).sort((a, b) => indexStatut(a) - indexStatut(b));
  }, [actifs]);

  // Cabinets d'expertise réellement présents, triés alphabétiquement.
  const expertsPresents = useMemo(() => {
    const set = new Set(actifs.map(cabinetExpert).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
  }, [actifs]);

  const term = q.trim().toLowerCase();

  // Étiquettes par dossier (badges + filtre).
  const partsParDossier = useMemo(
    () => indexParDossier(liens, catalogue),
    [liens, catalogue]
  );

  // Filtrage (recherche + statut + expert + période + particularité).
  const filtered = useMemo(() => {
    return actifs.filter((d) => {
      if (filtreStatut && d.statut !== filtreStatut) return false;
      if (filtreExpert && cabinetExpert(d) !== filtreExpert) return false;
      if (filtrePart && !(partsParDossier[d.id] || []).some((p) => p.id === filtrePart)) return false;
      // Période : comparaison sur les 10 premiers caractères (AAAA-MM-JJ),
      // ce qui marche aussi bien pour une date que pour un timestamp.
      if (du || au) {
        const brut = (champDate === "created_at" ? d.created_at : d.date_sinistre) || "";
        const jour = brut.slice(0, 10);
        if (!jour) return false; // date absente : hors période
        if (du && jour < du) return false;
        if (au && jour > au) return false;
      }
      if (!term) return true;
      return [d.numero_sinistre, d.client_nom, d.marque_modele, d.immatriculation, d.assureur, cabinetExpert(d)]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(term));
    });
  }, [actifs, filtreStatut, filtreExpert, filtrePart, partsParDossier, champDate, du, au, term]);

  // Tri.
  const visibles = useMemo(() => {
    const copie = [...filtered];
    copie.sort((a, b) => {
      const va = valeurTri(a, tri.cle);
      const vb = valeurTri(b, tri.cle);
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      // numeric: true → « FAC-2026-9 » avant « FAC-2026-10 » (et pas l'inverse).
      else cmp = String(va).localeCompare(String(vb), "fr", { numeric: true, sensitivity: "base" });
      return tri.sens === "asc" ? cmp : -cmp;
    });
    return copie;
  }, [filtered, tri]);

  // Synthèse (sur la sélection visible).
  const totalHT = visibles.reduce((s, d) => s + (d.montant || 0), 0);
  const enCours = visibles.filter((d) => estActif(d.statut)).length;

  const filtresActifs = !!(term || filtreStatut || filtreExpert || filtrePart || du || au);
  function reinitialiser() {
    setQ("");
    setFiltreStatut("");
    setFiltreExpert("");
    setFiltrePart("");
    setDu("");
    setAu("");
  }

  // Clic sur un en-tête : trie par cette clé, inverse le sens si déjà actif.
  function trierPar(cle: CleTri) {
    setTri((prev) =>
      prev.cle === cle
        ? { cle, sens: prev.sens === "asc" ? "desc" : "asc" }
        : { cle, sens: cle === "montant" || cle === "date_sinistre" || cle === "statut" ? "desc" : "asc" }
    );
  }

  function fleche(cle: CleTri) {
    if (tri.cle !== cle) return null;
    return <span className="ml-1 text-accent-teal">{tri.sens === "asc" ? "▲" : "▼"}</span>;
  }

  // Export Excel du tableau de suivi (sélection filtrée + triée).
  function exporterExcel() {
    const colonnes: ColonneExcel[] = [
      { header: t.numeroDossier, key: "numero", width: 16 },
      { header: "Client", key: "client", width: 22 },
      { header: "Véhicule", key: "vehicule", width: 22 },
      { header: "Immatriculation", key: "immat", width: 15 },
      { header: "Assureur", key: "assureur", width: 20 },
      { header: "Cabinet d'expert", key: "cabinet", width: 22 },
      { header: t.dateDossier, key: "date_sinistre", width: 14 },
      { header: "Statut", key: "statut", width: 16 },
      { header: "Montant HT", key: "montant", type: "euro", width: 14 },
      { header: "Particularités", key: "particularites", width: 24 },
      { header: "Cession", key: "cession", width: 10 },
      { header: "Réparateur", key: "reparateur", width: 18 },
    ];
    const lignes = visibles.map((d) => ({
      numero: d.numero_sinistre || "",
      client: d.client_nom || "",
      vehicule: d.marque_modele || "",
      immat: d.immatriculation || "",
      assureur: d.assureur || "",
      cabinet: d.cabinet_expert || "",
      date_sinistre: formatDate(d.date_sinistre) === "—" ? "" : formatDate(d.date_sinistre),
      statut: libelleStatut(d.statut, metier),
      montant: d.montant ?? "",
      particularites: (partsParDossier[d.id] || []).map((p) => p.nom).join(", "),
      cession: d.mode_cession ? "Oui" : "",
      reparateur: d.reparateur || "",
    }));
    const jour = ymd();
    exporterXlsx(`suivi-dossiers-${jour}`, "Suivi dossiers", colonnes, lignes);
  }

  return (
    <div>
      {/* En-tête : sur téléphone, action principale en pleine largeur puis
          les deux actions secondaires côte à côte (au lieu d'un empilement). */}
      <div className="mb-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
        <h1 className="titre-page mb-2 sm:mb-0">{t.dossiers}</h1>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary col-span-2 sm:col-span-1 sm:order-last"
          >
            + {t.ajouter}
          </button>
          <button
            onClick={exporterExcel}
            disabled={visibles.length === 0}
            className="btn-ghost truncate disabled:cursor-not-allowed disabled:opacity-40"
            title="Exporter le tableau de suivi au format Excel"
          >
            <span className="sm:hidden">⬇ Excel</span>
            <span className="hidden sm:inline">⬇ Exporter Excel</span>
          </button>
          <Link href="/import" className="btn-ghost truncate text-center">{t.importer}</Link>
        </div>
      </div>

      <ConfigBanner />

      {/* Synthèse de la sélection courante */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:mb-4 sm:gap-3 lg:grid-cols-3">
        <StatCard label="DOSSIERS AFFICHES" value={String(visibles.length)} accent="violet" />
        <StatCard label="EN COURS" value={String(enCours)} hint="non clôturés" accent="pink" />
        {/* Pleine largeur sous les deux autres : plus de carte esseulée. */}
        <div className="col-span-2 lg:col-span-1">
          <StatCard
            label="MONTANT HT TOTAL"
            value={formatEuros(totalHT)}
            hint="sur la sélection"
            accent="teal"
          />
        </div>
      </div>

      {/* Recherche + organisation (filtres et tri) */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <input
          className="field-input col-span-2 sm:max-w-xs sm:flex-1 sm:min-w-[12rem]"
          placeholder="Rechercher (client, véhicule, n° sinistre, assureur, expert…)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="field-input w-full sm:w-auto"
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value)}
          title="Filtrer par statut"
        >
          <option value="">Tous les statuts</option>
          {statutsPresents.map((s) => (
            <option key={s} value={s}>
              {libelleStatut(s, metier)}
            </option>
          ))}
        </select>
        <select
          className="field-input w-full sm:w-auto"
          value={filtreExpert}
          onChange={(e) => setFiltreExpert(e.target.value)}
          title="Filtrer par cabinet d'expert"
        >
          <option value="">Tous les cabinets d&apos;expert</option>
          {expertsPresents.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select
          className="field-input w-full sm:w-auto"
          value={filtrePart}
          onChange={(e) => setFiltrePart(e.target.value)}
          title="Filtrer par particularité (courtier, agrément…)"
        >
          <option value="">Toutes les particularités</option>
          {catalogue.map((p) => (
            <option key={p.id} value={p.id}>{p.nom}</option>
          ))}
        </select>
        <select
          className="field-input w-full sm:w-auto"
          value={`${tri.cle}:${tri.sens}`}
          onChange={(e) => {
            const [cle, sens] = e.target.value.split(":") as [CleTri, "asc" | "desc"];
            setTri({ cle, sens });
          }}
          title="Trier les dossiers"
        >
          {/* Un clic sur un en-tête de colonne peut produire une combinaison
              absente de cette liste : on l'ajoute alors dynamiquement, sinon
              le select affichait « plus récents » alors que le tableau était
              trié autrement. */}
          {!TRIS_PREDEFINIS.includes(`${tri.cle}:${tri.sens}`) && (
            <option value={`${tri.cle}:${tri.sens}`}>
              Tri : {LIBELLE_COLONNE[tri.cle] || tri.cle} ({tri.sens === "asc" ? "croissant" : "décroissant"})
            </option>
          )}
          <option value="created_at:desc">Tri : plus récents</option>
          <option value="date_sinistre:desc">Date du sinistre (récent → ancien)</option>
          <option value="date_sinistre:asc">Date du sinistre (ancien → récent)</option>
          <option value="statut:asc">Statut (début → fin de pipeline)</option>
          <option value="statut:desc">Statut (fin → début de pipeline)</option>
          <option value="expert:asc">Cabinet d&apos;expert (A → Z)</option>
          <option value="montant:desc">Montant HT (décroissant)</option>
          <option value="client_nom:asc">Client (A → Z)</option>
        </select>
        {filtresActifs && (
          <button onClick={reinitialiser} className="btn-ghost col-span-2 text-sm sm:col-span-1">
            Réinitialiser
          </button>
        )}
      </div>

      {/* Période : du … au …, sur la date du sinistre ou la date d'ajout.
          Chaque champ est étiqueté : lisible et aligné, y compris sur mobile. */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
        <div className="col-span-2 sm:w-auto">
          <label className="field-label text-[11px]">Période</label>
          <select
            className="field-input w-full sm:w-auto"
            value={champDate}
            onChange={(e) => setChampDate(e.target.value as "date_sinistre" | "created_at")}
            title="Sur quelle date porte la période"
          >
            <option value="date_sinistre">sur la date du sinistre</option>
            <option value="created_at">sur la date d&apos;ajout</option>
          </select>
        </div>
        <div>
          <label className="field-label text-[11px]">Du</label>
          <input type="date" className="field-input w-full" value={du} onChange={(e) => setDu(e.target.value)} />
        </div>
        <div>
          <label className="field-label text-[11px]">Au</label>
          <input type="date" className="field-input w-full" value={au} onChange={(e) => setAu(e.target.value)} />
        </div>
        {(du || au) && (
          <button
            onClick={() => { setDu(""); setAu(""); }}
            className="col-span-2 pb-2 text-left text-xs text-white/45 hover:text-white hover:underline sm:col-span-1"
          >
            effacer la période
          </button>
        )}
      </div>

      {/* ---------- MOBILE : une carte par dossier (le tableau débordait) ---------- */}
      <div className="space-y-2 sm:hidden">
        {loading && <p className="py-6 text-center text-sm text-white/40">Chargement…</p>}
        {!loading && visibles.length === 0 && (
          <p className="py-6 text-center text-sm text-white/40">
            {filtresActifs ? "Aucun dossier ne correspond aux filtres." : `Aucun dossier.`}
          </p>
        )}
        {visibles.map((d) => (
          <button
            key={d.id}
            onClick={() => router.push(`/sinistres/${d.id}`)}
            className="glass-card block w-full p-3 text-left"
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
              <span className="shrink-0 text-sm font-semibold text-white tabular-nums">
                {formatEuros(d.montant)}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatutBadge statut={d.statut} />
              {d.mode_cession && (
                <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
                  Cession
                </span>
              )}
              {(partsParDossier[d.id] || []).map((p) => (
                <span
                  key={p.id}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeParticularite(p.couleur)}`}
                >
                  {p.nom}
                </span>
              ))}
            </div>

            {/* Référence puis barre d'avancement PLEINE LARGEUR : côte à côte,
                le pourcentage venait se superposer au numéro de dossier. */}
            <div className="mt-2 truncate text-[11px] text-white/35">
              {d.numero_sinistre || "sans n°"}
              {formatDate(d.date_sinistre) !== "—" ? ` · ${formatDate(d.date_sinistre)}` : ""}
            </div>
            <div className="mt-1.5">
              <ProgressionDossier statut={d.statut} size="sm" />
            </div>
          </button>
        ))}
      </div>

      {/* ---------- DESKTOP : tableau harmonisé, une ligne = une hauteur ---------- */}
      <div className="glass-card hidden overflow-x-auto sm:block">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[15%]" />
            <col className="w-[16%]" />
            <col className="hidden md:table-column md:w-[18%]" />
            <col className="w-[11%]" />
            <col className="hidden xl:table-column xl:w-[13%]" />
            <col className="hidden lg:table-column lg:w-[10%]" />
            <col className="w-[17%]" />
            <col className="w-[12%]" />
            <col className="hidden lg:table-column lg:w-[7%]" />
          </colgroup>
          <thead className="text-left text-white/50">
            <tr>
              <ThTri label={t.numeroDossier} cle="numero_sinistre" tri={tri} onSort={trierPar} fleche={fleche} />
              <ThTri label="Client" cle="client_nom" tri={tri} onSort={trierPar} fleche={fleche} />
              <ThTri label="Véhicule" cle="marque_modele" tri={tri} onSort={trierPar} fleche={fleche} className="hidden md:table-cell" />
              <ThTri label="Immat." cle="immatriculation" tri={tri} onSort={trierPar} fleche={fleche} />
              <ThTri label="Assureur" cle="assureur" tri={tri} onSort={trierPar} fleche={fleche} className="hidden xl:table-cell" />
              <ThTri label={t.dateDossier} cle="date_sinistre" tri={tri} onSort={trierPar} fleche={fleche} className="hidden lg:table-cell" />
              <ThTri label="Statut" cle="statut" tri={tri} onSort={trierPar} fleche={fleche} />
              <ThTri label="Montant HT" cle="montant" tri={tri} onSort={trierPar} fleche={fleche} align="right" />
              <th className="cellule hidden font-medium lg:table-cell">Rapport</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-white/40">Chargement…</td></tr>
            )}
            {!loading && visibles.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-white/40">
                {filtresActifs
                  ? "Aucun dossier ne correspond aux filtres."
                  : `Aucun dossier. Clique sur « + ${t.ajouter} »${metier === "carrosserie" ? " ou importe un rapport" : ""}.`}
              </td></tr>
            )}
            {visibles.map((d) => (
              <tr
                key={d.id}
                onClick={() => router.push(`/sinistres/${d.id}`)}
                className="cursor-pointer border-t border-white/5 hover:bg-white/5"
              >
                <td className="cellule">
                  <div className="truncate font-medium text-white" title={d.numero_sinistre || ""}>
                    {d.numero_sinistre || "—"}
                  </div>
                </td>
                <td className="cellule">
                  <div className="truncate text-white/80" title={d.client_nom || ""}>
                    {d.client_nom || "—"}
                  </div>
                  {(partsParDossier[d.id] || []).length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {(partsParDossier[d.id] || []).slice(0, 2).map((p) => (
                        <span
                          key={p.id}
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badgeParticularite(p.couleur)}`}
                        >
                          {p.nom}
                        </span>
                      ))}
                      {(partsParDossier[d.id] || []).length > 2 && (
                        <span className="text-[10px] text-white/35">
                          +{(partsParDossier[d.id] || []).length - 2}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="cellule hidden md:table-cell">
                  <div className="truncate text-white/80" title={d.marque_modele || ""}>
                    {d.marque_modele || "—"}
                  </div>
                </td>
                <td className="cellule whitespace-nowrap text-white/80">{d.immatriculation || "—"}</td>
                <td className="cellule hidden xl:table-cell">
                  <div className="truncate text-white/80" title={d.assureur || ""}>{d.assureur || "—"}</div>
                </td>
                <td className="cellule hidden whitespace-nowrap text-white/80 lg:table-cell">
                  {formatDate(d.date_sinistre)}
                </td>
                <td className="cellule">
                  <div className="flex flex-wrap items-center gap-1">
                    <StatutBadge statut={d.statut} />
                    {d.mode_cession && (
                      <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
                        Cession
                      </span>
                    )}
                  </div>
                  <div className="mt-1 w-24">
                    <ProgressionDossier statut={d.statut} size="sm" />
                  </div>
                </td>
                <td className="cellule whitespace-nowrap text-right text-white/90 tabular-nums">
                  {formatEuros(d.montant)}
                </td>
                <td className="cellule hidden lg:table-cell">
                  {d.rapport_path ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        ouvrirFichier("rapports", d.rapport_path!);
                      }}
                      className="text-accent-pink hover:underline"
                    >
                      Voir
                    </button>
                  ) : (
                    <span className="text-white/30">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <DossierForm
          onClose={() => setShowForm(false)}
          onSaved={(id) => (id ? router.push(`/sinistres/${id}`) : load())}
        />
      )}
    </div>
  );
}

// En-tête de colonne cliquable (tri ascendant/descendant).
function ThTri({
  label,
  cle,
  tri,
  onSort,
  fleche,
  className = "",
  align = "left",
}: {
  label: string;
  cle: CleTri;
  tri: Tri;
  onSort: (cle: CleTri) => void;
  fleche: (cle: CleTri) => ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  const actif = tri.cle === cle;
  return (
    <th className={`px-4 py-3 font-medium ${align === "right" ? "text-right" : ""} ${className}`}>
      <button
        onClick={() => onSort(cle)}
        className={`inline-flex items-center gap-0.5 hover:text-white transition-colors ${
          actif ? "text-white" : ""
        } ${align === "right" ? "flex-row-reverse" : ""}`}
        title="Trier"
      >
        {label}
        {fleche(cle)}
      </button>
    </th>
  );
}
