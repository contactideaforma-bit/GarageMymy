"use client";

// ============================================================
//  MODE « RETARD DE PAIEMENT » ASSISTÉ (v13.12, migrations v70 + v82)
//
//  Un parcours en 5 étapes, chacune ASSISTÉE par l'appli — pas un guide :
//    1. Relance amiable        → email / courrier de relance / appel noté
//    2. Mise en demeure        → rédigée, signée, PDF, recommandé (n° de suivi)
//    3. Tentative amiable      → saisine du conciliateur ou réclamation à
//                                l'assureur (courrier généré) — ou dispense
//    4. Injonction de payer    → voie choisie par l'appli (petites créances /
//                                TJ / TC), pièces vérifiées, lettre + bordereau
//    5. Exécution forcée       → titre exécutoire, remise au commissaire
//  Chaque étape sait ce qui a été fait (dossier.retard_etapes), programme
//  ses rappels, et passe la main à la suivante. Le journal des contacts
//  et les rappels restent en bas. Sortir du retard CONSERVE tout.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CourrierRecouvrement, Document, Dossier, LigneArdoise, OrdreReparation, Paiement, Relance } from "@/lib/types";
import { ETAPES_GARANTIE, EtapeGarantie, affectationVente, attributionGage, etapeGarantie, gageMobilisable, situationVehicule } from "@/lib/garanties";
import { formatDate, formatDateTime, formatEuros, messageErreur, ymd } from "@/lib/format";
import { templateRelance } from "@/lib/paiements";
import {
  CANAUX_CONTACT,
  CibleCourrier,
  ETAPES_PROCEDURE,
  EtapesFaites,
  INTERLOCUTEURS,
  InfosGarantie,
  LIBELLE_TYPE_COURRIER,
  PERIODE_TAUX,
  SAISIE_ETAPE,
  TypeCourrier,
  cibleAssurance,
  cibleClient,
  cibleExpert,
  cibleParDefaut,
  cibleTiers,
  cibleTiersPourCourrier,
  completerDossierDepuisAnnuaire,
  echeanceRappel,
  estimerPenalites,
  etapeProcedure,
  etapeSuivante,
  etatRecouvrement,
  modeleCourrier,
  piecesProcedure,
  voieJudiciaire,
} from "@/lib/recouvrement";
import { ajouterRappel, basculerRappel, chargerRappels, estEnRetard, libelleEcheance, localVersIso, supprimerRappel } from "@/lib/ardoise";
import { lireRole } from "@/lib/conversation";
import {
  apercuCourrierRecouvrementPdf,
  courrierRecouvrementPdfBase64,
  documentPdfBase64Auto,
  generateCourrierRecouvrementPdf,
  nomFichierCourrier,
  nomFichierDocument,
} from "@/lib/pdf";
import ModalShell from "./ModalShell";
import SignaturePad from "./SignaturePad";
import ChampEcheance from "./ChampEcheance";
import EmailComposer from "./EmailComposer";
import EnvoiPostalModal from "./EnvoiPostalModal";

const ORIGINE_MANUELLE = "recouvrement";
const ORIGINE_AUTO = "recouvrement:auto";

type FactureRetard = Document & { paiements: Paiement[]; relances: Relance[] };
type Dest = "client" | "assurance" | "tiers";
type Banque = { iban?: string | null; bic?: string | null; tel?: string | null; email?: string | null };

