// ============================================================
//  PLANCHE PHOTOS (v47)
//
//  Met les photos d'état sur des pages A4, 4 par page, chacune légendée
//  avec son angle et son HORODATAGE. C'est l'horodatage qui fait la
//  valeur du document : il prouve l'état du véhicule à un instant donné.
//
//  Deux usages :
//    · document autonome (« Planche PDF » depuis la fiche dossier) ;
//    · annexe automatique du PV de restitution (cf. lib/pdf.ts).
// ============================================================

import jsPDF from "jspdf";
import { supabase } from "./supabaseClient";
import { Dossier, PhotoEtat } from "./types";
import { ANGLES, labelAngle } from "./photosEtat";
import { formatDateTime } from "./format";

/** Télécharge une photo du bucket privé et la convertit en dataURL. */
async function photoDataUrl(path: string): Promise<string | null> {
  try {
    const { data } = await supabase.storage.from("pieces").download(path);
    if (!data) return null;
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(data);
    });
  } catch {
    return null;
  }
}

/** Dimensions réelles d'une image, pour garder ses proportions. */
function dimensions(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve({ w: im.width, h: im.height });
    im.onerror = () => resolve({ w: 4, h: 3 });
    im.src = dataUrl;
  });
}

/** Ordre d'affichage : celui du tour du véhicule, pas celui de la base. */
function trier(photos: PhotoEtat[]): PhotoEtat[] {
  const rang = new Map(ANGLES.map((a, i) => [a.code, i]));
  return [...photos].sort((a, b) => (rang.get(a.angle) ?? 99) - (rang.get(b.angle) ?? 99));
}

const M = 14; // marge

/**
 * Ajoute les planches au PDF fourni. Ne fait RIEN s'il n'y a aucune photo
 * (le PV de restitution reste alors identique à avant).
 */
export async function ajouterPlanchesPhotos(
  pdf: jsPDF,
  dossier: Dossier,
  photos: PhotoEtat[],
  options: { nouvellePage?: boolean } = {}
): Promise<void> {
  if (photos.length === 0) return;

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const colW = (pageW - M * 2 - 6) / 2;
  const caseH = 62; // photo + légende

  const identite = [dossier.marque_modele, dossier.immatriculation, dossier.client_nom]
    .filter(Boolean)
    .join(" · ");

  let premiere = options.nouvellePage !== false;

  for (const moment of ["entree", "sortie"]) {
    const lot = trier(photos.filter((p) => p.moment === moment));
    if (lot.length === 0) continue;

    if (premiere) {
      pdf.addPage();
      premiere = false;
    } else {
      pdf.addPage();
    }
    let y = M;

    // En-tête de la planche
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(
      `ÉTAT DU VÉHICULE — ${moment === "entree" ? "À L'ENTRÉE" : "À LA SORTIE"}`,
      M,
      y + 4
    );
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(90);
    pdf.text(identite || "—", M, y + 10);
    pdf.setTextColor(0);
    y += 16;

    let col = 0;
    for (const p of lot) {
      // Nouvelle page quand la case ne tient plus.
      if (y + caseH > pageH - M) {
        pdf.addPage();
        y = M;
        col = 0;
      }
      const x = M + col * (colW + 6);
      const dataUrl = await photoDataUrl(p.path);

      if (dataUrl) {
        const { w, h } = await dimensions(dataUrl);
        const maxH = caseH - 12;
        const ratio = Math.min(colW / w, maxH / h);
        const largeur = w * ratio;
        const hauteur = h * ratio;
        try {
          pdf.addImage(
            dataUrl,
            dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG",
            x + (colW - largeur) / 2,
            y,
            largeur,
            hauteur
          );
        } catch {
          /* image illisible : on laisse la case vide plutôt que d'échouer */
        }
      }

      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.text(labelAngle(p.angle), x, y + caseH - 6);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(110);
      pdf.text(formatDateTime(p.prise_le), x, y + caseH - 2);
      pdf.setTextColor(0);

      col += 1;
      if (col === 2) {
        col = 0;
        y += caseH + 4;
      }
    }
  }
}

/** Lecture des photos d'un dossier, tolérante si la table n'existe pas. */
export async function photosDuDossier(dossierId: string): Promise<PhotoEtat[]> {
  const { data, error } = await supabase
    .from("photos_etat")
    .select("*")
    .eq("dossier_id", dossierId)
    .order("prise_le", { ascending: true });
  if (error) return [];
  return (data as PhotoEtat[]) || [];
}

/** Document autonome « planche photos », téléchargé directement. */
export async function genererPlanchePhotos(dossier: Dossier, photos: PhotoEtat[]): Promise<void> {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  // jsPDF crée déjà une première page : la planche l'utilise.
  pdf.deletePage(1);
  await ajouterPlanchesPhotos(pdf, dossier, photos);
  if (pdf.getNumberOfPages() === 0) pdf.addPage();
  pdf.save(
    `etat-vehicule-${dossier.immatriculation || dossier.numero_sinistre || "dossier"}.pdf`
  );
}
