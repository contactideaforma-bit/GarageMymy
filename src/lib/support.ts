// ============================================================
//  ASSISTANCE — tickets d'incident (v43)
//
//  Le garage signale un problème depuis l'appli ; l'éditeur reçoit le
//  ticket (email + notification + page admin) et répond dans le fil.
//
//  Règle de conception : le carrossier n'est pas informaticien. On ne lui
//  demande JAMAIS sa version, son navigateur ou l'URL de la page — tout
//  est capté automatiquement par `contexteTechnique()`.
// ============================================================

import { supabase } from "./supabaseClient";
import { fetchAuth } from "./apiClient";
import { Ticket, TicketMessage } from "./types";
import { VERSION_APP } from "./version";

/* ---------------------------- Référentiels --------------------------- */

export const CATEGORIES_TICKET = [
  { code: "bug", icone: "🐞", label: "Quelque chose ne marche pas" },
  { code: "lenteur", icone: "🐢", label: "L'appli est lente ou se bloque" },
  { code: "donnees", icone: "🧾", label: "Une information est fausse ou manquante" },
  { code: "document", icone: "📄", label: "Problème sur un document (PDF, email)" },
  { code: "question", icone: "❓", label: "Je ne sais pas comment faire" },
  { code: "amelioration", icone: "💡", label: "J'aimerais une amélioration" },
  { code: "autre", icone: "✉️", label: "Autre chose" },
] as const;

export const GRAVITES_TICKET = [
  {
    code: "bloquant",
    label: "Bloquant",
    detail: "Je ne peux pas travailler",
    badge: "badge badge-danger",
  },
  {
    code: "gene",
    label: "Gênant",
    detail: "Je peux continuer, mais c'est pénible",
    badge: "badge badge-warn",
  },
  {
    code: "mineur",
    label: "Mineur",
    detail: "Un détail, sans urgence",
    badge: "badge badge-neutral",
  },
] as const;

export const STATUTS_TICKET = [
  { code: "nouveau", label: "Reçu", badge: "badge badge-info" },
  { code: "en_cours", label: "En cours de traitement", badge: "badge badge-warn" },
  { code: "resolu", label: "Résolu", badge: "badge badge-ok" },
  { code: "ferme", label: "Clôturé", badge: "badge badge-neutral" },
] as const;

export function labelCategorie(code?: string | null): string {
  return CATEGORIES_TICKET.find((c) => c.code === code)?.label || "Autre chose";
}
export function iconeCategorie(code?: string | null): string {
  return CATEGORIES_TICKET.find((c) => c.code === code)?.icone || "✉️";
}
export function infoGravite(code?: string | null) {
  return GRAVITES_TICKET.find((g) => g.code === code) || GRAVITES_TICKET[1];
}
export function infoStatut(code?: string | null) {
  return STATUTS_TICKET.find((s) => s.code === code) || STATUTS_TICKET[0];
}

/** Les tickets encore « vivants » (à traiter côté éditeur). */
export function estOuvert(t: Ticket): boolean {
  return t.statut === "nouveau" || t.statut === "en_cours";
}

/* ------------------------------ Numéro ------------------------------- */

