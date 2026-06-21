import { isSupabaseConfigured } from "@/lib/supabaseClient";

export default function ConfigBanner() {
  if (isSupabaseConfigured) return null;
  return (
    <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      ⚠️ Supabase n&apos;est pas encore configuré. Crée un fichier{" "}
      <code className="font-mono">.env.local</code> à partir de{" "}
      <code className="font-mono">.env.local.example</code> avec tes clés, puis
      relance l&apos;application.
    </div>
  );
}
