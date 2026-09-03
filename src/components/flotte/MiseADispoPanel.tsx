"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Dossier, FlotteMiseADispo, FlottePhoto, FlotteVehicule } from "@/lib/types";
import { formatDate, formatDateTime, messageErreur, ymd } from "@/lib/format";
import {
  TYPES_MAD,
  detenteurA,
  enregistrerPhotoFlotte,
  finEffective,
  phraseDetenteur,
  supprimerPhotoFlotte,
  synchroniserStatutVehicule,
  urlFichierFlotte,
} from "@/lib/flotte";
import { ANGLES, labelAngle, preparerImage } from "@/lib/photosEtat";
import { apercuContratMiseADispoPdf, generateContratMiseADispoPdf } from "@/lib/pdf";
import { usePliage } from "@/lib/pliage";
import ModalShell from "@/components/ModalShell";
import SignaturePad from "@/components/SignaturePad";
import CameraModal from "@/components/CameraModal";
import MiseADispoModal from "@/components/flotte/MiseADispoModal";

const MOMENTS_MAD = [
  { code: "depart", label: "Au départ", icone: "🚗" },
  { code: "retour", label: "Au retour", icone: "🏁" },
];

/**
 * Historique des PRÊTS et LOCATIONS d'un véhicule (v12.3) : contrat,
 * signature des conditions générales, photos départ / retour, kilométrage,
 * retour du véhicule — et la question qui compte quand un PV arrive :
 * « qui avait le véhicule le … ? ».
 */