/** TCK-202608-4F2A — court, lisible au téléphone. */
export function genNumeroTicket(): string {
  const d = new Date();
  const mois = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const suffixe = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TCK-${mois}-${suffixe}`;
}

/* ------------------------ Contexte technique ------------------------- */

export type ContexteTechnique = {
  page: string;
  navigateur: string;
  version_app: string;
};

/**
 * Capte automatiquement de quoi diagnostiquer : page consultée, navigateur,
 * taille d'écran, version de l'appli. Aucune donnée personnelle.
 */
export function contexteTechnique(): ContexteTechnique {
  if (typeof window === "undefined") {
    return { page: "", navigateur: "", version_app: VERSION_APP };
  }
  const n = window.navigator;
  const ecran = `${window.screen?.width || 0}×${window.screen?.height || 0}`;
  const pwa = window.matchMedia?.("(display-mode: standalone)")?.matches ? " · PWA" : "";
  return {
    page: window.location.pathname + window.location.search,
    navigateur: `${n.userAgent} · écran ${ecran}${pwa}`.slice(0, 500),
    version_app: VERSION_APP,
  };
}

/** Résumé lisible du navigateur, pour l'écran admin. */
export function resumeNavigateur(ua?: string | null): string {
  if (!ua) return "—";
  const nav = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Navigateur inconnu";
  const os = /iPhone|iPad/.test(ua)
    ? "iPhone/iPad"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "Mac"
        : /Windows/.test(ua)
          ? "Windows"
          : "";
  const pwa = /PWA/.test(ua) ? " · installée" : "";
  return [nav, os].filter(Boolean).join(" · ") + pwa;
}

/* ------------------------------- Admin ------------------------------- */

/**
 * Emails autorisés à voir TOUS les tickets. Côté navigateur ce test est
 * seulement COSMÉTIQUE (afficher ou non l'onglet) : la vraie vérification
 * est refaite côté serveur dans /api/support/admin.
 */
export function emailsAdmin(): string[] {
  const brut =
    process.env.NEXT_PUBLIC_ADMIN_EMAILS || "contact.ideaforma@gmail.com";
  return brut
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function estAdmin(email?: string | null): boolean {
  if (!email) return false;
  return emailsAdmin().includes(email.toLowerCase());
}

/* ------------------------------ Lecture ------------------------------ */

export type ChargementTickets = {
  tickets: Ticket[];
  /** false = table `tickets` absente (migration v43 non exécutée) */
  dispo: boolean;
};

export async function chargerMesTickets(): Promise<ChargementTickets> {
  const { data, error } = await supabase
    .from("tickets")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return { tickets: [], dispo: false };
  return { tickets: (data as Ticket[]) || [], dispo: true };
}

export async function chargerMessages(ticketId: string): Promise<TicketMessage[]> {
  const { data, error } = await supabase
    .from("ticket_messages")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data as TicketMessage[]) || [];
}

/* ------------------------------ Écriture ----------------------------- */

export type NouveauTicket = {
  sujet: string;
  description: string;
  categorie: string;
  gravite: string;
  contact_email?: string | null;
  contact_tel?: string | null;
  garage_nom?: string | null;
};

/**
 * Crée le ticket, écrit le premier message du fil, puis prévient l'éditeur
 * (email + notification). L'échec de la notification n'annule PAS le
 * ticket : il est enregistré, l'éditeur le verra sur sa page admin.
 */
export async function creerTicket(t: NouveauTicket): Promise<Ticket> {
  const ctx = contexteTechnique();
  const ligne = {
    numero: genNumeroTicket(),
    sujet: t.sujet.trim(),
    description: t.description.trim(),
    categorie: t.categorie,
    gravite: t.gravite,
    statut: "nouveau",
    page: ctx.page,
    navigateur: ctx.navigateur,
    version_app: ctx.version_app,
    contact_email: t.contact_email || null,
    contact_tel: t.contact_tel || null,
    garage_nom: t.garage_nom || null,
    lu_admin: false,
    lu_garage: true,
  };

  const { data, error } = await supabase.from("tickets").insert(ligne).select("*").single();
  if (error) throw error;
  const ticket = data as Ticket;

  // Premier message du fil = la description, pour que la conversation
  // se lise d'un seul tenant.
  await supabase.from("ticket_messages").insert({
    ticket_id: ticket.id,
    auteur: "garage",
    auteur_nom: t.garage_nom || null,
    message: ticket.description,
  });

  try {
    await fetchAuth("/api/support/notifier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId: ticket.id }),
    });
  } catch {
    /* notification best-effort */
  }

  return ticket;
}

/** Le garage complète son ticket (nouvelle info, capture, précision…). */
export async function repondreGarage(ticket: Ticket, message: string): Promise<TicketMessage> {
  const { data, error } = await supabase
    .from("ticket_messages")
    .insert({
      ticket_id: ticket.id,
      auteur: "garage",
      auteur_nom: ticket.garage_nom || null,
      message: message.trim(),
    })
    .select("*")
    .single();
  if (error) throw error;

  // Le ticket redevient « non lu » côté éditeur et remonte dans sa liste.
  await supabase
    .from("tickets")
    .update({ lu_admin: false, maj_le: new Date().toISOString() })
    .eq("id", ticket.id);

  try {
    await fetchAuth("/api/support/notifier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId: ticket.id, relance: true }),
    });
  } catch {
    /* best-effort */
  }

  return data as TicketMessage;
}

/** Le garage clôture lui-même son ticket (« c'est bon pour moi »). */
export async function cloturerTicket(ticket: Ticket): Promise<void> {
  const { error } = await supabase
    .from("tickets")
    .update({ statut: "ferme", ferme_le: new Date().toISOString(), maj_le: new Date().toISOString() })
    .eq("id", ticket.id);
  if (error) throw error;
}

/** Marque le ticket comme lu par le garage (retire la pastille). */
export async function marquerLuGarage(ticket: Ticket): Promise<void> {
  if (ticket.lu_garage) return;
  await supabase.from("tickets").update({ lu_garage: true }).eq("id", ticket.id);
}
