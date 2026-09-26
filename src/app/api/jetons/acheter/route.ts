import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { PACKS_JETONS, TVA_JETONS, ttc } from "@/lib/jetons";
import { creerLienPaiement, ErreurQonto } from "@/lib/qonto";
import { tropDeDemandes } from "@/lib/limiteur";

export const runtime = "nodejs";

// Achat d'un pack de jetons : on enregistre l'achat « en attente » puis on
// crée un lien de paiement Qonto (CB, Apple Pay, PayPal). Les jetons sont
// crédités quand Qonto indique le lien « payé » (route /api/jetons/verifier).

export async function POST(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });
  if (tropDeDemandes("jetons-achat", user.id, 10, 3_600_000)) {
    return NextResponse.json({ error: "Trop de demandes d'achat : réessaie dans un moment." }, { status: 429 });
  }
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante côté serveur." }, { status: 500 });

  let body: { pack?: string; cgvAcceptees?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Corps invalide." }, { status: 400 }); }
  const pack = PACKS_JETONS.find((p) => p.id === body.pack);
  if (!pack) return NextResponse.json({ error: "Pack inconnu." }, { status: 400 });
  if (!body.cgvAcceptees) return NextResponse.json({ error: "Accepte les conditions d'achat des jetons pour continuer." }, { status: 400 });

  const { data: ent } = await admin.from("entreprise").select("nom").eq("owner_id", user.id).limit(1).maybeSingle();
  const { data: achat, error } = await admin
    .from("achats_jetons")
    .insert({ owner_id: user.id, pack: pack.libelle, jetons: pack.jetons, montant_ht: pack.prixHt, montant_ttc: ttc(pack.prixHt) })
    .select("*")
    .single();
  if (error || !achat) return NextResponse.json({ error: "Achats indisponibles : exécute supabase/migration_v90.sql." }, { status: 500 });

  try {
    const lien = await creerLienPaiement({
      titre: `${pack.libelle} — ${pack.jetons} jetons courriers La Poste`,
      description: `My Easy Auto — ${ent?.nom || user.email || "garage"} — réf. ${achat.id.slice(0, 8).toUpperCase()}`,
      prixHt: pack.prixHt,
      tauxTva: TVA_JETONS,
    });
    const { data: maj } = await admin.from("achats_jetons").update({ qonto_link_id: lien.id, qonto_url: lien.url }).eq("id", achat.id).select("*").single();
    return NextResponse.json({ ok: true, achat: maj || achat, url: lien.url });
  } catch (e) {
    const err = e as ErreurQonto;
    await admin.from("achats_jetons").update({ statut: "annule" }).eq("id", achat.id);
    return NextResponse.json({ error: err.message || "Paiement indisponible." }, { status: err.status || 502 });
  }
}
