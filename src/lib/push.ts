// ============================================================
//  NOTIFICATIONS PUSH — côté NAVIGATEUR (v42)
//
//  Abonnement / désabonnement de l'appareil courant. Le serveur ne fait
//  qu'enregistrer ce que le navigateur lui donne (endpoint + 2 clés).
//
//  ⚠️ iPhone : Apple n'expose l'API Push QUE dans une PWA installée sur
//  l'écran d'accueil. Dans Safari « normal », `PushManager` n'existe même
//  pas — d'où `estIphoneNonInstallee()`, utilisé pour afficher la marche
//  à suivre plutôt qu'un « non supporté » incompréhensible.
// ============================================================

import { supabase } from "./supabaseClient";

export const CLE_PUBLIQUE_VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

/** Le navigateur sait-il recevoir des notifications push ? */
export function pushSupporte(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** L'appli tourne-t-elle en mode « installée » (écran d'accueil) ? */
export function estInstallee(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export function estIphone(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ se présente comme un Mac : on le repère au tactile.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Cas typique à expliquer : iPhone, appli PAS ajoutée à l'écran d'accueil. */
export function estIphoneNonInstallee(): boolean {
  return estIphone() && !estInstallee() && !pushSupporte();
}

/** Nom lisible de l'appareil, pour la liste des réglages. */
export function nomAppareil(): string {
  if (typeof navigator === "undefined") return "Appareil";
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Téléphone Android" : "Tablette Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "PC Windows";
  return "Appareil";
}

/** Clé VAPID base64url → Uint8Array (format exigé par `subscribe`). */
function cleVersOctets(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const brut = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const octets = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
  return octets;
}

async function jeton(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

/** Enregistre (ou réutilise) le service worker `/sw.js`. */
export async function enregistrerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const existante = await navigator.serviceWorker.getRegistration("/sw.js");
    if (existante) return existante;
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

/** L'appareil courant est-il déjà abonné ? */
export async function abonnementCourant(): Promise<PushSubscription | null> {
  if (!pushSupporte()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export type ResultatActivation = { ok: boolean; erreur?: string };

/**
 * Active les notifications sur CET appareil :
 * autorisation → abonnement navigateur → enregistrement côté serveur.
 */
export async function activerPush(): Promise<ResultatActivation> {
  if (!CLE_PUBLIQUE_VAPID) {
    return {
      ok: false,
      erreur:
        "Clé publique VAPID absente. Ajoute NEXT_PUBLIC_VAPID_PUBLIC_KEY dans les variables d'environnement Vercel, puis redéploie.",
    };
  }
  if (!pushSupporte()) {
    return {
      ok: false,
      erreur: estIphone()
        ? "Sur iPhone, ajoute d'abord l'appli à l'écran d'accueil (Partager → Sur l'écran d'accueil), puis rouvre-la depuis l'icône."
        : "Ce navigateur ne gère pas les notifications.",
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      erreur:
        "Autorisation refusée. Réactive les notifications pour ce site dans les réglages du téléphone, puis réessaie.",
    };
  }

  const reg = await enregistrerServiceWorker();
  if (!reg) return { ok: false, erreur: "Service worker non enregistré." };
  // `ready` évite un abonnement pendant l'installation du worker.
  await navigator.serviceWorker.ready;

  let abo: PushSubscription;
  try {
    const existant = await reg.pushManager.getSubscription();
    abo =
      existant ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: cleVersOctets(CLE_PUBLIQUE_VAPID) as BufferSource,
      }));
  } catch (e) {
    return { ok: false, erreur: `Abonnement refusé par le navigateur : ${(e as Error).message}` };
  }

  const t = await jeton();
  if (!t) return { ok: false, erreur: "Session expirée : reconnecte-toi puis réessaie." };

  const brut = abo.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const rep = await fetch("/api/push/abonner", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
    body: JSON.stringify({
      endpoint: brut.endpoint,
      p256dh: brut.keys?.p256dh,
      auth: brut.keys?.auth,
      appareil: nomAppareil(),
    }),
  });
  if (!rep.ok) {
    const j = await rep.json().catch(() => ({}));
    return { ok: false, erreur: j.error || "Enregistrement du téléphone impossible." };
  }
  return { ok: true };
}

/** Coupe les notifications sur CET appareil (les autres restent actifs). */
export async function desactiverPush(): Promise<ResultatActivation> {
  const abo = await abonnementCourant();
  if (!abo) return { ok: true };
  const endpoint = abo.endpoint;
  await abo.unsubscribe().catch(() => undefined);

  const t = await jeton();
  if (!t) return { ok: true }; // plus de session : l'abonnement navigateur est déjà coupé
  await fetch("/api/push/desabonner", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
    body: JSON.stringify({ endpoint }),
  }).catch(() => undefined);
  return { ok: true };
}

/** Envoie une notification de test sur tous les appareils du garage. */
export async function testerPush(): Promise<ResultatActivation> {
  const t = await jeton();
  if (!t) return { ok: false, erreur: "Session expirée : reconnecte-toi." };
  const rep = await fetch("/api/push/test", {
    method: "POST",
    headers: { Authorization: `Bearer ${t}` },
  });
  const j = await rep.json().catch(() => ({}));
  if (!rep.ok) return { ok: false, erreur: j.error || "Envoi impossible." };
  if (!j.envoyes) return { ok: false, erreur: "Aucun appareil n'a reçu la notification." };
  return { ok: true };
}
