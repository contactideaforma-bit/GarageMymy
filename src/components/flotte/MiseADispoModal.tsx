"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Client, Dossier, Entreprise, FlotteMiseADispo, FlotteVehicule } from "@/lib/types";
import { formatEuros, messageErreur, ymd } from "@/lib/format";
import { TYPES_MAD, synchroniserStatutVehicule } from "@/lib/flotte";
import {
  PRISES_EN_CHARGE,
  clausesMiseADispo,
  conducteurDepuisClient,
  conducteurDepuisDossier,
  coutMiseADispoHt,
  defautsMiseADispo,
  joursPret,
} from "@/lib/pret";
import { apercuContratMiseADispoPdf } from "@/lib/pdf";
import ModalShell from "@/components/ModalShell";
import DossierPicker, { libelleDossier } from "@/components/DossierPicker";

type Form = {
  conducteur_nom: string; conducteur_tel: string; conducteur_email: string; conducteur_adresse: string;
  conducteur_naissance: string; permis_numero: string; permis_date: string;
  date_debut: string; date_fin: string; km_depart: string; carburant_depart: string; observations_depart: string;
  tarif_jour: string; tarif_horaire: string; franchise: string; km_jour: string; prix_km: string; prise_en_charge: string; caution: string;
  signataire_nom: string; notes: string;
};

/**
 * PRÊTER / LOUER un véhicule de la flotte (v12.3).
 *
 * Le conducteur vient d'un dossier sinistre (l'assuré), d'une fiche client
 * de l'annuaire, ou est saisi à la main — puis chaque donnée reste
 * modifiable. Le contrat (conditions générales) est généré avec les tarifs,
 * modifiable, signé ensuite depuis la fiche véhicule.
 */
