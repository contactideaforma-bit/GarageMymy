import { createClient } from "@supabase/supabase-js";

// Valeurs de repli pour que le build ne plante pas si les variables
// d'environnement ne sont pas encore configurées. Les appels réels
// échoueront tant que .env.local n'est pas renseigné.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "public-anon-key-placeholder";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
