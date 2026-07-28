// Ouverture des fichiers privés (rapports, pièces) via URL SIGNÉE :
// les buckets ne sont plus publics, un lien n'est valable qu'une heure
// et seulement pour un utilisateur connecté.

import { supabase } from "./supabaseClient";

// Télécharge un fichier privé du Storage et le renvoie en base64
// (pièce jointe d'email : accord de prise en charge, etc.).
// Boucle char par char, PAS de spread sur Uint8Array (TS2802 avec le target actuel).
export async function fichierBase64(bucket: string, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw error || new Error("Fichier introuvable dans le Storage.");
  const bytes = new Uint8Array(await data.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

export async function ouvrirFichier(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    alert("Impossible d'ouvrir le fichier (connexion requise, ou migration v17 non exécutée).");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
