// QUOTA IA (côté serveur uniquement) : 15 €/mois par utilisateur,
// extensible par des crédits ajoutés manuellement après achat.

import { getAdminClient } from "./supabaseAdmin";

export const QUOTA_MENSUEL_EUR = 15;

// Tarifs approximatifs Claude Sonnet convertis en euros (marge de sécurité)
const EUR_PAR_MTOKEN_ENTREE = 3;
const EUR_PAR_MTOKEN_SORTIE = 15;

export function moisCourant(): string {
  return new Date().toISOString().slice(0, 7); // AAAA-MM
}

export async function etatQuota(ownerId: string): Promise<{
  utilise: number;
  limite: number;
  restant: number;
  depasse: boolean;
}> {
  const admin = getAdminClient();
  if (!admin) return { utilise: 0, limite: QUOTA_MENSUEL_EUR, restant: QUOTA_MENSUEL_EUR, depasse: false };
  const mois = moisCourant();
  const [usageRes, creditsRes] = await Promise.all([
    admin.from("usage_ia").select("cout_eur").eq("owner_id", ownerId).eq("mois", mois).maybeSingle(),
    admin.from("credits_ia").select("montant_eur").eq("owner_id", ownerId).eq("mois", mois),
  ]);
  // FAIL-CLOSED : si la lecture du compteur échoue, on considère le quota
  // atteint plutôt que d'offrir des analyses non comptées.
  if (usageRes.error) {
    console.error("etatQuota: lecture usage_ia impossible", usageRes.error.message);
    return { utilise: QUOTA_MENSUEL_EUR, limite: QUOTA_MENSUEL_EUR, restant: 0, depasse: true };
  }
  const usage = usageRes.data;
  const credits = creditsRes.data;
  const utilise = Number(usage?.cout_eur) || 0;
  const extra = ((credits as { montant_eur: number }[]) || []).reduce(
    (s, c) => s + (Number(c.montant_eur) || 0),
    0
  );
  const limite = QUOTA_MENSUEL_EUR + extra;
  return { utilise, limite, restant: Math.max(0, limite - utilise), depasse: utilise >= limite };
}

export async function enregistrerUsage(
  ownerId: string,
  tokensEntree: number,
  tokensSortie: number
): Promise<void> {
  const admin = getAdminClient();
  if (!admin) return;
  const mois = moisCourant();
  const cout =
    (tokensEntree / 1_000_000) * EUR_PAR_MTOKEN_ENTREE +
    (tokensSortie / 1_000_000) * EUR_PAR_MTOKEN_SORTIE;

  // Incrément ATOMIQUE via la fonction SQL (migration v33) : plus de
  // read-modify-write, deux analyses simultanées ne se marchent plus dessus.
  const { error } = await admin.rpc("incrementer_usage_ia", {
    p_owner: ownerId,
    p_mois: mois,
    p_tokens_entree: tokensEntree,
    p_tokens_sortie: tokensSortie,
    p_cout: cout,
  });
  if (error) {
    // Repli (migration v33 pas encore exécutée) : ancien chemin non atomique.
    console.error("incrementer_usage_ia indisponible, repli non atomique :", error.message);
    const { data: existant } = await admin
      .from("usage_ia")
      .select("id,appels,tokens_entree,tokens_sortie,cout_eur")
      .eq("owner_id", ownerId)
      .eq("mois", mois)
      .maybeSingle();
    if (existant) {
      await admin
        .from("usage_ia")
        .update({
          appels: (existant.appels || 0) + 1,
          tokens_entree: (Number(existant.tokens_entree) || 0) + tokensEntree,
          tokens_sortie: (Number(existant.tokens_sortie) || 0) + tokensSortie,
          cout_eur: Math.round(((Number(existant.cout_eur) || 0) + cout) * 10000) / 10000,
        })
        .eq("id", existant.id);
    } else {
      await admin.from("usage_ia").insert({
        owner_id: ownerId,
        mois,
        appels: 1,
        tokens_entree: tokensEntree,
        tokens_sortie: tokensSortie,
        cout_eur: Math.round(cout * 10000) / 10000,
      });
    }
  }
}

export const MESSAGE_QUOTA_DEPASSE =
  "Quota IA mensuel atteint (15 € d'analyses ce mois-ci). L'analyse automatique reprendra le mois prochain — ou achète des crédits supplémentaires depuis Profil du garage > Assistant IA.";
