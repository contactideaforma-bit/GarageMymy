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
import { ajouterDocument, chargerAssurances, chargerClients, chargerGarages, completerAnnuaireDepuisDossier, creerDossier, enregistrerGarage, majDossier } from "@/lib/expertise/data";
import { fichierVersPdf } from "@/lib/photoPdf";
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
  // v13.8 : création depuis l'ordre de mission envoyé par le mandant.
  const [lectureOm, setLectureOm] = useState(false);
  const [ordreMission, setOrdreMission] = useState<{ file: File; resume: string[]; remarques: string | null } | null>(null);
  const fichierOm = useRef<HTMLInputElement>(null);

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

  type LectureMission = {
    mandant: { nom: string | null; adresse: string | null; email: string | null; tel: string | null; reference_mission: string | null; gestionnaire: string | null };
    sinistre: { numero: string | null; date: string | null; numero_police: string | null; nature: string | null; circonstances: string | null; lieu: string | null };
    assure: { nom: string | null };
    lese: { nom: string | null; adresse: string | null; code_postal: string | null; ville: string | null; email: string | null; tel: string | null };
    reparateur: { nom: string | null; adresse: string | null; code_postal: string | null; ville: string | null; siret: string | null; tel: string | null };
    vehicule: { immatriculation: string | null; marque: string | null; modele: string | null; finition: string | null; vin: string | null; energie: string | null; date_mec: string | null; couleur: string | null; kilometrage: number | null; genre: string | null };
    mission: { date_mission: string | null; date_visite: string | null; type_expertise: string | null; lieu_expertise: string | null; garantie: string | null; franchise: number | null; instructions: string | null };
    dommage: { type: string | null; description: string | null; zones: string | null };
    remarques: string | null;
  };

  /** Ordre de mission (PDF, scan, photo, mail imprimé) → mission pré-remplie. */
  async function lireOrdreMission(file: File) {
    setLectureOm(true);
    setErreur(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetchAuth("/api/expert/lire-mission", { method: "POST", body: form });
      const r = await lireReponse<{ data: LectureMission }>(res);
      if (!r.ok || !r.data?.data) throw new Error(r.error || "Ordre de mission illisible.");
      const x = r.data.data;
      const ou = <T,>(v: T | null | undefined, actuel: T | null | undefined) => (v !== null && v !== undefined && v !== "" ? v : actuel ?? null);
      const adresseLese = [x.lese.adresse, [x.lese.code_postal, x.lese.ville].filter(Boolean).join(" ")].filter(Boolean).join("\n") || null;
      const adresseRep = [x.reparateur.adresse, [x.reparateur.code_postal, x.reparateur.ville].filter(Boolean).join(" ")].filter(Boolean).join("\n") || null;
      // Réparateur connu dans la base (SIRET ou nom) → on le relie.
      const g = garages.find((gg) => (x.reparateur.siret && gg.siret === x.reparateur.siret) || (x.reparateur.nom && gg.nom.toLowerCase() === x.reparateur.nom.toLowerCase()));
      const notes = [
        x.mandant.reference_mission && `Réf. mission mandant : ${x.mandant.reference_mission}`,
        x.mandant.gestionnaire && `Gestionnaire : ${x.mandant.gestionnaire}${x.mandant.tel ? ` · ${x.mandant.tel}` : ""}`,
        x.mission.garantie && `Garantie : ${x.mission.garantie}`,
        x.mission.franchise !== null && `Franchise : ${x.mission.franchise} €`,
        x.sinistre.lieu && `Lieu du sinistre : ${x.sinistre.lieu}`,
        x.sinistre.circonstances && `Circonstances : ${x.sinistre.circonstances}`,
        x.mission.instructions && `Consignes du mandant : ${x.mission.instructions}`,
      ].filter(Boolean).join("\n");
      setD((prev) => ({
        ...prev,
        mandant_nom: ou(x.mandant.nom, prev.mandant_nom),
        mandant_adresse: ou(x.mandant.adresse, prev.mandant_adresse),
        mandant_email: ou(x.mandant.email, prev.mandant_email),
        numero_sinistre: ou(x.sinistre.numero, prev.numero_sinistre),
        date_sinistre: ou(x.sinistre.date, prev.date_sinistre),
        numero_police: ou(x.sinistre.numero_police, prev.numero_police),
        dommage_type: ou(x.sinistre.nature || x.dommage.type, prev.dommage_type),
        dommage_description: ou([x.dommage.description, x.dommage.zones].filter(Boolean).join(" — ") || null, prev.dommage_description),
        assure_nom: ou(x.assure.nom || x.lese.nom, prev.assure_nom),
        lese_nom: ou(x.lese.nom || x.assure.nom, prev.lese_nom),
        lese_adresse: ou(adresseLese, prev.lese_adresse),
        lese_email: ou(x.lese.email, prev.lese_email),
        lese_tel: ou(x.lese.tel, prev.lese_tel),
        garage_id: g ? g.id : prev.garage_id,
        reparateur_nom: ou(g ? g.nom : x.reparateur.nom, prev.reparateur_nom),
        reparateur_adresse: ou(g ? [g.adresse, [g.code_postal, g.ville].filter(Boolean).join(" ")].filter(Boolean).join("\n") : adresseRep, prev.reparateur_adresse),
        reparateur_siret: ou(g ? g.siret : x.reparateur.siret, prev.reparateur_siret),
        immatriculation: ou(x.vehicule.immatriculation, prev.immatriculation),
        marque: ou(x.vehicule.marque, prev.marque),
        modele: ou(x.vehicule.modele, prev.modele),
        finition: ou(x.vehicule.finition, prev.finition),
        vin: ou(x.vehicule.vin, prev.vin),
        energie: ou(x.vehicule.energie, prev.energie),
        date_mec: ou(x.vehicule.date_mec, prev.date_mec),
        couleur: ou(x.vehicule.couleur, prev.couleur),
        kilometrage: ou(x.vehicule.kilometrage, prev.kilometrage),
        genre: ou(x.vehicule.genre, prev.genre),
        date_mission: ou(x.mission.date_mission, prev.date_mission),
        date_visite: ou(x.mission.date_visite, prev.date_visite),
        type_expertise: ou(x.mission.type_expertise, prev.type_expertise),
        lieu_expertise: ou(x.mission.lieu_expertise || (x.reparateur.nom ? "Chez le réparateur" : null), prev.lieu_expertise),
        notes: [prev.notes, notes].filter(Boolean).join("\n") || null,
      }));
      const resume = [
        x.mandant.nom && `Mandant : ${x.mandant.nom}`,
        x.sinistre.numero && `Sinistre ${x.sinistre.numero}${x.sinistre.date ? ` du ${x.sinistre.date.split("-").reverse().join("/")}` : ""}`,
        (x.lese.nom || x.assure.nom) && `Lésé : ${x.lese.nom || x.assure.nom}`,
        x.vehicule.immatriculation && `Véhicule : ${[x.vehicule.immatriculation, x.vehicule.marque, x.vehicule.modele].filter(Boolean).join(" ")}`,
        x.reparateur.nom && `Réparateur : ${x.reparateur.nom}${g ? " (base de données)" : ""}`,
        x.mission.type_expertise && `Type : ${x.mission.type_expertise}`,
      ].filter((v): v is string => Boolean(v));
      setOrdreMission({ file, resume, remarques: x.remarques });
      setOuvert({ mission: true, mandant: true, lese: true, reparateur: true, vehicule: true, dommage: true });
    } catch (e) {
      setErreur(messageErreur(e, "Lecture de l'ordre de mission impossible."));
    } finally {
      setLectureOm(false);
    }
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
      // L'ordre de mission rejoint les documents du dossier.
      if (!initial && ordreMission) {
        try {
          const { blob } = await fichierVersPdf(ordreMission.file);
          await ajouterDocument({ dossierId: saved.id, type: "ordre_mission", file: blob, nom: ordreMission.file.name.replace(/\.[^.]+$/, "") + ".pdf" });
        } catch {
          /* le dossier est créé ; le document pourra être déposé à la main */
        }
      }
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

        {/* ---------------- Depuis l'ordre de mission (v13.8) ---------------- */}
        {!initial && (
          <div className="glass-soft border border-dashed border-white/25 p-3">
            <input ref={fichierOm} type="file" accept="application/pdf,image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) lireOrdreMission(f); e.target.value = ""; }} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold"><Icone nom="document" /> Créer depuis l&apos;ordre de mission</div>
                <p className="text-xs text-white/55">Dépose la fiche envoyée par l&apos;assurance (PDF, scan, photo ou mail imprimé, quelle que soit sa forme) : les informations disponibles remplissent la mission, tu complètes le reste.</p>
              </div>
              <button type="button" className="btn-primary btn-compact" disabled={lectureOm} onClick={() => fichierOm.current?.click()}>
                {lectureOm ? "Lecture en cours…" : <><Icone nom="trombone" /> Choisir la fiche</>}
              </button>
            </div>
            {ordreMission && (
              <div className="mt-2 rounded-lg bg-white/40 px-3 py-2 text-xs">
                <div className="font-semibold">Lu dans « {ordreMission.file.name} » — joint au dossier comme ordre de mission :</div>
                <ul className="mt-1 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                  {ordreMission.resume.map((l) => <li key={l}>• {l}</li>)}
                </ul>
                {ordreMission.remarques && <div className="mt-1 text-white/60">{ordreMission.remarques}</div>}
              </div>
            )}
          </div>
        )}

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
