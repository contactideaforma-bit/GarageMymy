"use client";

/* ====================================================================
 *  PHOTOS D'EXPERTISE (v13.5) — tour du véhicule guidé
 *  Grille des angles (face AV, 3/4 AVG, latéral G… + plaque, compteur,
 *  VIN) : un clic sur une case → appareil photo dans l'appli (caméra
 *  arrière) ou galerie du téléphone. Plusieurs photos par zone possibles
 *  (dommages en gros plan). Légende, ouverture plein écran, suppression.
 * ==================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import Icone from "@/components/expert/Icone";
import CameraModal from "@/components/CameraModal";
import ModalShell from "@/components/ModalShell";
import { Bloc, Erreur } from "@/components/expert/ui";
import { ajouterPhoto, chargerPhotos, lireDataUrl, majPhoto, supprimerPhoto, urlFichierExpert } from "@/lib/expertise/data";
import { PhotoExpert, ZONES_PHOTO, ZonePhoto, labelZone } from "@/lib/expertise/types";
import { formatDateTime, messageErreur } from "@/lib/format";

export default function PhotosExpertPanel({ dossierId, onChange }: { dossierId: string; onChange?: (photos: PhotoExpert[]) => void }) {
  const [photos, setPhotos] = useState<PhotoExpert[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [zoneEnCours, setZoneEnCours] = useState<ZonePhoto | null>(null); // galerie
  const [cameraZone, setCameraZone] = useState<ZonePhoto | null>(null);
  const [choixSource, setChoixSource] = useState<ZonePhoto | null>(null);
  const [apercu, setApercu] = useState<PhotoExpert | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const fichier = useRef<HTMLInputElement>(null);

  const recharger = useCallback(async () => {
    const p = await chargerPhotos(dossierId);
    setPhotos(p);
    onChange?.(p);
    const entries = await Promise.all(p.map(async (ph) => [ph.id, (await urlFichierExpert(ph.path)) || ""] as const));
    setUrls(Object.fromEntries(entries));
  }, [dossierId, onChange]);
  useEffect(() => { recharger(); }, [recharger]);

  async function enregistrer(dataUrl: string, zone: ZonePhoto) {
    setEnvoi(true); setErreur(null);
    try {
      await ajouterPhoto({ dossierId, zone, dataUrl });
      await recharger();
    } catch (e) { setErreur(messageErreur(e, "Enregistrement de la photo impossible.")); } finally { setEnvoi(false); }
  }

  async function depuisFichiers(files: FileList | null, zone: ZonePhoto) {
    if (!files?.length) return;
    setEnvoi(true); setErreur(null);
    try {
      for (const f of Array.from(files).slice(0, 12)) {
        const dataUrl = await lireDataUrl(f);
        await ajouterPhoto({ dossierId, zone, dataUrl });
      }
      await recharger();
    } catch (e) { setErreur(messageErreur(e, "Import impossible.")); } finally { setEnvoi(false); }
  }

  const parZone = (z: ZonePhoto) => photos.filter((p) => p.zone === z);
  const groupes: { titre: string; code: "tour" | "identification" | "dommages" }[] = [
    { titre: "Tour du véhicule", code: "tour" },
    { titre: "Identification", code: "identification" },
    { titre: "Dommages en gros plan", code: "dommages" },
  ];

  return (
    <div className="space-y-4">
      <Erreur message={erreur} />
      <input ref={fichier} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { if (zoneEnCours) depuisFichiers(e.target.files, zoneEnCours); e.target.value = ""; }} />

      {groupes.map((g) => (
        <Bloc key={g.code} titre={g.titre} actions={g.code === "tour" ? <span className="text-xs text-white/50">{photos.length} photo(s) · {envoi ? "enregistrement…" : "touche une case pour photographier"}</span> : undefined}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {ZONES_PHOTO.filter((z) => z.groupe === g.code).map((z) => {
              const liste = parZone(z.code);
              const premiere = liste[0];
              return (
                <button key={z.code} type="button" className="al-zone text-left" onClick={() => setChoixSource(z.code)} disabled={envoi}>
                  {premiere && urls[premiere.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls[premiere.id]} alt={z.label} />
                  ) : (
                    <Icone nom="photo" taille={28} className="opacity-40" />
                  )}
                  <span className="al-zone-nom">
                    {z.label}{liste.length > 1 ? ` · ${liste.length}` : ""}
                  </span>
                  {!premiere && <span className="text-[11px] text-white/45">{z.label}</span>}
                </button>
              );
            })}
          </div>
        </Bloc>
      ))}

      {photos.length > 0 && (
        <Bloc titre="Toutes les photos">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {photos.map((p) => (
              <div key={p.id} className="al-zone cursor-pointer" onClick={() => setApercu(p)}>
                {urls[p.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[p.id]} alt={labelZone(p.zone)} />
                ) : <span className="skeleton absolute inset-0" />}
                <span className="al-zone-nom">{labelZone(p.zone)}{p.legende ? ` — ${p.legende}` : ""}</span>
              </div>
            ))}
          </div>
        </Bloc>
      )}

      {choixSource && (
        <ModalShell title={labelZone(choixSource)} onClose={() => setChoixSource(null)} maxWidth="max-w-sm">
          <div className="grid gap-2">
            <button type="button" className="btn-primary w-full" onClick={() => { setCameraZone(choixSource); setChoixSource(null); }}><Icone nom="photo" /> Prendre une photo</button>
            <button type="button" className="btn-ghost w-full" onClick={() => { setZoneEnCours(choixSource); setChoixSource(null); setTimeout(() => fichier.current?.click(), 50); }}><Icone nom="galerie" /> Depuis la galerie / un fichier</button>
            {parZone(choixSource).length > 0 && (
              <button type="button" className="btn-ghost w-full" onClick={() => { setApercu(parZone(choixSource)[0]); setChoixSource(null); }}><Icone nom="oeil" /> Voir les {parZone(choixSource).length} photo(s)</button>
            )}
          </div>
        </ModalShell>
      )}

      {cameraZone && (
        <CameraModal titre={`Photo — ${labelZone(cameraZone)}`} libelleValider="Enregistrer la photo" conseil="Cadre l'élément en entier, recule d'un pas si besoin, puis Capturer." onCapture={(d) => enregistrer(d, cameraZone)} onClose={() => setCameraZone(null)} />
      )}

      {apercu && (
        <ModalShell title={`${labelZone(apercu.zone)} · ${formatDateTime(apercu.prise_le)}`} onClose={() => setApercu(null)} maxWidth="max-w-3xl">
          {urls[apercu.id] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urls[apercu.id]} alt="" className="w-full rounded-xl" />
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select className="field-input" value={apercu.zone} onChange={async (e) => { await majPhoto(apercu.id, { zone: e.target.value as ZonePhoto }); setApercu({ ...apercu, zone: e.target.value as ZonePhoto }); recharger(); }}>
              {ZONES_PHOTO.map((z) => <option key={z.code} value={z.code}>{z.label}</option>)}
            </select>
            <input className="field-input sm:col-span-2" placeholder="Légende (ex. enfoncement aile AVG, 15 cm)" defaultValue={apercu.legende || ""}
              onBlur={async (e) => { await majPhoto(apercu.id, { legende: e.target.value || null }); recharger(); }} />
          </div>
          <div className="flex justify-between gap-2">
            <button type="button" className="btn-danger btn-compact" onClick={async () => { if (confirm("Supprimer cette photo ?")) { await supprimerPhoto(apercu); setApercu(null); recharger(); } }}>Supprimer</button>
            <div className="flex gap-2">
              {(() => { const liste = photos; const i = liste.findIndex((p) => p.id === apercu.id); return (
                <>
                  <button type="button" className="btn-ghost btn-compact" disabled={i <= 0} onClick={() => setApercu(liste[i - 1])}><Icone nom="gauche" /> Préc.</button>
                  <button type="button" className="btn-ghost btn-compact" disabled={i >= liste.length - 1} onClick={() => setApercu(liste[i + 1])}>Suiv. <Icone nom="droite" /></button>
                </>
              ); })()}
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
