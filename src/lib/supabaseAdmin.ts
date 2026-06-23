import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Client Supabase « admin » réservé au SERVEUR (routes API).
// Utilise la clé SERVICE ROLE qui contourne RLS — ne JAMAIS l'importer
// dans un composant client. La clé n'a pas de préfixe NEXT_PUBLIC.
export function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
