// ============================================================
//  ASSISTANCE — côté SERVEUR (v43)
//
//  Identifie l'éditeur (compte admin) et résout l'identité des garages.
//  ⚠️ Ne JAMAIS importer ce fichier dans un composant client : il utilise
//  la clé service role.
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Comptes autorisés à voir TOUS les tickets.
 * `ADMIN_EMAILS` (serveur) prime ; repli sur la variable publique puis sur
 * l'adresse de l'éditeur.
 */
export function emailsAdminServeur(): string[] {
  const brut =
    process.env.ADMIN_EMAILS ||
    process.env.NEXT_PUBLIC_ADMIN_EMAILS ||
    "contact.ideaforma@gmail.com";
  return brut
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function estAdminServeur(email?: string | null): boolean {
  if (!email) return false;
  return emailsAdminServeur().includes(email.toLowerCase());
}

export type Compte = { id: string; email: string };

/** Tous les comptes Auth (max 1000) — sert à résoudre owner_id → email. */
export async function tousLesComptes(admin: SupabaseClient): Promise<Compte[]> {
  try {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error || !data) return [];
    return data.users.map((u) => ({ id: u.id, email: u.email || "" }));
  } catch {
    return [];
  }
}

/** Les comptes de l'éditeur (pour lui envoyer les notifications push). */
export async function comptesAdmin(admin: SupabaseClient): Promise<Compte[]> {
  const liste = emailsAdminServeur();
  return (await tousLesComptes(admin)).filter((c) =>
    liste.includes((c.email || "").toLowerCase())
  );
}

/** owner_id → email du compte. */
export async function annuaireComptes(admin: SupabaseClient): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (const c of await tousLesComptes(admin)) m.set(c.id, c.email);
  return m;
}

/** Petit habillage HTML commun aux emails d'assistance. */
export function emailHtml(titre: string, lignes: string[], corps?: string): string {
  const echapper = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const items = lignes
    .map(
      (l) =>
        `<tr><td style="padding:4px 0;color:#4b5563;font-size:13px">${echapper(l)}</td></tr>`
    )
    .join("");
  const bloc = corps
    ? `<div style="margin-top:16px;padding:14px 16px;background:#f6f7fb;border-left:3px solid #7c3aed;border-radius:6px;white-space:pre-wrap;font-size:14px;color:#1f2937">${echapper(
        corps
      )}</div>`
    : "";
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:620px;margin:auto;padding:24px;color:#1f2937">
  <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#7c3aed;font-weight:700">My Easy Auto — assistance</div>
  <h2 style="margin:8px 0 14px;font-size:19px;color:#111827">${echapper(titre)}</h2>
  <table style="width:100%;border-collapse:collapse">${items}</table>
  ${bloc}
  <p style="margin-top:22px;font-size:12px;color:#9ca3af">Message automatique — My Easy Auto</p>
</div>`;
}
