"use client";

// Formulaire de MISSION D'EXPERTISE (création / modification) — v13.5.
// Sections repliées : Mission · Mandant · Lésé · Réparateur · Véhicule · Dommage.
// « Lire la carte grise » : photo ou PDF → /api/extract-carte-grise (IA)
// pré-remplit le véhicule.

import { useEffect, useRef, useState } from "react";
import Icone from "@/components/expert/Icone";
import ModalShell from "@/components/ModalShell";
import { Champ, Erreur } from "@/components/expert/ui";
import { fetchAuth, lireReponse } from "@/lib/apiClient";
import { messageErreur } from "@/lib/format";
import RechercheSiren, { ResultatSiren } from "@/components/RechercheSiren";
import { chargerAssurances, chargerClients, chargerGarages, completerAnnuaireDepuisDossier, creerDossier, enregistrerGarage, majDossier } from "@/lib/expertise/data";
import { AssuranceExpert, ClientExpert, DossierExpert, GarageExpert, STATUTS_EXPERTISE, adresseFiche } from "@/lib/expertise/types";

const LIEUX = ["Autre lieu", "Chez le réparateur", "Au cabinet", "Chez l'assuré", "Expertise à distance (EAD)"];
const TYPES = ["Avant travaux", "En cours de travaux", "Après travaux", "Contradictoire", "Valeur vénale", "Contre-expertise"];
const GENRES = ["Voiture Particulière (Y Compris Commerciale)", "Camionnette", "Véhicule utilitaire", "Motocyclette", "Camping-car", "Remorque"];
const CARROSSERIES = ["Conduite Intérieure", "Break", "Coupé", "Cabriolet", "Monospace", "Fourgon", "Pick-up", "Berline"];
const ENERGIES = ["Essence", "Diesel", "Essence Electricité (Rechargeable)", "Essence Electricité (Non rechargeable)", "Diesel Electricité", "Électrique", "GPL", "Hydrogène"];
const DOMMAGES = ["Circulation", "Stationnement", "Vol / tentative de vol", "Vandalisme", "Incendie", "Grêle", "Bris de glace", "Catastrophe naturelle", "Autre"];
const INTENSITES = ["faible", "moyenne", "forte", "intensité"];
const PNEUS = ["10 %", "20 %", "30 %", "40 %", "50 %", "60 %", "70 %", "80 %", "90 %", "100 %"];

type Section = "mission" | "mandant" | "lese" | "reparateur" | "vehicule" | "dommage";

const VIDE: Partial<DossierExpert> = {
  statut: "mission",
  lieu_expertise: "Autre lieu",
  type_expertise: "Avant travaux",
  genre: GENRES[0],
  carrosserie: CARROSSERIES[0],
  etat_general: "Normal",
  pneu_avg: "20 %", pneu_avd: "20 %", pneu_arg: "20 %", pneu_ard: "20 %",
  dommage_type: "Circulation",
  vehicule_reparable: true,
  conclusions: {},
};

