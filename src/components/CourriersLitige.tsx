"use client";

// ============================================================
//  COURRIERS DE DÉBLOCAGE (mode litige, v13.18)
//  Deux courriers à un clic quand l'assureur fait traîner :
//   · à l'expert — accord de réparation + conservation des preuves,
//     photos d'état jointes à l'email ;
//   · à l'assureur — mise en demeure de prendre position (L. 211-9),
//     avec le compteur des 3 mois.
//  Courriers conservés dans `courriers_recouvrement` (document_id null),
//  PDF au logo du garage, journal + rappel automatiques.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CourrierRecouvrement, Dossier, PhotoEtat } from "@/lib/types";
import { formatDate, formatEuros, messageErreur, ymd } from "@/lib/format";
import { chargerPhotos } from "@/lib/photosEtat";
import { fichierBase64 } from "@/lib/storage";
import { ajouterRappel } from "@/lib/ardoise";
import { lireRole } from "@/lib/conversation";
import { echeanceRappel, cibleAssurance, cibleExpert, completerDossierDepuisAnnuaire } from "@/lib/recouvrement";
import { LIBELLE_COURRIER_LITIGE, TypeCourrierLitige, compteurOffre, modeleCourrierLitige } from "@/lib/courriersLitige";
import { apercuCourrierRecouvrementPdf, courrierRecouvrementPdfBase64, generateCourrierRecouvrementPdf, nomFichierCourrier } from "@/lib/pdf";
import ModalShell from "./ModalShell";
import SignaturePad from "./SignaturePad";
import EmailComposer from "./EmailComposer";

const TYPES: TypeCourrierLitige[] = ["accord_reparation_expert", "position_assureur"];

