"use client";

// ====================================================================
//  TABLEAUX FLUIDES (v12.6) — un seul mécanisme pour TOUS les tableaux
//
//  Demande : « dès qu'il y a un tableau, on l'adapte à la largeur de
//  l'écran pour qu'il ne dépasse pas (tablette, ordi, mobile), sans jamais
//  de chevauchement de texte, et on rend le réglage des colonnes facile,
//  surtout au tactile ».
//
//  Principe : monté UNE fois dans AppShell, ce composant observe le DOM et
//  « équipe » chaque <table> qu'il rencontre (pas besoin de retoucher les
//  19 écrans) :
//   · largeurs de colonnes en POURCENTAGES (somme = 100 %) → le tableau
//     remplit exactement la largeur disponible, quel que soit l'écran ;
//   · `table-layout: fixed` + `overflow: hidden` sur les cellules → une
//     cellule trop étroite coupe/replie son contenu, elle ne mord jamais
//     sur la voisine ;
//   · réglage = on GLISSE LA FRONTIÈRE entre deux colonnes (comme un
//     séparateur de volets) : la colonne de gauche s'élargit, celle de
//     droite se réduit d'autant, le total ne bouge pas → rien ne sort de
//     l'écran. Événements pointeur + zone de prise LARGE (22 px au doigt) ;
//   · double-clic / double-tap sur la frontière = largeurs automatiques ;
//   · mémorisé PAR APPAREIL (localStorage), clé = page + en-têtes.
//   · téléphone (< 640 px) : au-delà de 4 colonnes le tableau garde une
//     largeur minimale et défile (sinon les colonnes seraient illisibles) ;
//     jusqu'à 4 colonnes il tient dans l'écran.
// ====================================================================

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const CLE = "mea.tableaux.colonnes";
const PCT_MIN = 5;
const ZONE_SOURIS = 10;  // px de part et d'autre de la frontière
const ZONE_DOIGT = 22;
const COLONNES_MAX_MOBILE = 4;
const LARGEUR_COL_MOBILE = 6.5; // rem

type Memo = Record<string, number[]>;

function lireMemo(): Memo {
  try {
    const m = JSON.parse(window.localStorage.getItem(CLE) || "{}");
    return m && typeof m === "object" ? (m as Memo) : {};
  } catch {
    return {};
  }
}
function ecrireMemo(m: Memo) {
  try {
    window.localStorage.setItem(CLE, JSON.stringify(m));
  } catch {
    /* stockage indisponible */
  }
}

/** En-têtes de la première rangée (visibles ou non). */
function enTetes(table: HTMLTableElement): HTMLTableCellElement[] {
  const rangee = table.tHead?.rows[0] || table.rows[0];
  return rangee ? (Array.from(rangee.cells) as HTMLTableCellElement[]) : [];
}
const visible = (el: HTMLElement) => el.offsetParent !== null || getComputedStyle(el).display !== "none";

/** Clé stable d'un tableau : page + texte des en-têtes. */
function cleTable(table: HTMLTableElement, pathname: string): string {
  const texte = enTetes(table).map((th) => (th.textContent || "").trim().slice(0, 16)).join("|");
  const racine = pathname.replace(/\/[0-9a-f-]{20,}/gi, "/:id");
  return `${racine}#${texte}`;
}

function estMobile() {
  return window.innerWidth < 640;
}

/** Applique des pourcentages (indexés sur TOUTES les colonnes) aux colonnes visibles. */
function appliquer(table: HTMLTableElement, pct: number[]) {
  const ths = enTetes(table);
  const vis = ths.map((th, i) => (visible(th) ? i : -1)).filter((i) => i >= 0);
  const somme = vis.reduce((s, i) => s + (pct[i] || 0), 0) || 1;
  ths.forEach((th, i) => {
    if (!visible(th)) return;
    th.style.width = `${((pct[i] || 0) / somme) * 100}%`;
  });
  table.style.tableLayout = "fixed";
  table.style.width = "100%";
  table.style.minWidth =
    estMobile() && vis.length > COLONNES_MAX_MOBILE ? `${vis.length * LARGEUR_COL_MOBILE}rem` : "0";
}

