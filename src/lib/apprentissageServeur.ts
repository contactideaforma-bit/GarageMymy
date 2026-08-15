// MÉMOIRE DE L'ANALYSE — lecture côté SERVEUR (route d'extraction).
// Utilise la clé SERVICE ROLE : à n'importer que dans une route API.

import { getAdminClient } from "./supabaseAdmin";
import { IaRegle } from "./types";

/** Règles ACTIVES du garage, les plus fréquentes d'abord. */
export async function chargerReglesServeur(ownerId: string): Promise<IaRegle[]> {
  const admin = getAdminClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("ia_regles")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("actif", true)
    .order("occurrences", { ascending: false })
    .limit(60);
  // Table absente (migration v40 pas encore passée) : on analyse sans mémoire.
  if (error) return [];
  return (data || []) as IaRegle[];
}
