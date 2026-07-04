// Vérification d'identité pour les routes API (côté serveur).
// Le client envoie son jeton Supabase (Authorization: Bearer <access_token>) ;
// on le valide via la clé service role. Sans jeton valide → 401.

import { getAdminClient } from "./supabaseAdmin";

export async function utilisateurDepuisRequete(
  req: Request
): Promise<{ id: string; email: string | null } | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  const admin = getAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export const REPONSE_401 = {
  error: "Connexion requise. Reconnecte-toi puis réessaie.",
};
