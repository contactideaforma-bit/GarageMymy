import { isSupabaseConfigured } from "@/lib/supabaseClient";

export default function ConfigBanner() {
  if (isSupabaseConfigured) return null;
  return (
    <div className="mb-6 rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
      Supabase n&apos;est pas encore configuré. Crée un fichier{" "}
      <code className="font-mono">.env.local</code> à partir de{" "}
      <code className="font-mono">.env.local.example</code> avec tes clés, puis
      relance l&apos;application.
    </div>
  );
}
