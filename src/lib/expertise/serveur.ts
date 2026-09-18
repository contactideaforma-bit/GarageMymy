// Socle commun des routes /api/expert/* (mode expert, v13.5) :
// connexion + compte autorisé + quota IA + client Anthropic.

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { aAccesExpert } from "@/lib/expertise/acces";

export async function preparerAppelIA(req: Request): Promise<
  | { ok: true; userId: string; client: Anthropic; model: string; enregistrer: (entree: number, sortie: number) => Promise<void> }
  | { ok: false; reponse: NextResponse }
> {
  const { utilisateurDepuisRequete, REPONSE_401 } = await import("@/lib/apiAuth");
  const user = await utilisateurDepuisRequete(req);
  if (!user) return { ok: false, reponse: NextResponse.json(REPONSE_401, { status: 401 }) };
  if (!aAccesExpert(user.email)) {
    return { ok: false, reponse: NextResponse.json({ error: "Compte non autorisé sur l'espace expert." }, { status: 403 }) };
  }
  const { etatQuota, enregistrerUsage, MESSAGE_QUOTA_DEPASSE } = await import("@/lib/quotaIA");
  const quota = await etatQuota(user.id);
  if (quota.depasse) return { ok: false, reponse: NextResponse.json({ error: MESSAGE_QUOTA_DEPASSE }, { status: 402 }) };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, reponse: NextResponse.json({ error: "Clé ANTHROPIC_API_KEY manquante (.env.local et Vercel)." }, { status: 500 }) };
  }
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  return { ok: true, userId: user.id, client, model, enregistrer: (e, s) => enregistrerUsage(user.id, e, s) };
}

/** Extrait le premier objet JSON d'une réponse texte. */
export function jsonDepuisTexte(raw: string): unknown {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export const nombre = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
export const texte = (v: unknown, max = 200): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t.slice(0, max) : null;
};
