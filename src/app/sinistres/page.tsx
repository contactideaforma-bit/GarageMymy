"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { dateDuCache, erreurReseau, memoriser, relire } from "@/lib/horsLigne";
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
import { ecrireEtatListe, lireEtatListe } from "@/lib/filtresListe";
import { montantTtc, tauxTva, totalTtc } from "@/lib/tva";
import DossierForm from "@/components/DossierForm";
import StatutBadge from "@/components/StatutBadge";
import ProgressionDossier from "@/components/ProgressionDossier";
import ConfigBanner from "@/components/ConfigBanner";
import StatCard from "@/components/StatCard";
import { ouvrirFichier } from "@/lib/storage";
import { useMetier } from "@/components/MetierProvider";
import { termes } from "@/lib/metier";
import { mentionsBloquantes, mentionsDepuisJson, resumeMentions } from "@/lib/mentionsRapport";
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

// Un dossier porte-t-il une note (le pense-bête de la fiche dossier) ?
function aUneNote(d: Dossier): boolean {
  return Boolean((d.note || "").trim());
}

// Pastille discrète signalant qu'une note existe — son infobulle en donne
// le début, pour savoir s'il faut ouvrir le dossier sans avoir à cliquer.
function PastilleNote({ note }: { note?: string | null }) {
  const apercu = (note || "").trim().replace(/\s+/g, " ").slice(0, 140);
  return (
    <span
      title={`Note du dossier : ${apercu}${(note || "").trim().length > 140 ? "…" : ""}`}
      aria-label="Ce dossier contient une note"
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400/25 text-[9px] leading-none text-amber-200 ring-1 ring-amber-300/40"
    >
      ✎
    </span>
  );
}

// Filtre appliqué, retirable d'un clic (barre de recherche compacte).
function PastilleFiltre({ label, onRetirer }: { label: string; onRetirer: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-white/10 py-0.5 pl-2.5 pr-1.5 text-[11px] text-white/75">
      <span className="truncate">{label}</span>
      <button
        onClick={onRetirer}
        className="text-white/40 hover:text-rose-300"
        title="Retirer ce filtre"
        aria-label={`Retirer le filtre ${label}`}
      >
        ×
      </button>
    </span>
  );
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

/* ==================================================================
 *  MÉMOIRE DE LA SÉLECTION (v7.7)
 *  On ouvre un dossier depuis une liste filtrée, on revient : on doit
 *  retrouver EXACTEMENT la même sélection (filtres, tri, recherche) et
 *  la même position de défilement. Stocké pour la session de l'onglet.
 * ================================================================== */
const CLE_ETAT_LISTE = "sinistres.selection";

/* ==================================================================
 *  LARGEURS DE COLONNES AJUSTABLES (v10.9)
 *  Une poignée à droite de chaque en-tête : glisser = redimensionner,
 *  double-clic = revenir à la largeur automatique. Mémorisé sur
 *  l'appareil (localStorage) — chacun règle son tableau.
 * ================================================================== */
const CLE_LARGEURS = "mea.sinistres.colonnes";

/** Bornes (v12.2) : en dessous de 96 px le contenu d'une cellule chevauchait
 *  la colonne voisine ; au-delà de 560 px le tableau sort de l'écran. */
const LARGEUR_MIN = 96;
const LARGEUR_MAX = 560;
function borneLargeur(px: number): number {
  return Math.min(LARGEUR_MAX, Math.max(LARGEUR_MIN, px));
}

function lireLargeurs(): Record<string, number> {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_LARGEURS) || "{}");
    return brut && typeof brut === "object" ? brut : {};
  } catch {
    return {};
  }
}
function ecrireLargeurs(l: Record<string, number>) {
  try {
    localStorage.setItem(CLE_LARGEURS, JSON.stringify(l));
  } catch {
    /* stockage indisponible : le réglage vaut pour la session */
  }
}