export default function MiseADispoPanel({
  vehicule,
  mads,
  photos,
  dossiers,
  onChanged,
}: {
  vehicule: FlotteVehicule;
  mads: FlotteMiseADispo[];
  photos: FlottePhoto[];
  dossiers: Dossier[];
  onChanged: () => void;
}) {
  const { plie, basculerPliage } = usePliage("flotte.mad", false);
  const [nouveau, setNouveau] = useState<string | null>(null); // pret | location
  const [edition, setEdition] = useState<FlotteMiseADispo | null>(null);
  const [signer, setSigner] = useState<FlotteMiseADispo | null>(null);
  const [photosDe, setPhotosDe] = useState<FlotteMiseADispo | null>(null);
  const [retour, setRetour] = useState<FlotteMiseADispo | null>(null);
  const [dateQui, setDateQui] = useState("");

  const parId = useMemo(() => new Map(dossiers.map((d) => [d.id, d])), [dossiers]);
  const enCours = mads.filter((m) => m.statut === "en_cours");
  const passees = mads.filter((m) => m.statut !== "en_cours");
  const detenteur = dateQui ? detenteurA(mads, dateQui) : null;

  async function supprimer(m: FlotteMiseADispo) {
    if (!confirm(`Supprimer ce ${m.type === "location" ? "contrat de location" : "prêt"} (${m.conducteur_nom || "—"}) et ses photos ?`)) return;
    const { error } = await supabase.from("flotte_mises_a_dispo").delete().eq("id", m.id);
    if (error) return alert(messageErreur(error, "Suppression impossible."));
    await synchroniserStatutVehicule(vehicule.id);
    onChanged();
  }

  async function annuler(m: FlotteMiseADispo) {
    if (!confirm("Annuler cette mise à disposition (le véhicule n'est finalement pas parti) ?")) return;
    await supabase.from("flotte_mises_a_dispo").update({ statut: "annulee" }).eq("id", m.id);
    await synchroniserStatutVehicule(vehicule.id);
    onChanged();
  }

  function Carte({ m }: { m: FlotteMiseADispo }) {
    const info = TYPES_MAD[m.type] || TYPES_MAD.pret;
    const d = m.dossier_id ? parId.get(m.dossier_id) : undefined;
    const nbPhotos = { depart: photos.filter((p) => p.mise_a_dispo_id === m.id && p.moment === "depart").length, retour: photos.filter((p) => p.mise_a_dispo_id === m.id && p.moment === "retour").length };
    const fin = finEffective(m);
    const parcourus = m.km_depart != null && m.km_retour != null ? Number(m.km_retour) - Number(m.km_depart) : null;
    const actif = m.statut === "en_cours";
    return (
      <div className={`glass-soft p-3 ${actif ? "ring-1 ring-accent-teal/60" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${info.badge}`}>{info.label}</span>
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${actif ? "bg-emerald-100 text-emerald-700" : m.statut === "annulee" ? "bg-slate-100 text-slate-500" : "bg-white/10 text-white/70"}`}>
                {actif ? "En cours" : m.statut === "annulee" ? "Annulée" : "Terminée"}
              </span>
              {m.signature || m.cg_acceptees ? (
                <span className="text-xs text-emerald-300">✓ CG signées{m.signe_le ? ` le ${formatDate(m.signe_le)}` : ""}</span>
              ) : (
                <span className="text-xs text-amber-200">CG non signées</span>
              )}
            </div>
            <div className="mt-1 font-medium text-white">
              {m.conducteur_nom || "—"}
              {m.conducteur_tel ? <span className="text-sm font-normal text-white/50"> · {m.conducteur_tel}</span> : null}
            </div>
            <div className="text-xs text-white/50">
              Du {formatDate(m.date_debut)} {fin ? `au ${formatDate(fin)}` : m.date_fin ? `— retour prévu le ${formatDate(m.date_fin)}` : "— retour non planifié"}
              {m.km_depart != null ? ` · ${Number(m.km_depart).toLocaleString("fr-FR")} km départ` : ""}
              {m.km_retour != null ? ` → ${Number(m.km_retour).toLocaleString("fr-FR")} km retour` : ""}
              {parcourus != null ? ` (${parcourus.toLocaleString("fr-FR")} km)` : ""}
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-white/50">
              {d && <Link href={`/sinistres/${d.id}`} className="text-accent-teal hover:underline">Dossier sinistre {d.numero_sinistre || ""} ↗</Link>}
              <span>📷 départ {nbPhotos.depart} · retour {nbPhotos.retour}</span>
              {m.notes && <span className="italic">{m.notes}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <button onClick={() => setEdition(m)} className="text-accent-pink hover:underline">Contrat</button>
            <button onClick={() => apercuContratMiseADispoPdf(m, vehicule, d)} className="text-accent-teal hover:underline">PDF</button>
            <button onClick={() => generateContratMiseADispoPdf(m, vehicule, d)} className="text-accent-teal hover:underline">Télécharger</button>
            {!m.signature && <button onClick={() => setSigner(m)} className="text-accent-violet hover:underline">Faire signer</button>}
            <button onClick={() => setPhotosDe(m)} className="text-accent-violet hover:underline">Photos</button>
            {actif && <button onClick={() => setRetour(m)} className="font-semibold text-emerald-300 hover:underline">Retour du véhicule</button>}
            {actif && <button onClick={() => annuler(m)} className="text-white/40 hover:underline">Annuler</button>}
            <button onClick={() => supprimer(m)} className="text-white/40 hover:text-rose-300">Suppr.</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="glass-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 sm:px-4 sm:py-2.5">
        <button onClick={basculerPliage} className="flex min-w-0 items-center gap-2 text-left" aria-expanded={!plie}>
          <span className={`shrink-0 text-white/40 transition-transform ${plie ? "" : "rotate-90"}`} aria-hidden>▸</span>
          <h2 className="titre-bloc truncate">Prêts & locations</h2>
          <span className="badge">{mads.length}</span>
        </button>
        {!plie && (
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <button onClick={() => setNouveau("pret")} disabled={enCours.length > 0} className="btn-ghost py-1.5 px-3 text-xs" title={enCours.length ? "Le véhicule est déjà sorti : enregistre d'abord son retour." : ""}>Prêter</button>
            <button onClick={() => setNouveau("location")} disabled={enCours.length > 0} className="btn-primary py-1.5 px-3 text-xs" title={enCours.length ? "Le véhicule est déjà sorti : enregistre d'abord son retour." : ""}>Louer</button>
          </div>
        )}
      </div>

      {!plie && (
        <div className="space-y-3 px-4 py-4 sm:px-5">
          {/* Qui avait le véhicule ? */}
          <div className="glass-soft p-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-white/80">🎫 PV, radar, amende… qui avait le véhicule le</label>
              <input type="date" className="field-input max-w-[11rem]" value={dateQui} onChange={(e) => setDateQui(e.target.value)} />
              <button onClick={() => setDateQui(ymd())} className="text-xs text-white/40 hover:underline">aujourd&apos;hui</button>
            </div>
            {dateQui && (
              <p className={`mt-2 text-sm ${detenteur ? "text-white" : "text-white/60"}`}>
                {phraseDetenteur(vehicule.immatriculation, detenteur, dateQui, formatDate)}
                {detenteur?.conducteur_email ? ` Email : ${detenteur.conducteur_email}.` : ""}
                {detenteur?.conducteur_adresse ? ` Adresse : ${detenteur.conducteur_adresse}.` : ""}
              </p>
            )}
          </div>

          {mads.length === 0 && (
            <p className="text-sm text-white/40">
              Aucun prêt ni location pour ce véhicule. « Prêter » (gratuit, ex. véhicule de courtoisie pendant un sinistre) ou « Louer » (facturé) : le contrat est pré-rempli depuis le dossier ou la fiche client, puis signé et suivi ici.
            </p>
          )}
          {enCours.map((m) => <Carte key={m.id} m={m} />)}
          {passees.length > 0 && enCours.length > 0 && <div className="pt-1 text-xs font-semibold uppercase tracking-wide text-white/40">Historique</div>}
          {passees.map((m) => <Carte key={m.id} m={m} />)}
        </div>
      )}

      {nouveau && (
        <MiseADispoModal vehicule={vehicule} type={nouveau} onClose={() => setNouveau(null)} onSaved={() => { setNouveau(null); onChanged(); }} />
      )}
      {edition && (
        <MiseADispoModal vehicule={vehicule} type={edition.type} mad={edition} onClose={() => setEdition(null)} onSaved={() => { setEdition(null); onChanged(); }} />
      )}
      {signer && (
        <SignerModal mad={signer} vehicule={vehicule} onClose={() => setSigner(null)} onSaved={() => { setSigner(null); onChanged(); }} />
      )}
      {photosDe && (
        <PhotosMadModal mad={photosDe} vehicule={vehicule} photos={photos.filter((p) => p.mise_a_dispo_id === photosDe.id)} onClose={() => setPhotosDe(null)} onChanged={onChanged} />
      )}
      {retour && (
        <RetourModal mad={retour} vehicule={vehicule} onClose={() => setRetour(null)} onSaved={() => { setRetour(null); onChanged(); }} />
      )}
    </section>
  );
}

/* ------------------------- Signature des CG ------------------------- */

function SignerModal({ mad, vehicule, onClose, onSaved }: { mad: FlotteMiseADispo; vehicule: FlotteVehicule; onClose: () => void; onSaved: () => void }) {
  const [signataire, setSignataire] = useState(mad.signataire_nom || mad.conducteur_nom || "");
  const [signature, setSignature] = useState<string | null>(null);
  const [lu, setLu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const role = mad.type === "location" ? "locataire" : "emprunteur";

  async function save() {
    if (!lu) { setError("Coche la case « lu et approuvé » avec le signataire."); return; }
    if (!signature) { setError("Fais signer dans le cadre."); return; }
    setSaving(true);
    setError(null);
    const { error: e1 } = await supabase
      .from("flotte_mises_a_dispo")
      .update({ signataire_nom: signataire || null, signature, signe_le: new Date().toISOString(), cg_acceptees: true })
      .eq("id", mad.id);
    setSaving(false);
    if (e1) { setError(messageErreur(e1)); return; }
    onSaved();
  }

  return (
    <ModalShell title={`Signature des conditions générales — ${vehicule.immatriculation}`} onClose={onClose}>
      <p className="text-xs text-white/60">
        Le {role} signe à l&apos;écran, après lecture des conditions générales (visibles via « Contrat » ou « PDF »). La signature, horodatée, figure en bas du contrat PDF.
      </p>
      <div>
        <label className="field-label">Nom du signataire</label>
        <input className="field-input" value={signataire} onChange={(e) => setSignataire(e.target.value)} />
      </div>
      <label className="flex items-start gap-2 text-sm text-white/80">
        <input type="checkbox" className="mt-1" checked={lu} onChange={(e) => setLu(e.target.checked)} />
        <span>Le {role} déclare avoir lu et approuvé les conditions générales de {mad.type === "location" ? "location" : "prêt"} et l&apos;état du véhicule au départ.</span>
      </label>
      <div>
        <label className="field-label">Signature</label>
        <SignaturePad onChange={setSignature} />
      </div>
      {error && <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</div>}
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">Annuler</button>
        <button onClick={save} disabled={saving} className="btn-primary">{saving ? "…" : "Enregistrer la signature"}</button>
      </div>
    </ModalShell>
  );
}

/* --------------------------- Retour du véhicule --------------------------- */

function RetourModal({ mad, vehicule, onClose, onSaved }: { mad: FlotteMiseADispo; vehicule: FlotteVehicule; onClose: () => void; onSaved: () => void }) {
  const [dateRetour, setDateRetour] = useState(new Date().toISOString().slice(0, 16));
  const [km, setKm] = useState("");
  const [carburant, setCarburant] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const num = (v: string): number | null => (v.trim() === "" ? null : Number(v.replace(",", ".")) || 0);

  async function save() {
    const kmRetour = num(km);
    if (kmRetour != null && mad.km_depart != null && kmRetour < Number(mad.km_depart)) { setError("Le kilométrage au retour ne peut pas être inférieur à celui du départ."); return; }
    setSaving(true);
    setError(null);
    const { error: e1 } = await supabase
      .from("flotte_mises_a_dispo")
      .update({
        statut: "terminee",
        date_retour: new Date(dateRetour).toISOString(),
        km_retour: kmRetour,
        carburant_retour: carburant.trim() || null,
        observations_retour: obs.trim() || null,
      })
      .eq("id", mad.id);
    if (e1) { setError(messageErreur(e1)); setSaving(false); return; }
    if (kmRetour != null) await supabase.from("flotte_vehicules").update({ kilometrage: kmRetour }).eq("id", vehicule.id);
    await synchroniserStatutVehicule(vehicule.id);
    if (mad.dossier_id) {
      await supabase.from("evenements").insert({
        dossier_id: mad.dossier_id,
        titre: `Retour du véhicule ${vehicule.immatriculation}`,
        description: `Rendu par ${mad.conducteur_nom || "—"}${kmRetour != null ? ` · ${kmRetour.toLocaleString("fr-FR")} km` : ""}${obs ? ` · ${obs}` : ""}.`,
        date_evenement: new Date(dateRetour).toISOString(),
        categorie: "autre",
      });
    }
    setSaving(false);
    onSaved();
  }

  return (
    <ModalShell title={`Retour de ${vehicule.immatriculation}`} onClose={onClose}>
      <p className="text-xs text-white/60">
        {mad.conducteur_nom || "—"} rend le véhicule. Prends les photos « au retour » (bouton Photos) pour comparer avec le départ.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className="field-label">Date et heure du retour</label><input type="datetime-local" className="field-input" value={dateRetour} onChange={(e) => setDateRetour(e.target.value)} /></div>
        <div><label className="field-label">Kilométrage au retour {mad.km_depart != null ? `(départ ${Number(mad.km_depart).toLocaleString("fr-FR")})` : ""}</label><input inputMode="numeric" className="field-input" value={km} onChange={(e) => setKm(e.target.value)} /></div>
        <div><label className="field-label">Carburant au retour {mad.carburant_depart ? `(départ ${mad.carburant_depart})` : ""}</label><input className="field-input" value={carburant} onChange={(e) => setCarburant(e.target.value)} placeholder="ex. 1/2" /></div>
      </div>
      <div>
        <label className="field-label">État au retour (dommages constatés, propreté, accessoires…)</label>
        <textarea className="field-input" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} />
      </div>
      {error && <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</div>}
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">Annuler</button>
        <button onClick={save} disabled={saving} className="btn-primary">{saving ? "…" : "Véhicule rendu"}</button>
      </div>
    </ModalShell>
  );
}

/* ------------------------ Photos départ / retour ------------------------ */

function PhotosMadModal({
  mad,
  vehicule,
  photos,
  onClose,
  onChanged,
}: {
  mad: FlotteMiseADispo;
  vehicule: FlotteVehicule;
  photos: FlottePhoto[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [moment, setMoment] = useState(mad.statut === "en_cours" && photos.some((p) => p.moment === "depart") ? "retour" : "depart");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [camera, setCamera] = useState<string | null>(null); // angle
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [comparer, setComparer] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const angleFichier = useRef<string>("libre");

  useEffect(() => {
    let vivant = true;
    (async () => {
      const paires = await Promise.all(photos.map(async (p) => [p.id, (await urlFichierFlotte(p.path)) || ""] as const));
      if (vivant) setUrls(Object.fromEntries(paires));
    })();
    return () => { vivant = false; };
  }, [photos]);

  const photoDe = (mom: string, angle: string) => photos.find((p) => p.moment === mom && p.angle === angle);
  const libres = photos.filter((p) => p.moment === moment && p.angle === "libre");
  const obligatoires = ANGLES.filter((a) => a.obligatoire);
  const faites = obligatoires.filter((a) => photoDe(moment, a.code)).length;

  async function enregistrer(angle: string, dataUrl: string) {
    setBusy(true);
    setErreur(null);
    try {
      const blob = await preparerImage(dataUrl);
      await enregistrerPhotoFlotte({
        vehiculeId: vehicule.id,
        madId: mad.id,
        moment,
        angle,
        blob,
        kilometrage: moment === "depart" ? mad.km_depart : mad.km_retour,
        ancienne: angle === "libre" ? null : photoDe(moment, angle) || null,
      });
      onChanged();
    } catch (err) {
      setErreur(messageErreur(err, "Photo non enregistrée (migration v67 exécutée ?)."));
    } finally {
      setBusy(false);
    }
  }

  function depuisFichier(file: File, angle: string) {
    const reader = new FileReader();
    reader.onload = () => enregistrer(angle, String(reader.result));
    reader.readAsDataURL(file);
  }

  async function supprimer(p: FlottePhoto) {
    if (!confirm("Supprimer cette photo ?")) return;
    try { await supprimerPhotoFlotte(p); onChanged(); } catch (err) { setErreur(messageErreur(err)); }
  }

  return (
    <ModalShell title={`Photos — ${vehicule.immatriculation} · ${mad.conducteur_nom || ""}`} onClose={onClose} maxWidth="max-w-4xl">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) depuisFichier(f, angleFichier.current); e.target.value = ""; }}
      />
      <div className="flex flex-wrap items-center gap-2">
        {MOMENTS_MAD.map((m) => (
          <button key={m.code} onClick={() => { setMoment(m.code); setComparer(false); }} className={`rounded-full px-3 py-1.5 text-xs font-medium ${moment === m.code && !comparer ? "bg-white/20 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>
            {m.icone} {m.label} ({photos.filter((p) => p.moment === m.code).length})
          </button>
        ))}
        <button onClick={() => setComparer(true)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${comparer ? "bg-white/20 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>
          ⇄ Comparer avant / après
        </button>
        <span className="ml-auto text-xs text-white/40">{comparer ? "Même angle, départ à gauche, retour à droite." : `Tour du véhicule : ${faites}/${obligatoires.length}`}</span>
      </div>

      {erreur && <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{erreur}</div>}

      {!comparer && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ANGLES.map((a) => {
              const p = photoDe(moment, a.code);
              return (
                <div key={a.code} className="glass-soft overflow-hidden">
                  {p && urls[p.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls[p.id]} alt={a.label} className="aspect-[4/3] w-full object-cover" />
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center text-3xl text-white/20">{a.obligatoire ? "📷" : "＋"}</div>
                  )}
                  <div className="px-2 py-1.5">
                    <div className="truncate text-xs text-white/80">{a.label}{a.obligatoire ? "" : " (option)"}</div>
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      <button disabled={busy} onClick={() => setCamera(a.code)} className="text-accent-teal hover:underline">{p ? "Reprendre" : "Photo"}</button>
                      <button disabled={busy} onClick={() => { angleFichier.current = a.code; inputRef.current?.click(); }} className="text-white/50 hover:underline">Fichier</button>
                      {p && <button onClick={() => supprimer(p)} className="text-white/40 hover:text-rose-300">Suppr.</button>}
                    </div>
                    {p && <div className="text-[10px] text-white/30">{formatDateTime(p.prise_le)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="glass-soft p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-white/60">Photos libres (détail d&apos;un dégât, intérieur, accessoires…)</div>
              <div className="flex gap-3 text-xs">
                <button disabled={busy} onClick={() => setCamera("libre")} className="text-accent-teal hover:underline">+ Photo</button>
                <button disabled={busy} onClick={() => { angleFichier.current = "libre"; inputRef.current?.click(); }} className="text-white/50 hover:underline">+ Fichier</button>
              </div>
            </div>
            {libres.length > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {libres.map((p) => (
                  <div key={p.id} className="relative">
                    {urls[p.id] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={urls[p.id]} alt="" className="aspect-square w-full rounded-lg object-cover" />
                    )}
                    <button onClick={() => supprimer(p)} className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-[10px] text-white">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {comparer && (
        <div className="space-y-2">
          {ANGLES.filter((a) => photoDe("depart", a.code) || photoDe("retour", a.code)).map((a) => {
            const pd = photoDe("depart", a.code);
            const pr = photoDe("retour", a.code);
            return (
              <div key={a.code} className="glass-soft p-2">
                <div className="mb-1 text-xs text-white/70">{labelAngle(a.code)}</div>
                <div className="grid grid-cols-2 gap-2">
                  {[pd, pr].map((p, i) => (
                    <div key={i} className="overflow-hidden rounded-lg bg-white/5">
                      {p && urls[p.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={urls[p.id]} alt="" className="aspect-[4/3] w-full object-cover" />
                      ) : (
                        <div className="flex aspect-[4/3] items-center justify-center text-xs text-white/30">{i === 0 ? "pas de photo au départ" : "pas de photo au retour"}</div>
                      )}
                      {p && <div className="px-2 py-1 text-[10px] text-white/40">{i === 0 ? "Départ" : "Retour"} · {formatDateTime(p.prise_le)}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {photos.length === 0 && <p className="text-sm text-white/40">Aucune photo pour l&apos;instant.</p>}
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={onClose} className="btn-ghost">Fermer</button>
      </div>

      {camera && (
        <CameraModal
          titre={camera === "libre" ? "Photo libre" : `${labelAngle(camera)} — ${ANGLES.find((a) => a.code === camera)?.consigne || ""}`}
          onCapture={(dataUrl) => { const angle = camera; setCamera(null); enregistrer(angle, dataUrl); }}
          onClose={() => setCamera(null)}
        />
      )}
    </ModalShell>
  );
}