/** Mesure les largeurs naturelles (mise en page automatique) → pourcentages. */
function mesurer(table: HTMLTableElement): number[] {
  const ths = enTetes(table);
  const layout = table.style.tableLayout;
  const largeur = table.style.width;
  const min = table.style.minWidth;
  table.style.tableLayout = "auto";
  table.style.width = "100%";
  table.style.minWidth = "0";
  ths.forEach((th) => { th.style.width = ""; });
  const px = ths.map((th) => (visible(th) ? th.getBoundingClientRect().width : 0));
  let total = px.reduce((s, v) => s + v, 0);
  if (total <= 0) {
    // Tableau masqué à cet instant (ex. « hidden sm:table ») : parts égales.
    total = ths.length;
    for (let i = 0; i < px.length; i += 1) px[i] = 1;
  }
  table.style.tableLayout = layout;
  table.style.width = largeur;
  table.style.minWidth = min;
  return px.map((v) => (v / total) * 100);
}

function equiper(table: HTMLTableElement, pathname: string) {
  if (table.dataset.tf === "off" || table.closest("[data-tf='off']")) return;
  if (!visible(table)) return; // réessayé au prochain changement du DOM / redimensionnement
  const ths = enTetes(table);
  if (ths.length < 2) return;
  const cle = cleTable(table, pathname);
  const dejaFait = table.dataset.tf === cle && ths.every((th) => !visible(th) || th.style.width);
  if (dejaFait) return;

  table.dataset.tf = cle;
  table.classList.add("tf");
  const memo = lireMemo();
  const pct = memo[cle] && memo[cle].length === ths.length ? memo[cle] : mesurer(table);
  appliquer(table, pct);
  (table as HTMLTableElement & { __tfPct?: number[] }).__tfPct = pct;
}

/** Frontière la plus proche du pointeur : renvoie l'index de la colonne visible de gauche, ou -1. */
function frontiereSous(table: HTMLTableElement, x: number, zone: number): { gauche: number; droite: number } | null {
  const ths = enTetes(table);
  const vis = ths.map((th, i) => (visible(th) ? i : -1)).filter((i) => i >= 0);
  for (let k = 0; k < vis.length - 1; k += 1) {
    const r = ths[vis[k]].getBoundingClientRect();
    if (Math.abs(x - r.right) <= zone) return { gauche: vis[k], droite: vis[k + 1] };
  }
  return null;
}

/** Tableau fluide dont la RANGÉE D'EN-TÊTE est sous le pointeur (cellule, bordure ou interstice). */
function tableEnTeteSous(target: EventTarget | null, y: number): HTMLTableElement | null {
  const el = target as HTMLElement | null;
  const table = el?.closest?.("table.tf") as HTMLTableElement | null;
  if (!table) return null;
  const rangee = table.tHead?.rows[0] || table.rows[0];
  if (!rangee) return null;
  const r = rangee.getBoundingClientRect();
  return y >= r.top - 2 && y <= r.bottom + 2 ? table : null;
}

