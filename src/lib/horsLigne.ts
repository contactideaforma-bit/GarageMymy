// ============================================================
//  MODE DÉGRADÉ — travailler quand le réseau lâche (v47)
//
//  Dans un atelier, la 4G tombe derrière un mur porteur et le Wi-Fi ne
//  porte pas jusqu'à la cabine de peinture. Avant, l'écran se vidait et
//  le garage croyait avoir tout perdu.
//
//  Deux mécanismes, volontairement simples :
//
//   1. CACHE DE LECTURE — chaque écran important range sa dernière
//      réponse dans IndexedDB. Si le serveur ne répond pas, on réaffiche
//      cette copie avec sa date, en clair : « données du 12/08 à 9 h 40 ».
//
//   2. FILE D'ÉCRITURE — les modifications simples (note de dossier,
//      coche d'un rappel) sont mises en attente et rejouées dès le retour
//      du réseau. Rien n'est perdu, rien n'est écrit deux fois (chaque
//      opération porte un identifiant).
//
//  Ce qui n'est PAS mis en file : les créations complexes (dossier,
//  facture, signature, envoi d'email). Elles supposent des règles
//  métier et des fichiers ; les rejouer à l'aveugle serait dangereux.
//  L'appli le dit clairement à l'utilisateur.
// ============================================================

import { supabase } from "./supabaseClient";

const BASE = "mea-hors-ligne";
const VERSION = 1;
const STORE_CACHE = "cache";
const STORE_FILE = "file";

/* ----------------------------- IndexedDB ----------------------------- */

function indisponible(): boolean {
  return typeof window === "undefined" || !("indexedDB" in window);
}

function ouvrir(): Promise<IDBDatabase | null> {
  if (indisponible()) return Promise.resolve(null);
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = window.indexedDB.open(BASE, VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CACHE)) db.createObjectStore(STORE_CACHE);
      if (!db.objectStoreNames.contains(STORE_FILE)) db.createObjectStore(STORE_FILE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    // Navigation privée, quota refusé, stockage bloqué : on continue sans
    // cache plutôt que de casser l'écran.
    req.onerror = () => resolve(null);
  });
}

function transaction<T>(
  store: string,
  mode: IDBTransactionMode,
  action: (s: IDBObjectStore) => IDBRequest
): Promise<T | null> {
  return ouvrir().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const tx = db.transaction(store, mode);
          const req = action(tx.objectStore(store));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

/* --------------------------- Cache de lecture ------------------------ */

export type Instantane<T> = { donnees: T; le: string };

/** Range la dernière réponse d'un écran. Silencieux en cas d'échec. */
export async function memoriser<T>(cle: string, donnees: T): Promise<void> {
  await transaction(STORE_CACHE, "readwrite", (s) =>
    s.put({ donnees, le: new Date().toISOString() }, cle)
  );
}

/** Relit la copie locale d'un écran (null si aucune). */
export async function relire<T>(cle: string): Promise<Instantane<T> | null> {
  const v = await transaction<Instantane<T>>(STORE_CACHE, "readonly", (s) => s.get(cle));
  return v && v.donnees !== undefined ? v : null;
}

export async function viderCache(): Promise<void> {
  await transaction(STORE_CACHE, "readwrite", (s) => s.clear());
}

/* ------------------------------ Réseau ------------------------------- */

/** Le navigateur se croit-il connecté ? (indice, pas une garantie) */
export function enLigne(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

/**
 * L'erreur remontée par Supabase ressemble-t-elle à une coupure réseau ?
 * On distingue « le serveur ne répond pas » (→ cache) d'une vraie erreur
 * métier (→ message d'erreur normal).
 */
export function erreurReseau(err: unknown): boolean {
  if (!err) return false;
  if (!enLigne()) return true;
  const msg = (
    typeof err === "string" ? err : (err as { message?: string })?.message || ""
  ).toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("networkerror") ||
    msg.includes("load failed") ||
    msg.includes("fetch failed") ||
    msg.includes("timeout")
  );
}

/* --------------------------- File d'écriture ------------------------- */

export type OperationEnAttente = {
  id: string;
  /** Table Supabase visée. */
  table: string;
  type: "update" | "insert";
  /** Pour un update : la ligne ciblée (colonne = valeur). */
  colonne?: string;
  valeur?: string;
  /** Champs à écrire. */
  donnees: Record<string, unknown>;
  /** Ce que l'utilisateur a fait, en clair (affiché dans le bandeau). */
  libelle: string;
  cree_le: string;
};

function identifiant(): string {
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function enfiler(op: Omit<OperationEnAttente, "id" | "cree_le">): Promise<void> {
  const complete: OperationEnAttente = { ...op, id: identifiant(), cree_le: new Date().toISOString() };
  await transaction(STORE_FILE, "readwrite", (s) => s.put(complete));
}

export async function fileEnAttente(): Promise<OperationEnAttente[]> {
  const v = await transaction<OperationEnAttente[]>(STORE_FILE, "readonly", (s) => s.getAll());
  return (v || []).sort((a, b) => a.cree_le.localeCompare(b.cree_le));
}

async function retirer(id: string): Promise<void> {
  await transaction(STORE_FILE, "readwrite", (s) => s.delete(id));
}

/**
 * Écrit tout de suite si le réseau répond, sinon met en attente.
 * Renvoie `true` si l'écriture est partie, `false` si elle est en file.
 */
export async function ecrireOuEnfiler(
  op: Omit<OperationEnAttente, "id" | "cree_le">
): Promise<boolean> {
  if (enLigne()) {
    try {
      const err = await appliquer(op);
      if (!err) return true;
      if (!erreurReseau(err)) throw err;
    } catch (e) {
      if (!erreurReseau(e)) throw e;
    }
  }
  await enfiler(op);
  return false;
}

/** Exécute réellement une opération. Renvoie l'erreur éventuelle. */
async function appliquer(op: Omit<OperationEnAttente, "id" | "cree_le">): Promise<unknown> {
  if (op.type === "insert") {
    const { error } = await supabase.from(op.table).insert(op.donnees);
    return error;
  }
  if (!op.colonne || op.valeur === undefined) return new Error("Ligne cible manquante.");
  const { error } = await supabase.from(op.table).update(op.donnees).eq(op.colonne, op.valeur);
  return error;
}

export type ResultatRejeu = { envoyees: number; restantes: number; erreurs: number };

/**
 * Rejoue la file. Une opération qui échoue pour une raison MÉTIER est
 * abandonnée (sinon elle bloquerait la file indéfiniment) ; une opération
 * qui échoue pour une raison RÉSEAU reste en attente.
 */
export async function rejouerFile(): Promise<ResultatRejeu> {
  const file = await fileEnAttente();
  let envoyees = 0;
  let erreurs = 0;
  for (const op of file) {
    try {
      const err = await appliquer(op);
      if (!err) {
        await retirer(op.id);
        envoyees += 1;
      } else if (erreurReseau(err)) {
        break; // toujours hors ligne : on garde le reste pour plus tard
      } else {
        await retirer(op.id);
        erreurs += 1;
      }
    } catch (e) {
      if (erreurReseau(e)) break;
      await retirer(op.id);
      erreurs += 1;
    }
  }
  const restantes = (await fileEnAttente()).length;
  return { envoyees, restantes, erreurs };
}

/** « données du 12/08 à 09:40 » — pour dire de QUAND date ce qu'on lit. */
export function dateDuCache(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} à ${d.toLocaleTimeString(
    "fr-FR",
    { hour: "2-digit", minute: "2-digit" }
  )}`;
}
