// ============================================================
//  COQUE MOBILE (v13.50) — outils partagés par la barre du bas, la
//  recherche instantanée et les raccourcis.
//
//  Sur téléphone, l'appli n'est plus « le site en plus petit » : barre
//  d'onglets en bas (Accueil · Dossiers · + · Recherche · Plus), feuilles
//  qui montent du bas, raccourcis sous le pouce. Les écrans communiquent
//  avec la coque par de simples ÉVÉNEMENTS fenêtre : n'importe quel bouton
//  peut ouvrir la recherche ou les actions rapides sans câblage.
// ============================================================

import { useEffect, useState } from "react";

/** Point de bascule : en dessous, la coque mobile ; au-dessus, la barre latérale. */
export const REQUETE_MOBILE = "(max-width: 1023px)";

export function useEstMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(REQUETE_MOBILE);
    const maj = () => setMobile(mq.matches);
    maj();
    mq.addEventListener("change", maj);
    return () => mq.removeEventListener("change", maj);
  }, []);
  return mobile;
}

/** Ce que la recherche instantanée fait du dossier choisi. */
export type ModeRecherche = "ouvrir" | "photos" | "contact";

export const EVT_RECHERCHE = "mea:recherche";
export const EVT_ACTIONS = "mea:actions";

export function ouvrirRecherche(mode: ModeRecherche = "ouvrir") {
  window.dispatchEvent(new CustomEvent(EVT_RECHERCHE, { detail: { mode } }));
}
export function ouvrirActions() {
  window.dispatchEvent(new CustomEvent(EVT_ACTIONS));
}

// ---------- Dossiers récents (localStorage, par appareil) ----------
export type DossierRecent = { id: string; titre: string; sous: string; le: number };
const CLE_RECENTS = "mea.recents";
const MAX_RECENTS = 8;

export function lireRecents(): DossierRecent[] {
  try {
    const brut = window.localStorage.getItem(CLE_RECENTS);
    const liste = brut ? (JSON.parse(brut) as DossierRecent[]) : [];
    return Array.isArray(liste) ? liste : [];
  } catch {
    return [];
  }
}

export function noterRecent(r: Omit<DossierRecent, "le">) {
  try {
    const liste = lireRecents().filter((x) => x.id !== r.id);
    liste.unshift({ ...r, le: Date.now() });
    window.localStorage.setItem(CLE_RECENTS, JSON.stringify(liste.slice(0, MAX_RECENTS)));
  } catch {
    /* stockage indisponible */
  }
}

/** Téléphone au format tel: (chiffres et + seulement). */
export function lienTel(tel: string | null | undefined): string | null {
  const t = String(tel || "").replace(/[^\d+]/g, "");
  return t.length >= 6 ? `tel:${t}` : null;
}
export function lienSms(tel: string | null | undefined, texte = ""): string | null {
  const t = String(tel || "").replace(/[^\d+]/g, "");
  if (t.length < 6) return null;
  return `sms:${t}${texte ? `?&body=${encodeURIComponent(texte)}` : ""}`;
}
export function lienWhatsApp(tel: string | null | undefined, texte = ""): string | null {
  let t = String(tel || "").replace(/[^\d+]/g, "");
  if (t.length < 6) return null;
  if (t.startsWith("0")) t = "33" + t.slice(1); // numéro français sans indicatif
  t = t.replace(/^\+/, "");
  return `https://wa.me/${t}${texte ? `?text=${encodeURIComponent(texte)}` : ""}`;
}
