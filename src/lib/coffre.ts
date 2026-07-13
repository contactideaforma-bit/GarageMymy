// COFFRE — chiffrement/déchiffrement des secrets (côté SERVEUR uniquement).
// Utilisé pour les mots de passe des espaces extranet experts.
//
// Algorithme : AES-256-GCM (chiffrement authentifié — toute altération du
// texte chiffré fait échouer le déchiffrement).
// Clé : dérivée (SHA-256) de EXTRANET_SECRET si définie dans l'env,
// sinon de SUPABASE_SERVICE_ROLE_KEY (déjà secrète et présente côté serveur).
// ⚠️ Si la clé change (rotation service role sans EXTRANET_SECRET), les
// mots de passe déjà stockés deviennent illisibles → il faudra les resaisir.
// Recommandé : définir EXTRANET_SECRET (chaîne aléatoire longue) et ne plus y toucher.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function cle(): Buffer | null {
  const secret = process.env.EXTRANET_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  return createHash("sha256").update(secret).digest(); // 32 octets = AES-256
}

/** Chiffre un texte en clair → chaîne "v1.<iv>.<tag>.<données>" (base64). */
export function chiffrer(clair: string): string | null {
  const k = cle();
  if (!k) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const chiffre = Buffer.concat([cipher.update(clair, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${chiffre.toString("base64")}`;
}

/** Déchiffre une chaîne produite par chiffrer(). Renvoie null si clé absente ou données altérées. */
export function dechiffrer(payload: string): string | null {
  const k = cle();
  if (!k) return null;
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const donnees = Buffer.from(parts[3], "base64");
    const decipher = createDecipheriv("aes-256-gcm", k, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(donnees), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
