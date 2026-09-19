"use client";

// RENDEZ-VOUS D'EXPERTISE (v13.7) : création / modification. Depuis un
// dossier, le réparateur et l'adresse sont pré-remplis ; depuis l'agenda,
// on choisit le dossier (qui amène son garage) ou un garage seul.

import { useEffect, useState } from "react";
import ModalShell from "@/components/ModalShell";
import { Champ, Erreur } from "@/components/expert/ui";
import { chargerDossiers, chargerGarages, enregistrerRdv, supprimerRdv } from "@/lib/expertise/data";
import { DossierExpert, GarageExpert, RdvExpert, TYPES_RDV, adresseFiche } from "@/lib/expertise/types";
import { messageErreur } from "@/lib/format";

export default function RdvModal({
  initial,
  dossier,
  onClose,
  onSaved,
}: {
  initial?: Partial<RdvExpert> | null;
  /** Dossier d'origine (fiche dossier) : pré-remplit garage et adresse. */
  dossier?: DossierExpert | null;
  onClose: () => void;
  onSaved: (r: RdvExpert | null) => void;
}) {
  const [dossiers, setDossiers] = useState<DossierExpert[]>([]);
  const [garages, setGarages] = useState<GarageExpert[]>([]);
  const [r, setR] = useState<Partial<RdvExpert>>(() => ({
    date: new Date().toISOString().slice(0, 10),
    heure: "09:00",
    duree_min: 45,
    type: "visite",
    statut: "planifie",
    dossier_id: dossier?.id || null,
    garage_id: dossier?.garage_id || null,
    lieu: dossier?.reparateur_nom || null,
    adresse: dossier?.reparateur_adresse?.replace(/\n/g, ", ") || null,
    ...(initial || {}),
    ...(initial?.heure ? { heure: initial.heure.slice(0, 5) } : {}),
  }));
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    chargerDossiers().then(({ dossiers: d }) => setDossiers(d.filter((x) => x.statut !== "cloture")));
    chargerGarages().then(setGarages);
  }, []);

  const set = (k: keyof RdvExpert, v: unknown) => setR((p) => ({ ...p, [k]: v }));

  function choisirDossier(id: string) {
    const d = dossiers.find((x) => x.id === id);
    setR((p) => ({
      ...p,
      dossier_id: id || null,
      garage_id: d?.garage_id || p.garage_id || null,
      lieu: d?.reparateur_nom || p.lieu || null,
      adresse: d?.reparateur_adresse?.replace(/\n/g, ", ") || p.adresse || null,
    }));
  }
  function choisirGarage(id: string) {
    const g = garages.find((x) => x.id === id);
    setR((p) => ({ ...p, garage_id: id || null, lieu: g ? g.nom : p.lieu, adresse: g ? adresseFiche(g) : p.adresse }));
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!r.date) { setErreur("Indique la date."); return; }
    setEnvoi(true); setErreur(null);
    try {
      const saved = await enregistrerRdv({ ...r, heure: r.heure ? `${r.heure.slice(0, 5)}:00` : null, duree_min: Number(r.duree_min) || 45 });
      onSaved(saved);
    } catch (err) { setErreur(messageErreur(err, "Enregistrement impossible (migration v77 exécutée ?).")); } finally { setEnvoi(false); }
  }

  const dossierChoisi = dossiers.find((d) => d.id === r.dossier_id);
  return (
    <ModalShell title={initial?.id ? "Modifier le rendez-vous" : "Planifier un rendez-vous"} onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={enregistrer} className="space-y-3">
        <Erreur message={erreur} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Champ label="Dossier" className="sm:col-span-3">
            <select className="field-input" value={r.dossier_id || ""} onChange={(e) => choisirDossier(e.target.value)} disabled={Boolean(dossier)}>
              <option value="">— sans dossier —</option>
              {(dossier ? [dossier, ...dossiers.filter((d) => d.id !== dossier.id)] : dossiers).map((d) => (
                <option key={d.id} value={d.id}>{d.numero} · {[d.immatriculation, d.marque, d.modele].filter(Boolean).join(" ")}{d.lese_nom ? ` — ${d.lese_nom}` : ""}</option>
              ))}
            </select>
          </Champ>
          <Champ label="Type">
            <select className="field-input" value={r.type || "visite"} onChange={(e) => set("type", e.target.value)}>
              {TYPES_RDV.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </Champ>
          <Champ label="Date"><input type="date" className="field-input" value={r.date || ""} onChange={(e) => set("date", e.target.value)} required /></Champ>
          <div className="grid grid-cols-2 gap-2">
            <Champ label="Heure"><input type="time" className="field-input" value={r.heure || ""} onChange={(e) => set("heure", e.target.value)} /></Champ>
            <Champ label="Durée (min)"><input type="number" step="15" className="field-input" value={r.duree_min ?? 45} onChange={(e) => set("duree_min", Number(e.target.value))} /></Champ>
          </div>
          <Champ label="Réparateur (base de données)" className="sm:col-span-3">
            <select className="field-input" value={r.garage_id || ""} onChange={(e) => choisirGarage(e.target.value)}>
              <option value="">— autre lieu —</option>
              {garages.map((g) => <option key={g.id} value={g.id}>{g.nom}{g.ville ? ` · ${g.ville}` : ""}</option>)}
            </select>
          </Champ>
          <Champ label="Lieu"><input className="field-input" value={r.lieu || ""} onChange={(e) => set("lieu", e.target.value)} placeholder="Garage, domicile de l'assuré…" /></Champ>
          <Champ label="Adresse" className="sm:col-span-2"><input className="field-input" value={r.adresse || ""} onChange={(e) => set("adresse", e.target.value)} /></Champ>
          <Champ label="Notes" className="sm:col-span-3"><input className="field-input" value={r.notes || ""} onChange={(e) => set("notes", e.target.value)} placeholder="Véhicule démonté, présence de l'assuré, pièces à contrôler…" /></Champ>
          {initial?.id && (
            <Champ label="Statut">
              <select className="field-input" value={r.statut || "planifie"} onChange={(e) => set("statut", e.target.value)}>
                <option value="planifie">Planifié</option><option value="fait">Effectué</option><option value="annule">Annulé</option>
              </select>
            </Champ>
          )}
        </div>
        {dossierChoisi?.date_visite && dossierChoisi.date_visite !== r.date && (
          <p className="text-xs text-white/50">La date de visite du dossier ({dossierChoisi.date_visite.split("-").reverse().join("/")}) sera mise à jour.</p>
        )}
        <div className="flex flex-wrap justify-between gap-2">
          {initial?.id ? (
            <button type="button" className="btn-danger btn-compact" onClick={async () => { if (confirm("Supprimer ce rendez-vous ?")) { await supprimerRdv(initial.id!); onSaved(null); } }}>Supprimer</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={envoi}>{envoi ? "Enregistrement…" : "Enregistrer"}</button>
          </div>
        </div>
      </form>
    </ModalShell>
  );
}