export default function TableauxFluides() {
  const pathname = usePathname() || "/";

  useEffect(() => {
    const tout = () => document.querySelectorAll<HTMLTableElement>("table").forEach((t) => equiper(t, pathname));
    tout();

    // Les tableaux arrivent APRÈS le chargement des données : on observe le DOM.
    let planifie = 0;
    const obs = new MutationObserver(() => {
      if (planifie) return;
      planifie = window.requestAnimationFrame(() => { planifie = 0; tout(); });
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // Rotation / redimensionnement : la règle mobile peut changer.
    const surResize = () => {
      document.querySelectorAll<HTMLTableElement>("table.tf").forEach((t) => {
        const pct = (t as HTMLTableElement & { __tfPct?: number[] }).__tfPct;
        if (pct && visible(t)) appliquer(t, pct);
      });
      tout();
    };
    window.addEventListener("resize", surResize);

    // Curseur ↔ sur la frontière, au survol (souris).
    const surMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      document.querySelectorAll<HTMLElement>("th.tf-pres").forEach((el) => el.classList.remove("tf-pres"));
      const table = tableEnTeteSous(e.target, e.clientY);
      if (!table) return;
      const f = frontiereSous(table, e.clientX, ZONE_SOURIS);
      if (f) enTetes(table)[f.gauche].classList.add("tf-pres");
    };

    // Glisser la frontière entre deux colonnes.
    let dernierTap = 0;
    const surDown = (e: PointerEvent) => {
      const table = tableEnTeteSous(e.target, e.clientY);
      if (!table) return;
      const zone = e.pointerType === "touch" ? ZONE_DOIGT : ZONE_SOURIS;
      const f = frontiereSous(table, e.clientX, zone);
      if (!f) return;
      e.preventDefault();
      e.stopPropagation();

      // Double-tap / double-clic sur la frontière → largeurs automatiques.
      const maintenant = Date.now();
      if (maintenant - dernierTap < 350) {
        dernierTap = 0;
        const memo = lireMemo();
        delete memo[table.dataset.tf || ""];
        ecrireMemo(memo);
        const pct = mesurer(table);
        (table as HTMLTableElement & { __tfPct?: number[] }).__tfPct = pct;
        appliquer(table, pct);
        return;
      }
      dernierTap = maintenant;

      const ths = enTetes(table);
      const t = table as HTMLTableElement & { __tfPct?: number[] };
      const depart = t.__tfPct ? [...t.__tfPct] : mesurer(table);
      const largeurTable = table.getBoundingClientRect().width || 1;
      const vis = ths.map((th2, i) => (visible(th2) ? i : -1)).filter((i) => i >= 0);
      const sommeVis = vis.reduce((s, i) => s + (depart[i] || 0), 0) || 1;
      const x0 = e.clientX;
      const cible = e.target as HTMLElement;
      try { cible.setPointerCapture(e.pointerId); } catch { /* ignoré */ }
      table.classList.add("tf-glisse");
      ths[f.gauche].classList.add("tf-actif");

      const bouger = (ev: PointerEvent) => {
        // dx en pourcentage de la largeur du tableau, ramené à l'échelle des colonnes visibles
        const d = ((ev.clientX - x0) / largeurTable) * sommeVis;
        const g = depart[f.gauche] + d;
        const dr = depart[f.droite] - d;
        if (g < PCT_MIN || dr < PCT_MIN) return;
        const pct = [...depart];
        pct[f.gauche] = g;
        pct[f.droite] = dr;
        t.__tfPct = pct;
        appliquer(table, pct);
      };
      const lacher = () => {
        cible.removeEventListener("pointermove", bouger);
        cible.removeEventListener("pointerup", lacher);
        cible.removeEventListener("pointercancel", lacher);
        table.classList.remove("tf-glisse");
        ths[f.gauche].classList.remove("tf-actif");
        if (t.__tfPct) {
          const memo = lireMemo();
          memo[table.dataset.tf || ""] = t.__tfPct.map((v) => Math.round(v * 100) / 100);
          ecrireMemo(memo);
        }
      };
      cible.addEventListener("pointermove", bouger);
      cible.addEventListener("pointerup", lacher);
      cible.addEventListener("pointercancel", lacher);
    };

    // Un clic qui part d'une frontière ne doit pas déclencher le tri de l'en-tête.
    const surClick = (e: MouseEvent) => {
      const table = tableEnTeteSous(e.target, e.clientY);
      if (!table) return;
      if (frontiereSous(table, e.clientX, ZONE_SOURIS)) { e.preventDefault(); e.stopPropagation(); }
    };

    document.addEventListener("pointerdown", surDown, true);
    document.addEventListener("pointermove", surMove, { passive: true });
    document.addEventListener("click", surClick, true);
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", surResize);
      document.removeEventListener("pointerdown", surDown, true);
      document.removeEventListener("pointermove", surMove);
      document.removeEventListener("click", surClick, true);
    };
  }, [pathname]);

  return null;
}