export default function DossierExpertForm({
  initial,
  onClose,
  onSaved,
}: {
  initial?: DossierExpert | null;
  onClose: () => void;
  onSaved: (d: DossierExpert) => void;
}) {
  const [d, setD] = useState<Partial<DossierExpert>>(initial ? { ...initial } : { ...VIDE, date_mission: new Date().toISOString().slice(0, 10) });
  const [garages, setGarages] = useState<GarageExpert[]>([]);
  // v13.6 : base de données du cabinet → mandant / lésé choisis dans une liste.
  const [assurances, setAssurances] = useState<AssuranceExpert[]>([]);
  const [clients, setClients] = useState<ClientExpert[]>([]);
  const [creationGarage, setCreationGarage] = useState(false);
  const [ouvert, setOuvert] = useState<Record<Section, boolean>>({ mission: true, mandant: true, lese: !initial, reparateur: !initial, vehicule: true, dommage: !initial });
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [lectureCg, setLectureCg] = useState(false);
  const fichierCg = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chargerGarages().then(setGarages);
    chargerAssurances().then(setAssurances).catch(() => undefined);
    chargerClients().then(setClients).catch(() => undefined);
  }, []);

  function choisirAssurance(id: string) {
    const a = assurances.find((x) => x.id === id);
    if (!a) return;
    setD((prev) => ({ ...prev, mandant_nom: a.nom, mandant_adresse: adresseFiche(a) || prev.mandant_adresse, mandant_email: a.email || prev.mandant_email }));
  }
  function choisirClient(id: string) {
    const c = clients.find((x) => x.id === id);
    if (!c) return;
    setD((prev) => ({
      ...prev,
      lese_nom: c.nom,
      lese_adresse: [c.adresse, [c.code_postal, c.ville].filter(Boolean).join(" ")].filter(Boolean).join("\n") || prev.lese_adresse,
      lese_email: c.email || prev.lese_email,
      lese_tel: c.tel || prev.lese_tel,
    }));
  }
  /** « 🔍 SIRET » côté réparateur : la fiche est créée dans la base et sélectionnée. */
  async function garageDepuisSiren(r: ResultatSiren) {
    setCreationGarage(true);
    try {
      const deja = garages.find((g) => (g.siret && g.siret === r.siret) || g.nom.toLowerCase() === r.nom.toLowerCase());
      const g = deja || (await enregistrerGarage({ nom: r.nom, adresse: r.adresse || null, code_postal: r.codePostal || null, ville: r.ville || null, siret: r.siret || null, taux_t1: 65, taux_t2: 70, taux_t3: 75, taux_peinture: 70 }));
      if (!deja) setGarages((prev) => [...prev, g].sort((a, b) => a.nom.localeCompare(b.nom)));
      setD((prev) => ({
        ...prev,
        garage_id: g.id,
        reparateur_nom: g.nom,
        reparateur_adresse: [g.adresse, [g.code_postal, g.ville].filter(Boolean).join(" ")].filter(Boolean).join("\n"),
        reparateur_siret: g.siret,
      }));
    } catch (e) {
      setErreur(messageErreur(e, "Création du réparateur impossible."));
    } finally {
      setCreationGarage(false);
    }
  }

  const set = (k: keyof DossierExpert, v: unknown) => setD((prev) => ({ ...prev, [k]: v }));
  const basculer = (s: Section) => setOuvert((o) => ({ ...o, [s]: !o[s] }));

  function choisirGarage(id: string) {
    const g = garages.find((x) => x.id === id);
    setD((prev) => ({
      ...prev,
      garage_id: id || null,
      reparateur_nom: g ? g.nom : prev.reparateur_nom,
      reparateur_adresse: g ? [g.adresse, [g.code_postal, g.ville].filter(Boolean).join(" ")].filter(Boolean).join("\n") : prev.reparateur_adresse,
      reparateur_siret: g ? g.siret : prev.reparateur_siret,
    }));
  }

  async function lireCarteGrise(file: File) {
    setLectureCg(true);
    setErreur(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetchAuth("/api/extract-carte-grise", { method: "POST", body: form });
      const r = await lireReponse<{ data: Record<string, unknown> }>(res);
      if (!r.ok || !r.data?.data) throw new Error(r.error || "Carte grise illisible.");
      const cg = r.data.data as Record<string, string | number | null>;
      setD((prev) => ({
        ...prev,
        immatriculation: (cg.immatriculation as string) || prev.immatriculation,
        marque: (cg.marque as string) || prev.marque,
        modele: (cg.modele as string) || prev.modele,
        vin: (cg.numero_serie as string) || prev.vin,
        date_mec: (cg.premiere_circulation as string) || prev.date_mec,
        date_certificat: (cg.date_certificat as string) || prev.date_certificat,
        energie: (cg.energie as string) || prev.energie,
        places: (cg.places as number) || prev.places,
        couleur: (cg.couleur as string) || prev.couleur,
        numero_formule: (cg.numero_formule as string) || prev.numero_formule,
        lese_nom: prev.lese_nom || (cg.titulaire as string) || null,
        lese_adresse: prev.lese_adresse || (cg.titulaire_adresse as string) || null,
      }));
      setOuvert((o) => ({ ...o, vehicule: true }));
    } catch (e) {
      setErreur(messageErreur(e, "Lecture de la carte grise impossible."));
    } finally {
      setLectureCg(false);
    }
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!d.mandant_nom && !d.lese_nom) {
      setErreur("Indique au moins le mandant ou le lésé.");
      return;
    }
    setEnvoi(true);
    try {
      const nettoye: Partial<DossierExpert> = { ...d };
      for (const k of ["date_mission", "date_visite", "date_sinistre", "date_mec", "date_certificat", "validite_ct"] as const) {
        if (!nettoye[k]) nettoye[k] = null;
      }
      if (nettoye.places !== null && nettoye.places !== undefined && !Number.isFinite(Number(nettoye.places))) nettoye.places = null;
      if (nettoye.kilometrage !== null && nettoye.kilometrage !== undefined && !Number.isFinite(Number(nettoye.kilometrage))) nettoye.kilometrage = null;
      if (nettoye.immatriculation) nettoye.immatriculation = nettoye.immatriculation.toUpperCase().trim();
      const saved = initial ? await majDossier(initial.id, nettoye) : await creerDossier(nettoye);
      // Base de données : un mandant / un lésé inconnus y entrent automatiquement.
      await completerAnnuaireDepuisDossier(saved);
      onSaved(saved);
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }

  const Titre = ({ s, label, resume }: { s: Section; label: string; resume?: string | null }) => (
    <button type="button" onClick={() => basculer(s)} className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-left">
      <span className="titre-section">{label}</span>
      <span className="flex items-center gap-2 text-xs text-white/50">
        {!ouvert[s] && resume && <span className="max-w-[12rem] truncate">{resume}</span>}
        <Icone nom="chevron" className={`transition ${ouvert[s] ? "rotate-90" : ""}`} />
      </span>
    </button>
  );

  const texte = (k: keyof DossierExpert, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input className="field-input" value={(d[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} {...props} />
  );
  const choix = (k: keyof DossierExpert, options: string[]) => (
    <select className="field-input" value={(d[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)}>
      <option value="">—</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <ModalShell title={initial ? `Dossier ${initial.numero}` : "Nouvelle mission d'expertise"} onClose={onClose} maxWidth="max-w-3xl">
      <form onSubmit={enregistrer} className="space-y-3">
        <Erreur message={erreur} />

        {/* ---------------- Mission ---------------- */}
        <div className="glass-soft p-3">
          <Titre s="mission" label="Mission" resume={d.type_expertise} />
          {ouvert.mission && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Champ label="Date de mission">{texte("date_mission", { type: "date" })}</Champ>
              <Champ label="Date de visite">{texte("date_visite", { type: "date" })}</Champ>
              <Champ label="Statut">
                <select className="field-input" value={d.statut || "mission"} onChange={(e) => set("statut", e.target.value)}>
                  {STATUTS_EXPERTISE.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                </select>
              </Champ>
              <Champ label="Lieu d'expertise">{choix("lieu_expertise", LIEUX)}</Champ>
              <Champ label="Type d'expertise">{choix("type_expertise", TYPES)}</Champ>
              <Champ label="N° de rapport" aide={initial ? undefined : "Attribué automatiquement (AE…)"}>
                {texte("numero", { placeholder: "AE00034915", disabled: !initial })}
              </Champ>
            </div>
          )}
        </div>

        {/* ---------------- Mandant ---------------- */}
        <div className="glass-soft p-3">
          <Titre s="mandant" label="Mandant (compagnie / donneur d'ordre)" resume={d.mandant_nom} />
          {ouvert.mandant && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Champ label="Depuis la base de données" className="sm:col-span-3">
                <select className="field-input" value={assurances.find((a) => a.nom === d.mandant_nom)?.id || ""} onChange={(e) => choisirAssurance(e.target.value)}>
                  <option value="">— choisir une assurance enregistrée —</option>
                  {assurances.map((a) => <option key={a.id} value={a.id}>{a.nom}{a.ville ? ` · ${a.ville}` : ""}</option>)}
                </select>
              </Champ>
              <Champ label="Nom société" className="sm:col-span-2">
                <div className="flex gap-2">
                  {texte("mandant_nom", { placeholder: "GROUPAMA D OC" })}
                  <RechercheSiren nom={d.mandant_nom || ""} compact libelle={<><Icone nom="recherche" /> SIREN</>} onChoisir={(r) => setD((prev) => ({ ...prev, mandant_nom: r.nom, mandant_adresse: prev.mandant_adresse || [r.adresse, [r.codePostal, r.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ") }))} />
                </div>
              </Champ>
              <Champ label="Email du mandant">{texte("mandant_email", { type: "email" })}</Champ>
              <Champ label="Adresse" className="sm:col-span-3">{texte("mandant_adresse")}</Champ>
              <Champ label="N° de sinistre">{texte("numero_sinistre")}</Champ>
              <Champ label="Date du sinistre">{texte("date_sinistre", { type: "date" })}</Champ>
              <Champ label="N° de police">{texte("numero_police")}</Champ>
              <Champ label="Nom de l'assuré" className="sm:col-span-3">{texte("assure_nom", { placeholder: "MONSIEUR / MADAME …" })}</Champ>
            </div>
          )}
        </div>

        {/* ---------------- Lésé ---------------- */}
        <div className="glass-soft p-3">
          <Titre s="lese" label="Lésé (propriétaire du véhicule)" resume={d.lese_nom} />
          {ouvert.lese && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Champ label="Depuis la base de données" className="sm:col-span-3">
                <select className="field-input" value={clients.find((c) => c.nom === d.lese_nom)?.id || ""} onChange={(e) => choisirClient(e.target.value)}>
                  <option value="">— choisir un client enregistré —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.ville ? ` · ${c.ville}` : ""}</option>)}
                </select>
              </Champ>
              <Champ label="Nom" className="sm:col-span-2">
                <div className="flex gap-2">
                  {texte("lese_nom")}
                  {d.assure_nom && !d.lese_nom && (
                    <button type="button" className="btn-ghost btn-compact shrink-0 whitespace-nowrap" onClick={() => set("lese_nom", d.assure_nom)}>= assuré</button>
                  )}
                  <RechercheSiren nom={d.lese_nom || ""} compact libelle={<><Icone nom="recherche" /> SIREN</>} onChoisir={(r) => setD((prev) => ({ ...prev, lese_nom: r.nom, lese_adresse: prev.lese_adresse || [r.adresse, [r.codePostal, r.ville].filter(Boolean).join(" ")].filter(Boolean).join("\n") }))} />
                </div>
              </Champ>
              <Champ label="Téléphone">{texte("lese_tel", { type: "tel" })}</Champ>
              <Champ label="Adresse" className="sm:col-span-2">{texte("lese_adresse", { placeholder: "31830 PLAISANCE DU TOUCH" })}</Champ>
              <Champ label="Email">{texte("lese_email", { type: "email" })}</Champ>
            </div>
          )}
        </div>

        {/* ---------------- Réparateur ---------------- */}
        <div className="glass-soft p-3">
          <Titre s="reparateur" label="Réparateur" resume={d.reparateur_nom} />
          {ouvert.reparateur && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Champ label="Réparateur de la base de données" className="sm:col-span-3" aide="Choisir un réparateur remplit les champs ci-dessous (modifiables). « SIREN » : tape un nom ou un SIRET dans le champ Nom, la fiche est créée dans la base et sélectionnée.">
                <div className="flex gap-2">
                  <select className="field-input" value={d.garage_id || ""} onChange={(e) => choisirGarage(e.target.value)}>
                    <option value="">— saisie libre —</option>
                    {garages.map((g) => <option key={g.id} value={g.id}>{g.nom} · {g.ville || ""}</option>)}
                  </select>
                  {creationGarage ? <span className="btn-ghost btn-compact whitespace-nowrap">Création…</span> : <RechercheSiren nom={d.reparateur_nom || ""} compact libelle={<><Icone nom="recherche" /> SIREN</>} onChoisir={garageDepuisSiren} />}
                </div>
              </Champ>
              <Champ label="Nom" className="sm:col-span-2">{texte("reparateur_nom")}</Champ>
              <Champ label="SIRET">{texte("reparateur_siret")}</Champ>
              <Champ label="Adresse (une ligne par élément)" className="sm:col-span-3">
                <textarea className="field-input" rows={2} value={d.reparateur_adresse ?? ""} onChange={(e) => set("reparateur_adresse", e.target.value)} />
              </Champ>
            </div>
          )}
        </div>

        {/* ---------------- Véhicule ---------------- */}
        <div className="glass-soft p-3">
          <Titre s="vehicule" label="Véhicule" resume={[d.immatriculation, d.marque, d.modele].filter(Boolean).join(" · ")} />
          {ouvert.vehicule && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fichierCg} type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) lireCarteGrise(f); e.target.value = ""; }} />
                <button type="button" className="btn-ghost btn-compact" disabled={lectureCg} onClick={() => fichierCg.current?.click()}>
                  {lectureCg ? "Lecture en cours…" : <><Icone nom="photo" /> Lire la carte grise</>}
                </button>
                <span className="text-[11px] text-white/45">Photo ou PDF du certificat d&apos;immatriculation → véhicule pré-rempli.</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Champ label="Immatriculation">{texte("immatriculation", { placeholder: "AA-123-AA", style: { textTransform: "uppercase" } })}</Champ>
                <Champ label="Marque">{texte("marque")}</Champ>
                <Champ label="Modèle">{texte("modele")}</Champ>
                <Champ label="Finition">{texte("finition")}</Champ>
                <Champ label="Genre" className="col-span-2">{choix("genre", GENRES)}</Champ>
                <Champ label="Carrosserie">{choix("carrosserie", CARROSSERIES)}</Champ>
                <Champ label="Énergie">{choix("energie", ENERGIES)}</Champ>
                <Champ label="N° de série (VIN)" className="col-span-2">{texte("vin", { style: { textTransform: "uppercase" } })}</Champ>
                <Champ label="Places">
                  <input type="number" className="field-input" value={d.places ?? ""} onChange={(e) => set("places", e.target.value === "" ? null : Number(e.target.value))} />
                </Champ>
                <Champ label="Couleur">{texte("couleur")}</Champ>
                <Champ label="Date MEC">{texte("date_mec", { type: "date" })}</Champ>
                <Champ label="Date du certificat">{texte("date_certificat", { type: "date" })}</Champ>
                <Champ label="Validité CT">{texte("validite_ct", { type: "date" })}</Champ>
                <Champ label="Kilométrage relevé">
                  <input type="number" className="field-input" value={d.kilometrage ?? ""} onChange={(e) => set("kilometrage", e.target.value === "" ? null : Number(e.target.value))} />
                </Champ>
                <Champ label="État général">{choix("etat_general", ["Normal", "Bon", "Moyen", "Mauvais", "Neuf"])}</Champ>
                <Champ label="Type / N° de formule">{texte("numero_formule")}</Champ>
                <Champ label="Usure AVG">{choix("pneu_avg", PNEUS)}</Champ>
                <Champ label="Usure AVD">{choix("pneu_avd", PNEUS)}</Champ>
                <Champ label="Usure ARG">{choix("pneu_arg", PNEUS)}</Champ>
                <Champ label="Usure ARD">{choix("pneu_ard", PNEUS)}</Champ>
              </div>
            </div>
          )}
        </div>

        {/* ---------------- Dommage ---------------- */}
        <div className="glass-soft p-3">
          <Titre s="dommage" label="Dommage" resume={d.dommage_type} />
          {ouvert.dommage && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Champ label="Nature">{choix("dommage_type", DOMMAGES)}</Champ>
              <Champ label="Dommage imputable">{texte("dommage_imputable", { placeholder: "Oui / partiellement…" })}</Champ>
              <Champ label="Intensité">{choix("dommage_intensite", INTENSITES)}</Champ>
              <Champ label="Description des dégâts" className="sm:col-span-3">
                <textarea className="field-input" rows={2} value={d.dommage_description ?? ""} onChange={(e) => set("dommage_description", e.target.value)} placeholder="Choc avant gauche : aile, porte AVG, optique…" />
              </Champ>
              <Champ label="Véhicule" className="sm:col-span-3">
                <div className="segment">
                  <button type="button" className={`segment-btn ${d.vehicule_reparable !== false ? "actif" : ""}`} onClick={() => set("vehicule_reparable", true)}>Réparable</button>
                  <button type="button" className={`segment-btn ${d.vehicule_reparable === false ? "actif" : ""}`} onClick={() => set("vehicule_reparable", false)}>Économiquement irréparable (VEI)</button>
                </div>
              </Champ>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn-primary" disabled={envoi}>{envoi ? "Enregistrement…" : initial ? "Enregistrer" : "Créer la mission"}</button>
        </div>
      </form>
    </ModalShell>
  );
}
