"use client";

// ============================================================
//  COURRIER PAPIER — imprimer, poster, confirmer, joindre l'AR (v13.42)
//  Modale commune au suivi des impayés et au mode litige, tant que
//  l'envoi dématérialisé est en pause :
//   1. le courrier (signé) est imprimé ;
//   2. le garage le poste (recommandé AR, simple, main propre) et saisit
//      le n° de recommandé ;
//   3. il CONFIRME l'envoi — c'est cette confirmation qui valide l'étape
//      de procédure et programme le rappel. « Plus tard » laisse une
//      tâche « à poster » en suspens sur l'ardoise ;
//   4. pour un recommandé, la photo de la preuve de dépôt / de l'avis de
//      réception est demandée et jointe aux pièces du dossier (tâche
//      « AR à joindre » tant qu'elle n'est pas fournie).
//  Si l'envoi dématérialisé est actif, le bouton « Envoyer par La Poste »
//  réapparaît en tête (EnvoiPostalModal).
// ============================================================

import { useRef, useState } from "react";
import { CourrierRecouvrement, Dossier } from "@/lib/types";
import { formatDate, formatEuros, messageErreur, ymd } from "@/lib/format";
import { apercuCourrierRecouvrementPdf, courrierRecouvrementPdfBase64, generateCourrierRecouvrementPdf, nomFichierCourrier } from "@/lib/pdf";
import { fichierVersPdf, imageDataUrlVersPdf } from "@/lib/photoPdf";
import { COURRIERS_POSTE_ACTIFS } from "@/lib/envoisPostaux";
import { joindreAccuseReception, libelleCourrier, programmerTacheAPoster, programmerTacheAR } from "@/lib/courrierPapier";
import ModalShell from "./ModalShell";
import CameraModal from "./CameraModal";
import EnvoiPostalModal from "./EnvoiPostalModal";
import Ico from "@/components/Ico";

export type CanalPapier = "lrar" | "courrier" | "remis_en_main";

const LRAR_PAR_DEFAUT = new Set(["mise_en_demeure", "reclamation_assureur", "mise_en_demeure_retrait", "attribution_gage", "position_assureur", "mise_en_demeure_recours", "recours_direct"]);

