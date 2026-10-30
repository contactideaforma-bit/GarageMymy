"use client";

// ====================================================================
//  TABLEAUX FLUIDES — v2 « LISIBLES » (v13.58)
//
//  v12.6 forçait chaque tableau à 100 % de la largeur avec des colonnes en
//  pourcentages (`table-layout: fixed`). Résultat sur les écrans moyens :
//  les numéros de facture, les dates et les montants étaient COUPÉS AU
//  MILIEU (« FAC-20260 / 9-69018 / 0867 », « 18/10/202 / 6 ») et les lignes
//  devenaient hautes et illisibles. L'utilisateur a demandé la même chose
//  sur TOUS les tableaux de l'appli : « les lignes se coupent, ce n'est
//  pas clair ».
//
//  Nouveau principe, toujours GLOBAL (monté une fois dans AppShell, aucun
//  des 30+ écrans à retoucher) :
//   · mise en page AUTOMATIQUE du navigateur (`table-layout: auto`) : une
//     colonne ne descend jamais sous la largeur de son contenu ;
//   · les cellules « atomes » (référence, date, montant, badge, bouton,
//     texte court) sont en `white-space: nowrap` → jamais coupées ; seules
//     les cellules de TEXTE LONG (nom de client, libellé, commentaire)
//     passent à la ligne, entre les mots ;
//   · si l'ensemble ne tient pas dans l'écran, le CADRE du tableau défile
//     horizontalement (la 1re colonne reste lisible, rien ne s'écrase) ;
//   · la frontière entre deux en-têtes se glisse toujours (largeur minimale
//     de la colonne de gauche, en px, mémorisée par appareil) ; double-clic
//     = automatique.
//  Exclure un tableau : `data-tf="off"` sur la table ou un ancêtre.
// ====================================================================

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const CLE = "mea.tableaux.colonnes.v2";
const ZONE_SOURIS = 10; // px de part et d'autre de la frontière
const ZONE_DOIGT = 22;
const LARGEUR_MIN = 48; // px — une colonne ne se réduit pas en dessous
/** Au-delà de cette longueur (par ligne), une cellule est du texte qui peut se replier. */
const TEXTE_LONG = 26;

type Memo = Record<string, Record<number, number>>;

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

/* ------------------------------------------------------------------
   Classement des cellules : « atome » (jamais coupé) ou « texte » (replié
   entre les mots). On regarde chaque LIGNE visuelle de la cellule
   (innerText garde les retours des blocs) : si toutes sont courtes, ou si
   la cellule ne contient que des boutons / badges / champs, c'est un atome.
------------------------------------------------------------------ */
const MOTIF_ATOME = /^(\d[\d\s.,/:%€-]*\s*(€|%|HT|TTC|h|j|km)?|\d{1,2}\/\d{1,2}\/\d{2,4}.*|[A-Z0-9][A-Z0-9/_-]{2,})$/i;

function classerCellule(td: HTMLTableCellElement) {
  if (td.dataset.tfc) return;
  td.dataset.tfc = "1";
  const lignes = (td.innerText || td.textContent || "")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const texteSeul = lignes.join(" ");
  const interactif = td.querySelector("button, a, input, select, textarea, .badge, [class*='badge']");
  const longue = lignes.some((l) => l.length > TEXTE_LONG && !MOTIF_ATOME.test(l));
  // Une cellule tronquée volontairement (.truncate) avec un texte long reste du texte : on la laisse se replier.
  const tronquee = td.classList.contains("truncate") || td.querySelector(".truncate");
  if (!longue && (texteSeul.length <= TEXTE_LONG || interactif || !/\s/.test(texteSeul))) {
    td.classList.add("tf-atome");
    td.classList.remove("tf-texte");
  } else {
    td.classList.add("tf-texte");
    td.classList.remove("tf-atome");
    if (tronquee && td.classList.contains("truncate")) td.classList.remove("truncate");
  }
}

/** Le cadre qui entoure le tableau doit pouvoir défiler horizontalement. */
function cadreDe(table: HTMLTableElement): HTMLElement | null {
  const parent = table.parentElement;
  if (!parent || parent === document.body) return null;
  return parent;
}

function appliquerLargeurs(table: HTMLTableElement) {
  const ths = enTetes(table);
  const memo = lireMemo()[table.dataset.tf || ""] || {};
  ths.forEach((th, i) => {
    const px = memo[i];
    th.style.width = px ? `${px}px` : "";
    th.style.minWidth = px ? `${px}px` : "";
  });
}

