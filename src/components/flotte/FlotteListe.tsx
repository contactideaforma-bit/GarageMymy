"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fetchAuth, lireReponse } from "@/lib/apiClient";
import { Dossier, FlotteVehicule } from "@/lib/types";
import { formatDate, formatEuros, messageErreur } from "@/lib/format";
import {
  alerteAssurance,
  ALERTE_INFO,
  joursAvantAlerte,
  estConforme,
  dossierActifPourImmat,
  estSinistre,
} from "@/lib/flotte";
import StatCard from "@/components/StatCard";
import ConfigBanner from "@/components/ConfigBanner";
import VehiculeForm from "@/components/flotte/VehiculeForm";
import MiseADispoModal from "@/components/flotte/MiseADispoModal";

type Filtre = "tous" | "loues" | "disponibles" | "sinistres" | "alertes";

/**
 * Liste de la flotte (v12.3) : chaque véhicule ouvre sa FICHE (documents,
 * assurance, entretiens, prêts / locations). Le même composant sert
 * l'onglet « Flotte hors garage » (véhicules au nom de tiers) pour les
 * comptes autorisés : horsGarage = true.
 */
export default function FlotteListe({ horsGarage = false }: { horsGarage?: boolean }) {
  const router = useRouter();
  const [vehicules, setVehicules] = useState<FlotteVehicule[]>([]);
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [recherche, setRecherche] = useState("");
  const [editModal, setEditModal] = useState<{
    vehicule?: FlotteVehicule;
    prefill?: Partial<FlotteVehicule>;
    document?: { fichier: File; type: string };
  } | null>(null);
  const [locModal, setLocModal] = useState<{ vehicule: FlotteVehicule; type: string } | null>(null);
  const [analyseCg, setAnalyseCg] = useState(false);
  const [cgError, setCgError] = useState<string | null>(null);
  const cgInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [v0, d] = await Promise.all([
      supabase.from("flotte_vehicules").select("*").eq("hors_garage", horsGarage).order("created_at", { ascending: false }),
      supabase.from("dossiers").select("*"),
    ]);
    let v = v0;
    // Migration v67 non exécutée (colonne absente) : on affiche tout dans la flotte du garage.
    if (v.error && /hors_garage|column|colonne/i.test(v.error.message || "")) {
      v = await supabase.from("flotte_vehicules").select("*").order("created_at", { ascending: false });
    }
    setVehicules((v.data as FlotteVehicule[]) || []);
    setDossiers((d.data as Dossier[]) || []);
    setLoading(false);
  }, [horsGarage]);

  useEffect(() => { load(); }, [load]);

  async function supprimer(v: FlotteVehicule) {
    if (!confirm(`Supprimer ${v.immatriculation} de la flotte ?`)) return;
    await supabase.from("flotte_vehicules").delete().eq("id", v.id);
    load();
  }

  // Photo de la carte grise → extraction IA → formulaire pré-rempli
  async function importerCarteGrise(file: File) {
    setAnalyseCg(true);
    setCgError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetchAuth("/api/extract-carte-grise", { method: "POST", body: fd });
      const rep = await lireReponse<{ data: unknown }>(res);
      if (!rep.ok || !rep.data) throw new Error(rep.error || "Échec de l'analyse.");
      const d = rep.data.data as {
        immatriculation?: string | null;
        marque?: string | null;
        modele?: string | null;
        numero_serie?: string | null;
        premiere_circulation?: string | null;
        date_certificat?: string | null;
        titulaire?: string | null;
        cotitulaire?: string | null;
        titulaire_adresse?: string | null;
        energie?: string | null;
        puissance_fiscale?: number | null;
        puissance_kw?: number | null;
        genre?: string | null;
        carrosserie?: string | null;
        places?: number | null;
        ptac?: number | null;
        couleur?: string | null;
        numero_formule?: string | null;
      };
      // Tout ce qui n'a pas de champ dédié va dans les notes, pour ne rien perdre.
      const notes = [
        d.titulaire ? `Titulaire carte grise : ${d.titulaire}${d.cotitulaire ? ` (co-titulaire ${d.cotitulaire})` : ""}` : "",
        d.titulaire_adresse ? `Adresse titulaire : ${d.titulaire_adresse}` : "",
        d.puissance_fiscale != null ? `${d.puissance_fiscale} CV fiscaux` : "",
        d.puissance_kw != null ? `${d.puissance_kw} kW` : "",
        d.genre ? `Genre ${d.genre}` : "",
        d.carrosserie ? `Carrosserie ${d.carrosserie}` : "",
        d.places != null ? `${d.places} places` : "",
        d.ptac != null ? `PTAC ${d.ptac} kg` : "",
        d.date_certificat ? `Carte grise établie le ${d.date_certificat}` : "",
        d.numero_formule ? `N° de formule ${d.numero_formule}` : "",
      ].filter(Boolean).join("\n");
      setEditModal({
        prefill: {
          immatriculation: d.immatriculation || "",
          marque_modele: [d.marque, d.modele].filter(Boolean).join(" ") || null,
          vin: d.numero_serie || null,
          date_mise_circulation: d.premiere_circulation || null,
          carburant: d.energie || null,
          couleur: d.couleur || null,
          titulaire_cg: d.titulaire || null,
          cg_ok: Boolean(d.immatriculation),
          commentaire: d.puissance_fiscale != null ? `${d.puissance_fiscale} CV${d.energie ? ` · ${d.energie}` : ""}` : null,
          notes: notes || null,
        },
        // La photo de la carte grise est conservée : elle sera rangée dans
        // les documents du véhicule dès l'enregistrement.
        document: { fichier: file, type: "carte_grise" },
      });
    } catch (err: unknown) {
      setCgError(messageErreur(err, "Analyse impossible : réessaie avec une photo plus nette."));
    } finally {
      setAnalyseCg(false);
      if (cgInputRef.current) cgInputRef.current.value = "";
    }
  }

  const enrichis = useMemo(
    () =>
      vehicules.map((v) => {
        const dossierActif = dossierActifPourImmat(v.immatriculation, dossiers);
        return {
          ...v,
          dossierActif,
          sinistre: estSinistre(v, dossierActif),
          alerte: alerteAssurance(v),
          conforme: estConforme(v),
        };
      }),
    [vehicules, dossiers]
  );

  const kpi = useMemo(() => {
    const loues = enrichis.filter((v) => v.loue).length;
    const sinistres = enrichis.filter((v) => v.sinistre).length;
    const alertes = enrichis.filter((v) => v.alerte === "bientot" || v.alerte === "expiree").length;
    return { total: enrichis.length, loues, disponibles: enrichis.length - loues, sinistres, alertes };
  }, [enrichis]);

  const filtres = enrichis.filter((v) => {
    if (recherche) {
      const q = recherche.toLowerCase();
      const hay = `${v.immatriculation} ${v.marque_modele || ""} ${v.conducteur || ""} ${v.locataire || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filtre === "loues") return v.loue;
    if (filtre === "disponibles") return !v.loue;
    if (filtre === "sinistres") return v.sinistre;
    if (filtre === "alertes") return v.alerte === "bientot" || v.alerte === "expiree";
    return true;
  });

  const FILTRES: { key: Filtre; label: string }[] = [
    { key: "tous", label: "Tous" },
    { key: "loues", label: "Sortis" },
    { key: "disponibles", label: "Disponibles" },
    { key: "sinistres", label: "Sinistrés" },
    { key: "alertes", label: "Alertes assurance" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="titre-page">{horsGarage ? "Flotte hors garage" : "Flotte du garage"}</h1>
          {horsGarage && (
            <p className="text-xs text-white/50">Véhicules qui t&apos;appartiennent mais immatriculés au nom d&apos;un tiers — suivi complet, à part de la flotte du garage.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={cgInputRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importerCarteGrise(f);
            }}
          />
          <button onClick={() => cgInputRef.current?.click()} disabled={analyseCg} className="btn-ghost">
            {analyseCg ? "Analyse de la carte grise…" : "Ajouter par carte grise"}
          </button>
          <button onClick={() => setEditModal({})} className="btn-primary">+ Véhicule</button>
        </div>
      </div>
      <ConfigBanner />
      {cgError && (
        <div className="mb-4 rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">
          {cgError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Véhicules" value={String(kpi.total)} />
        <StatCard label="Sortis (prêtés / loués)" value={String(kpi.loues)} hint={`${kpi.disponibles} disponible${kpi.disponibles > 1 ? "s" : ""}`} />
        <StatCard label="Sinistrés" value={String(kpi.sinistres)} />
        <StatCard label="Alertes assurance" value={String(kpi.alertes)} hint="J+40 après souscription" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
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
        <input
          className="field-input ml-auto max-w-xs"
          placeholder="Rechercher (immat, modèle, nom…)"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-white/50">
            <tr>
              <th className="px-5 py-3 font-medium">Véhicule</th>
              <th className="px-5 py-3 font-medium">Statut</th>
              <th className="px-5 py-3 font-medium">Sinistre</th>
              <th className="px-5 py-3 font-medium">Assurance</th>
              <th className="px-5 py-3 font-medium">Conformité</th>
              <th className="px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-white/40">Chargement…</td></tr>
            )}
            {!loading && filtres.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-white/40">
                  {vehicules.length === 0
                    ? "Aucun véhicule dans la flotte. Ajoute ta première voiture avec « + Véhicule »."
                    : "Rien pour ce filtre."}
                </td>
              </tr>
            )}
            {filtres.map((v) => (
              <tr key={v.id} className="border-t border-white/5 hover:bg-white/5">
                <td className="px-5 py-3">
                  <Link href={`/flotte/${v.id}`} className="font-medium text-white hover:underline">{v.immatriculation}</Link>
                  <div className="text-xs text-white/50">
                    {v.marque_modele || "—"}
                    {v.conducteur ? ` · ${v.conducteur}` : ""}
                    {horsGarage && v.titulaire_cg ? ` · CG : ${v.titulaire_cg}` : ""}
                  </div>
                </td>
                <td className="px-5 py-3">
                  {v.loue ? (
                    <>
                      <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-violet-100 text-violet-700">
                        Sorti
                      </span>
                      <div className="mt-1 text-xs text-white/50">
                        {v.locataire || "—"}
                        {v.location_fin ? ` · retour ${formatDate(v.location_fin)}` : ""}
                        {v.prix_jour != null ? ` · ${formatEuros(v.prix_jour)}/j` : ""}
                      </div>
                    </>
                  ) : (
                    <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700">
                      Disponible
                    </span>
                  )}
                </td>
                <td className="px-5 py-3">
                  {v.sinistre ? (
                    v.dossierActif ? (
                      <Link
                        href={`/sinistres/${v.dossierActif.id}`}
                        className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-rose-100 text-rose-700 hover:underline"
                        title="Voir le dossier sinistre"
                      >
                        Sinistré → dossier
                      </Link>
                    ) : (
                      <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-rose-100 text-rose-700">
                        Sinistré {v.date_sinistre ? `(${formatDate(v.date_sinistre)})` : ""}
                      </span>
                    )
                  ) : (
                    <span className="text-xs text-white/30">—</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ALERTE_INFO[v.alerte].badge}`}>
                    {ALERTE_INFO[v.alerte].label}
                  </span>
                  {v.date_assurance && (
                    <div className="mt-1 text-xs text-white/40">
                      {v.assurance ? `${v.assurance} · ` : ""}
                      {(() => {
                        const j = joursAvantAlerte(v.date_assurance);
                        if (j === null) return "";
                        return j < 0 ? `dépassée de ${-j} j` : `échéance dans ${j} j`;
                      })()}
                    </div>
                  )}
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-2 text-xs">
                    <Pastille ok={v.ct_ok} label="CT" />
                    <Pastille ok={v.cg_ok} label="CG" />
                    <Pastille ok={v.entretien_ok} label="Entretien" />
                  </div>
                </td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  <Link href={`/flotte/${v.id}`} className="text-white hover:underline mr-3 font-medium">
                    Fiche
                  </Link>
                  {v.loue ? (
                    <Link href={`/flotte/${v.id}`} className="text-accent-teal hover:underline mr-3">
                      Retour
                    </Link>
                  ) : (
                    <>
                      <button onClick={() => setLocModal({ vehicule: v, type: "pret" })} className="text-accent-teal hover:underline mr-3">
                        Prêter
                      </button>
                      <button onClick={() => setLocModal({ vehicule: v, type: "location" })} className="text-accent-teal hover:underline mr-3">
                        Louer
                      </button>
                    </>
                  )}
                  <button onClick={() => setEditModal({ vehicule: v })} className="text-accent-pink hover:underline mr-3">
                    Modifier
                  </button>
                  <button onClick={() => supprimer(v)} className="text-white/40 hover:text-rose-300">
                    Suppr.
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-white/40">
        Clique sur une immatriculation pour ouvrir la fiche (documents, assurance, entretiens, prêts / locations, « qui avait le véhicule le… »).
        « Sinistré → dossier » apparaît automatiquement quand l&apos;immatriculation correspond à un dossier en cours.
        L&apos;alerte assurance se déclenche {`${40}`} jours après la date de souscription (orange ≤ 10 j, rouge dépassée).
      </p>

      {editModal && (
        <VehiculeForm
          vehicule={editModal.vehicule}
          prefill={editModal.prefill}
          documentInitial={editModal.document}
          horsGarage={horsGarage}
          onClose={() => setEditModal(null)}
          onSaved={(id) => {
            const creation = !editModal.vehicule;
            setEditModal(null);
            // Un véhicule créé s'ouvre directement sur sa fiche (documents, assurance…).
            if (creation) router.push(`/flotte/${id}`);
            else load();
          }}
        />
      )}
      {locModal && (
        <MiseADispoModal
          vehicule={locModal.vehicule}
          type={locModal.type}
          onClose={() => setLocModal(null)}
          onSaved={() => { setLocModal(null); load(); }}
        />
      )}
    </div>
  );
}

function Pastille({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
        ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
      }`}
      title={`${label} ${ok ? "à jour" : "à faire"}`}
    >
      {ok ? "✓" : "✗"} {label}
    </span>
  );
}
