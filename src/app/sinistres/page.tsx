"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Dossier } from "@/lib/types";
import {
  formatEuros,
  formatDate,
  indexStatut,
  libelleStatut,
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

// Valeur comparable d'un dossier selon la clé de tri.
function valeurTri(d: Dossier, cle: CleTri): string | number {
  switch (cle) {
    case "statut":
      return indexStatut(d.statut);
    case "montant":
      return d.montant ?? -Infinity;
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
  const [tri, setTri] = useState<Tri>({ cle: "created_at", sens: "desc" });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("dossiers")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setDossiers(data as Dossier[]);
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

  // Filtrage (recherche + statut + expert).
  const filtered = useMemo(() => {
    return actifs.filter((d) => {
      if (filtreStatut && d.statut !== filtreStatut) return false;
      if (filtreExpert && cabinetExpert(d) !== filtreExpert) return false;
      if (!term) return true;
      return [d.numero_sinistre, d.client_nom, d.marque_modele, d.immatriculation, d.assureur, cabinetExpert(d)]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(term));
    });
  }, [actifs, filtreStatut, filtreExpert, term]);

  // Tri.
  const visibles = useMemo(() => {
    const copie = [...filtered];
    copie.sort((a, b) => {
      const va = valeurTri(a, tri.cle);
      const vb = valeurTri(b, tri.cle);
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), "fr");
      return tri.sens === "asc" ? cmp : -cmp;
    });
    return copie;
  }, [filtered, tri]);

  // Synthèse (sur la sélection visible).
  const totalHT = visibles.reduce((s, d) => s + (d.montant || 0), 0);
  const enCours = visibles.filter((d) => d.statut !== "cloture").length;

  const filtresActifs = !!(term || filtreStatut || filtreExpert);
  function reinitialiser() {
    setQ("");
    setFiltreStatut("");
    setFiltreExpert("");
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
      cession: d.mode_cession ? "Oui" : "",
      reparateur: d.reparateur || "",
    }));
    const jour = new Date().toISOString().slice(0, 10);
    exporterXlsx(`suivi-dossiers-${jour}`, "Suivi dossiers", colonnes, lignes);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <h1 className="text-2xl font-semibold text-white">{t.dossiers}</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exporterExcel}
            disabled={visibles.length === 0}
            className="btn-ghost disabled:opacity-40 disabled:cursor-not-allowed"
            title="Exporter le tableau de suivi au format Excel"
          >
            ⬇ Exporter Excel
          </button>
          <Link href="/import" className="btn-ghost">{t.importer}</Link>
          <button onClick={() => setShowForm(true)} className="btn-primary">
            + {t.ajouter}
          </button>
        </div>
      </div>

      <ConfigBanner />

      {/* Synthèse de la sélection courante */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <StatCard label="DOSSIERS AFFICHES" value={String(visibles.length)} accent="violet" />
        <StatCard label="EN COURS" value={String(enCours)} hint="non clôturés" accent="pink" />
        <StatCard
          label="MONTANT HT TOTAL"
          value={formatEuros(totalHT)}
          hint="sur la sélection"
          accent="teal"
        />
      </div>

      {/* Recherche + organisation (filtres et tri) */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className="field-input max-w-xs flex-1 min-w-[12rem]"
          placeholder="Rechercher (client, véhicule, n° sinistre, assureur, expert…)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="field-input w-auto"
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
          className="field-input w-auto"
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
          className="field-input w-auto"
          value={`${tri.cle}:${tri.sens}`}
          onChange={(e) => {
            const [cle, sens] = e.target.value.split(":") as [CleTri, "asc" | "desc"];
            setTri({ cle, sens });
          }}
          title="Trier les dossiers"
        >
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
          <button onClick={reinitialiser} className="btn-ghost text-sm">
            Réinitialiser
          </button>
        )}
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-white/50">
            <tr>
              <ThTri label={t.numeroDossier} cle="numero_sinistre" tri={tri} onSort={trierPar} fleche={fleche} />
              <ThTri label="Client" cle="client_nom" tri={tri} onSort={trierPar} fleche={fleche} />
              <ThTri label="Véhicule" cle="marque_modele" tri={tri} onSort={trierPar} fleche={fleche} className="hidden md:table-cell" />
              <ThTri label="Immatriculation" cle="immatriculation" tri={tri} onSort={trierPar} fleche={fleche} />
              <ThTri label="Assureur" cle="assureur" tri={tri} onSort={trierPar} fleche={fleche} className="hidden xl:table-cell" />
              <ThTri label="Cabinet" cle="expert" tri={tri} onSort={trierPar} fleche={fleche} className="hidden xl:table-cell" />
              <ThTri label={t.dateDossier} cle="date_sinistre" tri={tri} onSort={trierPar} fleche={fleche} className="hidden lg:table-cell" />
              <ThTri label="Statut" cle="statut" tri={tri} onSort={trierPar} fleche={fleche} />
              <ThTri label="Montant HT" cle="montant" tri={tri} onSort={trierPar} fleche={fleche} align="right" />
              <th className="px-4 py-3 font-medium hidden sm:table-cell">Rapport</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={10} className="px-5 py-8 text-center text-white/40">Chargement…</td></tr>
            )}
            {!loading && visibles.length === 0 && (
              <tr><td colSpan={10} className="px-5 py-8 text-center text-white/40">
                {filtresActifs
                  ? "Aucun dossier ne correspond aux filtres."
                  : `Aucun dossier. Clique sur « + ${t.ajouter} »${metier === "carrosserie" ? " ou importe un rapport" : ""}.`}
              </td></tr>
            )}
            {visibles.map((d) => (
              <tr
                key={d.id}
                onClick={() => router.push(`/sinistres/${d.id}`)}
                className="border-t border-white/5 hover:bg-white/5 cursor-pointer"
              >
                <td className="px-4 py-3 font-medium text-white">{d.numero_sinistre || "—"}</td>
                <td className="px-4 py-3 text-white/80">{d.client_nom || "—"}</td>
                <td className="px-4 py-3 text-white/80 hidden md:table-cell">{d.marque_modele || "—"}</td>
                <td className="px-4 py-3 text-white/80 whitespace-nowrap">{d.immatriculation || "—"}</td>
                <td className="px-4 py-3 text-white/80 hidden xl:table-cell">{d.assureur || "—"}</td>
                <td className="px-4 py-3 text-white/80 hidden xl:table-cell">{cabinetExpert(d) || "—"}</td>
                <td className="px-4 py-3 text-white/80 hidden lg:table-cell">{formatDate(d.date_sinistre)}</td>
                <td className="px-5 py-3">
                  <StatutBadge statut={d.statut} />
                  {d.mode_cession && (
                    <span className="ml-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold bg-teal-100 text-teal-700">
                      Cession
                    </span>
                  )}
                  <div className="mt-1.5 w-32">
                    <ProgressionDossier statut={d.statut} size="sm" />
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-white/90 whitespace-nowrap">{formatEuros(d.montant)}</td>
                <td className="px-4 py-3 hidden sm:table-cell">
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
