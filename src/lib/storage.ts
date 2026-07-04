// Ouverture des fichiers privés (rapports, pièces) via URL SIGNÉE :
// les buckets ne sont plus publics, un lien n'est valable qu'une heure
// et seulement pour un utilisateur connecté.

import { supabase } from "./supabaseClient";

export async function ouvrirFichier(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    alert("Impossible d'ouvrir le fichier (connexion requise, ou migration v17 non exécutée).");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
