"use client";

// ============================================================
//  RECOURS DIRECT (v13.53, migration v103)
//
//  Client non responsable : le garage, mandaté, réclame les réparations
//  DIRECTEMENT à l'assureur du responsable (art. L. 124-3 C. assur.).
//  Le bloc rassemble :
//   · le TIERS RESPONSABLE et son assureur (pioché dans la base
//     assureurs), n° de police / de sinistre adverse, date du constat ;
//   · le CALCUL : part de responsabilité, vétusté → dû par l'assureur
//     adverse, reste à charge du client ;
//   · la PROCÉDURE GUIDÉE : mandat → recours → relance J+15 → mise en
//     demeure J+30 → Médiateur / injonction → réglé, avec rappels dans
//     « À faire » (origine 'recours') ;
//   · les COURRIERS (mandat signé par le client, lettre de recours,
//     relance, mise en demeure) : PDF au logo, e-mail avec pièces jointes
//     (mandat, constat, rapport, facture), recommandé + AR — même circuit
//     que les courriers de litige (table courriers_recouvrement).
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Assureur, CourrierRecouvrement, Document, Dossier, PieceDossier } from "@/lib/types";
import { formatDate, formatEuros, messageErreur, ymd } from "@/lib/format";
import { montantTtc } from "@/lib/tva";
import { ajouterRappel } from "@/lib/ardoise";
import { lireRole } from "@/lib/conversation";
import { echeanceRappel } from "@/lib/recouvrement";
import { fichierBase64 } from "@/lib/storage";
import { labelPiece } from "@/lib/pieces";
import { arJoint, cloturerTaches, origineAPoster } from "@/lib/courrierPapier";
import {
  ETAPES_RECOURS, ETAPE_PAR_COURRIER, LIBELLE_COURRIER_RECOURS, type EtapeRecours, type TypeCourrierRecours,
  calculerRecours, cibleAssureurAdverse, etapeRecours, indexEtapeRecours, joursDepuis, modeleCourrierRecours,
} from "@/lib/recours";
import { apercuCourrierRecouvrementPdf, courrierRecouvrementPdfBase64, documentPdfBase64Auto, generateCourrierRecouvrementPdf, nomFichierCourrier, nomFichierDocument } from "@/lib/pdf";
import ModalShell from "./ModalShell";
import SignaturePad from "./SignaturePad";
import EmailComposer from "./EmailComposer";
import CourrierPapierModal, { type CanalPapier } from "./CourrierPapierModal";

const ORIGINE_RECOURS = "recours";
const TYPES: TypeCourrierRecours[] = ["mandat_recours", "recours_direct", "relance_recours", "mise_en_demeure_recours"];

type Garage = { nom: string | null; adresse: string | null; code_postal: string | null; ville: string | null; siret: string | null };

