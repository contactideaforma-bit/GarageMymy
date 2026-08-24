"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePliage } from "@/lib/pliage";
import { Dossier, PhotoEtat } from "@/lib/types";
import { formatDateTime, messageErreur } from "@/lib/format";
import {
  ANGLES,
  Angle,
  MOMENTS,
  anglesManquants,
  avancement,
  chargerPhotos,
  enregistrerPhoto,
  labelAngle,
  serieComplete,
  supprimerPhoto,
  urlPhoto,
} from "@/lib/photosEtat";
import { genererPlanchePhotos } from "@/lib/photosEtatPdf";
import CameraModal from "@/components/CameraModal";

/**
 * ÉTAT DU VÉHICULE EN PHOTOS (v47).
 *
 * Le geste doit être plus rapide que le litige qu'il évite : un bouton
 * « Faire le tour du véhicule » enchaîne les 8 angles tout seul, en
 * affichant la consigne de cadrage à chaque fois. Sur téléphone, ça prend
 * moins d'une minute.
 *
 * Chaque cliché est horodaté et rangé sous son angle : à la sortie, on
 * compare deux fois le même cadrage.
 */
export default function PhotosEtatPanel({ dossier }: { dossier: Dossier }) {
  const { plie, basculerPliage } = usePliage("dossier.photosEtat", true);
  const [photos, setPhotos] = useState<PhotoEtat[]>([]);
  const [dispo, setDispo] = useState(true);
  const [moment, setMoment] = useState<string>("entree");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [angleEnCours, setAngleEnCours] = useState<Angle | null>(null);
  const [enchainement, setEnchainement] = useState(false);
  const [comparer, setComparer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pdfEnCours, setPdfEnCours] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const charger = useCallback(async () => {
    const { photos: p, dispo: ok } = await chargerPhotos(dossier.id);
    setPhotos(p);
    setDispo(ok);
  }, [dossier.id]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Liens signés (bucket privé) : un par photo, renouvelés au chargement.
  useEffect(() => {
    let vivant = true;
    (async () => {
      const paires = await Promise.all(
        photos.map(async (p) => [p.id, (await urlPhoto(p.path)) || ""] as const)
      );
      if (vivant) setUrls(Object.fromEntries(paires));
    })();
    return () => {
      vivant = false;
    };
  }, [photos]);

  const parAngle = useMemo(() => {
    const m = new Map<string, PhotoEtat>();
    for (const p of photos) m.set(`${p.moment}::${p.angle}`, p);
    return m;
  }, [photos]);

  const photoDe = (mom: string, angle: string) => parAngle.get(`${mom}::${angle}`);

  const av = avancement(photos, moment);
  const manquants = anglesManquants(photos, moment);

  /* ----------------------------- Capture ----------------------------- */

  function lancerTour() {
    const suivant = manquants[0] || ANGLES[0];
    setEnchainement(true);
    setAngleEnCours(suivant);
  }

  async function capturer(dataUrl: string) {
    const angle = angleEnCours;
    if (!angle) return;
    setBusy(true);
    setErreur(null);
    try {
      await enregistrerPhoto({
        dossierId: dossier.id,
        moment,
        angle: angle.code,
        dataUrl,
        ancienne: photoDe(moment, angle.code) || null,
      });
      const { photos: maj } = await chargerPhotos(dossier.id);
      setPhotos(maj);

      // Mode « tour du véhicule » : on enchaîne sur l'angle suivant.
      if (enchainement) {
        const restants = anglesManquants(maj, moment);
        if (restants.length > 0) {
          setAngleEnCours(restants[0]);
          setBusy(false);
          return;
        }
        setEnchainement(false);
      }
      setAngleEnCours(null);
    } catch (err) {
      setErreur(messageErreur(err, "Photo non enregistrée (migration v47 exécutée ?)."));
      setAngleEnCours(null);
      setEnchainement(false);
    }
    setBusy(false);
  }

  // Repli quand la caméra intégrée n'est pas disponible (PC sans webcam).
  async function fichierChoisi(f: File | null) {
    if (!f || !angleEnCours) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(f);
    });
    await capturer(dataUrl);
    if (inputRef.current) inputRef.current.value = "";
  }

  function ouvrirCapture(angle: Angle) {
    setErreur(null);
    setAngleEnCours(angle);
    setEnchainement(false);
    const cameraDispo =
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function";
    if (!cameraDispo) {
      // Laisse le temps au state de se poser avant d'ouvrir le sélecteur.
      setTimeout(() => inputRef.current?.click(), 0);
    }
  }

  async function retirer(p: PhotoEtat) {
    if (!confirm(`Supprimer la photo « ${labelAngle(p.angle)} » ?`)) return;
    try {
      await supprimerPhoto(p);
      setPhotos((prev) => prev.filter((x) => x.id !== p.id));
    } catch (err) {
      setErreur(messageErreur(err, "Suppression impossible."));
    }
  }

  async function planche() {
    setPdfEnCours(true);
    setErreur(null);
    try {
      await genererPlanchePhotos(dossier, photos);
    } catch (err) {
      setErreur(messageErreur(err, "Planche photo impossible à générer."));
    }
    setPdfEnCours(false);
  }

  const cameraDispo =
    typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";

  /* ------------------------------ Rendu ------------------------------ */

  const vignette = (mom: string, angle: Angle) => {
    const p = photoDe(mom, angle.code);
    return (
      <div key={`${mom}-${angle.code}`} className="relative">
        {p ? (
          <button
            type="button"
            onClick={() => ouvrirCapture(angle)}
            className="carte-liste block w-full overflow-hidden p-0"
            title={`${labelAngle(angle.code)} — ${formatDateTime(p.prise_le)} (cliquer pour reprendre)`}
          >
            {urls[p.id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[p.id]} alt={labelAngle(angle.code)} className="h-24 w-full object-cover sm:h-28" />
            ) : (
              <div className="skeleton h-24 w-full sm:h-28" />
            )}
            <span className="block truncate px-2 py-1 text-[10px] text-white/70">
              {angle.label}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => ouvrirCapture(angle)}
            className="flex h-[7.6rem] w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-white/20 px-2 text-center transition hover:border-accent-pink hover:bg-white/5 sm:h-[8.6rem]"
          >
            <span className="text-xl" aria-hidden>
              📷
            </span>
            <span className="mt-1 text-[11px] font-medium text-white/70">{angle.label}</span>
            <span className="mt-0.5 text-[10px] text-white/35">
              {angle.obligatoire ? "à prendre" : "facultatif"}
            </span>
          </button>
        )}
        {p && (
          <button
            onClick={() => retirer(p)}
            className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white/80 hover:text-rose-300"
            title="Supprimer cette photo"
          >
            ×
          </button>
        )}
      </div>
    );
  };

  return (
    <section className="glass-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={basculerPliage} className="flex min-w-0 items-center gap-2 text-left">
          <span className={`shrink-0 text-white/40 transition-transform ${plie ? "" : "rotate-90"}`} aria-hidden>
            ▸
          </span>
          <h2 className="titre-bloc">
            État du véhicule en photos
            <span className={`ml-2 ${serieComplete(photos, "entree") ? "badge badge-ok" : "badge badge-warn"}`}>
              entrée {avancement(photos, "entree").faites}/{avancement(photos, "entree").total}
            </span>
            {photos.some((p) => p.moment === "sortie") && (
              <span className={`ml-1.5 ${serieComplete(photos, "sortie") ? "badge badge-ok" : "badge badge-warn"}`}>
                sortie {avancement(photos, "sortie").faites}/{avancement(photos, "sortie").total}
              </span>
            )}
          </h2>
        </button>
        {!plie && (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={lancerTour} className="btn-primary btn-compact" disabled={busy}>
              📷 Faire le tour du véhicule
            </button>
            {photos.length > 0 && (
              <button onClick={planche} disabled={pdfEnCours} className="btn-ghost btn-compact">
                {pdfEnCours ? "PDF…" : "Planche PDF"}
              </button>
            )}
          </div>
        )}
      </div>

      {!plie && (
        <div className="mt-3">
          {!dispo ? (
            <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              Photos d&apos;état indisponibles : exécutez la migration
              <code className="mx-1 rounded bg-black/30 px-1">migration_v47.sql</code>.
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="segment">
                  {MOMENTS.map((m) => (
                    <button
                      key={m.code}
                      onClick={() => setMoment(m.code)}
                      className={`segment-btn ${moment === m.code ? "actif" : ""}`}
                    >
                      {m.icone} {m.label}
                      <span className="ml-1 opacity-70">
                        {avancement(photos, m.code).faites}/{avancement(photos, m.code).total}
                      </span>
                    </button>
                  ))}
                </div>
                {photos.some((p) => p.moment === "sortie") && (
                  <label className="flex items-center gap-2 text-xs text-white/60">
                    <input
                      type="checkbox"
                      checked={comparer}
                      onChange={(e) => setComparer(e.target.checked)}
                      className="h-4 w-4 accent-emerald-500"
                    />
                    Comparer entrée / sortie
                  </label>
                )}
              </div>

              {av.faites < av.total && (
                <p className="mb-3 rounded-lg border-2 border-white/10 bg-white/5 px-3 py-2 text-xs text-white/65">
                  Il manque {av.total - av.faites} photo{av.total - av.faites > 1 ? "s" : ""} sur la
                  série d&apos;{moment === "entree" ? "entrée" : "sortie"} :{" "}
                  {manquants.map((a) => a.label).join(", ")}.
                </p>
              )}

              {comparer ? (
                <div className="space-y-2">
                  {ANGLES.filter((a) => photoDe("entree", a.code) || photoDe("sortie", a.code)).map((a) => (
                    <div key={a.code} className="glass-soft rounded-lg p-2">
                      <p className="mb-1.5 text-xs font-semibold text-white/70">{a.label}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {["entree", "sortie"].map((m) => {
                          const p = photoDe(m, a.code);
                          return (
                            <div key={m}>
                              <p className="mb-1 text-[10px] uppercase tracking-wider text-white/40">
                                {m === "entree" ? "Entrée" : "Sortie"}
                              </p>
                              {p && urls[p.id] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={urls[p.id]}
                                  alt={`${a.label} ${m}`}
                                  className="h-28 w-full rounded object-cover sm:h-36"
                                />
                              ) : (
                                <div className="flex h-28 w-full items-center justify-center rounded border-2 border-dashed border-white/15 text-[11px] text-white/35 sm:h-36">
                                  non prise
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {ANGLES.map((a) => vignette(moment, a))}
                </div>
              )}

              <p className="mt-3 text-[11px] text-white/40">
                Chaque photo est horodatée et conservée avec le dossier. La série est jointe
                automatiquement au PV de restitution : c&apos;est votre preuve en cas de « cette
                rayure y était déjà ».
              </p>
            </>
          )}

          {erreur && (
            <div className="mt-2 rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
              {erreur}
            </div>
          )}
        </div>
      )}

      {/* Repli fichier (PC sans webcam / refus d'autorisation) */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => fichierChoisi(e.target.files?.[0] || null)}
      />

      {angleEnCours && cameraDispo && (
        <CameraModal
          titre={`${labelAngle(angleEnCours.code)} — ${angleEnCours.consigne}`}
          onCapture={capturer}
          onClose={() => {
            setAngleEnCours(null);
            setEnchainement(false);
          }}
        />
      )}
    </section>
  );
}
