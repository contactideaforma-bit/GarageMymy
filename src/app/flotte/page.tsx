"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { fetchAuth } from "@/lib/apiClient";
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
import ModalShell from "@/components/ModalShell";

type Filtre = "tous" | "loues" | "disponibles" | "sinistres" | "alertes";

export default function FlottePage() {
  const [vehicules, setVehicules] = useState<FlotteVehicule[]>([]);
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [recherche, setRecherche] = useState("");
  const [editModal, setEditModal] = useState<{ vehicule?: FlotteVehicule; prefill?: Partial<FlotteVehicule> } | null>(null);
  const [locModal, setLocModal] = useState<FlotteVehicule | null>(null);
  const [analyseCg, setAnalyseCg] = useState(false);
  const [cgError, setCgError] = useState<string | null>(null);
  const cgInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [v, d] = await Promise.all([
      supabase.from("flotte_vehicules").select("*").order("created_at", { ascending: false }),
      supabase.from("dossiers").select("*"),
    ]);
    setVehicules((v.data as FlotteVehicule[]) || []);
    setDossiers((d.data as Dossier[]) || []);
    setLoading(false);
  }, []);

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
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.data) throw new Error(json.error || `Erreur (HTTP ${res.status}).`);
      const d = json.data as {
        immatriculation?: string | null;
        marque?: string | null;
        modele?: string | null;
        numero_serie?: string | null;
        premiere_circulation?: string | null;
        titulaire?: string | null;
      };
      const infos = [
        d.numero_serie ? `VIN ${d.numero_serie}` : "",
        d.premiere_circulation ? `1ère circulation ${d.premiere_circulation}` : "",
        d.titulaire ? `Titulaire carte grise : ${d.titulaire}` : "",
      ].filter(Boolean).join(" · ");
      setEditModal({
        prefill: {
          immatriculation: d.immatriculation || "",
          marque_modele: [d.marque, d.modele].filter(Boolean).join(" ") || null,
          conducteur: d.titulaire || null,
          commentaire: infos || null,
        },
      });
    } catch (err: unknown) {
      setCgError(messageErreur(err, "Analyse impossible : réessaie avec une photo plus nette."));
    } finally {
      setAnalyseCg(false);
      if (cgInputRef.current) cgInputRef.current.value = "";
    }
  }

  async function rendreVehicule(v: FlotteVehicule) {
    await supabase
      .from("flotte_vehicules")
      .update({ loue: false, locataire: null, locataire_tel: null, location_debut: null, location_fin: null })
      .eq("id", v.id);
    load();
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
    { key: "loues", label: "Loués" },
    { key: "disponibles", label: "Disponibles" },
    { key: "sinistres", label: "Sinistrés" },
    { key: "alertes", label: "Alertes assurance" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-semibold text-white">Flotte du garage</h1>
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
        <StatCard label="Loués" value={String(kpi.loues)} hint={`${kpi.disponibles} disponible${kpi.disponibles > 1 ? "s" : ""}`} />
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
              <th className="px-5 py-3 font-medium">Location</th>
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
                  <div className="font-medium text-white">{v.immatriculation}</div>
                  <div className="text-xs text-white/50">
                    {v.marque_modele || "—"}
                    {v.conducteur ? ` · ${v.conducteur}` : ""}
                  </div>
                </td>
                <td className="px-5 py-3">
                  {v.loue ? (
                    <>
                      <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-violet-100 text-violet-700">
                        Loué
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
                  {v.loue ? (
                    <button onClick={() => rendreVehicule(v)} className="text-accent-teal hover:underline mr-3">
                      Rendre
                    </button>
                  ) : (
                    <button onClick={() => setLocModal(v)} className="text-accent-teal hover:underline mr-3">
                      Louer
                    </button>
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
        « Sinistré → dossier » apparaît automatiquement quand l&apos;immatriculation correspond à un dossier en cours.
        L&apos;alerte assurance se déclenche {`${40}`} jours après la date de souscription (orange ≤ 10 j, rouge dépassée).
      </p>

      {editModal && (
        <VehiculeModal
          vehicule={editModal.vehicule}
          prefill={editModal.prefill}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); load(); }}
        />
      )}
      {locModal && (
        <LocationModal
          vehicule={locModal}
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

/* --------------------------- Modal véhicule --------------------------- */

function VehiculeModal({
  vehicule,
  prefill,
  onClose,
  onSaved,
}: {
  vehicule?: FlotteVehicule;
  prefill?: Partial<FlotteVehicule>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [immat, setImmat] = useState(vehicule?.immatriculation || prefill?.immatriculation || "");
  const [modele, setModele] = useState(vehicule?.marque_modele || prefill?.marque_modele || "");
  const [assurance, setAssurance] = useState(vehicule?.assurance || "");
  const [dateAssurance, setDateAssurance] = useState(vehicule?.date_assurance || "");
  const [dateSinistre, setDateSinistre] = useState(vehicule?.date_sinistre || "");
  const [conducteur, setConducteur] = useState(vehicule?.conducteur || prefill?.conducteur || "");
  const [conducteurTel, setConducteurTel] = useState(vehicule?.conducteur_tel || "");
  const [ct, setCt] = useState(vehicule?.ct_ok ?? false);
  const [cg, setCg] = useState(vehicule?.cg_ok ?? false);
  const [entretien, setEntretien] = useState(vehicule?.entretien_ok ?? false);
  const [prixJour, setPrixJour] = useState(vehicule?.prix_jour != null ? String(vehicule.prix_jour) : "");
  const [commentaire, setCommentaire] = useState(vehicule?.commentaire || prefill?.commentaire || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!immat.trim()) { setError("L'immatriculation est obligatoire."); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        immatriculation: immat.trim().toUpperCase(),
        marque_modele: modele || null,
        assurance: assurance || null,
        date_assurance: dateAssurance || null,
        date_sinistre: dateSinistre || null,
        conducteur: conducteur || null,
        conducteur_tel: conducteurTel || null,
        ct_ok: ct,
        cg_ok: cg,
        entretien_ok: entretien,
        prix_jour: prixJour === "" ? null : Number(prixJour),
        commentaire: commentaire || null,
      };
      const { error: e1 } = vehicule
        ? await supabase.from("flotte_vehicules").update(payload).eq("id", vehicule.id)
        : await supabase.from("flotte_vehicules").insert(payload);
      if (e1) throw e1;
      onSaved();
    } catch (err: unknown) {
      setError(messageErreur(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={vehicule ? `Modifier ${vehicule.immatriculation}` : "Ajouter un véhicule à la flotte"} onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="field-label">Immatriculation *</label>
          <input className="field-input" value={immat} onChange={(e) => setImmat(e.target.value)} placeholder="AB-123-CD" />
        </div>
        <div>
          <label className="field-label">Marque et modèle</label>
          <input className="field-input" value={modele} onChange={(e) => setModele(e.target.value)} placeholder="Renault Clio V" />
        </div>
        <div>
          <label className="field-label">Assurance</label>
          <input className="field-input" value={assurance} onChange={(e) => setAssurance(e.target.value)} placeholder="Compagnie / contrat" />
        </div>
        <div>
          <label className="field-label">Date de souscription assurance</label>
          <input type="date" className="field-input" value={dateAssurance} onChange={(e) => setDateAssurance(e.target.value)} />
          <p className="mt-1 text-xs text-white/40">Alerte automatique 40 jours après.</p>
        </div>
        <div>
          <label className="field-label">Conducteur habituel</label>
          <input className="field-input" value={conducteur} onChange={(e) => setConducteur(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Téléphone conducteur</label>
          <input className="field-input" value={conducteurTel} onChange={(e) => setConducteurTel(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Date de sinistre (si sinistré)</label>
          <input type="date" className="field-input" value={dateSinistre} onChange={(e) => setDateSinistre(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Prix location (€/jour)</label>
          <input type="number" className="field-input" value={prixJour} onChange={(e) => setPrixJour(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="field-label">Conformité</label>
        <div className="flex flex-wrap gap-4 text-sm text-white/80">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={ct} onChange={(e) => setCt(e.target.checked)} /> Contrôle technique
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={cg} onChange={(e) => setCg(e.target.checked)} /> Carte grise
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={entretien} onChange={(e) => setEntretien(e.target.checked)} /> Entretien
          </label>
        </div>
      </div>

      <div>
        <label className="field-label">Commentaire</label>
        <textarea className="field-input" rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
      </div>

      {error && (
        <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">{error}</div>
      )}
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">Annuler</button>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </ModalShell>
  );
}

/* --------------------------- Modal location --------------------------- */

function LocationModal({
  vehicule,
  onClose,
  onSaved,
}: {
  vehicule: FlotteVehicule;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [locataire, setLocataire] = useState("");
  const [tel, setTel] = useState("");
  const [debut, setDebut] = useState(new Date().toISOString().slice(0, 10));
  const [fin, setFin] = useState("");
  const [prixJour, setPrixJour] = useState(vehicule.prix_jour != null ? String(vehicule.prix_jour) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!locataire.trim()) { setError("Indique le nom du locataire."); return; }
    setSaving(true);
    setError(null);
    try {
      const { error: e1 } = await supabase
        .from("flotte_vehicules")
        .update({
          loue: true,
          locataire: locataire.trim(),
          locataire_tel: tel || null,
          location_debut: debut || null,
          location_fin: fin || null,
          prix_jour: prixJour === "" ? null : Number(prixJour),
        })
        .eq("id", vehicule.id);
      if (e1) throw e1;
      onSaved();
    } catch (err: unknown) {
      setError(messageErreur(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Louer ${vehicule.immatriculation}`} onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="field-label">Locataire *</label>
          <input className="field-input" value={locataire} onChange={(e) => setLocataire(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Téléphone</label>
          <input className="field-input" value={tel} onChange={(e) => setTel(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Début</label>
          <input type="date" className="field-input" value={debut} onChange={(e) => setDebut(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Retour prévu</label>
          <input type="date" className="field-input" value={fin} onChange={(e) => setFin(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Prix (€/jour)</label>
          <input type="number" className="field-input" value={prixJour} onChange={(e) => setPrixJour(e.target.value)} />
        </div>
      </div>
      {error && (
        <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">{error}</div>
      )}
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">Annuler</button>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "Enregistrement…" : "Démarrer la location"}
        </button>
      </div>
    </ModalShell>
  );
}
