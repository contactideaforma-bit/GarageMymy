// Jetons courriers — logique SERVEUR (clé service), v13.28.
import type { SupabaseClient } from "@supabase/supabase-js";
import { statutLienPaiement, qontoConfigure } from "./qonto";

export async function soldeJetons(admin: SupabaseClient, ownerId: string): Promise<number> {
  const { data } = await admin.from("jetons_soldes").select("solde").eq("owner_id", ownerId).maybeSingle();
  return Number(data?.solde || 0);
}

/**
 * Vérifie auprès de Qonto les achats en attente (d'un garage, ou de tous si
 * ownerId est null) et crédite ceux qui sont payés. Idempotent : un achat
 * n'est crédité qu'une fois (fonction SQL jetons_crediter_achat).
 */
export async function verifierAchatsEnAttente(admin: SupabaseClient, ownerId: string | null): Promise<{ credites: number; erreurs: string[] }> {
  if (!qontoConfigure()) return { credites: 0, erreurs: [] };
  const depuis = new Date(Date.now() - 30 * 86400000).toISOString();
  let q = admin.from("achats_jetons").select("id, owner_id, qonto_link_id").eq("statut", "en_attente").gte("created_at", depuis).not("qonto_link_id", "is", null).limit(50);
  if (ownerId) q = q.eq("owner_id", ownerId);
  const { data } = await q;
  let credites = 0;
  const erreurs: string[] = [];
  for (const a of data || []) {
    try {
      const statut = await statutLienPaiement(a.qonto_link_id as string);
      if (statut === "paid") {
        const { data: solde, error } = await admin.rpc("jetons_crediter_achat", { p_achat: a.id });
        if (error) erreurs.push(error.message);
        else if (solde !== null) credites += 1;
      } else if (statut === "expired" || statut === "canceled") {
        await admin.from("achats_jetons").update({ statut: statut === "expired" ? "expire" : "annule", derniere_verif: new Date().toISOString() }).eq("id", a.id).eq("statut", "en_attente");
      } else {
        await admin.from("achats_jetons").update({ derniere_verif: new Date().toISOString() }).eq("id", a.id);
      }
    } catch (e) {
      erreurs.push((e as Error).message);
    }
  }
  return { credites, erreurs };
}
