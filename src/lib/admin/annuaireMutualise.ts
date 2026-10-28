// ============================================================
//  BASE MUTUALISÉE EXPERTS & ASSUREURS (v13.51) — logique partagée
//  client / serveur : normalisation, clé de dédoublonnage, fusion.
//
//  Principe : les tables `experts` et `assureurs` de CHAQUE garage sont
//  lues par le serveur (service role) ; les contacts identiques (même
//  e-mail, sinon même téléphone, sinon même nom + ville) sont fusionnés
//  en une ligne, le champ le mieux rempli l'emporte, et on compte le
//  nombre de garages qui connaissent le contact. Les clients ne sont
//  JAMAIS lus : seuls les contacts professionnels sont mutualisés.
// ============================================================

import type { Assureur, Expert } from "@/lib/types";

export type MutualiseExpert = {
  id: string;
  created_at: string;
  maj_le: string;
  cle: string;
  cabinet: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  tel: string | null;
  email: string | null;
  expert_nom: string | null;
  expert_tel: string | null;
  expert_email: string | null;
  notes: string | null;
  garages: number;
  verifie: boolean;
  partage: boolean;
};

export type MutualiseAssureur = {
  id: string;
  created_at: string;
  maj_le: string;
  cle: string;
  nom: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  tel: string | null;
  email: string | null;
  siren: string | null;
  notes: string | null;
  garages: number;
  verifie: boolean;
  partage: boolean;
};

export function normaliserTexte(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
export function normaliserTel(s: string | null | undefined): string {
  let t = String(s ?? "").replace(/[^\d+]/g, "");
  if (t.startsWith("+33")) t = "0" + t.slice(3);
  if (t.startsWith("0033")) t = "0" + t.slice(4);
  return t.length >= 9 ? t : "";
}
export function normaliserEmail(s: string | null | undefined): string {
  const e = String(s ?? "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : "";
}

/** Clé de dédoublonnage d'un cabinet / assureur : e-mail > téléphone > nom + ville. */
function cleContact(nom: string | null | undefined, email: string | null | undefined, tel: string | null | undefined, ville: string | null | undefined): string {
  const e = normaliserEmail(email);
  if (e) return `e:${e}`;
  const t = normaliserTel(tel);
  if (t) return `t:${t}`;
  const n = normaliserTexte(nom);
  if (n) return `n:${n}|${normaliserTexte(ville)}`;
  return "";
}

export function cleExpert(e: Pick<Expert, "cabinet" | "email" | "tel" | "ville" | "expert_email" | "expert_nom">): string {
  // Un cabinet se reconnaît d'abord à son domaine e-mail / téléphone de
  // standard ; à défaut, l'expert lui-même (e-mail ou nom).
  return (
    cleContact(e.cabinet, e.email, e.tel, e.ville) ||
    (normaliserEmail(e.expert_email) ? `x:${normaliserEmail(e.expert_email)}` : "") ||
    (normaliserTexte(e.expert_nom) ? `xn:${normaliserTexte(e.expert_nom)}` : "")
  );
}
export function cleAssureur(a: Pick<Assureur, "nom" | "email" | "tel" | "ville">): string {
  return cleContact(a.nom, a.email, a.tel, a.ville);
}

/** Le champ le mieux rempli l'emporte (le plus long, non vide). */
function meilleur(a: string | null | undefined, b: string | null | undefined): string | null {
  const x = (a ?? "").trim();
  const y = (b ?? "").trim();
  if (!x) return y || null;
  if (!y) return x;
  return y.length > x.length ? y : x;
}

type Source = { owner_id?: string | null };

export function consoliderExperts(lignes: (Expert & Source)[]): Omit<MutualiseExpert, "id" | "created_at" | "maj_le" | "verifie" | "partage">[] {
  const map = new Map<string, { row: Omit<MutualiseExpert, "id" | "created_at" | "maj_le" | "verifie" | "partage">; owners: Set<string> }>();
  for (const e of lignes) {
    const cle = cleExpert(e);
    if (!cle) continue;
    const cur = map.get(cle);
    if (!cur) {
      map.set(cle, {
        row: { cle, cabinet: e.cabinet, adresse: e.adresse, code_postal: e.code_postal, ville: e.ville, tel: e.tel, email: e.email, expert_nom: e.expert_nom, expert_tel: e.expert_tel, expert_email: e.expert_email, notes: null, garages: 0 },
        owners: new Set(e.owner_id ? [e.owner_id] : []),
      });
    } else {
      const r = cur.row;
      r.cabinet = meilleur(r.cabinet, e.cabinet); r.adresse = meilleur(r.adresse, e.adresse); r.code_postal = meilleur(r.code_postal, e.code_postal);
      r.ville = meilleur(r.ville, e.ville); r.tel = meilleur(r.tel, e.tel); r.email = meilleur(r.email, e.email);
      r.expert_nom = meilleur(r.expert_nom, e.expert_nom); r.expert_tel = meilleur(r.expert_tel, e.expert_tel); r.expert_email = meilleur(r.expert_email, e.expert_email);
      if (e.owner_id) cur.owners.add(e.owner_id);
    }
  }
  return Array.from(map.values()).map(({ row, owners }) => ({ ...row, garages: Math.max(1, owners.size) }));
}

export function consoliderAssureurs(lignes: (Assureur & Source)[]): Omit<MutualiseAssureur, "id" | "created_at" | "maj_le" | "verifie" | "partage">[] {
  const map = new Map<string, { row: Omit<MutualiseAssureur, "id" | "created_at" | "maj_le" | "verifie" | "partage">; owners: Set<string> }>();
  for (const a of lignes) {
    const cle = cleAssureur(a);
    if (!cle) continue;
    const cur = map.get(cle);
    if (!cur) {
      map.set(cle, {
        row: { cle, nom: a.nom, adresse: a.adresse, code_postal: a.code_postal, ville: a.ville, tel: a.tel, email: a.email, siren: a.siren ?? null, notes: null, garages: 0 },
        owners: new Set(a.owner_id ? [a.owner_id] : []),
      });
    } else {
      const r = cur.row;
      r.nom = meilleur(r.nom, a.nom); r.adresse = meilleur(r.adresse, a.adresse); r.code_postal = meilleur(r.code_postal, a.code_postal);
      r.ville = meilleur(r.ville, a.ville); r.tel = meilleur(r.tel, a.tel); r.email = meilleur(r.email, a.email); r.siren = meilleur(r.siren, a.siren ?? null);
      if (a.owner_id) cur.owners.add(a.owner_id);
    }
  }
  return Array.from(map.values()).map(({ row, owners }) => ({ ...row, garages: Math.max(1, owners.size) }));
}
