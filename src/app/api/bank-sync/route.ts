import { NextResponse } from "next/server";

// Connexion bancaire temps réel via Enable Banking (agrégateur DSP2).
// STRUCTURE PRÊTE : la table bank_connections (migration v10) stockera le
// consentement, et cette route fera la synchronisation des transactions
// (insertion dans bank_transactions avec source='api', dédup par hash).
// Activation prévue une fois le contrat Enable Banking signé (sandbox +
// "restricted production" possibles avant, sur les comptes du garage).

export const runtime = "nodejs";

function isConfigured(): boolean {
  return Boolean(process.env.ENABLE_BANKING_APP_ID && process.env.ENABLE_BANKING_PRIVATE_KEY);
}

export async function GET() {
  return NextResponse.json({ configured: isConfigured() });
}

export async function POST() {
  if (!isConfigured()) {
    return NextResponse.json(
      {
        error:
          "Connexion bancaire non configurée. En attendant, importe ton relevé CSV : le rapprochement est identique. " +
          "(Pour activer : compte Enable Banking, clés ENABLE_BANKING_APP_ID / ENABLE_BANKING_PRIVATE_KEY dans .env.local.)",
      },
      { status: 501 }
    );
  }
  // TODO (activation Enable Banking) : JWT RS256 → création de session de
  // consentement → récupération des transactions → upsert bank_transactions.
  return NextResponse.json(
    { error: "Synchronisation Enable Banking pas encore activée sur ce déploiement." },
    { status: 501 }
  );
}