export default function RetardPaiementPanel({
  dossier: dossierBrut,
  onPatch,
  onLever,
  onChanged,
}: {
  dossier: Dossier;
  onPatch: (patch: Partial<Dossier>) => void;
  onLever: () => void;
  onChanged?: () => void;
}) {
  const [factures, setFactures] = useState<FactureRetard[]>([]);
  const [relances, setRelances] = useState<Relance[]>([]);
  const [courriers, setCourriers] = useState<CourrierRecouvrement[]>([]);
  const [taches, setTaches] = useState<LigneArdoise[]>([]);
  const [ordres, setOrdres] = useState<OrdreReparation[]>([]);
  const [garage, setGarage] = useState<string | null>(null);
  const [banque, setBanque] = useState<Banque | null>(null);
  // v13.13 : coordonnées manquantes complétées depuis l'annuaire (clients / assureurs / experts).
  const [annuaire, setAnnuaire] = useState<Parameters<typeof completerDossierDepuisAnnuaire>[1]>({});
  const dossier = useMemo(() => completerDossierDepuisAnnuaire(dossierBrut, annuaire), [dossierBrut, annuaire]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [guideOuvert, setGuideOuvert] = useState(false);
  const journalRef = useRef<HTMLDivElement>(null);

  // Modales
  const [courrierModal, setCourrierModal] = useState<{ type: TypeCourrier; courrier?: CourrierRecouvrement; dest?: Dest; tiersNom?: string } | null>(null);
  const [envoiModal, setEnvoiModal] = useState<CourrierRecouvrement | null>(null);
  const [etapeModal, setEtapeModal] = useState<{ code: string; ref?: string; note?: string; vers?: string; titre?: string; date?: string; edition?: boolean; montant?: number | null; frais?: number | null } | null>(null);
  // v13.14 : ouvrir / fermer un bloc d'étape est LOCAL (sans toucher à l'étape en cours).
  const [ouvertCode, setOuvertCode] = useState<string | null>(null);
  const [emailModal, setEmailModal] = useState<{ to: string; subject: string; body: string; facture: FactureRetard | null; courrier?: CourrierRecouvrement; interlocuteur: Dest } | null>(null);

  // Journal des contacts — formulaire
  const [cDate, setCDate] = useState(ymd());
  const [cHeure, setCHeure] = useState(() => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(Math.floor(d.getMinutes() / 5) * 5).padStart(2, "0")}`; });
  const [cQui, setCQui] = useState(dossierBrut.mode_cession || dossierBrut.mode_pec ? "assurance" : "client");
  const [cCanal, setCCanal] = useState("telephone");
  const [cNotes, setCNotes] = useState("");
  const [cRappel, setCRappel] = useState("");
  const [tTexte, setTTexte] = useState("");
  const [tEcheance, setTEcheance] = useState("");

  /* ------------------------------ Données ------------------------------ */

  const charger = useCallback(async () => {
    const d = dossierBrut;
    const parNom = (table: string, col: string, nom: string | null | undefined) =>
      nom && nom.trim() ? supabase.from(table).select("*").ilike(col, nom.trim()).limit(1).maybeSingle() : Promise.resolve({ data: null });
    const [docs, pais, rels, cours, rap, ent, ors, cli, ass, exp] = await Promise.all([
      supabase.from("documents").select("*").eq("dossier_id", d.id).eq("type", "facture").order("created_at", { ascending: false }),
      supabase.from("paiements").select("*").eq("dossier_id", d.id),
      supabase.from("relances").select("*").eq("dossier_id", d.id).order("date_relance", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("courriers_recouvrement").select("*").eq("dossier_id", d.id).order("created_at", { ascending: false }),
      chargerRappels(d.id),
      supabase.from("entreprise").select("nom, iban, bic, tel, email").limit(1).maybeSingle(),
      supabase.from("ordres_reparation").select("*").eq("dossier_id", d.id).order("created_at", { ascending: false }),
      parNom("clients", "nom", d.client_nom),
      parNom("assureurs", "nom", d.assureur),
      parNom("experts", "cabinet", d.cabinet_expert),
    ]);
    setAnnuaire({ client: (cli.data as never) || null, assureur: (ass.data as never) || null, expert: (exp.data as never) || null });
    const p = (pais.data as Paiement[]) || [];
    const r = (rels.data as Relance[]) || [];
    setFactures(((docs.data as Document[]) || []).map((f) => ({ ...f, paiements: p.filter((x) => x.document_id === f.id), relances: r.filter((x) => x.document_id === f.id) })));
    setRelances(r);
    if (cours.error) {
      if (/relation|courriers_recouvrement|schema/i.test(cours.error.message || "")) setErreur("Migration v70 à exécuter dans Supabase pour les courriers de recouvrement.");
    } else setCourriers((cours.data as CourrierRecouvrement[]) || []);
    setTaches(rap.lignes.filter((l) => l.origine === ORIGINE_MANUELLE || l.origine === ORIGINE_AUTO));
    const e = ent.data as (Banque & { nom?: string | null }) | null;
    setGarage(e?.nom || null);
    setBanque(e ? { iban: e.iban, bic: e.bic, tel: e.tel, email: e.email } : null);
    setOrdres((ors.data as OrdreReparation[]) || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossierBrut.id, dossierBrut.client_nom, dossierBrut.assureur, dossierBrut.cabinet_expert]);

  useEffect(() => { charger(); }, [charger]);

  const etats = useMemo(() => factures.map((f) => ({ facture: f, etat: etatRecouvrement(f, f.paiements, f.relances) })).filter((x) => x.etat.reste > 0.01), [factures]);
  const enRetard = etats.filter((x) => x.etat.retard > 0);
  const principale = (enRetard[0] || etats[0])?.facture || null;
  const totalDu = etats.reduce((s, x) => s + x.etat.reste, 0);
  const retardMax = etats.reduce((m, x) => Math.max(m, x.etat.retard), 0);
  const cible = cibleParDefaut(dossier);
  const penalites = estimerPenalites(totalDu, retardMax, cible.professionnel);
  const etapesFaites: EtapesFaites = useMemo(() => (dossier.retard_etapes as EtapesFaites) || {}, [dossier.retard_etapes]);
  const etape = etapeProcedure(dossier.retard_etape);
  const idxEtape = ETAPES_PROCEDURE.findIndex((e) => e.code === etape.code);
  // Par défaut, le bloc ouvert suit l'étape en cours (et la suit quand elle avance).
  useEffect(() => { setOuvertCode(etape.code); }, [etape.code]);
  const nbRelances = relances.length + courriers.filter((c) => c.statut === "envoye" && c.type === "relance").length;
  const medEnvoyees = courriers.filter((c) => (c.type === "mise_en_demeure" || c.type === "mise_en_demeure_retrait") && c.statut === "envoye");
  const medLrar = medEnvoyees.find((c) => c.canal_envoi === "lrar") || null;
  const ordreSigne = ordres.some((o) => o.statut === "signe" || Boolean(o.signature));
  const voie = voieJudiciaire(totalDu, cible.professionnel);
  const pieces = piecesProcedure({
    facture: principale,
    ordreSigne,
    nbRelances,
    miseEnDemeure: { envoyee: medEnvoyees.length > 0, lrar: Boolean(medLrar), numero_suivi: medLrar?.numero_suivi || etapesFaites.mise_en_demeure?.ref },
    cession: Boolean(dossier.mode_cession || dossier.mode_pec),
  });
  const nomDebiteur = dossier.client_nom || dossier.numero_sinistre || "dossier";

  /* ---------------------- Garanties sur le véhicule (v13.15) ------------- */
  const orRef = ordres.find((o) => o.signe_le) || ordres[0] || null;
  const clausesOR = orRef?.clauses || null;
  const situation = useMemo(() => situationVehicule(dossier, orRef, clausesOR), [dossier, orRef, clausesOR]);
  const gage = gageMobilisable(orRef, dossier);
  const vehiculeAuGarage = Boolean(dossier.au_garage);
  const infosGarantie: InfosGarantie = {
    vehicule: [dossier.marque_modele, dossier.immatriculation].filter(Boolean).join(" "),
    dispoDepuis: situation.dispoDepuis,
    gardiennageJours: situation.gardiennageJours,
    gardiennageMontant: situation.gardiennageMontant,
    gardiennageJour: clausesOR?.gardiennage_jour ?? null,
    gageDelai: gage.ok ? clausesOR?.gage_delai ?? 30 : null,
    gageMontant: clausesOR?.gage_montant ?? null,
    numeroOR: orRef?.numero ?? null,
    dateOR: orRef?.date_or ?? null,
    dateSignatureOR: orRef?.signe_le ?? null,
    valeurExpert: etapesFaites.gar_gage_expertise?.montant ?? null,
    expert: etapesFaites.gar_gage_expertise?.ref ?? null,
    frais: etapesFaites.gar_gage_expertise?.frais ?? null,
    ...(etapesFaites.gar_gage_expertise?.montant != null
      ? (() => { const a = attributionGage(etapesFaites.gar_gage_expertise!.montant!, totalDu, etapesFaites.gar_gage_expertise!.frais || 0); return { aRestituer: a.aRestituer, resteDu: a.resteDu }; })()
      : {}),
  };

  /* ------------------------------ Rappels ------------------------------ */

  const programmerRappelAuto = useCallback(async (texte: string, jours: number) => {
    try {
      const anciens = taches.filter((t) => t.origine === ORIGINE_AUTO && !t.fait);
      await Promise.all(anciens.map((t) => supprimerRappel(t)));
      const ligne = await ajouterRappel({ texte, dossierId: dossier.id, echeance: echeanceRappel(jours), ordre: -1, auteur: lireRole(), pour: null, origine: ORIGINE_AUTO });
      setTaches((prev) => [ligne, ...prev.filter((t) => !anciens.some((a) => a.id === t.id))]);
      setInfo(`Rappel programmé : ${libelleEcheance(ligne.echeance, true)}.`);
      setTimeout(() => setInfo(null), 5000);
    } catch (err) { setErreur(messageErreur(err, "Rappel non programmé.")); }
  }, [dossier.id, taches]);

  async function ajouterTache() {
    const t = tTexte.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const ligne = await ajouterRappel({ texte: t, dossierId: dossier.id, echeance: localVersIso(tEcheance), ordre: Math.min(0, ...taches.map((l) => l.ordre)) - 1, auteur: lireRole(), pour: null, origine: ORIGINE_MANUELLE });
      setTaches((prev) => [ligne, ...prev]); setTTexte(""); setTEcheance("");
    } catch (err) { setErreur(messageErreur(err, "Tâche non ajoutée.")); }
    setBusy(false);
  }
  async function cocher(ligne: LigneArdoise, fait: boolean) {
    setTaches((prev) => prev.map((x) => (x.id === ligne.id ? { ...x, fait } : x)));
    try { await basculerRappel(ligne, fait); } catch (err) { setTaches((prev) => prev.map((x) => (x.id === ligne.id ? { ...x, fait: !fait } : x))); setErreur(messageErreur(err, "Modification impossible.")); }
  }
  async function retirerTache(ligne: LigneArdoise) {
    setTaches((prev) => prev.filter((x) => x.id !== ligne.id));
    try { await supprimerRappel(ligne); } catch (err) { setErreur(messageErreur(err, "Suppression impossible.")); charger(); }
  }

  /* --------------------------- Journal des contacts --------------------- */

  async function journaliser(args: { canal: string; interlocuteur: string; notes: string; date?: string; heure?: string | null; documentId?: string | null }) {
    const base: Record<string, unknown> = { dossier_id: dossier.id, document_id: args.documentId ?? principale?.id ?? null, date_relance: args.date || ymd(), canal: args.canal, notes: args.notes };
    const extras: Record<string, unknown> = { interlocuteur: args.interlocuteur };
    if (args.heure) extras.heure = args.heure;
    let res = await supabase.from("relances").insert({ ...base, ...extras });
    if (res.error && /column|colonne|schema/i.test(res.error.message || "")) res = await supabase.from("relances").insert(base);
    if (res.error) throw res.error;
  }

  async function enregistrerContact() {
    if (!cNotes.trim() || busy) return;
    setBusy(true); setErreur(null);
    try {
      await journaliser({ canal: cCanal, interlocuteur: cQui, notes: cNotes.trim(), date: cDate, heure: cHeure });
      setCNotes("");
      if (cRappel) {
        const ligne = await ajouterRappel({ texte: `Rappeler ${libelleQui(cQui).toLowerCase()} — suite à l'échange du ${formatDate(cDate)}`, dossierId: dossier.id, echeance: localVersIso(cRappel), ordre: -1, auteur: lireRole(), pour: null, origine: ORIGINE_MANUELLE });
        setTaches((prev) => [ligne, ...prev]); setCRappel("");
      }
      await charger(); onChanged?.();
    } catch (err) { setErreur(messageErreur(err, "Contact non enregistré.")); }
    setBusy(false);
  }

  function noterUnAppel() {
    setCCanal("telephone");
    journalRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => journalRef.current?.querySelector("textarea")?.focus(), 400);
  }

  /* ------------------------------ Étapes -------------------------------- */

  async function changerEtape(code: string, patchEtapes?: EtapesFaites) {
    const patch: Record<string, unknown> = { retard_etape: code };
    if (patchEtapes) patch.retard_etapes = patchEtapes;
    let { error } = await supabase.from("dossiers").update(patch).eq("id", dossier.id);
    if (error && patchEtapes && /retard_etapes|column|colonne/i.test(error.message || "")) {
      ({ error } = await supabase.from("dossiers").update({ retard_etape: code }).eq("id", dossier.id));
      if (!error) setErreur("Étape enregistrée, mais migration v82 à exécuter dans Supabase pour conserver les références.");
    }
    if (error) { setErreur(messageErreur(error, "Étape non enregistrée (migration v70 exécutée ?).")); return; }
    onPatch({ retard_etape: code, ...(patchEtapes ? { retard_etapes: patchEtapes } : {}) });
  }

  /** Marque une étape comme faite (date, référence, note) et passe à la suivante. */
  async function marquerEtapeFaite(code: string, faitLe: string, ref: string | null, note: string | null, versEtape?: string, montants?: { montant?: number | null; frais?: number | null }) {
    // Étape de GARANTIE (gar_*) : indépendante du parcours principal.
    const eg = etapeGarantie(code);
    if (eg) {
      const faites: EtapesFaites = { ...etapesFaites, [code]: { fait_le: faitLe, ref: ref || null, note: note || null, montant: montants?.montant ?? null, frais: montants?.frais ?? null } };
      await changerEtape(etape.code, faites);
      try { await journaliser({ canal: "autre", interlocuteur: "client", notes: `Garantie véhicule — « ${eg.titre} »${ref ? ` — ${ref}` : ""}${montants?.montant != null ? ` — ${formatEuros(montants.montant)}` : ""}${note ? ` — ${note}` : ""}` }); } catch { /* facultatif */ }
      if (eg.rappel) await programmerRappelAuto(`${eg.rappel[0]} (${nomDebiteur})`, eg.rappel[1]);
      setEtapeModal(null);
      charger(); onChanged?.();
      return;
    }
    const suiv = versEtape ? etapeProcedure(versEtape) : etapeSuivante(code);
    const faites: EtapesFaites = { ...etapesFaites, [code]: { fait_le: faitLe, ref: ref || null, note: note || null } };
    // Ordonnance obtenue sans avocat : l'étape « avocat » est sautée (marquée « sans objet »).
    if (code === "judiciaire" && versEtape === "execution") faites.avocat = { fait_le: faitLe, ref: "Sans objet — ordonnance obtenue sans avocat", note: null };
    await changerEtape(suiv ? suiv.code : code, faites);
    try {
      await journaliser({ canal: "autre", interlocuteur: cible.type === "assurance" ? "assurance" : "client", notes: `Étape « ${etapeProcedure(code).titre} » réalisée${ref ? ` — ${ref}` : ""}${note ? ` — ${note}` : ""}` });
    } catch { /* journal facultatif */ }
    const rappels: Record<string, [string, number]> = {
      amiable: [`Vérifier le paiement après relance (${nomDebiteur}) — sinon rédiger la mise en demeure`, 8],
      mise_en_demeure: [`Fin du délai de mise en demeure (${nomDebiteur}) : vérifier le paiement, sinon tentative amiable ou injonction`, 8],
      amiable_judiciaire: [`Tentative amiable (${nomDebiteur}) : réponse reçue ? Sinon préparer l'injonction de payer`, 30],
      judiciaire: [`Injonction de payer (${nomDebiteur}) : ordonnance reçue ? À signifier sous 3 mois par commissaire de justice`, 45],
      avocat: [`Avocat (${nomDebiteur}) : point sur l'assignation / l'opposition`, 30],
      execution: [`Exécution (${nomDebiteur}) : point avec le commissaire de justice sur les sommes récupérées`, 30],
    };
    const r = rappels[code];
    if (r) await programmerRappelAuto(r[0], r[1]);
    setEtapeModal(null);
    charger(); onChanged?.();
  }

  /** Corrige la date / référence / note d'une étape déjà faite, sans changer l'étape en cours. */
  async function modifierEtapeFaite(code: string, faitLe: string, ref: string | null, note: string | null, montants?: { montant?: number | null; frais?: number | null }) {
    const faites: EtapesFaites = { ...etapesFaites, [code]: { ...etapesFaites[code], fait_le: faitLe, ref: ref || null, note: note || null, ...(montants ? { montant: montants.montant ?? null, frais: montants.frais ?? null } : {}) } };
    await changerEtape(etape.code, faites);
    setEtapeModal(null);
  }

  /** Annule une étape faite : elle redevient l'étape en cours (ses courriers et rappels sont conservés). */
  async function annulerEtapeFaite(code: string) {
    const eg = etapeGarantie(code);
    if (!confirm(`Annuler l'étape « ${eg ? eg.titre : etapeProcedure(code).titre} » ?${eg ? "" : " Elle redevient l'étape en cours ;"} les courriers et le journal sont conservés.`)) return;
    const faites: EtapesFaites = { ...etapesFaites };
    delete faites[code];
    if (eg) { await changerEtape(etape.code, faites); return; }
    // Une étape « avocat » marquée sans objet par l'issue de l'injonction est aussi remise à zéro.
    if (code === "judiciaire" && faites.avocat?.ref?.startsWith("Sans objet")) delete faites.avocat;
    await changerEtape(code, faites);
    setOuvertCode(code);
  }

  /* ------------------------------ Emails -------------------------------- */

  function ouvrirEmail(vers: "client" | "assurance") {
    const c = vers === "assurance" ? cibleAssurance(dossier) : cibleClient(dossier);
    const f = principale;
    const niveau = (f?.relances.length || 0) + 1;
    const t = f ? templateRelance(niveau, f, dossier, c.professionnel) : { subject: `Relance — dossier ${dossier.numero_sinistre || ""}`, body: "" };
    setEmailModal({ to: c.email || "", subject: t.subject, body: t.body, facture: f, interlocuteur: vers });
  }

  /* ------------------------------ Courriers ----------------------------- */

  async function supprimerCourrier(c: CourrierRecouvrement) {
    if (!confirm("Supprimer ce courrier ? (récupérable 30 jours dans l'historique)")) return;
    const { error } = await supabase.from("courriers_recouvrement").delete().eq("id", c.id);
    if (error) setErreur(messageErreur(error)); else setCourriers((prev) => prev.filter((x) => x.id !== c.id));
  }

  async function marquerEnvoye(c: CourrierRecouvrement, canal: string, extra?: { numero_suivi?: string | null; date?: string | null }) {
    const patch: Record<string, unknown> = { statut: "envoye", envoye_le: extra?.date ? new Date(extra.date).toISOString() : new Date().toISOString(), canal_envoi: canal };
    if (extra?.numero_suivi) patch.numero_suivi = extra.numero_suivi;
    let { error } = await supabase.from("courriers_recouvrement").update(patch).eq("id", c.id);
    if (error && patch.numero_suivi && /numero_suivi|column|colonne/i.test(error.message || "")) {
      delete patch.numero_suivi;
      ({ error } = await supabase.from("courriers_recouvrement").update(patch).eq("id", c.id));
    }
    if (error) { setErreur(messageErreur(error)); return; }
    setCourriers((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...(patch as Partial<CourrierRecouvrement>) } : x)));
    const libelle = LIBELLE_TYPE_COURRIER[c.type];
    try {
      await journaliser({
        canal: canal === "email" ? "email" : "courrier",
        interlocuteur: c.destinataire === "tiers" ? "autre" : c.destinataire,
        notes: `${libelle} envoyé${canal === "lrar" ? ` en recommandé AR${extra?.numero_suivi ? ` n° ${extra.numero_suivi}` : ""}` : canal === "email" ? " par email" : " par courrier"}${c.montant ? ` — ${formatEuros(c.montant)}` : ""}`,
        documentId: c.document_id,
      });
    } catch { /* journal facultatif */ }
    setEnvoiModal(null);
    // La mise en demeure envoyée en recommandé VALIDE l'étape 2 avec son n° de suivi.
    if (c.type === "mise_en_demeure" && canal === "lrar" && !etapesFaites.mise_en_demeure) {
      await marquerEtapeFaite("mise_en_demeure", extra?.date || ymd(), extra?.numero_suivi || null, null);
      return;
    }
    if (c.type === "mise_en_demeure_retrait" && canal === "lrar" && !etapesFaites.gar_med_retrait) {
      await marquerEtapeFaite("gar_med_retrait", extra?.date || ymd(), extra?.numero_suivi || null, null);
      // Vaut aussi mise en demeure de payer pour le parcours principal.
      if (!etapesFaites.mise_en_demeure && etape.code === "mise_en_demeure") await marquerEtapeFaite("mise_en_demeure", extra?.date || ymd(), extra?.numero_suivi || null, "Mise en demeure de payer et de retirer le véhicule");
      return;
    }
    if (c.type === "requete_vente_1903" && !etapesFaites.gar_requete_1903) { await marquerEtapeFaite("gar_requete_1903", ymd(), c.destinataire_nom || "Commissaire de justice", null); return; }
    if (c.type === "attribution_gage" && !etapesFaites.gar_gage_attribution) { await marquerEtapeFaite("gar_gage_attribution", extra?.date || ymd(), extra?.numero_suivi || null, null); return; }
    if (c.type === "saisine_conciliateur" && !etapesFaites.amiable_judiciaire) { await marquerEtapeFaite("amiable_judiciaire", ymd(), "Conciliateur saisi", null); return; }
    if (c.type === "reclamation_assureur" && !etapesFaites.amiable_judiciaire) { await marquerEtapeFaite("amiable_judiciaire", ymd(), "Réclamation à l'assureur", null); return; }
    const jours = c.delai_jours || 8;
    await programmerRappelAuto(
      c.type === "mise_en_demeure" ? `Fin du délai de mise en demeure (${nomDebiteur}) : vérifier le paiement, sinon passer à l'étape suivante` : `Vérifier le paiement après ${libelle.toLowerCase()} (${nomDebiteur})`,
      jours
    );
    charger(); onChanged?.();
  }

  const courrierEnvoyeParEmail = (c: CourrierRecouvrement) => {
    const cibleC = c.destinataire === "assurance" ? cibleAssurance(dossier) : c.destinataire === "client" ? cibleClient(dossier) : cibleTiers(c.destinataire_nom || "", c.destinataire_adresse || "");
    setEmailModal({
      to: cibleC.email || "",
      subject: c.objet || LIBELLE_TYPE_COURRIER[c.type],
      body: `Bonjour,\n\nVeuillez trouver ci-joint ${c.type === "mise_en_demeure" ? "une mise en demeure de payer" : c.type === "relance" ? "un courrier de relance" : "notre courrier"} concernant la facture ${principale?.numero || ""} (dossier ${dossier.numero_sinistre || ""}).\n\nCordialement.`,
      facture: principale,
      courrier: c,
      interlocuteur: c.destinataire,
    });
  };

  const factureDe = (c: CourrierRecouvrement) => factures.find((f) => f.id === c.document_id) || principale;
  const courriersDe = (types: TypeCourrier[]) => courriers.filter((c) => types.includes(c.type));

  /* --------------------------- Rendu d'une étape ------------------------ */

  function statutEtape(i: number): "fait" | "encours" | "passee" | "avenir" {
    const code = ETAPES_PROCEDURE[i].code;
    if (etapesFaites[code]) return "fait";
    return i === idxEtape ? "encours" : i < idxEtape ? "passee" : "avenir";
  }

  const boutonFaite = (code: string, label = "Étape faite → suivante") => (
    <button onClick={() => setEtapeModal({ code })} className="btn-ghost btn-compact">✓ {label}</button>
  );

  function ListeCourriers({ types }: { types: TypeCourrier[] }) {
    const liste = courriersDe(types);
    if (!liste.length) return null;
    return (
      <ul className="mt-2 space-y-1.5">
        {liste.map((c) => (
          <li key={c.id} className="carte-liste flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <span className="font-semibold text-white">{LIBELLE_TYPE_COURRIER[c.type]}</span>
              <span className="text-white/60"> → {c.destinataire_nom || c.destinataire} · {formatDate(c.date_courrier)}</span>{" "}
              <span className={c.statut === "envoye" ? "badge badge-ok" : c.statut === "signe" ? "badge badge-info" : "badge badge-neutral"}>
                {c.statut === "envoye" ? `Envoyé${c.canal_envoi === "lrar" ? ` · recommandé${c.numero_suivi ? ` n° ${c.numero_suivi}` : ""}` : c.canal_envoi === "email" ? " par email" : ""}` : c.statut === "signe" ? "Signé — à envoyer" : "Brouillon"}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              <button onClick={() => apercuCourrierRecouvrementPdf(c, dossier, factureDe(c)?.numero)} className="btn-ghost btn-compact">Aperçu</button>
              <button onClick={() => generateCourrierRecouvrementPdf(c, dossier, factureDe(c)?.numero)} className="btn-ghost btn-compact">⬇ PDF</button>
              {c.statut !== "envoye" && <button onClick={() => setCourrierModal({ type: c.type, courrier: c })} className="btn-ghost btn-compact">Modifier / signer</button>}
              {c.statut !== "envoye" && <button onClick={() => courrierEnvoyeParEmail(c)} className="btn-ghost btn-compact">✉ Email</button>}
              {c.statut !== "envoye" && <button onClick={() => setEnvoiModal(c)} className="btn-primary btn-compact">📮 Recommandé / posté</button>}
              <button onClick={() => supprimerCourrier(c)} className="text-xs text-white/40 hover:text-rose-300">Supprimer</button>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  /** Liste des étapes d'une voie de garantie (abandon / gage), avec validation, modification, annulation. */
  function EtapesGarantie({ voie }: { voie: EtapeGarantie["voie"] }) {
    const liste = ETAPES_GARANTIE.filter((e) => e.voie === voie);
    const prerequisOk = (e: EtapeGarantie) => {
      if (e.code === "gar_requete_1903") return Boolean(etapesFaites.gar_med_retrait) && situation.joursAvantVente === 0;
      if (e.code === "gar_vente_1903") return Boolean(etapesFaites.gar_requete_1903);
      if (e.code === "gar_gage_expertise") { const m = etapesFaites.gar_med_retrait; return Boolean(m) && Date.now() >= new Date(m!.fait_le).getTime() + (clausesOR?.gage_delai || 30) * 86400000; }
      if (e.code === "gar_gage_attribution") return etapesFaites.gar_gage_expertise?.montant != null;
      return true;
    };
    return (
      <ul className="mt-2 space-y-1.5">
        {liste.map((e) => {
          const f = etapesFaites[e.code];
          const ok = prerequisOk(e);
          return (
            <li key={e.code} className="flex items-start gap-2 text-sm">
              <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${f ? "bg-emerald-500 text-white" : ok ? "bg-amber-400 text-amber-950" : "bg-white/15 text-white/60"}`}>{f ? "✓" : "·"}</span>
              <span className="min-w-0 flex-1">
                <span className={f ? "text-white" : ok ? "text-white" : "text-white/60"}>{e.titre}</span>
                {f ? (
                  <span className="block text-xs text-white/60">
                    fait le {formatDate(f.fait_le)}{f.ref ? ` — ${f.ref}` : ""}{f.montant != null ? ` — ${formatEuros(f.montant)}` : ""}{f.frais != null ? ` (frais ${formatEuros(f.frais)})` : ""}
                    {e.code === "gar_vente_1903" && f.montant != null && (() => { const a = affectationVente(f.montant!, f.frais || 0, totalDu); return <> → frais {formatEuros(a.frais)}, créance {formatEuros(a.creance)}, surplus consigné {formatEuros(a.surplusConsigne)}{a.resteDu > 0 ? `, reste dû ${formatEuros(a.resteDu)}` : ""}</>; })()}
                    {" · "}<button className="underline hover:text-white" onClick={() => setEtapeModal({ code: e.code, edition: true, date: f.fait_le, ref: f.ref || "", note: f.note || "", montant: f.montant, frais: f.frais, titre: `${e.titre} — modifier` })}>modifier</button>
                    {" · "}<button className="underline hover:text-rose-300" onClick={() => annulerEtapeFaite(e.code)}>annuler</button>
                  </span>
                ) : (
                  <span className="block text-xs text-white/50">{e.aide} {ok && <button className="ml-1 underline text-white/80 hover:text-white" onClick={() => setEtapeModal({ code: e.code })}>marquer fait</button>}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  function contenuEtape(code: string) {
    const fait = etapesFaites[code];
    const recap = fait && (
      <div className="alerte alerte-ok mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span><span className="alerte-titre">Fait le {formatDate(fait.fait_le)}</span>{fait.ref ? ` — ${fait.ref}` : ""}{fait.note ? ` — ${fait.note}` : ""}</span>
        <span className="flex gap-1">
          <button onClick={() => setEtapeModal({ code, edition: true, date: fait.fait_le, ref: fait.ref || "", note: fait.note || "", titre: `${etapeProcedure(code).titre} — modifier` })} className="btn-ghost btn-compact">Modifier</button>
          <button onClick={() => annulerEtapeFaite(code)} className="btn-ghost btn-compact">Annuler l&apos;étape</button>
        </span>
      </div>
    );
    const reprendre = !fait && code !== etape.code && (
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-white/60">
        <span>Cette étape n&apos;est pas l&apos;étape en cours.</span>
        <button onClick={() => changerEtape(code)} className="btn-ghost btn-compact">Reprendre la procédure à cette étape</button>
      </div>
    );
    switch (code) {
      case "amiable":
        return (
          <>
            {recap}
            {reprendre}
            <p className="text-sm text-white/80">Dès l&apos;échéance dépassée : on demande une date de paiement et on garde une trace. Les relances automatiques (J+15, J+30) partent seules ; ici vous relancez à la main.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => ouvrirEmail(cible.type === "assurance" ? "assurance" : "client")} className="btn-primary btn-compact" disabled={!principale}>✉ Email de relance</button>
              <button onClick={() => setCourrierModal({ type: "relance" })} className="btn-ghost btn-compact" disabled={!principale}>📄 Courrier de relance (PDF)</button>
              <button onClick={noterUnAppel} className="btn-ghost btn-compact">📞 Noter un appel</button>
              {cible.type !== "assurance" && <button onClick={() => ouvrirEmail("assurance")} className="btn-ghost btn-compact" disabled={!principale}>✉ Email à l&apos;assurance</button>}
            </div>
            <p className="mt-2 text-xs text-white/60">{nbRelances} relance{nbRelances > 1 ? "s" : ""} enregistrée{nbRelances > 1 ? "s" : ""} sur ce dossier.</p>
            <ListeCourriers types={["relance"]} />
            {!fait && <div className="mt-2">{boutonFaite("amiable", "Relances faites → mise en demeure")}</div>}
          </>
        );
      case "mise_en_demeure": {
        const med = courriersDe(["mise_en_demeure"]);
        const enAttente = [...med, ...courriersDe(["mise_en_demeure_retrait"])].find((c) => c.statut !== "envoye");
        return (
          <>
            {recap}
            {reprendre}
            <p className="text-sm text-white/80">L&apos;acte qui fait courir les intérêts et que le juge exigera. L&apos;appli rédige le courrier ; vous le relisez, le signez, puis vous l&apos;envoyez en <strong>recommandé avec accusé de réception</strong> (délai de 8 jours).</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {!enAttente && vehiculeAuGarage && <button onClick={() => setCourrierModal({ type: "mise_en_demeure_retrait" })} className="btn-primary btn-compact" disabled={!principale} title="Le véhicule est au garage : cette version fait aussi courir les 3 mois de la loi 1903 et le délai du gage">⚖ Mise en demeure de payer et de retirer le véhicule</button>}
              {!enAttente && <button onClick={() => setCourrierModal({ type: "mise_en_demeure" })} className={`${vehiculeAuGarage ? "btn-ghost" : "btn-primary"} btn-compact`} disabled={!principale}>⚖ {vehiculeAuGarage ? "Mise en demeure simple" : "Rédiger la mise en demeure"}</button>}
              {enAttente && <button onClick={() => setEnvoiModal(enAttente)} className="btn-primary btn-compact">📮 Envoyer en recommandé (n° de suivi)</button>}
              {enAttente && <button onClick={() => courrierEnvoyeParEmail(enAttente)} className="btn-ghost btn-compact">✉ Aussi par email (PDF joint)</button>}
            </div>
            <ListeCourriers types={["mise_en_demeure", "mise_en_demeure_retrait"]} />
            {!fait && [...med, ...courriersDe(["mise_en_demeure_retrait"])].some((c) => c.statut === "envoye") && <div className="mt-2">{boutonFaite("mise_en_demeure", "Recommandé envoyé → tentative amiable")}</div>}
          </>
        );
      }
      case "amiable_judiciaire": {
        const versAssurance = cible.type === "assurance";
        return (
          <>
            {recap}
            {reprendre}
            {versAssurance ? (
              <p className="text-sm text-white/80">Débiteur : <strong>{cible.nom}</strong> (assureur). Avant toute action, une <strong>réclamation écrite</strong> à son service réclamations ; sans réponse satisfaisante sous 2 mois, le Médiateur de l&apos;assurance.</p>
            ) : totalDu <= 5000 ? (
              <p className="text-sm text-white/80">Créance de <strong>{formatEuros(totalDu)}</strong> (≤ 5 000 €) : la tentative amiable est <strong>obligatoire</strong> avant une assignation classique. Le conciliateur de justice est gratuit (mairie ou tribunal). L&apos;injonction de payer, elle, en est dispensée.</p>
            ) : (
              <p className="text-sm text-white/80">Créance de <strong>{formatEuros(totalDu)}</strong> (&gt; 5 000 €) : la tentative amiable n&apos;est pas obligatoire, mais un conciliateur ou un médiateur reste souvent le moyen le plus rapide d&apos;être payé.</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {versAssurance ? (
                <>
                  <button onClick={() => setCourrierModal({ type: "reclamation_assureur", dest: "assurance" })} className="btn-primary btn-compact" disabled={!principale}>📄 Réclamation à l&apos;assureur (PDF)</button>
                  <a href="https://www.mediation-assurance.org" target="_blank" rel="noreferrer" className="btn-ghost btn-compact">Médiateur de l&apos;assurance ↗</a>
                </>
              ) : (
                <>
                  <button onClick={() => setCourrierModal({ type: "saisine_conciliateur", dest: "tiers", tiersNom: "Conciliateur de justice" })} className="btn-primary btn-compact" disabled={!principale}>📄 Saisir le conciliateur (PDF)</button>
                  <a href="https://www.conciliateurs.fr" target="_blank" rel="noreferrer" className="btn-ghost btn-compact">Trouver un conciliateur ↗</a>
                </>
              )}
              {!fait && <button onClick={() => setEtapeModal({ code: "amiable_judiciaire", ref: "Dispensée — injonction de payer directe" })} className="btn-ghost btn-compact">Passer directement à l&apos;injonction</button>}
            </div>
            <ListeCourriers types={["saisine_conciliateur", "reclamation_assureur"]} />
            {!fait && <div className="mt-2">{boutonFaite("amiable_judiciaire", "Tentative faite → injonction de payer")}</div>}
          </>
        );
      }
      case "judiciaire":
        return (
          <>
            {recap}
            {reprendre}
            <div className="glass-soft p-3">
              <div className="font-semibold text-white">{voie.titre}</div>
              <p className="mt-1 text-sm text-white/80">{voie.pourquoi}</p>
              <p className="mt-1 text-sm text-white/80">{voie.demarche}</p>
              <a href={voie.lien} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-accent-pink hover:underline">{voie.lienLabel} ↗</a>
            </div>
            <div className="mt-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Pièces du dossier — vérifiées par l&apos;appli</div>
              <ul className="mt-1 space-y-1 text-sm">
                {pieces.map((p) => (
                  <li key={p.code} className="flex items-start gap-2">
                    <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${p.ok ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>{p.ok ? "✓" : "!"}</span>
                    <span><span className="font-medium text-white">{p.label}</span> <span className="text-white/60">— {p.detail}</span></span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => setCourrierModal({ type: "requete_injonction", dest: "tiers", tiersNom: voie.code === "petites_creances" ? "Commissaire de justice" : voie.code === "injonction_tc" ? "Greffe du tribunal de commerce" : "Greffe du tribunal judiciaire" })} className="btn-primary btn-compact" disabled={!principale}>📄 Lettre d&apos;accompagnement + bordereau (PDF)</button>
              <button onClick={() => generateCourrierRecouvrementPdf(courriersDe(["mise_en_demeure"]).find((c) => c.statut === "envoye") || courriersDe(["mise_en_demeure"])[0], dossier, principale?.numero)} className="btn-ghost btn-compact" disabled={!courriersDe(["mise_en_demeure"]).length}>⬇ Mise en demeure (PDF)</button>
            </div>
            <ListeCourriers types={["requete_injonction"]} />
            {!fait && (
              <div className="mt-3 rounded-lg border border-white/15 p-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Issue de la voie sans avocat</div>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <button onClick={() => setEtapeModal({ code: "judiciaire", vers: "execution", titre: "Ordonnance / titre obtenu → exécution forcée" })} className="btn-primary btn-compact">✓ Ordonnance obtenue → exécution</button>
                  <button onClick={() => setEtapeModal({ code: "judiciaire", vers: "avocat", titre: "Voie sans avocat sans succès → avocat", note: "" })} className="btn-ghost btn-compact">✗ Opposition / rejet / pas d&apos;accord → avocat</button>
                </div>
                <p className="mt-1 text-xs text-white/60">Notez la référence de la requête ou de l&apos;ordonnance : elle sera reprise dans le dossier transmis à l&apos;avocat ou au commissaire de justice.</p>
              </div>
            )}
          </>
        );
      case "avocat": {
        const sansObjet = fait?.ref?.startsWith("Sans objet");
        return (
          <>
            {recap}
            {reprendre}
            {sansObjet ? (
              <p className="text-sm text-white/80">Étape sans objet : l&apos;ordonnance a été obtenue sans avocat.</p>
            ) : (
              <>
                <p className="text-sm text-white/80">La voie sans avocat n&apos;a pas abouti (opposition du débiteur, requête rejetée, pas d&apos;accord). Un avocat engage l&apos;assignation au fond ou suit l&apos;opposition. L&apos;appli prépare le <strong>dossier de transmission</strong> : créance, chronologie de toutes vos démarches, pièces.</p>
                <p className="mt-1 text-xs text-white/60">Représentation obligatoire au-delà de 10 000 € devant le tribunal judiciaire. Les honoraires peuvent être demandés au débiteur (art. 700 CPC).</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => setCourrierModal({ type: "transmission_avocat", dest: "tiers", tiersNom: "Maître" })} className="btn-primary btn-compact" disabled={!principale}>📄 Dossier de transmission à l&apos;avocat (PDF)</button>
                  <a href="https://www.avocat.fr/annuaire" target="_blank" rel="noreferrer" className="btn-ghost btn-compact">Trouver un avocat (CNB) ↗</a>
                </div>
                <ListeCourriers types={["transmission_avocat"]} />
                {!fait && <div className="mt-2">{boutonFaite("avocat", "Jugement obtenu → exécution")}</div>}
              </>
            )}
          </>
        );
      }
      case "execution":
        return (
          <>
            {recap}
            {reprendre}
            <p className="text-sm text-white/80">Titre exécutoire en main (ordonnance non contestée, accord homologué) : un <strong>commissaire de justice</strong> procède à la saisie (compte bancaire, vente…). Ses frais sont en principe à la charge du débiteur.</p>
            <p className="mt-1 text-xs text-white/60">Prescription : 2 ans contre un particulier, 5 ans entre professionnels, à compter de la facture{principale?.date_document ? ` (${formatDate(principale.date_document)})` : ""}.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => setCourrierModal({ type: "remise_commissaire", dest: "tiers", tiersNom: "Commissaire de justice" })} className="btn-primary btn-compact" disabled={!principale}>📄 Remise au commissaire de justice (PDF)</button>
              <a href="https://commissaire-justice.fr/annuaire" target="_blank" rel="noreferrer" className="btn-ghost btn-compact">Trouver un commissaire de justice ↗</a>
            </div>
            <ListeCourriers types={["remise_commissaire"]} />
            {!fait && <div className="mt-2">{boutonFaite("execution", "Titre exécutoire remis")}</div>}
          </>
        );
      default:
        return null;
    }
  }

  /* -------------------------------- Rendu ------------------------------- */

  return (
    <section className="glass-card p-4" style={{ borderLeft: "8px solid #f59e0b" }}>
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-bold text-white">⏰ Retard de paiement</span>
          {dossier.retard_depuis && <span className="text-sm text-white/70">depuis le {formatDate(dossier.retard_depuis)}</span>}
          {totalDu > 0 && <span className="badge badge-danger text-sm">{formatEuros(totalDu)} dus</span>}
          {retardMax > 0 && <span className="badge badge-warn text-sm">{retardMax} j de retard</span>}
          {info && <span className="text-sm font-medium text-emerald-300">{info}</span>}
        </div>
        <button onClick={onLever} className="btn-ghost btn-compact" title="Le paiement est arrivé — tout reste enregistré">✓ Réglé — sortir du retard</button>
      </div>

      {/* Factures + débiteur */}
      <div className="mt-3 glass-soft p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Factures impayées</div>
            {etats.length === 0 ? (
              <p className="mt-1 text-sm font-medium text-emerald-300">Aucune facture avec un solde dû sur ce dossier.</p>
            ) : (
              <ul className="mt-1 divide-y divide-white/10">
                {etats.map(({ facture: f, etat }) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <div>
                      <span className="text-base font-semibold text-white">{f.numero || "Facture"}</span>
                      <span className="ml-2 text-sm text-white/70">{f.date_echeance ? `échéance ${formatDate(f.date_echeance)}` : "sans échéance"}{etat.retard > 0 ? ` · ${etat.retard} j de retard` : ""} · {f.relances.length} relance{f.relances.length > 1 ? "s" : ""}</span>
                    </div>
                    <span className="text-base font-bold text-rose-300">{formatEuros(etat.reste)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {totalDu > 0 && (
            <div className="text-sm text-white/80 sm:max-w-xs">
              <div>Débiteur : <strong className="text-white">{cible.nom}</strong> <span className="text-white/60">({cible.professionnel ? "professionnel" : "particulier"})</span></div>
              <div className="mt-1 flex flex-wrap gap-1">
                {([["Adresse", cible.adresse], ["Email", cible.email], ["Tél.", cible.type === "assurance" ? dossier.assureur_tel : dossier.client_tel]] as [string, string | null | undefined][]).map(([l, v]) => (
                  <span key={l} className={`badge ${v ? "badge-ok" : "badge-danger"}`} title={v || `${l} manquant — complétez la fiche dossier ou l'annuaire`}>{v ? `${l} ✓` : `${l} ?`}</span>
                ))}
              </div>
              {retardMax > 0 && (
                <div className="text-white/70">Intérêts {formatEuros(penalites.interets)} ({penalites.taux} %, {PERIODE_TAUX}){penalites.indemnite ? ` + indemnité ${formatEuros(penalites.indemnite)}` : ""} → <strong className="text-white">{formatEuros(penalites.total)}</strong> exigibles en plus</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Parcours assisté */}
      <div className="mt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Parcours de recouvrement — chaque étape est assistée</div>
          <button onClick={() => setGuideOuvert((v) => !v)} className="text-xs font-semibold text-accent-pink hover:underline">{guideOuvert ? "Masquer les repères juridiques" : "Repères juridiques"}</button>
        </div>
        <ol className="mt-2 space-y-2">
          {ETAPES_PROCEDURE.map((e, i) => {
            const st = statutEtape(i);
            const enCours = st === "encours";
            const ouvert = ouvertCode === e.code;
            return (
              <li key={e.code} className={`rounded-xl border p-3 ${enCours ? "border-amber-400/60 bg-amber-500/10" : st === "fait" ? "border-emerald-400/40 bg-emerald-500/5" : "border-white/10"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button onClick={() => setOuvertCode(ouvert ? null : e.code)} className="flex min-w-0 items-center gap-2 text-left" title={ouvert ? "Replier" : "Déplier"} aria-expanded={ouvert}>
                    <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${st === "fait" ? "bg-emerald-500 text-white" : enCours ? "bg-amber-400 text-amber-950" : "bg-white/15 text-white/70"}`}>{st === "fait" ? "✓" : i + 1}</span>
                    <span className={`text-base font-semibold ${st === "avenir" ? "text-white/60" : "text-white"}`}>{e.titre}</span>
                    <span className="text-white/50">{ouvert ? "▾" : "▸"}</span>
                  </button>
                  <span className="text-xs text-white/60">{st === "fait" ? `fait le ${formatDate(etapesFaites[e.code].fait_le)}` : enCours ? "étape en cours" : st === "passee" ? "passée sans validation" : e.quand}</span>
                </div>
                {ouvert && <div className="mt-3">{contenuEtape(e.code)}</div>}
                {guideOuvert && !ouvert && <p className="mt-2 text-xs text-white/60">{e.comment}</p>}
                {guideOuvert && <p className="mt-1 text-[11px] text-white/45">{e.textes}</p>}
              </li>
            );
          })}
        </ol>
        {guideOuvert && (
          <p className="mt-2 text-[11px] text-amber-200/80">Repères juridiques indicatifs (droit français, septembre 2026). L&apos;appli n&apos;est ni avocat ni commissaire de justice : avant une action en justice, vérifiez les délais et faites-vous conseiller.</p>
        )}
      </div>

      {/* ---------------- Véhicule et garanties (v13.15) ---------------- */}
      {(vehiculeAuGarage || clausesOR) && (
        <div className="mt-3 glass-soft p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Véhicule et garanties de paiement</div>
            <span className={`badge ${vehiculeAuGarage ? "badge-ok" : "badge-neutral"}`}>{vehiculeAuGarage ? "Véhicule au garage" : "Véhicule rendu"}</span>
          </div>
          {!clausesOR && <p className="mt-1 text-xs text-white/60">L&apos;OR de ce dossier ne porte pas de clauses de garantie (OR antérieur à la v13.15 ou garanties désactivées dans le profil). Les leviers légaux restent utilisables ; les courriers ci-dessous les mentionnent.</p>}
          {!vehiculeAuGarage && <p className="mt-1 text-xs text-white/60">Le véhicule a été rendu : rétention et vente loi 1903 sont sans objet.{gage.ok ? " Le gage reste mobilisable." : ""}</p>}

          <div className="mt-2 grid gap-3 lg:grid-cols-3">
            {/* Rétention */}
            <div className="rounded-xl border border-white/10 p-3">
              <div className="font-semibold text-white">1. Droit de rétention</div>
              {vehiculeAuGarage ? (
                <>
                  <p className="mt-1 text-sm text-white/80">Véhicule conservé jusqu&apos;au paiement intégral (art. 2286 C. civ.). Ne pas le restituer avant encaissement.</p>
                  {situation.dispoDepuis ? (
                    <p className="mt-1 text-sm text-white/80">À disposition depuis le <strong className="text-white">{formatDate(situation.dispoDepuis)}</strong> ({situation.joursDepuisDispo} j).{clausesOR?.gardiennage_jour ? <> Gardiennage : <strong className="text-white">{formatEuros(situation.gardiennageMontant)}</strong> HT ({situation.gardiennageJours} j × {formatEuros(clausesOR.gardiennage_jour)}).</> : " Tarif de gardiennage non renseigné dans le profil."}</p>
                  ) : (
                    <p className="mt-1 text-xs text-amber-200/90">Date de fin de travaux inconnue : renseignez « fin prévue » sur l&apos;OR ou la date de réparation du dossier pour déclencher le gardiennage et le compteur des 3 mois.</p>
                  )}
                  <p className="mt-1 text-[11px] text-white/45">Facturer le gardiennage : fiche dossier → Documents → « + Gardiennage ».</p>
                </>
              ) : (
                <p className="mt-1 text-sm text-white/60">Sans objet, véhicule rendu.</p>
              )}
            </div>

            {/* Loi 1903 */}
            <div className="rounded-xl border border-white/10 p-3">
              <div className="font-semibold text-white">2. Vente aux enchères (loi 1903)</div>
              {!vehiculeAuGarage ? (
                <p className="mt-1 text-sm text-white/60">Sans objet, véhicule rendu.</p>
              ) : (
                <>
                  <p className="mt-1 text-sm text-white/80">{situation.dateVentePossible ? (situation.joursAvantVente > 0 ? <>Requête possible à partir du <strong className="text-white">{formatDate(situation.dateVentePossible)}</strong> (dans {situation.joursAvantVente} j), après mise en demeure.</> : <><strong className="text-emerald-300">Délai de 3 mois écoulé</strong> : la requête peut être déposée.</>) : "Compteur non démarré (date de mise à disposition inconnue)."}</p>
                  <EtapesGarantie voie="abandon" />
                </>
              )}
            </div>

            {/* Gage */}
            <div className="rounded-xl border border-white/10 p-3">
              <div className="font-semibold text-white">3. Gage — pacte commissoire</div>
              {gage.ok ? (
                <>
                  <p className="mt-1 text-sm text-white/80">Clause acceptée expressément le {formatDate(clausesOR?.gage_consenti_le)}{clausesOR?.gage_consenti_par ? ` par ${clausesOR.gage_consenti_par}` : ""} (OR {orRef?.numero}). Transfert de propriété à défaut de paiement <strong className="text-white">{clausesOR?.gage_delai || 30} j</strong> après la mise en demeure.</p>
                  {etapesFaites.gar_med_retrait && (() => {
                    const fin = new Date(new Date(etapesFaites.gar_med_retrait.fait_le).getTime() + (clausesOR?.gage_delai || 30) * 86400000);
                    const restant = Math.ceil((fin.getTime() - Date.now()) / 86400000);
                    return <p className="mt-1 text-sm text-white/80">{restant > 0 ? <>Délai en cours : expire le <strong className="text-white">{fin.toLocaleDateString("fr-FR")}</strong> ({restant} j).</> : <strong className="text-emerald-300">Délai expiré : le gage peut être réalisé (évaluation par expert).</strong>}</p>;
                  })()}
                  {!etapesFaites.gar_med_retrait && <p className="mt-1 text-xs text-amber-200/90">Envoyez d&apos;abord la mise en demeure de payer et de retirer le véhicule (colonne 2) : elle fait courir le délai du pacte.</p>}
                  {etapesFaites.gar_gage_expertise?.montant != null && (() => {
                    const a = attributionGage(etapesFaites.gar_gage_expertise!.montant!, totalDu, etapesFaites.gar_gage_expertise!.frais || 0);
                    return <div className="mt-1 rounded-lg bg-white/5 p-2 text-sm text-white/85">Valeur expert <strong>{formatEuros(etapesFaites.gar_gage_expertise!.montant!)}</strong> − dû {formatEuros(a.total)} → {a.aRestituer > 0 ? <>à <strong className="text-emerald-300">restituer au client : {formatEuros(a.aRestituer)}</strong></> : a.resteDu > 0 ? <>reste dû par le client : <strong className="text-rose-300">{formatEuros(a.resteDu)}</strong></> : "solde nul"}.</div>;
                  })()}
                  <EtapesGarantie voie="gage" />
                </>
              ) : (
                <p className="mt-1 text-sm text-white/60">Non mobilisable : {gage.raison} <span className="text-white/40">(Profil → Garanties de paiement)</span></p>
              )}
            </div>
          </div>

          {vehiculeAuGarage && (
            <div className="mt-3 flex flex-wrap gap-2">
              {!courriersDe(["mise_en_demeure_retrait"]).length ? (
                <button onClick={() => setCourrierModal({ type: "mise_en_demeure_retrait" })} className="btn-primary btn-compact" disabled={!principale}>⚖ Mise en demeure de payer et de retirer le véhicule (PDF)</button>
              ) : null}
              {etapesFaites.gar_med_retrait && situation.joursAvantVente === 0 && !etapesFaites.gar_requete_1903 && (
                <button onClick={() => setCourrierModal({ type: "requete_vente_1903", dest: "tiers" })} className="btn-primary btn-compact" disabled={!principale}>📄 Demande de vente au commissaire de justice (PDF)</button>
              )}
              {gage.ok && etapesFaites.gar_gage_expertise?.montant != null && !etapesFaites.gar_gage_attribution && (
                <button onClick={() => setCourrierModal({ type: "attribution_gage" })} className="btn-primary btn-compact" disabled={!principale}>📄 Notification du transfert de propriété (PDF)</button>
              )}
            </div>
          )}
          <ListeCourriers types={["mise_en_demeure_retrait", "requete_vente_1903", "attribution_gage"]} />
          <p className="mt-2 text-[11px] text-white/45">Repères : art. 2286 et 1948 C. civ. (rétention) ; loi du 31 déc. 1903 (vente, 3 mois, juge) ; art. 2336 et 2348 C. civ. (gage, expert, surplus). L&apos;appli n&apos;est ni avocat ni commissaire de justice.</p>
        </div>
      )}

      {/* Journal des contacts + rappels */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="glass-soft p-3" ref={journalRef}>
          <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Journal des appels et échanges</div>
          <div className="mt-2 flex flex-wrap items-end gap-2 text-xs">
            <div><label className="field-label text-[11px]">Date</label><input type="date" className="field-input field-compact" value={cDate} onChange={(e) => setCDate(e.target.value)} /></div>
            <div><label className="field-label text-[11px]">Heure</label><input type="time" className="field-input field-compact" value={cHeure} onChange={(e) => setCHeure(e.target.value)} /></div>
            <div><label className="field-label text-[11px]">Qui</label><select className="field-input field-compact" value={cQui} onChange={(e) => setCQui(e.target.value)}>{INTERLOCUTEURS.map((i) => <option key={i.code} value={i.code}>{i.label}</option>)}</select></div>
            <div><label className="field-label text-[11px]">Par</label><select className="field-input field-compact" value={cCanal} onChange={(e) => setCCanal(e.target.value)}>{CANAUX_CONTACT.map((i) => <option key={i.code} value={i.code}>{i.label}</option>)}</select></div>
          </div>
          <textarea className="field-input mt-2 w-full" rows={2} placeholder="Ce qui a été dit : « promet un virement vendredi », « attend le rapport définitif »…" value={cNotes} onChange={(e) => setCNotes(e.target.value)} />
          <div className="mt-1.5 flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1"><label className="field-label text-[11px]">Me le rappeler (facultatif)</label><ChampEcheance valeur={cRappel} onChange={setCRappel} /></div>
            <button onClick={enregistrerContact} disabled={busy || !cNotes.trim()} className="btn-primary btn-compact shrink-0">Enregistrer</button>
          </div>
          {relances.length > 0 && (
            <ul className="mt-2 max-h-56 divide-y divide-white/10 overflow-y-auto">
              {relances.map((r) => (
                <li key={r.id} className="py-1.5 text-sm">
                  <div className="flex flex-wrap items-center gap-1.5 text-white/60">
                    <span className="font-semibold text-white">{formatDate(r.date_relance)}</span>
                    {r.heure && <span>{r.heure}</span>}
                    {r.interlocuteur && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/80">{libelleQui(r.interlocuteur)}</span>}
                    <span>{CANAUX_CONTACT.find((c) => c.code === r.canal)?.label || r.canal}</span>
                  </div>
                  {r.notes && <div className="mt-0.5 break-words text-white/85">{r.notes}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass-soft p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Rappels</div>
          <p className="mt-1 text-xs text-white/60">Programmés automatiquement après chaque action (J+8, J+30…). Visibles dans « À faire ».</p>
          <div className="mt-2 flex gap-2">
            <input className="field-input field-compact flex-1" placeholder="Rappel… (ex. rappeler l'assurance)" value={tTexte} onChange={(e) => setTTexte(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ajouterTache(); } }} />
            <button onClick={ajouterTache} disabled={busy || !tTexte.trim()} className="btn-ghost btn-compact shrink-0">Ajouter</button>
          </div>
          <div className="mt-1.5"><ChampEcheance valeur={tEcheance} onChange={setTEcheance} /></div>
          {taches.filter((t) => !t.fait).length > 0 && (
            <ul className="mt-2 divide-y divide-white/10">
              {taches.filter((t) => !t.fait).map((ligne) => {
                const retard = estEnRetard(ligne.echeance);
                return (
                  <li key={ligne.id} className="flex min-w-0 items-start gap-2.5 py-2 text-sm">
                    <input type="checkbox" checked={false} onChange={() => cocher(ligne, true)} className="mt-1 h-4 w-4 shrink-0 accent-emerald-500" />
                    <div className="min-w-0 flex-1">
                      <span className="block break-words text-white/90">{ligne.texte}</span>
                      <span className="block text-[10px] tabular-nums text-white/40">ajouté le {formatDateTime(ligne.created_at)}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {ligne.origine === ORIGINE_AUTO && <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">Auto</span>}
                        {ligne.echeance && <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${retard ? "bg-rose-100 text-rose-700" : "bg-white/10 text-white/80"}`}>{retard ? "En retard · " : ""}{libelleEcheance(ligne.echeance)}</span>}
                      </span>
                    </div>
                    <button onClick={() => retirerTache(ligne)} className="shrink-0 text-white/40 hover:text-rose-300" title="Supprimer">×</button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {erreur && <div className="mt-2 rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{erreur}</div>}

      {/* Modale courrier */}
      {courrierModal && principale && (
        <CourrierModal
          type={courrierModal.type}
          existant={courrierModal.courrier}
          destInitial={courrierModal.dest}
          tiersNom={courrierModal.tiersNom}
          dossier={dossier}
          facture={factureDe(courrierModal.courrier || ({ document_id: principale.id } as CourrierRecouvrement)) || principale}
          reste={etats.find((x) => x.facture.id === (courrierModal.courrier?.document_id || principale.id))?.etat.reste ?? totalDu}
          niveau={nbRelances + 1}
          garage={garage}
          banque={banque}
          garantie={infosGarantie}
          etapes={etapesFaites}
          onClose={() => setCourrierModal(null)}
          onSaved={(c, action) => {
            setCourriers((prev) => (prev.some((x) => x.id === c.id) ? prev.map((x) => (x.id === c.id ? c : x)) : [c, ...prev]));
            setCourrierModal(null);
            if (action === "email") courrierEnvoyeParEmail(c);
            else if (action === "lrar") setEnvoiModal(c);
            else if (action === "signe") setInfo("Courrier enregistré et signé.");
          }}
        />
      )}

      {/* Modale envoi recommandé / posté */}
      {envoiModal && (
        <EnvoiModal
          courrier={envoiModal}
          dossier={dossier}
          numeroFacture={factureDe(envoiModal)?.numero}
          onClose={() => setEnvoiModal(null)}
          onConfirmer={(canal, numero, date) => marquerEnvoye(envoiModal, canal, { numero_suivi: numero, date })}
        />
      )}

      {/* Modale étape faite */}
      {etapeModal && (
        <EtapeModal
          code={etapeModal.code}
          refInitiale={etapeModal.ref}
          onClose={() => setEtapeModal(null)}
          titre={etapeModal.titre}
          dateInitiale={etapeModal.date}
          noteInitiale={etapeModal.note}
          edition={etapeModal.edition}
          montantInitial={etapeModal.montant}
          fraisInitial={etapeModal.frais}
          onConfirmer={(date, ref, note, montants) => (etapeModal.edition ? modifierEtapeFaite(etapeModal.code, date, ref, note, montants) : marquerEtapeFaite(etapeModal.code, date, ref, note, etapeModal.vers, montants))}
        />
      )}

      {/* Modale email */}
      {emailModal && (
        <EmailComposer
          dossier={dossier}
          document={emailModal.facture}
          defaultTo={emailModal.to}
          defaultSubject={emailModal.subject}
          defaultBody={emailModal.body}
          piecesJointes={
            emailModal.courrier
              ? [{ label: LIBELLE_TYPE_COURRIER[emailModal.courrier.type], filename: nomFichierCourrier(emailModal.courrier, emailModal.facture?.numero), getBase64: () => courrierRecouvrementPdfBase64(emailModal.courrier!, dossier), coche: true }]
              : emailModal.facture
                ? [{ label: nomFichierDocument(emailModal.facture).replace(/\.pdf$/, ""), filename: nomFichierDocument(emailModal.facture), getBase64: () => documentPdfBase64Auto(emailModal.facture!, dossier), coche: false }]
                : undefined
          }
          onClose={() => setEmailModal(null)}
          onSent={async () => {
            const m = emailModal;
            setEmailModal(null);
            if (m.courrier) { await marquerEnvoye(m.courrier, "email"); return; }
            try { await journaliser({ canal: "email", interlocuteur: m.interlocuteur === "tiers" ? "autre" : m.interlocuteur, notes: `Relance envoyée par email — ${m.subject}`, documentId: m.facture?.id }); } catch (err) { setErreur(messageErreur(err, "Email envoyé mais relance non journalisée.")); }
            await programmerRappelAuto(`Vérifier le paiement après relance email (${nomDebiteur}) — relancer à nouveau si rien reçu`, 8);
            charger(); onChanged?.();
          }}
        />
      )}
    </section>
  );
}

function libelleQui(code: string): string {
  return INTERLOCUTEURS.find((i) => i.code === code)?.label || code;
}

/* ====================================================================
   Modale « courrier » : texte proposé, modifiable, signature au doigt
   (sinon tampon + signature du profil), aperçu / PDF, puis email ou
   recommandé (qui ouvre l'étape d'envoi avec le n° de suivi).
==================================================================== */

function CourrierModal({ type, existant, destInitial, tiersNom, dossier, facture, reste, niveau, garage, banque, garantie, etapes, onClose, onSaved }: {
  type: TypeCourrier;
  existant?: CourrierRecouvrement;
  destInitial?: Dest;
  tiersNom?: string;
  dossier: Dossier;
  facture: Document;
  reste: number;
  niveau: number;
  garage: string | null;
  banque: Banque | null;
  garantie?: InfosGarantie | null;
  etapes: EtapesFaites;
  onClose: () => void;
  onSaved: (c: CourrierRecouvrement, action: "brouillon" | "signe" | "email" | "lrar") => void;
}) {
  const debiteur = cibleParDefaut(dossier);
  // Tiers pré-rempli : conciliateur / greffe / commissaire compétent au lieu du débiteur, ou le cabinet d'expertise.
  const tiersDefaut = useMemo(() => {
    if (tiersNom === "expert") return cibleExpert(dossier);
    const t = cibleTiersPourCourrier(type, dossier, debiteur, reste);
    return tiersNom && !t.nom ? cibleTiers(tiersNom) : tiersNom && type === "transmission_avocat" ? { ...t, nom: tiersNom } : t;
  }, [type, dossier, debiteur, reste, tiersNom]);
  const cibleDe = useCallback((d: Dest, nomT?: string, adrT?: string): CibleCourrier => (d === "assurance" ? cibleAssurance(dossier) : d === "client" ? cibleClient(dossier) : nomT !== undefined || adrT !== undefined ? cibleTiers(nomT || "", adrT || "") : tiersDefaut), [dossier, tiersDefaut]);
  const initialDest: Dest = existant?.destinataire || destInitial || debiteur.type;
  const initialCible = existant ? cibleDe(initialDest, existant.destinataire_nom || undefined, existant.destinataire_adresse || undefined) : cibleDe(initialDest);
  const [vers, setVers] = useState<Dest>(initialDest);
  const [nom, setNom] = useState(existant?.destinataire_nom || initialCible.nom);
  const [adresse, setAdresse] = useState(existant?.destinataire_adresse || initialCible.adresse);
  const [date, setDate] = useState(existant?.date_courrier || ymd());
  const modele = useMemo(() => modeleCourrier({ type, facture, dossier, cible: cibleDe(vers, nom, adresse), reste, niveau, garage, debiteur, etapes, banque, garantie }), [type, facture, dossier, vers, nom, adresse, reste, niveau, garage, debiteur, etapes, banque, garantie, cibleDe]);
  const [objet, setObjet] = useState(existant?.objet || modele.objet);
  const [corps, setCorps] = useState(existant?.corps || modele.corps);
  const [signataire, setSignataire] = useState(existant?.signataire_nom || garage || "");
  const [signature, setSignature] = useState<string | null>(existant?.signature || null);
  const [signer, setSigner] = useState(Boolean(existant?.signature));
  const [busy, setBusy] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const versTiers = type === "saisine_conciliateur" || type === "requete_injonction" || type === "remise_commissaire" || type === "requete_vente_1903";
  const lrar = type === "mise_en_demeure" || type === "reclamation_assureur" || type === "mise_en_demeure_retrait" || type === "attribution_gage";

  function changerCible(v: Dest) {
    setVers(v);
    const c = cibleDe(v);
    setNom(c.nom); setAdresse(c.adresse);
    const m = modeleCourrier({ type, facture, dossier, cible: c, reste, niveau, garage, debiteur, etapes, banque, garantie });
    setObjet(m.objet); setCorps(m.corps);
  }

  function brouillon(): CourrierRecouvrement {
    const signe = signer && signature;
    return {
      id: existant?.id || "", created_at: existant?.created_at || new Date().toISOString(), dossier_id: dossier.id, document_id: facture.id, type,
      destinataire: vers, destinataire_nom: nom.trim() || null, destinataire_adresse: adresse.trim() || null, objet: objet.trim() || null, corps: corps.trim() || null,
      montant: reste, delai_jours: modele.delaiJours, date_courrier: date || ymd(), signataire_nom: signataire.trim() || null,
      signature: signe ? signature : null, signe_le: signe ? existant?.signe_le || new Date().toISOString() : null,
      envoye_le: existant?.envoye_le || null, canal_envoi: existant?.canal_envoi || null,
      statut: existant?.statut === "envoye" ? "envoye" : signe ? "signe" : "brouillon", notes: existant?.notes || null, numero_suivi: existant?.numero_suivi || null,
    };
  }

  async function enregistrer(action: "brouillon" | "signe" | "email" | "lrar") {
    setBusy(action); setErreur(null);
    const c = brouillon();
    if (signer && !signature) { setErreur("Signez dans le cadre (ou décochez la signature au doigt pour utiliser le tampon et la signature du profil)."); setBusy(null); return; }
    const { id, created_at, numero_suivi, ...donnees } = c;
    void created_at; void numero_suivi;
    const res = id
      ? await supabase.from("courriers_recouvrement").update(donnees).eq("id", id).select("*").single()
      : await supabase.from("courriers_recouvrement").insert(donnees).select("*").single();
    if (res.error || !res.data) { setErreur(messageErreur(res.error, "Enregistrement impossible (migration v70 exécutée ?).")); setBusy(null); return; }
    setBusy(null);
    onSaved(res.data as CourrierRecouvrement, action);
  }

  return (
    <ModalShell title={LIBELLE_TYPE_COURRIER[type]} onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          {!versTiers && (
            <div>
              <label className="field-label text-[11px]">Destinataire</label>
              <div className="segment">
                <button type="button" onClick={() => changerCible("client")} className={`segment-btn ${vers === "client" ? "actif" : ""}`}>Client</button>
                <button type="button" onClick={() => changerCible("assurance")} className={`segment-btn ${vers === "assurance" ? "actif" : ""}`}>Assurance</button>
                {type === "relance" && dossier.cabinet_expert && <button type="button" onClick={() => { setVers("tiers"); const c = cibleExpert(dossier); setNom(c.nom); setAdresse(c.adresse); }} className={`segment-btn ${vers === "tiers" ? "actif" : ""}`}>Expert</button>}
              </div>
            </div>
          )}
          <div><label className="field-label text-[11px]">Date du courrier</label><input type="date" className="field-input field-compact" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="text-sm text-white/70">Facture {facture.numero || "—"} · <strong className="text-white">{formatEuros(reste)}</strong> dus</div>
        </div>
        {versTiers && <p className="text-xs text-white/60">Destinataire pré-rempli d&apos;après le domicile / siège du débiteur ({[dossier.client_code_postal, dossier.client_ville].filter(Boolean).join(" ") || "lieu inconnu"}) : vérifiez l&apos;adresse exacte de la juridiction ou de l&apos;étude.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          <div><label className="field-label text-[11px]">{versTiers ? "Destinataire (conciliateur, greffe, commissaire…)" : "Nom du destinataire"}</label><input className="field-input field-compact w-full" value={nom} onChange={(e) => setNom(e.target.value)} /></div>
          <div><label className="field-label text-[11px]">Adresse postale</label><textarea className="field-input field-compact w-full" rows={2} value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="Rue, code postal, ville" /></div>
        </div>
        <div><label className="field-label text-[11px]">Objet</label><input className="field-input field-compact w-full" value={objet} onChange={(e) => setObjet(e.target.value)} /></div>
        <div>
          <div className="flex items-center justify-between">
            <label className="field-label text-[11px]">Texte du courrier (modifiable)</label>
            <button type="button" onClick={() => { setObjet(modele.objet); setCorps(modele.corps); }} className="text-[11px] font-semibold text-accent-pink hover:underline">↺ Reprendre le texte proposé</button>
          </div>
          <textarea className="field-input w-full font-mono text-[13px]" rows={12} value={corps} onChange={(e) => setCorps(e.target.value)} />
          {lrar && <p className="mt-1 text-xs text-amber-200/90">À envoyer en recommandé avec accusé de réception : c&apos;est la preuve exigée ensuite. Le PDF est édité au logo et aux couleurs du garage.</p>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="field-label text-[11px]">Signataire</label>
            <input className="field-input field-compact w-full" value={signataire} onChange={(e) => setSignataire(e.target.value)} placeholder="Nom du signataire" />
            <label className="mt-2 flex items-center gap-2 text-sm text-white/80">
              <input type="checkbox" checked={signer} onChange={(e) => setSigner(e.target.checked)} className="h-4 w-4 accent-pink-500" />
              Signer au doigt (sinon : tampon et signature enregistrés dans le profil)
            </label>
          </div>
          {signer && <div><label className="field-label text-[11px]">Signature</label><SignaturePad onChange={setSignature} /></div>}
        </div>
        {erreur && <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{erreur}</div>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-3">
          <button type="button" onClick={() => apercuCourrierRecouvrementPdf(brouillon(), dossier, facture.numero)} className="btn-ghost btn-compact">👁 Aperçu PDF</button>
          <button type="button" onClick={() => generateCourrierRecouvrementPdf(brouillon(), dossier, facture.numero)} className="btn-ghost btn-compact">⬇ Télécharger le PDF</button>
          <button type="button" onClick={() => enregistrer(signer && signature ? "signe" : "brouillon")} disabled={busy !== null} className="btn-ghost btn-compact">Enregistrer</button>
          {!versTiers && <button type="button" onClick={() => enregistrer("email")} disabled={busy !== null} className="btn-ghost btn-compact">✉ Envoyer par email (PDF joint)</button>}
          <button type="button" onClick={() => enregistrer("lrar")} disabled={busy !== null} className="btn-primary btn-compact">{lrar ? "Signer → envoyer en recommandé" : "Signer → envoyer par courrier"}</button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ====================================================================
   Modale « envoi » : le courrier est prêt — on le télécharge / imprime,
   on le poste, on saisit le n° de suivi du recommandé et la date, puis
   on confirme. C'est CETTE confirmation qui valide l'étape et programme
   le rappel.
==================================================================== */

function EnvoiModal({ courrier, dossier, numeroFacture, onClose, onConfirmer }: {
  courrier: CourrierRecouvrement;
  dossier: Dossier;
  numeroFacture?: string | null;
  onClose: () => void;
  onConfirmer: (canal: "lrar" | "courrier" | "remis_en_main", numero: string | null, date: string) => Promise<void>;
}) {
  const [canal, setCanal] = useState<"lrar" | "courrier" | "remis_en_main">(["mise_en_demeure", "reclamation_assureur", "mise_en_demeure_retrait", "attribution_gage"].includes(courrier.type) ? "lrar" : "courrier");
  const [numero, setNumero] = useState(courrier.numero_suivi || "");
  const [date, setDate] = useState(ymd());
  const [busy, setBusy] = useState(false);
  const [laPoste, setLaPoste] = useState(false);
  const signe = Boolean(courrier.signature) || courrier.statut === "signe";
  return (
    <ModalShell title={`Envoyer — ${LIBELLE_TYPE_COURRIER[courrier.type]}`} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-3">
        {/* v13.27 — Envoi dématérialisé : La Poste imprime et distribue le PDF. */}
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3">
          <div className="text-sm font-semibold text-white">📮 Envoyer par La Poste depuis l&apos;appli</div>
          <p className="mt-0.5 text-xs text-white/65">Le courrier est imprimé et posté pour vous{canal === "lrar" ? " en recommandé AR : n° de recommandé, preuve de dépôt et avis de réception remontent dans le dossier" : ""}. Rien à imprimer, pas de bureau de poste.</p>
          <button type="button" onClick={() => setLaPoste(true)} className="btn-primary btn-compact mt-2">{canal === "lrar" ? "Envoyer en recommandé AR par La Poste" : "Envoyer par La Poste"}</button>
        </div>
        <div className="text-center text-[11px] uppercase tracking-wide text-white/40">— ou envoi manuel —</div>
        <div className="glass-soft p-3 text-sm text-white/85">
          <div><strong className="text-white">{courrier.destinataire_nom || courrier.destinataire}</strong>{courrier.destinataire_adresse ? ` — ${courrier.destinataire_adresse.replace(/\n/g, ", ")}` : ""}</div>
          <div className="text-white/70">Daté du {formatDate(courrier.date_courrier)}{courrier.montant ? ` · ${formatEuros(courrier.montant)}` : ""} · {signe ? (courrier.signature ? "signé au doigt" : "signé (tampon et signature du profil)") : "non signé"}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => apercuCourrierRecouvrementPdf(courrier, dossier, numeroFacture)} className="btn-ghost btn-compact">👁 Aperçu</button>
          <button type="button" onClick={() => generateCourrierRecouvrementPdf(courrier, dossier, numeroFacture)} className="btn-primary btn-compact">⬇ Télécharger le PDF à imprimer</button>
        </div>
        <div>
          <label className="field-label text-[11px]">Mode d&apos;envoi</label>
          <div className="segment">
            <button type="button" onClick={() => setCanal("lrar")} className={`segment-btn ${canal === "lrar" ? "actif" : ""}`}>Recommandé AR</button>
            <button type="button" onClick={() => setCanal("courrier")} className={`segment-btn ${canal === "courrier" ? "actif" : ""}`}>Courrier simple</button>
            <button type="button" onClick={() => setCanal("remis_en_main")} className={`segment-btn ${canal === "remis_en_main" ? "actif" : ""}`}>Remis en main propre</button>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {canal === "lrar" && <div><label className="field-label text-[11px]">N° du recommandé (suivi La Poste)</label><input className="field-input field-compact w-full font-mono" placeholder="1A 123 456 7890 1" value={numero} onChange={(e) => setNumero(e.target.value)} /></div>}
          <div><label className="field-label text-[11px]">Date d&apos;envoi</label><input type="date" className="field-input field-compact w-full" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        {canal === "lrar" && <p className="text-xs text-white/60">Le n° de suivi est conservé avec le courrier et repris dans les pièces de la procédure. Vous pouvez le saisir plus tard en modifiant le courrier.</p>}
        <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
          <button type="button" onClick={onClose} className="btn-ghost btn-compact">Plus tard</button>
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await onConfirmer(canal, numero.trim() || null, date); } finally { setBusy(false); } }} className="btn-primary btn-compact">{busy ? "Enregistrement…" : "✓ Confirmer l'envoi"}</button>
        </div>
      </div>
      {laPoste && (
        <EnvoiPostalModal
          titre={`La Poste — ${LIBELLE_TYPE_COURRIER[courrier.type]}`}
          getPdfBase64={() => courrierRecouvrementPdfBase64(courrier, dossier)}
          nomFichier={nomFichierCourrier(courrier, numeroFacture)}
          objet={courrier.objet || LIBELLE_TYPE_COURRIER[courrier.type]}
          destinataireNom={courrier.destinataire_nom || ""}
          destinataireAdresse={courrier.destinataire_adresse || ""}
          typeInitial={canal === "lrar" ? "lrar" : "simple"}
          dossierId={dossier.id}
          courrierId={courrier.id || null}
          onClose={() => setLaPoste(false)}
          onEnvoye={async (e) => {
            setLaPoste(false);
            // Le n° de recommandé est attribué à l'impression : il sera reporté
            // automatiquement sur le courrier au prochain suivi.
            await onConfirmer(e.type === "lrar" ? "lrar" : "courrier", e.numero_suivi, ymd());
          }}
        />
      )}
    </ModalShell>
  );
}

/* ====================================================================
   Modale « étape faite » : date, référence (n° de recommandé, de
   requête, titre exécutoire…), note — l'appli passe ensuite à l'étape
   suivante et programme le rappel.
==================================================================== */

function EtapeModal({ code, refInitiale, dateInitiale, noteInitiale, montantInitial, fraisInitial, edition, titre, onClose, onConfirmer }: { code: string; refInitiale?: string; dateInitiale?: string; noteInitiale?: string; montantInitial?: number | null; fraisInitial?: number | null; edition?: boolean; titre?: string; onClose: () => void; onConfirmer: (date: string, ref: string | null, note: string | null, montants?: { montant?: number | null; frais?: number | null }) => Promise<void> }) {
  const eg = etapeGarantie(code);
  const e = eg ? { titre: eg.titre } : etapeProcedure(code);
  const saisie = eg ? { ref: eg.ref, aide: eg.aide } : SAISIE_ETAPE[code];
  const suiv = eg ? null : etapeSuivante(code);
  const [date, setDate] = useState(dateInitiale || ymd());
  const [ref, setRef] = useState(refInitiale || "");
  const [note, setNote] = useState(noteInitiale || "");
  const [montant, setMontant] = useState(montantInitial != null ? String(montantInitial) : "");
  const [frais, setFrais] = useState(fraisInitial != null ? String(fraisInitial) : "");
  const [busy, setBusy] = useState(false);
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  return (
    <ModalShell title={titre || `${e.titre} — étape réalisée`} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-3">
        <p className="text-sm text-white/80">{saisie?.aide}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div><label className="field-label text-[11px]">Date</label><input type="date" className="field-input field-compact w-full" value={date} onChange={(ev) => setDate(ev.target.value)} /></div>
          {saisie?.ref && <div><label className="field-label text-[11px]">{saisie.ref}</label><input className="field-input field-compact w-full" value={ref} onChange={(ev) => setRef(ev.target.value)} /></div>}
          {eg?.montants?.map((m) => (
            <div key={m.cle}><label className="field-label text-[11px]">{m.label}</label><input inputMode="decimal" className="field-input field-compact w-full text-right" value={m.cle === "montant" ? montant : frais} onChange={(ev) => (m.cle === "montant" ? setMontant(ev.target.value) : setFrais(ev.target.value))} /></div>
          ))}
        </div>
        <div><label className="field-label text-[11px]">Note (facultatif)</label><textarea className="field-input w-full" rows={2} value={note} onChange={(ev) => setNote(ev.target.value)} /></div>
        <p className="text-xs text-white/60">{edition ? "Seules la date, la référence et la note sont modifiées." : suiv ? `L'appli passe ensuite à l'étape « ${suiv.titre} » et programme le rappel.` : "Dernière étape du parcours."}</p>
        <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
          <button type="button" onClick={onClose} className="btn-ghost btn-compact">Annuler</button>
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await onConfirmer(date, ref.trim() || null, note.trim() || null, eg?.montants ? { montant: num(montant), frais: num(frais) } : undefined); } finally { setBusy(false); } }} className="btn-primary btn-compact">{busy ? "Enregistrement…" : edition ? "Enregistrer" : "✓ Valider l'étape"}</button>
        </div>
      </div>
    </ModalShell>
  );
}