type EtatListe = {
  q: string;
  filtreStatut: string;
  filtreExpert: string;
  filtrePart: string;
  filtreLitige: string; // "" tous · "oui" en litige · "non" sans litige (v10.8)
  champDate: "date_sinistre" | "created_at";
  du: string;
  au: string;
  triCle: CleTri;
  triSens: "asc" | "desc";
  scroll: number;
};

const ETAT_VIDE: EtatListe = {
  q: "",
  filtreStatut: "",
  filtreExpert: "",
  filtrePart: "",
  filtreLitige: "",
  champDate: "date_sinistre",
  du: "",
  au: "",
  triCle: "created_at",
  triSens: "desc",
  scroll: 0,
};

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
  // Litige (v10.8) : filtre plutôt qu'un onglet — trop d'onglets sinon.
  const [filtreLitige, setFiltreLitige] = useState<string>("");
  const [tri, setTri] = useState<Tri>({ cle: "created_at", sens: "desc" });
  // Panneau de filtres REPLIÉ par défaut (v7.8) : au-dessus de la liste, cinq
  // grands champs côte à côte mangeaient la moitié de l'écran. Ce qui reste
  // toujours visible : la recherche, le tri, et des pastilles rappelant les
  // filtres actifs.
  const [filtresOuverts, setFiltresOuverts] = useState(false);
  // Largeurs de colonnes réglées à la souris (v10.9), mémorisées par appareil.
  const [largeurs, setLargeurs] = useState<Record<string, number>>({});
  useEffect(() => setLargeurs(lireLargeurs()), []);
  const changerLargeur = useCallback((cle: string, px: number | null) => {
    setLargeurs((prev) => {
      const suiv = { ...prev };
      if (px == null) delete suiv[cle];
      else suiv[cle] = Math.round(borneLargeur(px));
      ecrireLargeurs(suiv);
      return suiv;
    });
  }, []);

  // Date de la copie locale affichée quand le réseau est absent (v47).
  const [copieLocale, setCopieLocale] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("dossiers")
      .select("*")
      .order("created_at", { ascending: false });
    // MODE DÉGRADÉ (v47) : la liste des dossiers est l'écran le plus
    // consulté dans l'atelier — il doit rester lisible sans réseau.
    if (error && erreurReseau(error)) {
      const cache = await relire<Dossier[]>("liste-sinistres");
      if (cache) {
        setDossiers(cache.donnees);
        setCopieLocale(cache.le);
        setLoading(false);
        return;
      }
    }
    if (data) {
      setDossiers(data as Dossier[]);
      setCopieLocale(null);
      memoriser("liste-sinistres", data as Dossier[]);
    }
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

  // ---------- Mémoire de la sélection ----------
  // Restauration APRÈS le montage (le sessionStorage n'existe pas côté serveur).
  const [selectionPrete, setSelectionPrete] = useState(false);
  const scrollARestaurer = useRef<number>(0);

  useEffect(() => {
    const e = lireEtatListe(CLE_ETAT_LISTE, ETAT_VIDE);
    setQ(e.q);
    setFiltreStatut(e.filtreStatut);
    setFiltreExpert(e.filtreExpert);
    setFiltrePart(e.filtrePart);
    setFiltreLitige(e.filtreLitige || "");
    setChampDate(e.champDate);
    setDu(e.du);
    setAu(e.au);
    setTri({ cle: e.triCle, sens: e.triSens });
    scrollARestaurer.current = e.scroll || 0;
    setSelectionPrete(true);
  }, []);

  const etatCourant = useCallback(
    (scroll = 0): EtatListe => ({
      q,
      filtreStatut,
      filtreExpert,
      filtrePart,
      filtreLitige,
      champDate,
      du,
      au,
      triCle: tri.cle,
      triSens: tri.sens,
      scroll,
    }),
    [q, filtreStatut, filtreExpert, filtrePart, filtreLitige, champDate, du, au, tri]
  );

  // Enregistrement à chaque changement — mais JAMAIS avant la restauration,
  // sinon l'état vide du premier rendu écraserait la sélection mémorisée.
  useEffect(() => {
    if (!selectionPrete) return;
    ecrireEtatListe(CLE_ETAT_LISTE, etatCourant(0));
  }, [selectionPrete, etatCourant]);

  // Retour depuis un dossier : on remet la liste là où elle était.
  useEffect(() => {
    if (loading || !selectionPrete) return;
    const y = scrollARestaurer.current;
    if (!y) return;
    scrollARestaurer.current = 0;
    // Après peinture, sinon la page n'est pas encore assez haute pour défiler.
    requestAnimationFrame(() => window.scrollTo({ top: y }));
  }, [loading, selectionPrete]);

  // Ouvrir un dossier : on garde la position de défilement pour le retour.
  const ouvrirDossier = useCallback(
    (id: string) => {
      ecrireEtatListe(CLE_ETAT_LISTE, etatCourant(window.scrollY));
      router.push(`/sinistres/${id}`);
    },
    [etatCourant, router]
  );

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
      if (filtreLitige === "oui" && !d.litige) return false;
      if (filtreLitige === "non" && d.litige) return false;
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
  }, [actifs, filtreStatut, filtreExpert, filtrePart, filtreLitige, partsParDossier, champDate, du, au, term]);

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

  // Synthèse (sur la sélection visible) — en HT ET en TTC : le HT est le
  // chiffre du rapport, le TTC celui que voient le client et l'assurance.
  const totalHT = visibles.reduce((s, d) => s + (d.montant || 0), 0);
  const totalTTC = totalTtc(visibles);
  const enCours = visibles.filter((d) => estActif(d.statut)).length;

  const filtresActifs = !!(term || filtreStatut || filtreExpert || filtrePart || filtreLitige || du || au);
  // Nombre de filtres repliés actifs (la recherche, elle, reste visible).
  const nbFiltres =
    (filtreStatut ? 1 : 0) + (filtreExpert ? 1 : 0) + (filtrePart ? 1 : 0) + (filtreLitige ? 1 : 0) + (du || au ? 1 : 0);
  const nomParticularite = catalogue.find((p) => p.id === filtrePart)?.nom || "";
  function reinitialiser() {
    setQ("");
    setFiltreStatut("");
    setFiltreExpert("");
    setFiltrePart("");
    setFiltreLitige("");
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
      { header: "Montant TTC", key: "montant_ttc", type: "euro", width: 14 },
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
      montant_ttc: d.montant != null ? montantTtc(d) : "",
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
        <div className="mb-2 sm:mb-0">
          <h1 className="titre-page">{t.dossiers}</h1>
          {copieLocale && (
            <p className="mt-1 text-xs text-amber-300">
              Hors ligne — liste du {dateDuCache(copieLocale)} enregistrée sur cet appareil
            </p>
          )}
        </div>
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
            label="MONTANT TOTAL"
            value={`${formatEuros(totalHT)} HT`}
            hint={`${formatEuros(totalTTC)} TTC · sur la sélection`}
            accent="teal"
          />
        </div>
      </div>

      {/* ---------- Barre de recherche COMPACTE (v7.8) ----------
           Une seule ligne : recherche + « Filtres » repliable + tri. Les
           filtres actifs restent visibles sous forme de pastilles, chacune
           retirable d'un clic. */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          className="field-input field-compact min-w-[10rem] flex-1 sm:max-w-sm"
          placeholder="Rechercher un dossier…"
          title="Rechercher par client, véhicule, immatriculation, n° de sinistre, assureur ou cabinet d'expert"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <button
          onClick={() => setFiltresOuverts((v) => !v)}
          className="btn-ghost btn-compact inline-flex items-center gap-1.5 whitespace-nowrap"
          title="Filtrer par statut, cabinet, particularité ou période"
          aria-expanded={filtresOuverts}
        >
          Filtres
          {nbFiltres > 0 && (
            <span className="rounded-full bg-accent-teal/25 px-1.5 text-[10px] font-bold text-accent-teal">
              {nbFiltres}
            </span>
          )}
          <span className="text-[10px] text-white/40">{filtresOuverts ? "▲" : "▼"}</span>
        </button>

        <select
          className="field-input field-compact w-auto max-w-[13rem]"
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
          <button
            onClick={reinitialiser}
            className="text-xs text-white/45 underline-offset-2 hover:text-white hover:underline"
          >
            Tout effacer
          </button>
        )}
      </div>

      {/* Pastilles des filtres actifs — on voit ce qui est appliqué même
          quand le panneau est replié, et on le retire d'un clic. */}
      {nbFiltres > 0 && !filtresOuverts && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {filtreStatut && (
            <PastilleFiltre label={libelleStatut(filtreStatut, metier)} onRetirer={() => setFiltreStatut("")} />
          )}
          {filtreExpert && <PastilleFiltre label={filtreExpert} onRetirer={() => setFiltreExpert("")} />}
          {filtrePart && <PastilleFiltre label={nomParticularite} onRetirer={() => setFiltrePart("")} />}
          {filtreLitige && (
            <PastilleFiltre label={filtreLitige === "oui" ? "⚠ En litige" : "Sans litige"} onRetirer={() => setFiltreLitige("")} />
          )}
          {(du || au) && (
            <PastilleFiltre
              label={`${champDate === "created_at" ? "Ajout" : "Sinistre"} ${du ? `du ${du}` : ""}${au ? ` au ${au}` : ""}`}
              onRetirer={() => { setDu(""); setAu(""); }}
            />
          )}
        </div>
      )}

      {/* Panneau des filtres (replié par défaut) */}
      {filtresOuverts && (
        <div className="glass-soft mb-3 grid grid-cols-1 gap-2 rounded-xl p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="field-label text-[11px]">Statut</label>
            <select
              className="field-input field-compact"
              value={filtreStatut}
              onChange={(e) => setFiltreStatut(e.target.value)}
            >
              <option value="">Tous les statuts</option>
              {statutsPresents.map((st) => (
                <option key={st} value={st}>{libelleStatut(st, metier)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label text-[11px]">Cabinet d&apos;expert</label>
            <select
              className="field-input field-compact"
              value={filtreExpert}
              onChange={(e) => setFiltreExpert(e.target.value)}
            >
              <option value="">Tous les cabinets</option>
              {expertsPresents.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label text-[11px]">Particularité</label>
            <select
              className="field-input field-compact"
              value={filtrePart}
              onChange={(e) => setFiltrePart(e.target.value)}
            >
              <option value="">Toutes</option>
              {catalogue.map((p) => (
                <option key={p.id} value={p.id}>{p.nom}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label text-[11px]">Litige</label>
            <select
              className="field-input field-compact"
              value={filtreLitige}
              onChange={(e) => setFiltreLitige(e.target.value)}
              title="Dossiers en litige (mode litige activé sur la fiche)"
            >
              <option value="">Tous les dossiers</option>
              <option value="oui">⚠ En litige</option>
              <option value="non">Sans litige</option>
            </select>
          </div>

          <div>
            <label className="field-label text-[11px]">Période</label>
            <select
              className="field-input field-compact"
              value={champDate}
              onChange={(e) => setChampDate(e.target.value as "date_sinistre" | "created_at")}
              title="Sur quelle date porte la période"
            >
              <option value="date_sinistre">sur la date du sinistre</option>
              <option value="created_at">sur la date d&apos;ajout</option>
            </select>
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                type="date"
                className="field-input field-compact"
                value={du}
                onChange={(e) => setDu(e.target.value)}
                title="Du"
              />
              <span className="text-[11px] text-white/35">au</span>
              <input
                type="date"
                className="field-input field-compact"
                value={au}
                onChange={(e) => setAu(e.target.value)}
                title="Au"
              />
            </div>
          </div>
        </div>
      )}

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
            onClick={() => ouvrirDossier(d.id)}
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
              <span className="shrink-0 text-right tabular-nums">
                <span className="block text-sm font-semibold text-white">
                  {formatEuros(d.montant)} HT
                </span>
                <span className="block text-[11px] text-accent-teal">
                  {formatEuros(montantTtc(d))} TTC
                </span>
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatutBadge statut={d.statut} />
                    {d.litige && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700" title="Mode litige activé sur la fiche">
                        ⚠ Litige
                      </span>
                    )}
              <BadgeMentions dossier={d} />
              {aUneNote(d) && <PastilleNote note={d.note} />}
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
        {/* LARGEURS (v9.9) : plus de colonnes en pourcentages (leur somme
            dépassait 100 % et le statut chevauchait le montant). Chaque
            colonne a une largeur MINIMALE adaptée à son contenu ; le tableau
            s'élargit et défile horizontalement si l'écran est trop étroit. */}
        <table className={`w-full min-w-[56rem] text-sm ${Object.keys(largeurs).length ? "table-fixed" : ""}`}>
          <thead className="text-left text-white/50">
            <tr>
              <ThTri label={t.numeroDossier} cle="numero_sinistre" tri={tri} onSort={trierPar} fleche={fleche} className="w-[9rem] max-w-[9rem]" largeur={largeurs.numero_sinistre} onLargeur={changerLargeur} />
              {/* Client : réduite par défaut (v10.9) — ajustable à la souris. */}
              <ThTri label="Client" cle="client_nom" tri={tri} onSort={trierPar} fleche={fleche} className="w-[10rem]" largeur={largeurs.client_nom} onLargeur={changerLargeur} />
              <ThTri label="Véhicule" cle="marque_modele" tri={tri} onSort={trierPar} fleche={fleche} className="hidden min-w-[9rem] md:table-cell" largeur={largeurs.marque_modele} onLargeur={changerLargeur} />
              <ThTri label="Immat." cle="immatriculation" tri={tri} onSort={trierPar} fleche={fleche} className="w-[7.5rem]" largeur={largeurs.immatriculation} onLargeur={changerLargeur} />
              <ThTri label="Assureur" cle="assureur" tri={tri} onSort={trierPar} fleche={fleche} className="hidden min-w-[8rem] xl:table-cell" largeur={largeurs.assureur} onLargeur={changerLargeur} />
              <ThTri label={t.dateDossier} cle="date_sinistre" tri={tri} onSort={trierPar} fleche={fleche} className="hidden w-[7rem] lg:table-cell" largeur={largeurs.date_sinistre} onLargeur={changerLargeur} />
              <ThTri label="Statut" cle="statut" tri={tri} onSort={trierPar} fleche={fleche} className="w-[13rem] min-w-[13rem]" largeur={largeurs.statut} onLargeur={changerLargeur} />
              <ThTri label="Montant HT / TTC" cle="montant" tri={tri} onSort={trierPar} fleche={fleche} align="right" className="w-[8.5rem] min-w-[8.5rem]" largeur={largeurs.montant} onLargeur={changerLargeur} />
              <th className="cellule hidden w-[5rem] font-medium lg:table-cell">Rapport</th>
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
                onClick={() => ouvrirDossier(d.id)}
                className="cursor-pointer border-t border-white/5 hover:bg-white/5"
              >
                <td className="cellule max-w-[9rem]">
                  <div className="truncate font-medium text-white" title={d.numero_sinistre || ""}>
                    {d.numero_sinistre || "—"}
                  </div>
                </td>
                <td className="cellule max-w-[14rem]">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-white/80" title={d.client_nom || ""}>
                      {d.client_nom || "—"}
                    </span>
                    {/* Pastille « note » : ce dossier contient un pense-bête */}
                    {aUneNote(d) && <PastilleNote note={d.note} />}
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
                <td className="cellule hidden max-w-[12rem] md:table-cell">
                  <div className="truncate text-white/80" title={d.marque_modele || ""}>
                    {d.marque_modele || "—"}
                  </div>
                </td>
                <td className="cellule whitespace-nowrap text-white/80">{d.immatriculation || "—"}</td>
                <td className="cellule hidden max-w-[10rem] xl:table-cell">
                  <div className="truncate text-white/80" title={d.assureur || ""}>{d.assureur || "—"}</div>
                </td>
                <td className="cellule hidden whitespace-nowrap text-white/80 lg:table-cell">
                  {formatDate(d.date_sinistre)}
                </td>
                <td className="cellule whitespace-nowrap">
                  <div className="flex flex-wrap items-center gap-1">
                    <StatutBadge statut={d.statut} />
                    {d.litige && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700" title="Mode litige activé sur la fiche">
                        ⚠ Litige
                      </span>
                    )}
                    <BadgeMentions dossier={d} />
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
                <td className="cellule whitespace-nowrap text-right tabular-nums">
                  <div className="text-white/90">{formatEuros(d.montant)}</div>
                  <div className="text-[11px] text-accent-teal" title={`TVA ${tauxTva(d)} %`}>
                    {formatEuros(montantTtc(d))} TTC
                  </div>
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
  largeur,
  onLargeur,
}: {
  label: string;
  cle: CleTri;
  tri: Tri;
  onSort: (cle: CleTri) => void;
  fleche: (cle: CleTri) => ReactNode;
  className?: string;
  align?: "left" | "right";
  largeur?: number;
  onLargeur?: (cle: string, px: number | null) => void;
}) {
  const actif = tri.cle === cle;
  return (
    <th
      className={`relative px-4 py-3 font-medium ${align === "right" ? "text-right" : ""} ${className}`}
      style={largeur ? { width: largeur, minWidth: largeur, maxWidth: largeur } : undefined}
    >
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
      {/* Poignée : glisser = largeur manuelle (mémorisée), double-clic = auto. */}
      {onLargeur && (
        <span
          onPointerDown={(e) => {
            // v12.2 : événements POINTEUR — la poignée répond aussi au doigt
            // (tablette, téléphone en paysage), plus seulement à la souris.
            e.preventDefault();
            e.stopPropagation();
            const poignee = e.currentTarget as HTMLElement;
            const th = poignee.closest("th");
            const base = th?.offsetWidth || 120;
            const depart = e.clientX;
            try { poignee.setPointerCapture(e.pointerId); } catch { /* ignoré */ }
            const bouger = (ev: PointerEvent) => onLargeur(cle, borneLargeur(base + ev.clientX - depart));
            const lacher = () => {
              poignee.removeEventListener("pointermove", bouger);
              poignee.removeEventListener("pointerup", lacher);
              poignee.removeEventListener("pointercancel", lacher);
            };
            poignee.addEventListener("pointermove", bouger);
            poignee.addEventListener("pointerup", lacher);
            poignee.addEventListener("pointercancel", lacher);
          }}
          onDoubleClick={() => onLargeur(cle, null)}
          className="absolute -right-1 top-0 z-10 h-full w-3 cursor-col-resize touch-none rounded hover:bg-accent-pink/40 sm:w-2"
          title="Glisser pour ajuster la largeur · double-clic : automatique"
          aria-hidden
        />
      )}
    </th>
  );
}

/**
 * Badge « mention particulière » (v11.2) : conservatoire, sursis, VGE…
 * Rouge si une mention bloque la facturation, ambre sinon ; infobulle =
 * la liste. Les mentions purement informatives n'ont pas de badge.
 */
function BadgeMentions({ dossier }: { dossier: Dossier }) {
  const mentions = mentionsDepuisJson(dossier.mentions_rapport);
  const resume = resumeMentions(mentions, 2);
  if (!resume) return null;
  const bloque = mentionsBloquantes(mentions).length > 0;
  return (
    <span
      className={`badge ${bloque ? "badge-danger" : "badge-warn"}`}
      title={mentions
        .filter((m) => m.gravite !== "info")
        .map((m) => `${m.libelle}${m.montant != null ? ` (${m.montant} €)` : ""}`)
        .join(" · ")}
    >
      {bloque ? "⛔" : "⚠"} {resume}
    </span>
  );
}