export default function CourriersLitige({ dossier: dossierBrut }: { dossier: Dossier }) {
  const [courriers, setCourriers] = useState<CourrierRecouvrement[]>([]);
  const [photos, setPhotos] = useState<PhotoEtat[]>([]);
  const [garage, setGarage] = useState<{ nom: string | null; gard_tarif_jour: number | null } | null>(null);
  const [annuaire, setAnnuaire] = useState<Parameters<typeof completerDossierDepuisAnnuaire>[1]>({});
  const [modal, setModal] = useState<{ type: TypeCourrierLitige; courrier?: CourrierRecouvrement } | null>(null);
  const [email, setEmail] = useState<CourrierRecouvrement | null>(null);
  const [envoi, setEnvoi] = useState<{ courrier: CourrierRecouvrement; canal: string; numero: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const dossier = useMemo(() => completerDossierDepuisAnnuaire(dossierBrut, annuaire), [dossierBrut, annuaire]);

  const charger = useCallback(async () => {
    const d = dossierBrut;
    const parNom = (table: string, col: string, nom: string | null | undefined) =>
      nom && nom.trim() ? supabase.from(table).select("*").ilike(col, nom.trim()).limit(1).maybeSingle() : Promise.resolve({ data: null });
    const [c, p, e, ass, exp] = await Promise.all([
      supabase.from("courriers_recouvrement").select("*").eq("dossier_id", d.id).in("type", TYPES).order("created_at", { ascending: false }),
      chargerPhotos(d.id),
      supabase.from("entreprise").select("nom, gard_tarif_jour").limit(1).maybeSingle(),
      parNom("assureurs", "nom", d.assureur),
      parNom("experts", "cabinet", d.cabinet_expert),
    ]);
    setCourriers((c.data as CourrierRecouvrement[]) || []);
    setPhotos(p.photos.filter((x) => x.moment === "entree"));
    setGarage((e.data as { nom: string | null; gard_tarif_jour: number | null } | null) || null);
    setAnnuaire({ assureur: (ass.data as never) || null, expert: (exp.data as never) || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossierBrut.id, dossierBrut.assureur, dossierBrut.cabinet_expert]);
  useEffect(() => { charger(); }, [charger]);

  const cpt = compteurOffre(dossier);
  const joursImmo = dossier.date_expertise ? Math.max(0, Math.floor((Date.now() - new Date(dossier.date_expertise).getTime()) / 86400000)) : null;

  async function journaliser(c: CourrierRecouvrement, canal: string, numero?: string | null) {
    try {
      await supabase.from("relances").insert({
        dossier_id: dossier.id, document_id: null, date_relance: ymd(), canal: canal === "email" ? "email" : "courrier",
        interlocuteur: c.destinataire === "assurance" ? "assurance" : "expert",
        notes: `${LIBELLE_COURRIER_LITIGE[c.type as TypeCourrierLitige]} envoyé${canal === "lrar" ? ` en recommandé AR${numero ? ` n° ${numero}` : ""}` : canal === "email" ? " par email" : ""}`,
      });
    } catch { /* journal facultatif */ }
  }

  async function marquerEnvoye(c: CourrierRecouvrement, canal: string, numero?: string | null) {
    const patch: Record<string, unknown> = { statut: "envoye", envoye_le: new Date().toISOString(), canal_envoi: canal };
    if (numero) patch.numero_suivi = numero;
    let { error } = await supabase.from("courriers_recouvrement").update(patch).eq("id", c.id);
    if (error && numero && /numero_suivi|column/i.test(error.message || "")) { delete patch.numero_suivi; ({ error } = await supabase.from("courriers_recouvrement").update(patch).eq("id", c.id)); }
    if (error) { setErreur(messageErreur(error)); return; }
    await journaliser(c, canal, numero);
    const jours = c.delai_jours || 8;
    try {
      await ajouterRappel({
        texte: c.type === "position_assureur" ? `Réponse de l'assureur à la mise en demeure (${dossier.client_nom || dossier.numero_sinistre}) ? Sinon Médiateur de l'assurance` : `Accord de réparation de l'expert reçu (${dossier.client_nom || dossier.numero_sinistre}) ? Sinon relancer / informer l'assureur`,
        dossierId: dossier.id, echeance: echeanceRappel(jours), ordre: -1, auteur: lireRole(), pour: null, origine: "litige",
      });
      setInfo(`Envoi enregistré — rappel programmé à J+${jours}.`);
      setTimeout(() => setInfo(null), 5000);
    } catch { /* rappel facultatif */ }
    setEnvoi(null);
    charger();
  }

  const piecesEmail = (c: CourrierRecouvrement) => [
    { label: LIBELLE_COURRIER_LITIGE[c.type as TypeCourrierLitige], filename: nomFichierCourrier(c, dossier.numero_sinistre), getBase64: () => courrierRecouvrementPdfBase64(c, dossier), coche: true },
    ...(c.type === "accord_reparation_expert"
      ? photos.slice(0, 12).map((p, i) => ({ label: `Photo d'état ${i + 1} (${p.angle})`, filename: `photo-etat-${i + 1}-${p.angle}.jpg`, getBase64: () => fichierBase64("pieces", p.path), coche: true }))
      : []),
  ];

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Courriers de déblocage</div>
        {cpt.echeance && (
          <span className={`badge ${cpt.depasse ? "badge-danger" : (cpt.joursRestants ?? 99) <= 15 ? "badge-warn" : "badge-info"}`} title="Art. L. 211-9 C. assur. : offre d'indemnisation dans les 3 mois de la demande (point de départ : date d'expertise)">
            Offre attendue avant le {formatDate(cpt.echeance)} · {cpt.depasse ? `dépassé de ${-(cpt.joursRestants ?? 0)} j` : `${cpt.joursRestants} j`}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-white/75">
        Reconstitution demandée, expert qui sursoit, aucune position sur le paiement : on fige les preuves avec l&apos;expert pour pouvoir réparer, et on met l&apos;assureur devant ses délais.
        {joursImmo !== null && <> Véhicule immobilisé depuis <strong className="text-white">{joursImmo} j</strong> (expertise du {formatDate(dossier.date_expertise)}).</>}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button onClick={() => setModal({ type: "accord_reparation_expert" })} className="btn-primary btn-compact" title={photos.length ? `${photos.length} photo(s) d'état jointes à l'email` : "Aucune photo d'état d'entrée : prenez-les avant d'envoyer"}>
          📄 Demande d&apos;accord de réparation → expert{photos.length ? ` (+${Math.min(12, photos.length)} photos)` : ""}
        </button>
        <button onClick={() => setModal({ type: "position_assureur" })} className="btn-primary btn-compact">⚖ Mise en demeure de prise de position → assureur</button>
      </div>
      {!photos.length && <p className="mt-1 text-xs text-amber-200/90">Pas de photos d&apos;état d&apos;entrée sur ce dossier : elles sont la preuve à figer. Fiche dossier → Photos d&apos;état.</p>}
      {info && <p className="mt-1 text-xs font-medium text-emerald-300">{info}</p>}
      {erreur && <p className="mt-1 text-xs text-rose-300">{erreur}</p>}

      {courriers.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {courriers.map((c) => (
            <li key={c.id} className="carte-liste flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <span className="font-semibold text-white">{LIBELLE_COURRIER_LITIGE[c.type as TypeCourrierLitige]}</span>
                <span className="text-white/60"> → {c.destinataire_nom || c.destinataire} · {formatDate(c.date_courrier)}</span>{" "}
                <span className={c.statut === "envoye" ? "badge badge-ok" : "badge badge-neutral"}>{c.statut === "envoye" ? `Envoyé${c.canal_envoi === "lrar" ? ` · recommandé${c.numero_suivi ? ` n° ${c.numero_suivi}` : ""}` : c.canal_envoi === "email" ? " par email" : ""}` : "Brouillon"}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                <button onClick={() => apercuCourrierRecouvrementPdf(c, dossier, dossier.numero_sinistre)} className="btn-ghost btn-compact">Aperçu</button>
                <button onClick={() => generateCourrierRecouvrementPdf(c, dossier, dossier.numero_sinistre)} className="btn-ghost btn-compact">⬇ PDF</button>
                {c.statut !== "envoye" && <button onClick={() => setModal({ type: c.type as TypeCourrierLitige, courrier: c })} className="btn-ghost btn-compact">Modifier</button>}
                {c.statut !== "envoye" && <button onClick={() => setEmail(c)} className="btn-ghost btn-compact">✉ Email</button>}
                {c.statut !== "envoye" && <button onClick={() => setEnvoi({ courrier: c, canal: c.type === "position_assureur" ? "lrar" : "courrier", numero: "" })} className="btn-primary btn-compact">📮 Posté</button>}
              </div>
              {envoi?.courrier.id === c.id && (
                <div className="flex w-full flex-wrap items-end gap-2 rounded-lg bg-white/5 p-2">
                  <div className="segment">
                    {(["lrar", "courrier", "remis_en_main"] as const).map((k) => <button key={k} type="button" className={`segment-btn ${envoi.canal === k ? "actif" : ""}`} onClick={() => setEnvoi({ ...envoi, canal: k })}>{k === "lrar" ? "Recommandé AR" : k === "courrier" ? "Courrier simple" : "Remis en main propre"}</button>)}
                  </div>
                  {envoi.canal === "lrar" && <input className="field-input field-compact w-48 font-mono" placeholder="N° du recommandé" value={envoi.numero} onChange={(e) => setEnvoi({ ...envoi, numero: e.target.value })} />}
                  <button className="btn-primary btn-compact" onClick={() => marquerEnvoye(c, envoi.canal, envoi.numero.trim() || null)}>✓ Confirmer l&apos;envoi</button>
                  <button className="btn-ghost btn-compact" onClick={() => setEnvoi(null)}>Annuler</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {modal && (
        <CourrierLitigeModal
          type={modal.type}
          existant={modal.courrier}
          dossier={dossier}
          garage={garage}
          nbPhotos={photos.length}
          joursImmobilisation={joursImmo}
          onClose={() => setModal(null)}
          onSaved={(c, action) => {
            setCourriers((prev) => (prev.some((x) => x.id === c.id) ? prev.map((x) => (x.id === c.id ? c : x)) : [c, ...prev]));
            setModal(null);
            if (action === "email") setEmail(c);
            if (action === "poster") setEnvoi({ courrier: c, canal: c.type === "position_assureur" ? "lrar" : "courrier", numero: "" });
          }}
        />
      )}

      {email && (
        <EmailComposer
          dossier={dossier}
          document={null}
          defaultTo={(email.destinataire === "assurance" ? cibleAssurance(dossier).email : cibleExpert(dossier).email) || ""}
          defaultSubject={email.objet || LIBELLE_COURRIER_LITIGE[email.type as TypeCourrierLitige]}
          defaultBody={`Bonjour,\n\nVeuillez trouver ci-joint ${email.type === "position_assureur" ? "une mise en demeure de prendre position" : "notre demande d'accord de réparation et de conservation des preuves, accompagnée des photographies d'état du véhicule"} concernant le dossier ${dossier.numero_sinistre || ""} (véhicule ${dossier.immatriculation || ""}).\n\nCordialement.`}
          piecesJointes={piecesEmail(email)}
          onClose={() => setEmail(null)}
          onSent={async () => { const c = email; setEmail(null); await marquerEnvoye(c, "email"); }}
        />
      )}
    </div>
  );
}

function CourrierLitigeModal({ type, existant, dossier, garage, nbPhotos, joursImmobilisation, onClose, onSaved }: {
  type: TypeCourrierLitige;
  existant?: CourrierRecouvrement;
  dossier: Dossier;
  garage: { nom: string | null; gard_tarif_jour: number | null } | null;
  nbPhotos: number;
  joursImmobilisation: number | null;
  onClose: () => void;
  onSaved: (c: CourrierRecouvrement, action: "enregistrer" | "email" | "poster") => void;
}) {
  const cible = type === "position_assureur" ? cibleAssurance(dossier) : cibleExpert(dossier);
  const [nom, setNom] = useState(existant?.destinataire_nom || cible.nom);
  const [adresse, setAdresse] = useState(existant?.destinataire_adresse || cible.adresse);
  const [date, setDate] = useState(existant?.date_courrier || ymd());
  const [montant] = useState<number | null>(dossier.montant != null ? Number(dossier.montant) : null);
  const modele = useMemo(() => modeleCourrierLitige({ type, dossier, garage: garage?.nom || null, montant, nbPhotos, joursImmobilisation, gardiennageJour: garage?.gard_tarif_jour ?? null }), [type, dossier, garage, montant, nbPhotos, joursImmobilisation]);
  const [objet, setObjet] = useState(existant?.objet || modele.objet);
  const [corps, setCorps] = useState(existant?.corps || modele.corps);
  const [signataire, setSignataire] = useState(existant?.signataire_nom || garage?.nom || "");
  const [signature, setSignature] = useState<string | null>(existant?.signature || null);
  const [signer, setSigner] = useState(Boolean(existant?.signature));
  const [busy, setBusy] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function brouillon(): CourrierRecouvrement {
    const signe = signer && signature;
    return {
      id: existant?.id || "", created_at: existant?.created_at || new Date().toISOString(), dossier_id: dossier.id, document_id: null, type,
      destinataire: type === "position_assureur" ? "assurance" : "tiers", destinataire_nom: nom.trim() || null, destinataire_adresse: adresse.trim() || null,
      objet: objet.trim() || null, corps: corps.trim() || null, montant: montant, delai_jours: modele.delaiJours, date_courrier: date || ymd(),
      signataire_nom: signataire.trim() || null, signature: signe ? signature : null, signe_le: signe ? existant?.signe_le || new Date().toISOString() : null,
      envoye_le: existant?.envoye_le || null, canal_envoi: existant?.canal_envoi || null, statut: existant?.statut === "envoye" ? "envoye" : signe ? "signe" : "brouillon", notes: null,
    };
  }

  async function enregistrer(action: "enregistrer" | "email" | "poster") {
    setBusy(action); setErreur(null);
    if (signer && !signature) { setErreur("Signez dans le cadre, ou décochez la signature au doigt (tampon et signature du profil)."); setBusy(null); return; }
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
    <ModalShell title={LIBELLE_COURRIER_LITIGE[type]} onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <div><label className="field-label text-[11px]">Destinataire</label><input className="field-input field-compact w-full" value={nom} onChange={(e) => setNom(e.target.value)} /></div>
          <div><label className="field-label text-[11px]">Adresse postale</label><textarea className="field-input field-compact w-full" rows={2} value={adresse} onChange={(e) => setAdresse(e.target.value)} /></div>
          <div><label className="field-label text-[11px]">Date du courrier</label><input type="date" className="field-input field-compact w-full" value={date} onChange={(e) => setDate(e.target.value)} />
            {montant != null && <div className="mt-1 text-xs text-white/60">Chiffrage : {formatEuros(montant)} HT</div>}</div>
        </div>
        <div><label className="field-label text-[11px]">Objet</label><input className="field-input field-compact w-full" value={objet} onChange={(e) => setObjet(e.target.value)} /></div>
        <div>
          <div className="flex items-center justify-between">
            <label className="field-label text-[11px]">Texte du courrier (modifiable)</label>
            <button type="button" onClick={() => { setObjet(modele.objet); setCorps(modele.corps); }} className="text-[11px] font-semibold text-accent-pink hover:underline">↺ Reprendre le texte proposé</button>
          </div>
          <textarea className="field-input w-full font-mono text-[13px]" rows={12} value={corps} onChange={(e) => setCorps(e.target.value)} />
          {type === "position_assureur" && <p className="mt-1 text-xs text-amber-200/90">À envoyer en recommandé AR au nom du client (ou du garage cessionnaire) : c&apos;est ce qui fait courir les intérêts et ouvre la voie du Médiateur.</p>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="field-label text-[11px]">Signataire</label>
            <input className="field-input field-compact w-full" value={signataire} onChange={(e) => setSignataire(e.target.value)} />
            <label className="mt-2 flex items-center gap-2 text-sm text-white/80"><input type="checkbox" checked={signer} onChange={(e) => setSigner(e.target.checked)} className="h-4 w-4 accent-pink-500" />Signer au doigt (sinon : tampon et signature du profil)</label>
          </div>
          {signer && <div><label className="field-label text-[11px]">Signature</label><SignaturePad onChange={setSignature} /></div>}
        </div>
        {erreur && <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{erreur}</div>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-3">
          <button type="button" onClick={() => apercuCourrierRecouvrementPdf(brouillon(), dossier, dossier.numero_sinistre)} className="btn-ghost btn-compact">👁 Aperçu PDF</button>
          <button type="button" onClick={() => generateCourrierRecouvrementPdf(brouillon(), dossier, dossier.numero_sinistre)} className="btn-ghost btn-compact">⬇ Télécharger</button>
          <button type="button" onClick={() => enregistrer("enregistrer")} disabled={busy !== null} className="btn-ghost btn-compact">Enregistrer</button>
          <button type="button" onClick={() => enregistrer("email")} disabled={busy !== null} className="btn-ghost btn-compact">✉ Envoyer par email{type === "accord_reparation_expert" && nbPhotos ? ` (+${Math.min(12, nbPhotos)} photos)` : " (PDF joint)"}</button>
          <button type="button" onClick={() => enregistrer("poster")} disabled={busy !== null} className="btn-primary btn-compact">{type === "position_assureur" ? "Signer → envoyer en recommandé" : "Signer → poster"}</button>
        </div>
      </div>
    </ModalShell>
  );
}