export default function CourrierPapierModal({ courrier, dossier, numeroFacture, mode = "envoi", onClose, onConfirmer }: {
  courrier: CourrierRecouvrement;
  dossier: Dossier;
  numeroFacture?: string | null;
  /** « envoi » = circuit complet ; « ar » = seulement joindre l'AR d'un recommandé déjà posté. */
  mode?: "envoi" | "ar";
  onClose: () => void;
  /** Appelé à la confirmation ; renvoie le courrier mis à jour (pour l'étape AR). */
  onConfirmer?: (canal: CanalPapier, numero: string | null, date: string) => Promise<void>;
}) {
  const libelle = libelleCourrier(courrier);
  const [etape, setEtape] = useState<"envoi" | "ar">(mode);
  const [canal, setCanal] = useState<CanalPapier>(LRAR_PAR_DEFAUT.has(courrier.type) ? "lrar" : "courrier");
  const [numero, setNumero] = useState(courrier.numero_suivi || "");
  const [date, setDate] = useState(ymd());
  const [imprime, setImprime] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [laPoste, setLaPoste] = useState(false);
  const [camera, setCamera] = useState<"depot" | "ar" | null>(null);
  const [natureFichier, setNatureFichier] = useState<"depot" | "ar">("ar");
  const inputRef = useRef<HTMLInputElement>(null);
  const signe = Boolean(courrier.signature) || courrier.statut === "signe";
  const courrierAR = { ...courrier, numero_suivi: numero.trim() || courrier.numero_suivi || null };

  async function imprimer() {
    setBusy("imprimer"); setErreur(null);
    try { await apercuCourrierRecouvrementPdf(courrier, dossier, numeroFacture); setImprime(true); }
    catch (e) { setErreur(messageErreur(e, "Impossible d'ouvrir le PDF.")); }
    finally { setBusy(null); }
  }

  async function plusTard() {
    setBusy("plus_tard");
    await programmerTacheAPoster(courrier, canal);
    setBusy(null);
    onClose();
  }

  async function confirmer() {
    if (!onConfirmer) return;
    setBusy("confirmer"); setErreur(null);
    try {
      await onConfirmer(canal, numero.trim() || null, date);
      if (canal === "lrar") {
        await programmerTacheAR(courrierAR, numero.trim() || null);
        setEtape("ar");
      } else onClose();
    } catch (e) { setErreur(messageErreur(e)); }
    finally { setBusy(null); }
  }

  async function enregistrerAR(blob: Blob, nature: "depot" | "ar") {
    setBusy("ar"); setErreur(null);
    try {
      await joindreAccuseReception(courrierAR, blob, nature);
      setInfo(nature === "ar" ? "Avis de réception joint au dossier — la tâche est clôturée." : "Preuve de dépôt jointe au dossier. Pensez à joindre l'avis de réception quand il revient.");
      if (nature === "ar") setTimeout(onClose, 1500);
    } catch (e) { setErreur(messageErreur(e, "Enregistrement impossible (bucket « pieces » ?).")); }
    finally { setBusy(null); setCamera(null); if (inputRef.current) inputRef.current.value = ""; }
  }

  function demanderPhoto(nature: "depot" | "ar") {
    if (typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function") setCamera(nature);
    else { setNatureFichier(nature); inputRef.current?.click(); }
  }

  return (
    <ModalShell title={etape === "ar" ? `Accusé de réception — ${libelle}` : `Imprimer et poster — ${libelle}`} onClose={onClose} maxWidth="max-w-lg">
      {etape === "envoi" ? (
        <div className="space-y-3">
          {COURRIERS_POSTE_ACTIFS && <>
            <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3">
              <div className="text-sm font-semibold text-white"><Ico n="mailbox" /> Envoyer par La Poste depuis l&apos;appli</div>
              <p className="mt-0.5 text-xs text-white/65">Le courrier est imprimé et posté pour vous{canal === "lrar" ? " en recommandé AR : n° de recommandé, preuve de dépôt et avis de réception remontent dans le dossier" : ""}.</p>
              <button type="button" onClick={() => setLaPoste(true)} className="btn-primary btn-compact mt-2">{canal === "lrar" ? "Envoyer en recommandé AR par La Poste" : "Envoyer par La Poste"}</button>
            </div>
            <div className="text-center text-[11px] uppercase tracking-wide text-white/40">— ou envoi par vos soins —</div>
          </>}

          <div className="glass-soft p-3 text-sm text-white/85">
            <div><strong className="text-white">{courrier.destinataire_nom || courrier.destinataire}</strong>{courrier.destinataire_adresse ? ` — ${courrier.destinataire_adresse.replace(/\n/g, ", ")}` : ""}</div>
            <div className="text-white/70">Daté du {formatDate(courrier.date_courrier)}{courrier.montant ? ` · ${formatEuros(courrier.montant)}` : ""} · {signe ? (courrier.signature ? "signé au doigt" : "signé (tampon et signature du profil)") : "non signé"}</div>
          </div>

          {/* Étape 1 — imprimer */}
          <div className="rounded-lg border border-white/15 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white"><span className={`badge ${imprime ? "badge-ok" : "badge-neutral"}`}>1</span> Imprimer le courrier</div>
            <p className="mt-0.5 text-xs text-white/65">Le PDF s&apos;ouvre dans un nouvel onglet : imprimez-le (⌘/Ctrl + P), signez à la main si besoin, puis mettez-le sous enveloppe{canal === "lrar" ? " avec le formulaire de recommandé" : ""}.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={busy !== null} onClick={imprimer} className="btn-primary btn-compact"><Ico n="file" /> Ouvrir pour imprimer</button>
              <button type="button" disabled={busy !== null} onClick={() => generateCourrierRecouvrementPdf(courrier, dossier, numeroFacture)} className="btn-ghost btn-compact"><Ico n="download" /> Télécharger le PDF</button>
            </div>
          </div>

          {/* Étape 2 — poster */}
          <div className="rounded-lg border border-white/15 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white"><span className="badge badge-neutral">2</span> Poster</div>
            <div className="mt-2 segment">
              <button type="button" onClick={() => setCanal("lrar")} className={`segment-btn ${canal === "lrar" ? "actif" : ""}`}>Recommandé AR</button>
              <button type="button" onClick={() => setCanal("courrier")} className={`segment-btn ${canal === "courrier" ? "actif" : ""}`}>Courrier simple</button>
              <button type="button" onClick={() => setCanal("remis_en_main")} className={`segment-btn ${canal === "remis_en_main" ? "actif" : ""}`}>Remis en main propre</button>
            </div>
            {canal === "lrar" && <p className="mt-1 text-xs text-white/60">Au guichet de La Poste (ou recommandé en ligne sur laposte.fr avec impression par La Poste). Gardez la preuve de dépôt : elle vous sera demandée à l&apos;étape suivante.</p>}
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {canal === "lrar" && <div><label className="field-label text-[11px]">N° du recommandé (suivi La Poste)</label><input className="field-input field-compact w-full font-mono" placeholder="1A 123 456 7890 1" value={numero} onChange={(e) => setNumero(e.target.value)} /></div>}
              <div><label className="field-label text-[11px]">Date d&apos;envoi</label><input type="date" className="field-input field-compact w-full" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            </div>
          </div>

          {/* Étape 3 — confirmer */}
          <div className="rounded-lg border border-white/15 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white"><span className="badge badge-neutral">3</span> Confirmer l&apos;envoi</div>
            <p className="mt-0.5 text-xs text-white/65">Tant que l&apos;envoi n&apos;est pas confirmé, le courrier reste « à poster » dans les tâches du dossier et l&apos;étape de procédure n&apos;est pas validée.</p>
          </div>

          {erreur && <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{erreur}</div>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-3">
            <button type="button" disabled={busy !== null} onClick={plusTard} className="btn-ghost btn-compact" title="Laisse une tâche « à poster » dans le dossier">{busy === "plus_tard" ? "…" : "Plus tard — me le rappeler"}</button>
            <button type="button" disabled={busy !== null} onClick={confirmer} className="btn-primary btn-compact">{busy === "confirmer" ? "Enregistrement…" : "J'ai posté le courrier"}</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-white/85">Recommandé{courrierAR.numero_suivi ? ` n° ${courrierAR.numero_suivi}` : ""} posté{courrier.envoye_le ? ` le ${formatDate(courrier.envoye_le)}` : ""} → <strong className="text-white">{courrier.destinataire_nom || courrier.destinataire}</strong>.</p>
          <p className="text-xs text-white/65">Prenez en photo la <strong className="text-white">preuve de dépôt</strong> dès maintenant, puis l&apos;<strong className="text-white">avis de réception</strong> (carton signé) quand il revient : les deux sont rangés dans les pièces du dossier, avec le courrier. C&apos;est la preuve exigée ensuite (conciliateur, injonction, médiateur).</p>
          <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const { blob } = await fichierVersPdf(f); await enregistrerAR(blob, natureFichier); } catch (err) { setErreur(messageErreur(err, "Conversion impossible.")); } }} />
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-white/15 p-3">
              <div className="text-sm font-semibold text-white">Preuve de dépôt</div>
              <p className="mt-0.5 text-xs text-white/60">Le récépissé remis au guichet (ou le mail de La Poste).</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={busy !== null} onClick={() => demanderPhoto("depot")} className="btn-primary btn-compact"><Ico n="camera" /> Photo</button>
                <button type="button" disabled={busy !== null} onClick={() => { setNatureFichier("depot"); inputRef.current?.click(); }} className="btn-ghost btn-compact">Importer</button>
              </div>
            </div>
            <div className="rounded-lg border border-white/15 p-3">
              <div className="text-sm font-semibold text-white">Avis de réception</div>
              <p className="mt-0.5 text-xs text-white/60">Le carton signé par le destinataire, à son retour.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={busy !== null} onClick={() => demanderPhoto("ar")} className="btn-primary btn-compact"><Ico n="camera" /> Photo</button>
                <button type="button" disabled={busy !== null} onClick={() => { setNatureFichier("ar"); inputRef.current?.click(); }} className="btn-ghost btn-compact">Importer</button>
              </div>
            </div>
          </div>
          {info && <p className="text-xs font-medium text-emerald-300">{info}</p>}
          {erreur && <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{erreur}</div>}
          <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
            <button type="button" onClick={onClose} className="btn-ghost btn-compact">Plus tard — une tâche me le rappellera</button>
          </div>
        </div>
      )}

      {camera && (
        <CameraModal
          titre={camera === "ar" ? "Avis de réception" : "Preuve de dépôt"}
          conseil="Cadre bien le document (n° de recommandé lisible), lumière au-dessus, puis Capturer."
          onCapture={async (dataUrl) => { try { const blob = await imageDataUrlVersPdf(dataUrl); await enregistrerAR(blob, camera); } catch (err) { setErreur(messageErreur(err, "Conversion impossible.")); setCamera(null); } }}
          onClose={() => setCamera(null)}
        />
      )}

      {COURRIERS_POSTE_ACTIFS && laPoste && (
        <EnvoiPostalModal
          titre={`La Poste — ${libelle}`}
          getPdfBase64={() => courrierRecouvrementPdfBase64(courrier, dossier)}
          nomFichier={nomFichierCourrier(courrier, numeroFacture)}
          objet={courrier.objet || libelle}
          destinataireNom={courrier.destinataire_nom || ""}
          destinataireAdresse={courrier.destinataire_adresse || ""}
          typeInitial={canal === "lrar" ? "lrar" : "simple"}
          dossierId={dossier.id}
          courrierId={courrier.id || null}
          onClose={() => setLaPoste(false)}
          onEnvoye={async (e) => { setLaPoste(false); await onConfirmer?.(e.type === "lrar" ? "lrar" : "courrier", e.numero_suivi, ymd()); onClose(); }}
        />
      )}
    </ModalShell>
  );
}
