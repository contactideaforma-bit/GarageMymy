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

/* ====================================================================
   CLOISONNEMENT DU STOCKAGE PAR GARAGE (v44)

   Jusqu'ici, les fichiers étaient déposés à la racine des buckets
   (`1723..._rapport.pdf`) : n'importe quel compte CONNECTÉ pouvait, en
   devinant un nom, lire le rapport d'un autre garage. Désormais chaque
   fichier vit dans un dossier au nom du compte :

       <owner_id>/<chemin d'avant>

   et les policies Storage (migration v44) n'autorisent QUE ce dossier.

   ⚠️ Les fichiers déposés AVANT la v44 gardent leur ancien chemin : les
   policies acceptent aussi les objets dont le PROPRIÉTAIRE Storage est le
   compte connecté, donc rien n'est perdu. N'écris plus jamais un chemin
   sans passer par `cheminProprietaire()`.
==================================================================== */

let idCache: string | null = null;

/** Identifiant du compte connecté (mis en cache pour la session). */
export async function idProprietaire(): Promise<string> {
  if (idCache) return idCache;
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("Session expirée : reconnecte-toi puis réessaie.");
  idCache = id;
  return id;
}

/** `photo.pdf` → `<owner_id>/photo.pdf`. À utiliser pour TOUT dépôt. */
export async function cheminProprietaire(suffixe: string): Promise<string> {
  const uid = await idProprietaire();
  return `${uid}/${suffixe.replace(/^\/+/, "")}`;
}

/** Le chemin appartient-il déjà à un dossier de compte ? (anciens fichiers) */
export function cheminCloisonne(path: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i.test(path);
}

/**
 * Dépose un fichier dans le dossier du garage et renvoie le chemin COMPLET
 * (celui à stocker en base).
 */
export async function deposerFichier(
  bucket: string,
  suffixe: string,
  corps: Blob | File,
  options?: { contentType?: string; upsert?: boolean }
): Promise<string> {
  const path = await cheminProprietaire(suffixe);
  const { error } = await supabase.storage.from(bucket).upload(path, corps, {
    contentType: options?.contentType,
    upsert: options?.upsert ?? false,
  });
  if (error) throw error;
  return path;
}