export default function RecoursDirectPanel({
  dossier,
  documents,
  pieces,
  onPatch,
  onLever,
}: {
  dossier: Dossier;
  documents: Document[];
  pieces: PieceDossier[];
  onPatch: (patch: Partial<Dossier>) => void;
  onLever: () => void;
}) {
  const [courriers, setCourriers] = useState<CourrierRecouvrement[]>([]);
  const [assureurs, setAssureurs] = useState<Assureur[]>([]);
  const [garage, setGarage] = useState<Garage | null>(null);
  const [piecesAR, setPiecesAR] = useState<{ type: string; path: string }[]>([]);
  const [modal, setModal] = useState<{ type: TypeCourrierRecours; courrier?: CourrierRecouvrement } | null>(null);
  const [email, setEmail] = useState<CourrierRecouvrement | null>(null);
  const [envoi, setEnvoi] = useState<CourrierRecouvrement | null>(null);
  const [arModal, setArModal] = useState<CourrierRecouvrement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [enregistre, setEnregistre] = useState(false);

  /* ----------------------------- Chargement ----------------------------- */
  const charger = useCallback(async () => {
    const [c, a, e, ar] = await Promise.all([
      supabase.from("courriers_recouvrement").select("*").eq("dossier_id", dossier.id).in("type", TYPES).order("created_at", { ascending: false }),
      supabase.from("assureurs").select("*").order("nom"),
      supabase.from("entreprise").select("nom, adresse, code_postal, ville, siret").limit(1).maybeSingle(),
      supabase.from("pieces_dossier").select("type, path").eq("dossier_id", dossier.id).eq("type", "accuse_reception"),
    ]);
    setCourriers((c.data as CourrierRecouvrement[]) || []);
    setAssureurs((a.data as Assureur[]) || []);
    setGarage((e.data as Garage | null) || null);
    setPiecesAR((ar.data as { type: string; path: string }[]) || []);
  }, [dossier.id]);
  useEffect(() => { charger(); }, [charger]);

  /* ------------------- Fiche du tiers : autosauvegarde ------------------ */
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enregistrerChamps = useCallback(async (patch: Partial<Dossier>) => {
    const { error } = await supabase.from("dossiers").update(patch).eq("id", dossier.id);
    if (error) { setErreur(messageErreur(error, "Enregistrement impossible (migration v103 exécutée ?).")); return; }
    setErreur(null);
    setEnregistre(true);
    setTimeout(() => setEnregistre(false), 1800);
  }, [dossier.id]);
  const enAttente = useRef<Partial<Dossier>>({});
  const champ = (patch: Partial<Dossier>) => {
    onPatch(patch);
    enAttente.current = { ...enAttente.current, ...patch };
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => {
      const p = enAttente.current;
      enAttente.current = {};
      enregistrerChamps(p);
    }, 700);
  };
  useEffect(() => () => { if (minuteur.current) clearTimeout(minuteur.current); }, []);

  /** Choix d'un assureur de la base : on reprend ses coordonnées. */
  function choisirAssureur(nom: string) {
    const a = assureurs.find((x) => (x.nom || "").trim().toLowerCase() === nom.trim().toLowerCase());
    const patch: Partial<Dossier> = { recours_tiers_assureur: nom };
    if (a) {
      patch.recours_tiers_assureur_adresse = [a.adresse, [a.code_postal, a.ville].filter(Boolean).join(" ")].filter(Boolean).join("\n") || dossier.recours_tiers_assureur_adresse || null;
      patch.recours_tiers_assureur_email = a.email || dossier.recours_tiers_assureur_email || null;
      patch.recours_tiers_assureur_tel = a.tel || dossier.recours_tiers_assureur_tel || null;
    }
    champ(patch);
  }

  /* ------------------------------- Calcul ------------------------------- */
  const facture = useMemo(() => documents.filter((d) => d.type === "facture").sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))[0] || null, [documents]);
  const baseTtc = facture?.total_ttc != null ? Number(facture.total_ttc) : montantTtc(dossier);
  const calcul = calculerRecours(dossier, baseTtc);

  /* ----------------------------- Procédure ------------------------------ */
  const etape = etapeRecours(dossier.recours_etape);
  const idx = indexEtapeRecours(dossier.recours_etape);
  const jours = joursDepuis(dossier.recours_depuis);
  const recoursEnvoye = courriers.find((c) => c.type === "recours_direct" && c.statut === "envoye");
  const joursDepuisRecours = joursDepuis(recoursEnvoye?.envoye_le);
  const mandat = courriers.find((c) => c.type === "mandat_recours");
  const constat = pieces.find((p) => p.type === "constat");
  const rapport = pieces.find((p) => p.type === "rapport_definitif");
  const joursImmo = dossier.date_expertise ? Math.max(0, Math.floor((Date.now() - new Date(dossier.date_expertise).getTime()) / 86400000)) : null;

  async function passerEtape(cle: EtapeRecours) {
    const patch: Partial<Dossier> = { recours_etape: cle };
    if (cle === "regle") patch.recours_resolu_le = new Date().toISOString();
    onPatch(patch);
    const { error } = await supabase.from("dossiers").update(patch).eq("id", dossier.id);
    if (error) setErreur(messageErreur(error));
  }

  /** Le prochain courrier à produire selon l'étape. */
  const prochainType: TypeCourrierRecours | null =
    idx === 0 ? (mandat ? "recours_direct" : "mandat_recours")
    : idx === 1 ? "relance_recours"
    : idx === 2 ? "mise_en_demeure_recours"
    : null;

  /* ----------------------------- Envois ------------------------------- */
  async function journaliser(c: CourrierRecouvrement, canal: string, numero?: string | null) {
    try {
      await supabase.from("relances").insert({
        dossier_id: dossier.id, document_id: null, date_relance: ymd(), canal: canal === "email" ? "email" : "courrier",
        interlocuteur: c.type === "mandat_recours" ? "client" : "assurance",
        notes: `${LIBELLE_COURRIER_RECOURS[c.type as TypeCourrierRecours]} → ${c.destinataire_nom || ""}${canal === "lrar" ? ` (recommandé AR${numero ? ` n° ${numero}` : ""})` : canal === "email" ? " (email)" : ""}`,
      });
    } catch { /* journal facultatif */ }
  }

  async function marquerEnvoye(c: CourrierRecouvrement, canal: string, numero?: string | null, date?: string | null) {
    const patch: Record<string, unknown> = { statut: "envoye", envoye_le: date ? new Date(date).toISOString() : new Date().toISOString(), canal_envoi: canal };
    if (numero) patch.numero_suivi = numero;
    let { error } = await supabase.from("courriers_recouvrement").update(patch).eq("id", c.id);
    if (error && numero && /numero_suivi|column/i.test(error.message || "")) { delete patch.numero_suivi; ({ error } = await supabase.from("courriers_recouvrement").update(patch).eq("id", c.id)); }
    if (error) { setErreur(messageErreur(error)); throw new Error(messageErreur(error)); }
    await journaliser(c, canal, numero);
    await cloturerTaches(origineAPoster(c.id));
    // L'étape du dossier avance avec le courrier envoyé.
    const cible = ETAPE_PAR_COURRIER[c.type as TypeCourrierRecours];
    if (indexEtapeRecours(cible) > idx) await passerEtape(cible);
    const jours = c.delai_jours || 15;
    if (c.type !== "mandat_recours") {
      try {
        const suite = c.type === "recours_direct" ? "Sinon relance" : c.type === "relance_recours" ? "Sinon mise en demeure en recommandé" : "Sinon Médiateur de l'assurance / injonction de payer";
        await ajouterRappel({
          texte: `Recours direct ${dossier.client_nom || dossier.numero_sinistre || ""} : réponse de ${c.destinataire_nom || "l'assureur adverse"} ? ${suite}`,
          dossierId: dossier.id, echeance: echeanceRappel(jours), ordre: -1, auteur: lireRole(), pour: null, origine: ORIGINE_RECOURS,
        });
        setInfo(`Envoi enregistré — rappel programmé à J+${jours}.`);
        setTimeout(() => setInfo(null), 5000);
      } catch { /* rappel facultatif */ }
    }
    charger();
  }

  /** Pièces jointes d'un e-mail de recours : courrier + mandat + constat + rapport + facture. */
  const piecesEmail = (c: CourrierRecouvrement) => {
    const liste = [{ label: LIBELLE_COURRIER_RECOURS[c.type as TypeCourrierRecours], filename: nomFichierCourrier(c, dossier.numero_sinistre), getBase64: () => courrierRecouvrementPdfBase64(c, dossier), coche: true }];
    if (c.type === "mandat_recours") return liste;
    if (mandat && mandat.id !== c.id) liste.push({ label: "Mandat de recouvrement signé", filename: nomFichierCourrier(mandat, dossier.numero_sinistre), getBase64: () => courrierRecouvrementPdfBase64(mandat, dossier), coche: true });
    if (constat) liste.push({ label: labelPiece("constat"), filename: constat.nom || "constat.pdf", getBase64: () => fichierBase64("pieces", constat.path), coche: true });
    if (rapport) liste.push({ label: labelPiece("rapport_definitif"), filename: rapport.nom || "rapport-expertise.pdf", getBase64: () => fichierBase64("pieces", rapport.path), coche: true });
    if (facture) liste.push({ label: `Facture ${facture.numero || ""}`, filename: nomFichierDocument(facture), getBase64: () => documentPdfBase64Auto(facture, dossier), coche: true });
    return liste;
  };

  const piecesDisponibles = [mandat ? "mandat de recouvrement" : "", constat ? "constat amiable" : "", rapport ? "rapport d'expertise" : "", facture ? `facture${facture.numero ? ` n° ${facture.numero}` : ""}` : ""].filter(Boolean);

  const sel = (patch: Partial<Dossier>) => champ(patch);

  return (
    <section className="glass-card p-3 sm:p-4" style={{ borderColor: "rgba(20, 184, 166, 0.45)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="titre-bloc text-white">⚖️ Recours direct contre l&apos;assureur du responsable</h2>
          <p className="mt-1 text-xs text-white/60">
            Client non responsable : le garage, mandaté, réclame les réparations directement à l&apos;assureur adverse (art. L. 124-3 du Code des assurances). Pas de franchise, pas de malus, taux du garage maintenus.
            {jours !== null && <> Ouvert depuis <strong className="text-white">{jours} j</strong> ({formatDate(dossier.recours_depuis)}).</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {enregistre && <span className="badge badge-ok">Enregistré ✓</span>}
          <button onClick={onLever} className="btn-ghost btn-compact" title="Sortir du recours direct (les informations et courriers sont conservés)">Lever le recours</button>
        </div>
      </div>

      {/* ---------- Procédure guidée ---------- */}
      <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Étapes du recours">
        {ETAPES_RECOURS.map((e, i) => {
          const fait = i < idx || (dossier.recours_etape === "regle" && i <= idx);
          const courant = i === idx;
          return (
            <li key={e.cle}>
              <button type="button" onClick={() => passerEtape(e.cle)} className={`segment-btn ${courant ? "actif" : ""}`} style={fait && !courant ? { opacity: 0.6 } : undefined} title={e.conseil}>
                {fait && !courant ? "✓ " : `${i + 1}. `}{e.court}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-white">{etape.label}</span>
          {recoursEnvoye && joursDepuisRecours !== null && etape.cle !== "regle" && (
            <span className={`badge ${joursDepuisRecours >= 30 ? "badge-danger" : joursDepuisRecours >= 15 ? "badge-warn" : "badge-info"}`}>Recours envoyé il y a {joursDepuisRecours} j</span>
          )}
        </div>
        <p className="mt-1 text-xs text-white/65">{etape.conseil}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {prochainType && (
            <button onClick={() => setModal({ type: prochainType })} className="btn-primary btn-compact">
              {prochainType === "mandat_recours" ? "✍️ Faire signer le mandat au client" : prochainType === "recours_direct" ? "📄 Préparer la lettre de recours" : prochainType === "relance_recours" ? "🔁 Préparer la relance" : "⚖ Préparer la mise en demeure (recommandé)"}
            </button>
          )}
          {etape.cle === "mise_en_demeure" && (
            <a href="https://www.mediation-assurance.org/" target="_blank" rel="noreferrer" className="btn-ghost btn-compact" onClick={() => passerEtape("mediateur")}>🌐 Saisir le Médiateur de l&apos;assurance</a>
          )}
          {etape.cle !== "regle" && <button onClick={() => passerEtape("regle")} className="btn-ghost btn-compact">✓ Réglé par l&apos;assureur</button>}
        </div>
        {!constat && <p className="mt-2 text-xs text-amber-200/90">Constat amiable absent des pièces du dossier : c&apos;est LA preuve de la responsabilité du tiers. Ajoutez-le dans « Pièces du dossier ».</p>}
      </div>

      {/* ---------- Tiers responsable ---------- */}
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">Tiers responsable</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div><label className="field-label !mb-0.5 text-[11px]">Conducteur / propriétaire</label><input className="field-input field-compact" value={dossier.recours_tiers_nom ?? ""} onChange={(e) => sel({ recours_tiers_nom: e.target.value })} /></div>
            <div><label className="field-label !mb-0.5 text-[11px]">Immatriculation du tiers</label><input className="field-input field-compact uppercase" value={dossier.recours_tiers_immat ?? ""} onChange={(e) => sel({ recours_tiers_immat: e.target.value.toUpperCase() })} /></div>
            <div><label className="field-label !mb-0.5 text-[11px]">Date du constat</label><input type="date" className="field-input field-compact" value={dossier.recours_date_constat ?? ""} onChange={(e) => sel({ recours_date_constat: e.target.value || null })} /></div>
            <div><label className="field-label !mb-0.5 text-[11px]">N° de police du tiers</label><input className="field-input field-compact" value={dossier.recours_tiers_police ?? ""} onChange={(e) => sel({ recours_tiers_police: e.target.value })} /></div>
          </div>
          <div className="mt-3 mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">Assureur du responsable</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="field-label !mb-0.5 text-[11px]">Compagnie (base assureurs)</label>
              <input list="recours-assureurs" className="field-input field-compact" value={dossier.recours_tiers_assureur ?? ""} onChange={(e) => choisirAssureur(e.target.value)} placeholder="Tapez pour chercher dans la base…" />
              <datalist id="recours-assureurs">{assureurs.map((a) => <option key={a.id} value={a.nom || ""} />)}</datalist>
            </div>
            <div><label className="field-label !mb-0.5 text-[11px]">E-mail sinistres</label><input type="email" className="field-input field-compact" value={dossier.recours_tiers_assureur_email ?? ""} onChange={(e) => sel({ recours_tiers_assureur_email: e.target.value })} /></div>
            <div><label className="field-label !mb-0.5 text-[11px]">Téléphone</label><input type="tel" className="field-input field-compact" value={dossier.recours_tiers_assureur_tel ?? ""} onChange={(e) => sel({ recours_tiers_assureur_tel: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className="field-label !mb-0.5 text-[11px]">Adresse postale (recommandé)</label><textarea rows={2} className="field-input field-compact" value={dossier.recours_tiers_assureur_adresse ?? ""} onChange={(e) => sel({ recours_tiers_assureur_adresse: e.target.value })} /></div>
            <div><label className="field-label !mb-0.5 text-[11px]">N° de sinistre chez l&apos;assureur adverse</label><input className="field-input field-compact" value={dossier.recours_sinistre_adverse ?? ""} onChange={(e) => sel({ recours_sinistre_adverse: e.target.value })} placeholder="communiqué après le recours" /></div>
          </div>
        </div>

        {/* ---------- Calcul ---------- */}
        <div className="rounded-xl border border-white/10 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">Ce que doit l&apos;assureur adverse</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="field-label !mb-0.5 text-[11px]">Responsabilité du client</label>
              <select className="field-input field-compact" value={String(dossier.recours_part_responsabilite ?? 0)} onChange={(e) => sel({ recours_part_responsabilite: Number(e.target.value) })}>
                <option value="0">0 % — non responsable</option>
                <option value="25">25 % — torts partagés</option>
                <option value="50">50 % — torts partagés</option>
                <option value="75">75 % — torts partagés</option>
              </select>
            </div>
            <div>
              <label className="field-label !mb-0.5 text-[11px]">Vétusté retenue (TTC)</label>
              <input type="number" min={0} step="0.01" className="field-input field-compact" value={dossier.recours_vetuste ?? ""} onChange={(e) => sel({ recours_vetuste: e.target.value === "" ? null : Number(e.target.value) })} placeholder="0" />
            </div>
          </div>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2"><dt className="text-white/60">Réparations {facture ? `(facture ${facture.numero || ""})` : "(chiffrage)"}</dt><dd className="tabular-nums text-white">{formatEuros(calcul.base)} TTC</dd></div>
            {calcul.vetuste > 0 && <div className="flex justify-between gap-2"><dt className="text-white/60">− Vétusté</dt><dd className="tabular-nums text-white/80">− {formatEuros(calcul.vetuste)}</dd></div>}
            {calcul.tortsPartages && <div className="flex justify-between gap-2"><dt className="text-white/60">× Part du responsable</dt><dd className="tabular-nums text-white/80">{calcul.partAssureur} %</dd></div>}
            <div className="flex justify-between gap-2 border-t border-white/10 pt-1.5"><dt className="font-semibold text-white">Dû par l&apos;assureur adverse</dt><dd className="tabular-nums text-base font-bold text-accent-teal">{formatEuros(calcul.duAssureur)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-white/60">Reste à la charge du client</dt><dd className={`tabular-nums font-semibold ${calcul.resteClient > 0 ? "text-amber-300" : "text-white/60"}`}>{formatEuros(calcul.resteClient)}</dd></div>
          </dl>
          <p className="mt-2 text-[11px] text-white/45">Pas de franchise en recours direct : la franchise ne joue que sur le contrat du client. Si l&apos;assureur adverse applique une vétusté, le client la doit au garage.</p>
          <div className="mt-2"><label className="field-label !mb-0.5 text-[11px]">Notes</label><textarea rows={2} className="field-input field-compact" value={dossier.recours_notes ?? ""} onChange={(e) => sel({ recours_notes: e.target.value })} placeholder="Gestionnaire, références, ce qui a été dit au téléphone…" /></div>
        </div>
      </div>

      {/* ---------- Courriers ---------- */}
      <div className="mt-4 border-t border-white/10 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Courriers du recours</div>
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <button key={t} onClick={() => setModal({ type: t })} className="btn-ghost btn-compact" title={LIBELLE_COURRIER_RECOURS[t]}>
                {t === "mandat_recours" ? "✍️ Mandat" : t === "recours_direct" ? "📄 Recours" : t === "relance_recours" ? "🔁 Relance" : "⚖ Mise en demeure"}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-xs text-white/55">Pièces jointes aux e-mails : {piecesDisponibles.length ? piecesDisponibles.join(", ") : "aucune pour l'instant"}.</p>
        {info && <p className="mt-1 text-xs font-medium text-emerald-300">{info}</p>}
        {erreur && <p className="mt-1 text-xs text-rose-300">{erreur}</p>}
        {courriers.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {courriers.map((c) => (
              <li key={c.id} className="carte-liste flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <span className="font-semibold text-white">{LIBELLE_COURRIER_RECOURS[c.type as TypeCourrierRecours]}</span>
                  <span className="text-white/60"> → {c.destinataire_nom || c.destinataire} · {formatDate(c.date_courrier)}</span>{" "}
                  <span className={c.statut === "envoye" ? "badge badge-ok" : c.statut === "signe" ? "badge badge-info" : "badge badge-neutral"}>
                    {c.statut === "envoye" ? `Envoyé${c.canal_envoi === "lrar" ? ` · recommandé${c.numero_suivi ? ` n° ${c.numero_suivi}` : ""}` : c.canal_envoi === "email" ? " par email" : ""}` : c.statut === "signe" ? "Signé" : "Brouillon"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => apercuCourrierRecouvrementPdf(c, dossier, dossier.numero_sinistre)} className="btn-ghost btn-compact">Aperçu</button>
                  <button onClick={() => generateCourrierRecouvrementPdf(c, dossier, dossier.numero_sinistre)} className="btn-ghost btn-compact">⬇ PDF</button>
                  {c.statut !== "envoye" && <button onClick={() => setModal({ type: c.type as TypeCourrierRecours, courrier: c })} className="btn-ghost btn-compact">Modifier</button>}
                  {c.statut !== "envoye" && c.type !== "mandat_recours" && <button onClick={() => setEmail(c)} className="btn-ghost btn-compact">✉ Email</button>}
                  {c.statut !== "envoye" && c.type !== "mandat_recours" && <button onClick={() => setEnvoi(c)} className="btn-primary btn-compact">📮 Imprimer et poster</button>}
                  {c.statut === "envoye" && c.canal_envoi === "lrar" && !arJoint(piecesAR, c.id) && <button onClick={() => setArModal(c)} className="btn-primary btn-compact">📬 Joindre l&apos;AR</button>}
                  {c.statut === "envoye" && c.canal_envoi === "lrar" && arJoint(piecesAR, c.id) && <span className="badge badge-ok">AR joint</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {modal && (
        <CourrierRecoursModal
          type={modal.type}
          existant={modal.courrier}
          dossier={dossier}
          garage={garage}
          calcul={calcul}
          numeroFacture={facture?.numero || null}
          dateRecours={recoursEnvoye?.envoye_le || recoursEnvoye?.date_courrier || null}
          joursImmobilisation={joursImmo}
          piecesJointes={piecesDisponibles}
          onClose={() => setModal(null)}
          onSaved={async (c, action) => {
            setCourriers((prev) => (prev.some((x) => x.id === c.id) ? prev.map((x) => (x.id === c.id ? c : x)) : [c, ...prev]));
            setModal(null);
            if (c.type === "mandat_recours" && c.statut === "signe" && idx === 0) {
              // Mandat signé : l'étape « mandat » est acquise, on passe au recours.
              await passerEtape("mandat");
              setInfo("Mandat signé et enregistré — préparez maintenant la lettre de recours.");
              setTimeout(() => setInfo(null), 5000);
            }
            if (action === "email") setEmail(c);
            if (action === "poster") setEnvoi(c);
          }}
        />
      )}
      {envoi && (
        <CourrierPapierModal courrier={envoi} dossier={dossier} numeroFacture={dossier.numero_sinistre} onClose={() => { setEnvoi(null); charger(); }} onConfirmer={(canal: CanalPapier, numero, date) => marquerEnvoye(envoi, canal, numero, date)} />
      )}
      {arModal && (
        <CourrierPapierModal courrier={arModal} dossier={dossier} numeroFacture={dossier.numero_sinistre} mode="ar" onClose={() => { setArModal(null); charger(); }} />
      )}
      {email && (
        <EmailComposer
          dossier={dossier}
          document={null}
          defaultTo={cibleAssureurAdverse(dossier).email || ""}
          defaultCci={dossier.client_email || ""}
          defaultSubject={email.objet || LIBELLE_COURRIER_RECOURS[email.type as TypeCourrierRecours]}
          defaultBody={`Bonjour,\n\nVeuillez trouver ci-joint ${email.type === "recours_direct" ? "notre recours direct, au nom de notre client, avec le mandat, le constat amiable, le rapport d'expertise et la facture" : email.type === "relance_recours" ? "notre relance concernant le recours direct transmis précédemment" : "une mise en demeure de régler les réparations"} — véhicule ${dossier.immatriculation || ""}, accident du ${formatDate(dossier.recours_date_constat || dossier.date_sinistre)}${dossier.recours_sinistre_adverse ? `, votre sinistre n° ${dossier.recours_sinistre_adverse}` : ""}.\n\nMerci de nous communiquer votre numéro de sinistre et le nom du gestionnaire.\n\nCordialement.`}
          piecesJointes={piecesEmail(email)}
          onClose={() => setEmail(null)}
          onSent={async () => { const c = email; setEmail(null); try { await marquerEnvoye(c, "email"); } catch { /* erreur déjà affichée */ } }}
        />
      )}
    </section>
  );
}

/* ====================================================================== */

function CourrierRecoursModal({ type, existant, dossier, garage, calcul, numeroFacture, dateRecours, joursImmobilisation, piecesJointes, onClose, onSaved }: {
  type: TypeCourrierRecours;
  existant?: CourrierRecouvrement;
  dossier: Dossier;
  garage: Garage | null;
  calcul: ReturnType<typeof calculerRecours>;
  numeroFacture: string | null;
  dateRecours: string | null;
  joursImmobilisation: number | null;
  piecesJointes: string[];
  onClose: () => void;
  onSaved: (c: CourrierRecouvrement, action: "enregistrer" | "email" | "poster") => void;
}) {
  const estMandat = type === "mandat_recours";
  const cible = cibleAssureurAdverse(dossier);
  const [nom, setNom] = useState(existant?.destinataire_nom || cible.nom);
  const [adresse, setAdresse] = useState(existant?.destinataire_adresse || cible.adresse);
  const [date, setDate] = useState(existant?.date_courrier || ymd());
  const garageTexte = garage ? { nom: garage.nom, adresse: [garage.adresse, [garage.code_postal, garage.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null, siret: garage.siret } : null;
  const modele = useMemo(
    () => modeleCourrierRecours({ type, dossier, garage: garageTexte, calcul, numeroFacture, dateRecours, joursImmobilisation, piecesJointes }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, dossier, garage, calcul.duAssureur, numeroFacture, dateRecours, joursImmobilisation, piecesJointes.join("|")]
  );
  const [objet, setObjet] = useState(existant?.objet || modele.objet);
  const [corps, setCorps] = useState(existant?.corps || modele.corps);
  // Le MANDAT est signé par le CLIENT ; les autres courriers par le garage.
  const [signataire, setSignataire] = useState(existant?.signataire_nom || (estMandat ? dossier.client_nom || "" : garage?.nom || ""));
  const [signature, setSignature] = useState<string | null>(existant?.signature || null);
  const [signer, setSigner] = useState(estMandat || Boolean(existant?.signature));
  const [busy, setBusy] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function brouillon(): CourrierRecouvrement {
    const signe = signer && signature;
    return {
      id: existant?.id || "", created_at: existant?.created_at || new Date().toISOString(), dossier_id: dossier.id, document_id: null, type,
      destinataire: estMandat ? "client" : "assurance", destinataire_nom: nom.trim() || null, destinataire_adresse: adresse.trim() || null,
      objet: objet.trim() || null, corps: corps.trim() || null, montant: calcul.duAssureur, delai_jours: modele.delaiJours, date_courrier: date || ymd(),
      signataire_nom: signataire.trim() || null, signature: signe ? signature : null, signe_le: signe ? existant?.signe_le || new Date().toISOString() : null,
      envoye_le: existant?.envoye_le || null, canal_envoi: existant?.canal_envoi || null, statut: existant?.statut === "envoye" ? "envoye" : signe ? "signe" : "brouillon", notes: null,
    };
  }

  async function enregistrer(action: "enregistrer" | "email" | "poster") {
    setBusy(action); setErreur(null);
    if (signer && !signature) { setErreur(estMandat ? "Le client doit signer dans le cadre (ou décochez pour imprimer le mandat et le faire signer sur papier)." : "Signez dans le cadre, ou décochez la signature au doigt."); setBusy(null); return; }
    const { id, created_at, numero_suivi, ...donnees } = brouillon();
    void created_at; void numero_suivi;
    const res = id
      ? await supabase.from("courriers_recouvrement").update(donnees).eq("id", id).select("*").single()
      : await supabase.from("courriers_recouvrement").insert(donnees).select("*").single();
    if (res.error || !res.data) { setErreur(messageErreur(res.error, "Enregistrement impossible (migration v70 exécutée ?).")); setBusy(null); return; }
    setBusy(null);
    onSaved(res.data as CourrierRecouvrement, action);
  }

  return (
    <ModalShell title={LIBELLE_COURRIER_RECOURS[type]} onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-3">
        {estMandat ? (
          <p className="rounded-lg border border-teal-400/30 bg-teal-500/10 px-3 py-2 text-xs text-teal-100">
            Le mandat autorise le garage à réclamer et encaisser au nom du client. Faites-le signer sur l&apos;écran (tablette / téléphone) ou imprimez-le pour une signature manuscrite. Il sera joint à chaque envoi à l&apos;assureur adverse.
          </p>
        ) : !cible.email && !cible.adresse ? (
          <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">Renseignez d&apos;abord l&apos;assureur du responsable (e-mail et adresse postale) dans le bloc Recours direct.</p>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-3">
          <div><label className="field-label text-[11px]">{estMandat ? "Assureur visé par le mandat" : "Destinataire"}</label><input className="field-input field-compact w-full" value={nom} onChange={(e) => setNom(e.target.value)} /></div>
          <div><label className="field-label text-[11px]">Adresse postale</label><textarea className="field-input field-compact w-full" rows={2} value={adresse} onChange={(e) => setAdresse(e.target.value)} /></div>
          <div><label className="field-label text-[11px]">Date</label><input type="date" className="field-input field-compact w-full" value={date} onChange={(e) => setDate(e.target.value)} />
            <div className="mt-1 text-xs text-white/60">Réclamé : {formatEuros(calcul.duAssureur)} TTC</div></div>
        </div>
        <div><label className="field-label text-[11px]">Objet</label><input className="field-input field-compact w-full" value={objet} onChange={(e) => setObjet(e.target.value)} /></div>
        <div>
          <div className="flex items-center justify-between">
            <label className="field-label text-[11px]">Texte (modifiable)</label>
            <button type="button" onClick={() => { setObjet(modele.objet); setCorps(modele.corps); }} className="text-[11px] font-semibold text-accent-pink hover:underline">↺ Reprendre le texte proposé</button>
          </div>
          <textarea className="field-input w-full font-mono text-[13px]" rows={12} value={corps} onChange={(e) => setCorps(e.target.value)} />
          {type === "mise_en_demeure_recours" && <p className="mt-1 text-xs text-amber-200/90">À envoyer en recommandé AR : c&apos;est ce qui fait courir les intérêts et ouvre la voie du Médiateur.</p>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="field-label text-[11px]">{estMandat ? "Signataire (le client)" : "Signataire"}</label>
            <input className="field-input field-compact w-full" value={signataire} onChange={(e) => setSignataire(e.target.value)} />
            <label className="mt-2 flex items-center gap-2 text-sm text-white/80"><input type="checkbox" checked={signer} onChange={(e) => setSigner(e.target.checked)} className="h-4 w-4 accent-pink-500" />{estMandat ? "Signature du client à l'écran" : "Signer au doigt (sinon : tampon et signature du profil)"}</label>
          </div>
          {signer && <div><label className="field-label text-[11px]">Signature{estMandat ? " du client — « Bon pour mandat »" : ""}</label><SignaturePad onChange={setSignature} /></div>}
        </div>
        {erreur && <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{erreur}</div>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-3">
          <button type="button" onClick={() => apercuCourrierRecouvrementPdf(brouillon(), dossier, dossier.numero_sinistre)} className="btn-ghost btn-compact">👁 Aperçu PDF</button>
          <button type="button" onClick={() => generateCourrierRecouvrementPdf(brouillon(), dossier, dossier.numero_sinistre)} className="btn-ghost btn-compact">⬇ Télécharger</button>
          <button type="button" onClick={() => enregistrer("enregistrer")} disabled={busy !== null} className={estMandat ? "btn-primary btn-compact" : "btn-ghost btn-compact"}>{estMandat ? "Enregistrer le mandat signé" : "Enregistrer"}</button>
          {!estMandat && <button type="button" onClick={() => enregistrer("email")} disabled={busy !== null} className="btn-ghost btn-compact">✉ Envoyer par email (pièces jointes)</button>}
          {!estMandat && <button type="button" onClick={() => enregistrer("poster")} disabled={busy !== null} className="btn-primary btn-compact">{type === "mise_en_demeure_recours" || type === "recours_direct" ? "Signer → imprimer et poster en recommandé" : "Signer → imprimer et poster"}</button>}
        </div>
      </div>
    </ModalShell>
  );
}
