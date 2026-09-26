"use client";

// ============================================================
//  ENVOI PAR LA POSTE EN 1 CLIC (v13.27)
//  Le PDF part chez Maileva (La Poste) qui l'imprime, le met sous
//  pli et le remet au facteur : lettre simple ou recommandé AR
//  papier. Utilisée depuis la fiche dossier, la page Courriers et
//  les courriers de la procédure d'impayé / du litige.
// ============================================================

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ModalShell from "./ModalShell";
import GuideCourriers, { guideCourriersVu, marquerGuideCourriersVu } from "./GuideCourriers";
import { compterPagesPdf, coutJetons, feuillesPli, FEUILLES_MAX } from "@/lib/jetons";
import { lireSoldeJetons } from "@/lib/jetonsClient";
import { LIBELLE_LIGNES, lignesAdresse, verifierAdresse, type EnvoiPostal, type TypeEnvoiPostal } from "@/lib/envoisPostaux";
import { ConfigMaileva, envoyerParLaPoste, lireConfigMaileva } from "@/lib/envoisPostauxClient";

export default function EnvoiPostalModal({
  titre = "Envoyer par La Poste",
  getPdfBase64,
  nomFichier,
  objet,
  destinataireNom,
  destinataireAdresse,
  typeInitial = "simple",
  dossierId = null,
  courrierId = null,
  onClose,
  onEnvoye,
}: {
  titre?: string;
  getPdfBase64: () => Promise<string>;
  nomFichier: string;
  objet: string;
  destinataireNom: string;
  destinataireAdresse: string;
  typeInitial?: TypeEnvoiPostal;
  dossierId?: string | null;
  courrierId?: string | null;
  onClose: () => void;
  onEnvoye: (envoi: EnvoiPostal) => void | Promise<void>;
}) {
  const [config, setConfig] = useState<ConfigMaileva | null>(null);
  const [charge, setCharge] = useState(false);
  const [type, setType] = useState<TypeEnvoiPostal>(typeInitial);
  const [lignes, setLignes] = useState<string[]>(() => lignesAdresse(destinataireNom, destinataireAdresse));
  const [couleur, setCouleur] = useState(false);
  const [rectoVerso, setRectoVerso] = useState(true);
  const [arScanne, setArScanne] = useState(true);
  const [confirme, setConfirme] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [solde, setSolde] = useState<number | null>(null);
  const [pages, setPages] = useState<number | null>(null);
  const [guide, setGuide] = useState(false);
  const pdfCache = useRef<string | null>(null);

  // Le PDF est préparé UNE fois : il sert au calcul du coût, à l'aperçu et à l'envoi.
  async function pdf(): Promise<string> {
    if (!pdfCache.current) pdfCache.current = await getPdfBase64();
    return pdfCache.current;
  }

  useEffect(() => {
    setGuide(!guideCourriersVu());
    lireConfigMaileva().then(({ config: c, error }) => {
      setConfig(c);
      if (c) { setCouleur(c.couleur); setRectoVerso(c.recto_verso); }
      if (error) setErreur(error);
      setCharge(true);
    });
    lireSoldeJetons().then(setSolde);
    pdf().then((b64) => setPages(compterPagesPdf(atob(b64)))).catch(() => setPages(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const feuilles = pages !== null ? feuillesPli(pages, rectoVerso) : null;
  const cout = feuilles !== null ? coutJetons(type, feuilles) : null;
  const tropLong = feuilles !== null && feuilles > FEUILLES_MAX;
  const soldeInsuffisant = solde !== null && cout !== null && solde < cout;

  const probleme = verifierAdresse(lignes);
  const exp = config?.expediteur;
  const expIncomplet = !exp?.nom || !exp?.adresse || !exp?.code_postal || !exp?.ville;

  async function apercu() {
    try {
      const b64 = await pdf();
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) u8[i] = bin.charCodeAt(i);
      window.open(URL.createObjectURL(new Blob([u8], { type: "application/pdf" })), "_blank");
    } catch (e) {
      setErreur((e as Error).message || "Aperçu impossible.");
    }
  }

  async function envoyer() {
    setErreur(null);
    if (probleme) { setErreur(probleme); return; }
    if (type === "lrar" && expIncomplet) { setErreur("Complète l'adresse du garage dans le Profil : elle figure sur le recommandé comme expéditeur."); return; }
    setBusy(true);
    try {
      const pdfBase64 = await pdf();
      const { envoi, error } = await envoyerParLaPoste({ pdfBase64, nomFichier, type, objet, lignes, couleur, rectoVerso, arScanne: type === "lrar" && arScanne, dossierId, courrierId });
      if (error || !envoi) { setErreur(error || "Envoi impossible."); lireSoldeJetons().then(setSolde); return; }
      await onEnvoye(envoi);
    } catch (e) {
      setErreur((e as Error).message || "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title={titre} onClose={onClose} maxWidth="max-w-2xl">
      {!charge && <p className="text-sm text-white/50">Chargement…</p>}

      {charge && config && !config.migration && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-500/15 px-3 py-2 text-sm text-amber-100">
          Exécute <code>supabase/migration_v89.sql</code> dans Supabase pour activer l&apos;envoi de courriers par La Poste.
        </div>
      )}

      {charge && config?.migration && !config.configured && (
        <div className="space-y-2 rounded-lg border border-amber-400/30 bg-amber-500/15 px-3 py-3 text-sm text-amber-100">
          <p>L&apos;envoi de courriers par La Poste depuis l&apos;appli ouvre très prochainement. En attendant, télécharge le PDF et poste-le toi-même.</p>
          <Link href="/courriers" className="btn-ghost btn-compact inline-block" onClick={onClose}>En savoir plus →</Link>
        </div>
      )}

      {charge && config?.configured && guide && (
        <GuideCourriers compact onCompris={() => { marquerGuideCourriersVu(); setGuide(false); }} />
      )}

      {charge && config?.configured && !guide && (
        <div className="space-y-3">
          {config.environnement === "sandbox" && (
            <div className="rounded-lg border border-sky-400/30 bg-sky-500/15 px-3 py-2 text-xs text-sky-100">
              Environnement de <strong>TEST</strong> Maileva : l&apos;envoi est simulé, rien n&apos;est imprimé ni posté (les jetons sont tout de même décomptés pour tester le parcours).
            </div>
          )}

          <div>
            <label className="field-label text-[11px]">Type d&apos;envoi</label>
            <div className="segment">
              <button type="button" onClick={() => setType("simple")} className={`segment-btn ${type === "simple" ? "actif" : ""}`}>✉ Lettre simple</button>
              <button type="button" onClick={() => setType("lrar")} className={`segment-btn ${type === "lrar" ? "actif" : ""}`}>📮 Recommandé AR</button>
            </div>
            <p className="mt-1 text-xs text-white/55">
              {type === "lrar"
                ? "Recommandé papier avec avis de réception, distribué par le facteur contre signature. Le n° de recommandé et la preuve de dépôt remontent dans l'appli."
                : "Courrier papier déposé dans la boîte aux lettres du destinataire."}
            </p>
          </div>

          <div className="glass-soft p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/60">Adresse du destinataire</span>
              <button type="button" className="text-[11px] font-semibold text-accent-pink hover:underline" onClick={() => setLignes(lignesAdresse(destinataireNom, destinataireAdresse))}>↺ Reprendre l&apos;adresse du dossier</button>
            </div>
            <div className="grid gap-1.5">
              {LIBELLE_LIGNES.map((lib, i) => (
                <div key={i} className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[190px_1fr]">
                  <label className="text-[11px] text-white/50">{lib}</label>
                  <input
                    className={`field-input field-compact w-full ${i === 5 ? "font-semibold uppercase" : ""}`}
                    maxLength={38}
                    value={lignes[i] || ""}
                    onChange={(e) => setLignes((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                </div>
              ))}
            </div>
            {probleme ? <p className="mt-2 text-xs text-amber-200">{probleme}</p> : <p className="mt-2 text-xs text-emerald-300">Adresse au format postal ✓</p>}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="glass-soft p-3 text-xs text-white/70">
              <div className="mb-1 font-semibold uppercase tracking-wide text-white/60">Expéditeur</div>
              {exp?.nom ? (
                <div className="whitespace-pre-line text-white/85">{[exp.nom, exp.adresse, `${exp.code_postal || ""} ${exp.ville || ""}`.trim()].filter(Boolean).join("\n")}</div>
              ) : (
                <span className="text-amber-200">Adresse du garage à compléter dans le Profil.</span>
              )}
            </div>
            <div className="glass-soft space-y-1.5 p-3 text-sm text-white/80">
              <label className="flex items-center gap-2"><input type="checkbox" checked={rectoVerso} onChange={(e) => setRectoVerso(e.target.checked)} className="h-4 w-4 accent-pink-500" />Recto verso</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={couleur} onChange={(e) => setCouleur(e.target.checked)} className="h-4 w-4 accent-pink-500" />Impression couleur</label>
              {type === "lrar" && <label className="flex items-center gap-2"><input type="checkbox" checked={arScanne} onChange={(e) => setArScanne(e.target.checked)} className="h-4 w-4 accent-pink-500" />Avis de réception scanné (PDF dans l&apos;appli)</label>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-white/75">
            <span>📄 {nomFichier}</span>
            <button type="button" onClick={apercu} className="btn-ghost btn-compact">👁 Aperçu du PDF</button>
          </div>

          <div className={`rounded-lg border px-3 py-2 text-sm ${soldeInsuffisant ? "border-rose-400/40 bg-rose-500/15 text-rose-100" : "border-white/15 bg-white/5 text-white/85"}`}>
            {cout === null ? (
              <span>Calcul du coût…</span>
            ) : (
              <span>
                Coût : <strong>{cout} jeton{cout > 1 ? "s" : ""}</strong> ({feuilles} feuille{(feuilles || 0) > 1 ? "s" : ""} avec la page adresse)
                {solde !== null && <> · Solde : <strong>{solde}</strong>{!soldeInsuffisant && <> → {solde - cout} après l&apos;envoi</>}</>}
              </span>
            )}
            {soldeInsuffisant && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span>Jetons insuffisants pour cet envoi.</span>
                <Link href="/courriers#jetons" className="btn-primary btn-compact" onClick={onClose}>Acheter des jetons</Link>
              </div>
            )}
            {tropLong && <div className="mt-1 text-rose-200">Trop long : {FEUILLES_MAX} feuilles maximum par pli.</div>}
          </div>

          <label className="flex items-start gap-2 text-sm text-white/85">
            <input type="checkbox" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} className="mt-0.5 h-4 w-4 accent-pink-500" />
            <span>Je confirme l&apos;envoi : ce courrier sera imprimé et posté par La Poste{cout !== null ? ` (${cout} jeton${cout > 1 ? "s" : ""} débité${cout > 1 ? "s" : ""})` : ""}. Un envoi transmis ne peut plus être annulé.</span>
          </label>
        </div>
      )}

      {erreur && <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{erreur}</div>}

      <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
        <button type="button" onClick={onClose} className="btn-ghost btn-compact">Annuler</button>
        {config?.configured && !guide && (
          <button type="button" disabled={busy || !confirme || Boolean(probleme) || soldeInsuffisant || tropLong || cout === null} onClick={envoyer} className="btn-primary btn-compact">
            {busy ? "Transmission à La Poste…" : type === "lrar" ? "📮 Envoyer en recommandé AR" : "✉ Envoyer la lettre"}
          </button>
        )}
      </div>
    </ModalShell>
  );
}