export default function MiseADispoModal({
  vehicule,
  type,
  mad,
  onClose,
  onSaved,
}: {
  vehicule: FlotteVehicule;
  type: string; // pret | location
  /** Mise à disposition existante (modification du contrat). */
  mad?: FlotteMiseADispo;
  onClose: () => void;
  onSaved: (m: FlotteMiseADispo) => void;
}) {
  const [entreprise, setEntreprise] = useState<Partial<Entreprise> | null>(null);
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [clientId, setClientId] = useState<string | null>(mad?.client_id || null);
  const [pickDossier, setPickDossier] = useState(false);
  const [pickClient, setPickClient] = useState(false);
  const [qClient, setQClient] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const location = type === "location";
  const info = TYPES_MAD[type] || TYPES_MAD.pret;
  const defauts = useMemo(() => defautsMiseADispo(type, entreprise, vehicule), [type, entreprise, vehicule]);

  const s = (v: unknown) => (v == null ? "" : String(v));
  const [f, setF] = useState<Form>({
    conducteur_nom: s(mad?.conducteur_nom), conducteur_tel: s(mad?.conducteur_tel), conducteur_email: s(mad?.conducteur_email),
    conducteur_adresse: s(mad?.conducteur_adresse), conducteur_naissance: s(mad?.conducteur_naissance),
    permis_numero: s(mad?.permis_numero), permis_date: s(mad?.permis_date),
    date_debut: mad?.date_debut || ymd(), date_fin: s(mad?.date_fin),
    km_depart: s(mad?.km_depart ?? vehicule.kilometrage), carburant_depart: s(mad?.carburant_depart), observations_depart: s(mad?.observations_depart),
    tarif_jour: s(mad?.tarif_jour), tarif_horaire: s(mad?.tarif_horaire), franchise: s(mad?.franchise), km_jour: s(mad?.km_jour), prix_km: s(mad?.prix_km),
    prise_en_charge: mad?.prise_en_charge || "client", caution: s(mad?.caution),
    signataire_nom: s(mad?.signataire_nom), notes: s(mad?.notes),
  });
  const [clauses, setClauses] = useState(mad?.clauses || "");
  const [tarifsPoses, setTarifsPoses] = useState(Boolean(mad));
  const set = (k: keyof Form, v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    // Profil absent → objet vide : les tarifs par défaut (véhicule) se posent quand même.
    supabase.from("entreprise").select("*").limit(1).maybeSingle().then(({ data }) => setEntreprise((data as Entreprise) || {}));
    supabase.from("dossiers").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      const liste = ((data as Dossier[]) || []).filter((d) => !d.archive);
      setDossiers(liste);
      if (mad?.dossier_id) setDossier(liste.find((d) => d.id === mad.dossier_id) || null);
    });
    supabase.from("clients").select("*").order("nom").then(({ data }) => setClients((data as Client[]) || []));
  }, [mad?.dossier_id]);

  // Tarifs par défaut posés une fois le profil chargé (création seulement).
  useEffect(() => {
    if (tarifsPoses || !entreprise) return;
    setF((x) => ({
      ...x,
      tarif_jour: s(defauts.tarif_jour), tarif_horaire: s(defauts.tarif_horaire), franchise: s(defauts.franchise),
      km_jour: s(defauts.km_jour), prix_km: s(defauts.prix_km),
    }));
    setTarifsPoses(true);
  }, [entreprise, defauts, tarifsPoses]);

  function appliquer(p: Partial<FlotteMiseADispo>) {
    setF((x) => ({
      ...x,
      conducteur_nom: s(p.conducteur_nom) || x.conducteur_nom,
      conducteur_tel: s(p.conducteur_tel) || x.conducteur_tel,
      conducteur_email: s(p.conducteur_email) || x.conducteur_email,
      conducteur_adresse: s(p.conducteur_adresse) || x.conducteur_adresse,
      date_debut: p.date_debut || x.date_debut,
      date_fin: p.date_fin || x.date_fin,
      prise_en_charge: location && p.prise_en_charge ? p.prise_en_charge : x.prise_en_charge,
      signataire_nom: s(p.conducteur_nom) || x.signataire_nom,
    }));
  }
  function choisirDossier(d: Dossier) {
    setDossier(d);
    setClientId(null);
    appliquer(conducteurDepuisDossier(d));
    setPickDossier(false);
  }
  function choisirClient(c: Client) {
    setClientId(c.id);
    setDossier(null);
    appliquer(conducteurDepuisClient(c));
    setPickClient(false);
  }

  const num = (v: string): number | null => (v.trim() === "" ? null : Number(String(v).replace(",", ".")) || 0);
  const txt = (v: string) => (v.trim() ? v.trim() : null);

  function valeurs(): FlotteMiseADispo {
    return {
      id: mad?.id || "",
      created_at: mad?.created_at || new Date().toISOString(),
      vehicule_id: vehicule.id,
      type,
      statut: mad?.statut || "en_cours",
      dossier_id: dossier?.id || null,
      client_id: clientId,
      transfert_id: mad?.transfert_id || null,
      conducteur_nom: txt(f.conducteur_nom), conducteur_tel: txt(f.conducteur_tel), conducteur_email: txt(f.conducteur_email),
      conducteur_adresse: txt(f.conducteur_adresse), conducteur_naissance: f.conducteur_naissance || null,
      permis_numero: txt(f.permis_numero), permis_date: f.permis_date || null,
      date_debut: f.date_debut || null, date_fin: f.date_fin || null, date_retour: mad?.date_retour || null,
      km_depart: num(f.km_depart), km_retour: mad?.km_retour ?? null,
      carburant_depart: txt(f.carburant_depart), carburant_retour: mad?.carburant_retour ?? null,
      observations_depart: txt(f.observations_depart), observations_retour: mad?.observations_retour ?? null,
      tarif_jour: location ? num(f.tarif_jour) : 0, tarif_horaire: location ? num(f.tarif_horaire) : null,
      franchise: num(f.franchise), km_jour: num(f.km_jour), prix_km: num(f.prix_km),
      prise_en_charge: location ? f.prise_en_charge : "client", caution: location ? num(f.caution) : null,
      clauses: clauses.trim() || null,
      signataire_nom: txt(f.signataire_nom), signature: mad?.signature || null, signe_le: mad?.signe_le || null,
      cg_acceptees: mad?.cg_acceptees || false,
      notes: txt(f.notes),
    };
  }

  function regenererClauses() {
    if (clauses.trim() && !confirm("Remplacer le texte des conditions générales par le texte par défaut (calculé avec les données ci-dessus) ?")) return;
    setClauses(clausesMiseADispo({ ...valeurs(), clauses: null }, vehicule, entreprise, dossier));
  }

  async function enregistrer(puis?: "pdf") {
    if (!f.conducteur_nom.trim()) { setError(`Indique le nom du ${info.role}.`); return; }
    if (!f.date_debut) { setError("Indique la date de début."); return; }
    setSaving(true);
    setError(null);
    const v = valeurs();
    if (!v.clauses) v.clauses = clausesMiseADispo(v, vehicule, entreprise, dossier);
    const { id, created_at, ...payload } = v;
    void id; void created_at;
    try {
      let sauve: FlotteMiseADispo;
      if (mad) {
        const { data, error: e1 } = await supabase.from("flotte_mises_a_dispo").update(payload).eq("id", mad.id).select("*").single();
        if (e1) throw e1;
        sauve = data as FlotteMiseADispo;
      } else {
        const { data, error: e1 } = await supabase.from("flotte_mises_a_dispo").insert(payload).select("*").single();
        if (e1) throw e1;
        sauve = data as FlotteMiseADispo;
        // Trace dans le dossier sinistre lié.
        if (dossier) {
          await supabase.from("evenements").insert({
            dossier_id: dossier.id,
            titre: `${info.label} du véhicule ${vehicule.immatriculation}`,
            description: `${vehicule.marque_modele || ""} ${location ? "loué" : "prêté"} à ${v.conducteur_nom} du ${v.date_debut}${v.date_fin ? ` au ${v.date_fin}` : ""}.`,
            date_evenement: new Date().toISOString(),
            categorie: "autre",
          });
        }
      }
      await synchroniserStatutVehicule(vehicule.id);
      if (puis === "pdf") await apercuContratMiseADispoPdf(sauve, vehicule, dossier);
      onSaved(sauve);
    } catch (err) {
      setError(messageErreur(err, "Enregistrement impossible (migration v67 exécutée ?)."));
    } finally {
      setSaving(false);
    }
  }

  const jours = joursPret(f.date_debut, f.date_fin);
  const estimation = location ? coutMiseADispoHt(valeurs()) : 0;
  const clientChoisi = clients.find((c) => c.id === clientId) || null;
  const clientsFiltres = useMemo(() => {
    const q = qClient.trim().toLowerCase();
    return (q ? clients.filter((c) => `${c.nom || ""} ${c.telephone || ""} ${c.email || ""} ${c.ville || ""}`.toLowerCase().includes(q)) : clients).slice(0, 30);
  }, [clients, qClient]);

  return (
    <ModalShell title={`${mad ? "Contrat" : info.verbe} — ${vehicule.immatriculation}${vehicule.marque_modele ? ` · ${vehicule.marque_modele}` : ""}`} onClose={onClose} maxWidth="max-w-3xl">
      {/* Source du conducteur */}
      <div className="glass-soft p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">Lié à</div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setPickDossier(true)} className={`btn-ghost py-1.5 px-3 text-xs ${dossier ? "ring-1 ring-accent-teal" : ""}`}>
            {dossier ? `Sinistre : ${libelleDossier(dossier)}` : "Un dossier sinistre (l'assuré)"}
          </button>
          <button onClick={() => setPickClient(true)} className={`btn-ghost py-1.5 px-3 text-xs ${clientChoisi ? "ring-1 ring-accent-teal" : ""}`}>
            {clientChoisi ? `Client : ${clientChoisi.nom || "—"}` : "Une fiche client"}
          </button>
          {(dossier || clientChoisi) && (
            <button onClick={() => { setDossier(null); setClientId(null); }} className="text-xs text-white/40 hover:underline">Détacher</button>
          )}
          {dossier && <Link href={`/sinistres/${dossier.id}`} className="text-xs text-accent-teal hover:underline">Ouvrir le dossier ↗</Link>}
        </div>
        <p className="mt-1 text-xs text-white/40">Les coordonnées ci-dessous sont pré-remplies depuis le dossier ou la fiche client, puis modifiables.</p>
      </div>

      {/* Conducteur */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2"><label className="field-label">{location ? "Locataire" : "Emprunteur"} *</label><input className="field-input" value={f.conducteur_nom} onChange={(e) => set("conducteur_nom", e.target.value)} /></div>
        <div><label className="field-label">Téléphone</label><input className="field-input" value={f.conducteur_tel} onChange={(e) => set("conducteur_tel", e.target.value)} /></div>
        <div><label className="field-label">Email</label><input type="email" className="field-input" value={f.conducteur_email} onChange={(e) => set("conducteur_email", e.target.value)} /></div>
        <div className="col-span-2 sm:col-span-4"><label className="field-label">Adresse</label><input className="field-input" value={f.conducteur_adresse} onChange={(e) => set("conducteur_adresse", e.target.value)} /></div>
        <div><label className="field-label">Né(e) le</label><input type="date" className="field-input" value={f.conducteur_naissance} onChange={(e) => set("conducteur_naissance", e.target.value)} /></div>
        <div><label className="field-label">Permis délivré le</label><input type="date" className="field-input" value={f.permis_date} onChange={(e) => set("permis_date", e.target.value)} /></div>
        <div className="col-span-2"><label className="field-label">N° de permis</label><input className="field-input" value={f.permis_numero} onChange={(e) => set("permis_numero", e.target.value)} /></div>
      </div>

      {/* Période & départ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><label className="field-label">Début *</label><input type="date" className="field-input" value={f.date_debut} onChange={(e) => set("date_debut", e.target.value)} /></div>
        <div><label className="field-label">Retour prévu</label><input type="date" className="field-input" value={f.date_fin} onChange={(e) => set("date_fin", e.target.value)} /></div>
        <div><label className="field-label">Km au départ</label><input inputMode="numeric" className="field-input" value={f.km_depart} onChange={(e) => set("km_depart", e.target.value)} /></div>
        <div><label className="field-label">Carburant au départ</label><input className="field-input" value={f.carburant_depart} onChange={(e) => set("carburant_depart", e.target.value)} placeholder="ex. 3/4" /></div>
      </div>
      <div>
        <label className="field-label">État du véhicule au départ (rayures, équipements, accessoires remis…)</label>
        <textarea className="field-input" rows={2} value={f.observations_depart} onChange={(e) => set("observations_depart", e.target.value)} />
        <p className="mt-1 text-xs text-white/40">Les photos avant / après se prennent depuis la fiche véhicule, une fois le contrat créé.</p>
      </div>

      {/* Conditions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {location && (
          <>
            <div><label className="field-label">Tarif € HT / jour</label><input inputMode="decimal" className="field-input" value={f.tarif_jour} onChange={(e) => set("tarif_jour", e.target.value)} /></div>
            <div><label className="field-label">Tarif € HT / heure</label><input inputMode="decimal" className="field-input" value={f.tarif_horaire} onChange={(e) => set("tarif_horaire", e.target.value)} placeholder="optionnel" /></div>
            <div><label className="field-label">Dépôt de garantie €</label><input inputMode="decimal" className="field-input" value={f.caution} onChange={(e) => set("caution", e.target.value)} /></div>
            <div>
              <label className="field-label">Frais pris en charge par</label>
              <select className="field-input" value={f.prise_en_charge} onChange={(e) => set("prise_en_charge", e.target.value)}>
                {Object.keys(PRISES_EN_CHARGE).map((k) => <option key={k} value={k}>{k === "assurance" ? "L'assurance (sinistre)" : "Le locataire"}</option>)}
              </select>
            </div>
          </>
        )}
        <div><label className="field-label">Franchise €</label><input inputMode="decimal" className="field-input" value={f.franchise} onChange={(e) => set("franchise", e.target.value)} /></div>
        <div><label className="field-label">Km inclus / jour</label><input inputMode="numeric" className="field-input" value={f.km_jour} onChange={(e) => set("km_jour", e.target.value)} placeholder="vide = libre" /></div>
        <div><label className="field-label">€ HT / km au-delà</label><input inputMode="decimal" className="field-input" value={f.prix_km} onChange={(e) => set("prix_km", e.target.value)} /></div>
      </div>
      <div className="glass-soft px-3 py-2 text-xs text-white/70">
        {jours ? `${jours} jour(s)` : "Durée non renseignée"}
        {location ? (Number(f.tarif_jour) > 0 ? ` · estimation ${formatEuros(estimation)} HT` : " · location sans tarif journalier") : " · prêt à titre gratuit (prêt à usage)"}
      </div>

      {/* Conditions générales */}
      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <label className="field-label mb-0">Conditions générales de {location ? "location" : "prêt"} (modifiables — un article par paragraphe)</label>
          <button onClick={regenererClauses} className="text-xs text-accent-teal hover:underline">↺ Texte par défaut avec ces données</button>
        </div>
        <textarea className="field-input font-mono text-xs" rows={10} value={clauses} onChange={(e) => setClauses(e.target.value)} placeholder="Généré automatiquement à l'enregistrement si laissé vide." />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className="field-label">Nom du signataire</label><input className="field-input" value={f.signataire_nom} onChange={(e) => set("signataire_nom", e.target.value)} placeholder={f.conducteur_nom} /></div>
        <div><label className="field-label">Notes internes</label><input className="field-input" value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>
      </div>

      {error && <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</div>}
      <div className="flex flex-wrap justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Annuler</button>
        <button onClick={() => enregistrer("pdf")} disabled={saving} className="btn-ghost">Enregistrer + aperçu PDF</button>
        <button onClick={() => enregistrer()} disabled={saving} className="btn-primary">{saving ? "…" : mad ? "Enregistrer" : `Démarrer ${location ? "la location" : "le prêt"}`}</button>
      </div>

      {pickDossier && (
        <DossierPicker dossiers={dossiers} onChoisir={choisirDossier} onFermer={() => setPickDossier(false)} titre="Lier à un dossier sinistre" />
      )}
      {pickClient && (
        <ModalShell title="Choisir une fiche client" onClose={() => setPickClient(false)}>
          <input autoFocus className="field-input" placeholder="Nom, téléphone, email, ville…" value={qClient} onChange={(e) => setQClient(e.target.value)} />
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {clientsFiltres.length === 0 && <p className="text-sm text-white/40">Aucun client. L&apos;annuaire se remplit depuis les dossiers ou à la main (Base de données).</p>}
            {clientsFiltres.map((c) => (
              <button key={c.id} onClick={() => choisirClient(c)} className="glass-soft block w-full px-3 py-2 text-left text-sm hover:bg-white/10">
                <div className="text-white">{c.nom || "—"}</div>
                <div className="text-xs text-white/50">{[c.telephone, c.email, c.ville].filter(Boolean).join(" · ") || "—"}</div>
              </button>
            ))}
          </div>
        </ModalShell>
      )}
    </ModalShell>
  );
}