function equiper(table: HTMLTableElement, pathname: string) {
  if (table.dataset.tf === "off" || table.closest("[data-tf='off']")) return;
  if (!visible(table)) return; // réessayé au prochain changement du DOM / redimensionnement
  const ths = enTetes(table);
  if (ths.length < 2) return;
  const cle = cleTable(table, pathname);
  if (table.dataset.tf !== cle) {
    table.dataset.tf = cle;
    table.classList.add("tf");
    table.style.tableLayout = "auto";
    table.style.width = "100%";
    table.style.minWidth = "0";
    const cadre = cadreDe(table);
    if (cadre) cadre.classList.add("tf-cadre");
    appliquerLargeurs(table);
  }
  // Les lignes arrivent / changent après coup : on classe les cellules pas encore vues.
  const nouvelles = table.querySelectorAll<HTMLTableCellElement>("td:not([data-tfc])");
  if (!nouvelles.length) return;
  nouvelles.forEach(classerCellule);
  harmoniserColonnes(table);
}

/** Une colonne entière se comporte pareil : dès qu'une cellule est du texte
 *  long, toute la colonne se replie (sinon les largeurs varient d'une ligne
 *  à l'autre et le tableau a l'air bancal). */
function harmoniserColonnes(table: HTMLTableElement) {
  const texte = new Set<number>();
  table.querySelectorAll<HTMLTableCellElement>("td.tf-texte").forEach((td) => texte.add(td.cellIndex));
  if (!texte.size) return;
  table.querySelectorAll<HTMLTableCellElement>("td.tf-atome").forEach((td) => {
    if (texte.has(td.cellIndex) && td.colSpan === 1) {
      td.classList.remove("tf-atome");
      td.classList.add("tf-texte");
    }
  });
}

/** Frontière la plus proche du pointeur : colonne visible de gauche, ou null. */
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
    window.addEventListener("resize", tout);

    // Curseur ↔ sur la frontière, au survol (souris).
    const surMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      document.querySelectorAll<HTMLElement>("th.tf-pres").forEach((el) => el.classList.remove("tf-pres"));
      const table = tableEnTeteSous(e.target, e.clientY);
      if (!table) return;
      const f = frontiereSous(table, e.clientX, ZONE_SOURIS);
      if (f) enTetes(table)[f.gauche].classList.add("tf-pres");
    };

    // Glisser la frontière : règle la largeur (minimale) de la colonne de gauche.
    let dernierTap = 0;
    const surDown = (e: PointerEvent) => {
      const table = tableEnTeteSous(e.target, e.clientY);
      if (!table) return;
      const zone = e.pointerType === "touch" ? ZONE_DOIGT : ZONE_SOURIS;
      const f = frontiereSous(table, e.clientX, zone);
      if (!f) return;
      e.preventDefault();
      e.stopPropagation();

      const cle = table.dataset.tf || "";
      // Double-tap / double-clic sur la frontière → largeurs automatiques.
      const maintenant = Date.now();
      if (maintenant - dernierTap < 350) {
        dernierTap = 0;
        const memo = lireMemo();
        delete memo[cle];
        ecrireMemo(memo);
        appliquerLargeurs(table);
        return;
      }
      dernierTap = maintenant;

      const ths = enTetes(table);
      const th = ths[f.gauche];
      const depart = th.getBoundingClientRect().width;
      const x0 = e.clientX;
      const cible = e.target as HTMLElement;
      try { cible.setPointerCapture(e.pointerId); } catch { /* ignoré */ }
      table.classList.add("tf-glisse");
      th.classList.add("tf-actif");
      let largeur = depart;

      const bouger = (ev: PointerEvent) => {
        largeur = Math.max(LARGEUR_MIN, depart + (ev.clientX - x0));
        th.style.width = `${largeur}px`;
        th.style.minWidth = `${largeur}px`;
      };
      const lacher = () => {
        cible.removeEventListener("pointermove", bouger);
        cible.removeEventListener("pointerup", lacher);
        cible.removeEventListener("pointercancel", lacher);
        table.classList.remove("tf-glisse");
        th.classList.remove("tf-actif");
        const memo = lireMemo();
        memo[cle] = { ...(memo[cle] || {}), [f.gauche]: Math.round(largeur) };
        ecrireMemo(memo);
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
      window.removeEventListener("resize", tout);
      document.removeEventListener("pointerdown", surDown, true);
      document.removeEventListener("pointermove", surMove);
      document.removeEventListener("click", surClick, true);
    };
  }, [pathname]);

  return null;
}
