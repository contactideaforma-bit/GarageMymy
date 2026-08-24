// ============================================================
//  PHOTOS D'ÉTAT DU VÉHICULE (v47)
//
//  Un tour du véhicule en 8 clichés, toujours les mêmes, dans le même
//  ordre — à l'ENTRÉE puis à la SORTIE. C'est cette régularité qui rend
//  la série opposable : on compare deux fois le même angle.
//
//  Trois vues facultatives complètent la série (compteur, intérieur,
//  zone du sinistre) : utiles, mais jamais bloquantes.
// ============================================================

import { supabase } from "./supabaseClient";
import { deposerFichier } from "./storage";
import { PhotoEtat } from "./types";

export const MOMENTS = [
  { code: "entree", label: "À l'entrée", court: "Entrée", icone: "⬅️" },
  { code: "sortie", label: "À la sortie", court: "Sortie", icone: "➡️" },
] as const;

export type Angle = {
  code: string;
  label: string;
  /** Consigne affichée pendant la prise de vue. */
  consigne: string;
  obligatoire: boolean;
};

export const ANGLES: Angle[] = [
  { code: "av_g", label: "3/4 avant gauche", consigne: "Reculez de 3 pas, cadrez tout le véhicule en biais.", obligatoire: true },
  { code: "av", label: "Face avant", consigne: "Bien en face, pare-chocs et calandre entiers.", obligatoire: true },
  { code: "av_d", label: "3/4 avant droit", consigne: "Même angle que le 3/4 avant gauche, de l'autre côté.", obligatoire: true },
  { code: "lat_d", label: "Côté droit", consigne: "Le flanc complet, des roues au toit.", obligatoire: true },
  { code: "ar_d", label: "3/4 arrière droit", consigne: "En biais, hayon et aile arrière visibles.", obligatoire: true },
  { code: "ar", label: "Face arrière", consigne: "Bien en face, plaque d'immatriculation lisible.", obligatoire: true },
  { code: "ar_g", label: "3/4 arrière gauche", consigne: "Symétrique du 3/4 arrière droit.", obligatoire: true },
  { code: "lat_g", label: "Côté gauche", consigne: "Le flanc complet, des roues au toit.", obligatoire: true },
  { code: "compteur", label: "Compteur", consigne: "Contact mis, kilométrage net et lisible.", obligatoire: false },
  { code: "interieur", label: "Intérieur", consigne: "Habitacle et sièges avant.", obligatoire: false },
  { code: "degat", label: "Zone du sinistre", consigne: "Le dégât de près, puis d'un peu plus loin.", obligatoire: false },
];

export function labelAngle(code: string): string {
  return ANGLES.find((a) => a.code === code)?.label || code;
}

export function labelMoment(code: string): string {
  return MOMENTS.find((m) => m.code === code)?.label || code;
}

/** Angles obligatoires manquants pour un moment donné. */
export function anglesManquants(photos: PhotoEtat[], moment: string): Angle[] {
  const pris = new Set(photos.filter((p) => p.moment === moment).map((p) => p.angle));
  return ANGLES.filter((a) => a.obligatoire && !pris.has(a.code));
}

/** « 6/8 » — avancement de la série obligatoire. */
export function avancement(photos: PhotoEtat[], moment: string): { faites: number; total: number } {
  const total = ANGLES.filter((a) => a.obligatoire).length;
  return { faites: total - anglesManquants(photos, moment).length, total };
}

export function serieComplete(photos: PhotoEtat[], moment: string): boolean {
  return anglesManquants(photos, moment).length === 0;
}

/* ------------------------------ Lecture ------------------------------ */

export async function chargerPhotos(
  dossierId: string
): Promise<{ photos: PhotoEtat[]; dispo: boolean }> {
  const { data, error } = await supabase
    .from("photos_etat")
    .select("*")
    .eq("dossier_id", dossierId)
    .order("prise_le", { ascending: true });
  // Migration v47 non exécutée : le panneau se met en sommeil.
  if (error) return { photos: [], dispo: false };
  return { photos: (data as PhotoEtat[]) || [], dispo: true };
}

/** Lien d'affichage (1 h) — le bucket est privé. */
export async function urlPhoto(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("pieces").createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

/* ------------------------------ Écriture ----------------------------- */

/** dataURL (capture caméra) → Blob JPEG, redimensionné pour rester léger. */
export async function preparerImage(dataUrl: string, maxDim = 1600): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = dataUrl;
  });
  const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * ratio);
  canvas.height = Math.round(img.height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Impossible de préparer l'image.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82)
  );
  if (!blob) throw new Error("Impossible de préparer l'image.");
  return blob;
}

/**
 * Enregistre une photo. Une prise de vue REMPLACE la précédente du même
 * angle et du même moment : la série reste propre, on ne se retrouve pas
 * avec quatre versions de l'aile avant droite.
 */
export async function enregistrerPhoto(args: {
  dossierId: string;
  moment: string;
  angle: string;
  dataUrl: string;
  kilometrage?: number | null;
  commentaire?: string | null;
  ancienne?: PhotoEtat | null;
}): Promise<PhotoEtat> {
  const blob = await preparerImage(args.dataUrl);
  const path = await deposerFichier(
    "pieces",
    `etat/${args.dossierId}/${args.moment}-${args.angle}-${Date.now()}.jpg`,
    blob,
    { contentType: "image/jpeg" }
  );

  const { data, error } = await supabase
    .from("photos_etat")
    .insert({
      dossier_id: args.dossierId,
      moment: args.moment,
      angle: args.angle,
      path,
      kilometrage: args.kilometrage ?? null,
      commentaire: args.commentaire || null,
      prise_le: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;

  // Nettoyage de la version précédente (fichier + ligne).
  if (args.ancienne) {
    await supabase.storage.from("pieces").remove([args.ancienne.path]);
    await supabase.from("photos_etat").delete().eq("id", args.ancienne.id);
  }
  return data as PhotoEtat;
}

export async function supprimerPhoto(photo: PhotoEtat): Promise<void> {
  const { error } = await supabase.from("photos_etat").delete().eq("id", photo.id);
  if (error) throw error;
  await supabase.storage.from("pieces").remove([photo.path]);
}
