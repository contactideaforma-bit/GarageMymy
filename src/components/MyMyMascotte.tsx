"use client";

// « MY-MY » MASCOTTE ANIMÉE (v13.43)
//
// La mascotte en SVG vectoriel (console rose, écran crème, visage, croix et
// boutons, bras et jambes filaires). Chaque partie est un groupe que l'on
// anime séparément :
//   • les pupilles et les sourcils SUIVENT LA SOURIS (pointeur fin) ;
//     au doigt, elle regarde là où on a touché puis revient ;
//   • elle CLIGNE des yeux, respire, salue de la main ;
//   • au CLIC elle réagit (coucou, chatouilles, saut, toupie, bouderie…) ;
//   • elle se BALADE le long du bas de l'écran (ordinateur seulement),
//     se cache derrière le bord et réapparaît par surprise ;
//   • elle donne des ASTUCES dans une bulle (texte + lien optionnel).
//
// Deux modes :
//   mode="vitrine" → site public : réactions ludiques au clic.
//   mode="appli"   → garage connecté : le clic OUVRE le chat (onOuvrir) après
//                    un petit saut ; les réactions ludiques arrivent au 5e clic
//                    rapide. Elle se balade moins (c'est un outil, pas un jouet).
//
// Respecte prefers-reduced-motion (pas de balade ni de rebond), ne bouge
// jamais quand un champ de saisie a le focus, et reste en bas à droite sur
// téléphone. Textes : lib/mymyMascotte.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ASTUCES_VITRINE,
  AstuceMyMy,
  GesteMyMy,
  REACTIONS_CLIC,
  SURPRISES,
  TAQUINERIES,
  astucesPourRoute,
  tirerAuHasard,
} from "@/lib/mymyMascotte";

type Props = {
  mode: "vitrine" | "appli";
  /** Mode appli : ouvrir la fenêtre de discussion. */
  onOuvrir?: () => void;
  /** Bulle affichée dès l'arrivée (ex. premier « coucou »). */
  messageInitial?: string | null;
  /** Autoriser la balade (ordinateur). Par défaut : oui. */
  balade?: boolean;
};

type Bulle = { texte: string; href?: string; label?: string; id: number };
type Humeur = "normal" | "content" | "surpris" | "boude" | "clin";

const LARGEUR_PC = 118; // px rendus (viewBox 220 → ~118 px de large)
const LARGEUR_MOBILE = 84;
const MARGE = 18;

function estPointeurFin(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;
}
function mouvementReduit(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
function champActif(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable;
}
function grandEcran(): boolean {
  return typeof window !== "undefined" && window.innerWidth >= 1024;
}

export default function MyMyMascotte({ mode, onOuvrir, messageInitial, balade = true }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  /* ------------------------------ État ------------------------------ */
  const [regard, setRegard] = useState({ x: 0, y: 0 }); // décalage pupilles (unités SVG)
  const [sourcils, setSourcils] = useState(0); // -1 (froncés) … +1 (levés)
  const [humeur, setHumeur] = useState<Humeur>("normal");
  const [geste, setGeste] = useState<GesteMyMy | "marche" | null>(null);
  const [bulle, setBulle] = useState<Bulle | null>(null);
  const [survol, setSurvol] = useState(false);
  // Position : px depuis la gauche ; null = « à la maison » (bas à droite).
  const [x, setXEtat] = useState<number | null>(null);
  // Copie synchrone de la position : les scénarios asynchrones enchaînent
  // plusieurs déplacements et ne doivent pas lire un état périmé.
  const xRef = useRef<number | null>(null);
  const setX = useCallback((v: number | null) => {
    xRef.current = v;
    setXEtat(v);
  }, []);
  const [dureeMarche, setDureeMarche] = useState(0);
  const [face, setFace] = useState<1 | -1>(1); // 1 = regarde à droite
  const [cache, setCache] = useState(false);
  const [largeur, setLargeur] = useState(LARGEUR_PC);
  const [monte, setMonte] = useState(false);

  const racineRef = useRef<HTMLDivElement>(null);
  const clicsRef = useRef<{ n: number; dernier: number }>({ n: 0, dernier: 0 });
  const bulleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gesteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const regardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const survolTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const derniereAstuce = useRef<AstuceMyMy | null>(null);
  const occupeRef = useRef(false); // en train de marcher / se cacher
  const bulleId = useRef(0);

  useEffect(() => {
    setMonte(true);
    const maj = () => setLargeur(window.innerWidth < 640 ? LARGEUR_MOBILE : LARGEUR_PC);
    maj();
    window.addEventListener("resize", maj);
    return () => window.removeEventListener("resize", maj);
  }, []);

  /* ---------------------------- Bulles ------------------------------ */
  const parler = useCallback((b: Omit<Bulle, "id">, duree = 8000) => {
    if (bulleTimer.current) clearTimeout(bulleTimer.current);
    bulleId.current += 1;
    setBulle({ ...b, id: bulleId.current });
    bulleTimer.current = setTimeout(() => setBulle(null), duree);
  }, []);
  const taire = useCallback(() => {
    if (bulleTimer.current) clearTimeout(bulleTimer.current);
    setBulle(null);
  }, []);

  useEffect(() => {
    if (messageInitial) parler({ texte: messageInitial }, 7000);
  }, [messageInitial, parler]);

  /* ---------------------------- Gestes ------------------------------ */
  const faireGeste = useCallback((g: GesteMyMy, h: Humeur = "content", duree = 1200) => {
    if (gesteTimer.current) clearTimeout(gesteTimer.current);
    setGeste(g);
    setHumeur(h);
    gesteTimer.current = setTimeout(() => {
      setGeste(null);
      setHumeur("normal");
    }, duree);
  }, []);

  /* ----------------------- Suivi de la souris ----------------------- */
  useEffect(() => {
    if (!monte) return;
    const fin = estPointeurFin();
    let raf = 0;
    const viser = (cx: number, cy: number) => {
      const el = racineRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Centre des yeux ≈ 35 % de la hauteur de la mascotte.
      const ex = r.left + r.width / 2;
      const ey = r.top + r.height * 0.35;
      const dx = cx - ex;
      const dy = cy - ey;
      const dist = Math.hypot(dx, dy) || 1;
      const amp = Math.min(1, dist / 160); // tout près : regard léger
      const max = 6.5;
      // Si elle regarde à gauche (face = -1) le SVG est retourné : on
      // inverse le décalage horizontal pour que les yeux suivent quand même.
      setRegard({ x: (dx / dist) * max * amp * face, y: (dy / dist) * max * amp * 0.8 });
      // Sourcils : levés quand le curseur est haut, légèrement froncés en bas.
      setSourcils(Math.max(-1, Math.min(1, -dy / 300)));
    };
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        viser(e.clientX, e.clientY);
      });
    };
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      viser(t.clientX, t.clientY);
      if (regardTimer.current) clearTimeout(regardTimer.current);
      regardTimer.current = setTimeout(() => {
        setRegard({ x: 0, y: 0 });
        setSourcils(0);
      }, 1800);
    };
    if (fin) window.addEventListener("pointermove", onMove, { passive: true });
    else window.addEventListener("touchstart", onTouch, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("touchstart", onTouch);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [monte, face]);

  /* ------------------------------ Clic ------------------------------ */
  const onClic = () => {
    const maintenant = Date.now();
    const c = clicsRef.current;
    c.n = maintenant - c.dernier < 2500 ? c.n + 1 : 1;
    c.dernier = maintenant;

    if (mode === "appli") {
      // Outil avant tout : petit saut puis on ouvre le chat. La série de
      // réactions ludiques est réservée aux clics rapides répétés.
      if (c.n >= 5) {
        const r = REACTIONS_CLIC[Math.min(c.n - 1, REACTIONS_CLIC.length - 1)];
        faireGeste(r.geste, r.geste === "boude" ? "boude" : r.geste === "clin" ? "clin" : "content", 1500);
        parler({ texte: r.texte }, 3000);
        return;
      }
      faireGeste("saut", "content", 500);
      taire();
      setTimeout(() => onOuvrir?.(), 280);
      return;
    }

    const r = REACTIONS_CLIC[Math.min(c.n - 1, REACTIONS_CLIC.length - 1)];
    if (c.n > REACTIONS_CLIC.length) c.n = 0; // on recommence le cycle
    faireGeste(r.geste, r.geste === "boude" ? "boude" : r.geste === "clin" ? "clin" : r.geste === "surprise" ? "surpris" : "content", 1500);
    parler({ texte: r.texte }, 3500);
  };

  /* --------------------------- Survol long -------------------------- */
  const onEntrer = () => {
    setSurvol(true);
    if (survolTimer.current) clearTimeout(survolTimer.current);
    survolTimer.current = setTimeout(() => {
      if (!bulle && !occupeRef.current) parler({ texte: tirerAuHasard(TAQUINERIES) }, 3000);
    }, 2600);
  };
  const onSortir = () => {
    setSurvol(false);
    if (survolTimer.current) clearTimeout(survolTimer.current);
  };

  /* ------------------------- Balade / cachette ---------------------- */
  const maison = useCallback(() => window.innerWidth - largeur - MARGE, [largeur]);

  const marcherVers = useCallback(
    (cible: number) =>
      new Promise<void>((resolve) => {
        const depart = xRef.current ?? maison();
        const distance = Math.abs(cible - depart);
        if (distance < 4) return resolve();
        const duree = Math.max(700, distance * 6); // ~6 ms par px
        setFace(cible > depart ? 1 : -1);
        setDureeMarche(duree);
        setGeste("marche");
        // Si on est « à la maison » (x = null), on pose d'abord la valeur
        // réelle pour que la transition CSS ait un point de départ.
        setX(depart);
        requestAnimationFrame(() => requestAnimationFrame(() => setX(cible)));
        setTimeout(() => {
          setGeste(null);
          setFace(1);
          resolve();
        }, duree + 60);
      }),
    [maison, setX],
  );

  const scenarios = useMemo(
    () => ({
      // Marche vers un point au hasard puis revient (appli) ou y reste (vitrine).
      async balade() {
        const w = window.innerWidth;
        const cible = Math.round(MARGE + Math.random() * (w - largeur - 2 * MARGE));
        await marcherVers(cible);
        if (mode === "appli") {
          await new Promise((r) => setTimeout(r, 6000 + Math.random() * 8000));
          await marcherVers(maison());
          setX(null);
        }
      },
      // Sort par la droite, attend, et surgit du bord gauche.
      async cachette() {
        await marcherVers(window.innerWidth + 10);
        setCache(true);
        await new Promise((r) => setTimeout(r, 5000 + Math.random() * 7000));
        if (champActif()) {
          // On ne surprend pas quelqu'un qui tape : retour discret.
          setCache(false);
          setX(maison());
          setTimeout(() => setX(null), 50);
          return;
        }
        setDureeMarche(0);
        setX(-largeur - 10);
        setFace(1);
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
        setCache(false);
        faireGeste("surprise", "surpris", 1400);
        parler({ texte: tirerAuHasard(SURPRISES) }, 3500);
        await marcherVers(MARGE);
        if (mode === "appli") {
          await new Promise((r) => setTimeout(r, 7000));
          await marcherVers(maison());
          setX(null);
        }
      },
      async retour() {
        await marcherVers(maison());
        setX(null);
      },
    }),
    [marcherVers, maison, mode, largeur, faireGeste, parler, setX],
  );

  // Planificateur : toutes les 35-80 s (vitrine) / 60-120 s (appli), une
  // petite action : astuce (le plus souvent), balade, cachette, coucou.
  const scenariosRef = useRef(scenarios);
  scenariosRef.current = scenarios;
  useEffect(() => {
    if (!monte) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let actif = true;
    const [min, max] = mode === "vitrine" ? [35000, 80000] : [60000, 120000];
    const premier = mode === "vitrine" ? 14000 : 25000;

    const action = async () => {
      if (!actif || occupeRef.current || document.visibilityState === "hidden") return;
      const bouge = balade && grandEcran() && !mouvementReduit() && !champActif();
      const tirage = Math.random();
      const pBalade = mode === "vitrine" ? 0.28 : 0.12;
      const pCache = mode === "vitrine" ? 0.14 : 0.06;
      occupeRef.current = true;
      try {
        if (bouge && tirage < pCache) {
          taire();
          await scenariosRef.current.cachette();
        } else if (bouge && tirage < pCache + pBalade) {
          taire();
          await scenariosRef.current.balade();
        } else if (tirage > 0.9) {
          faireGeste("coucou", "content", 1600);
        } else {
          const liste = mode === "vitrine" ? ASTUCES_VITRINE : astucesPourRoute(pathname);
          const a = tirerAuHasard(liste, derniereAstuce.current ?? undefined);
          derniereAstuce.current = a;
          faireGeste("coucou", "content", 1200);
          parler(a, 9000);
        }
      } finally {
        occupeRef.current = false;
      }
    };
    const planifier = (delai: number) => {
      timer = setTimeout(async () => {
        await action();
        if (actif) planifier(min + Math.random() * (max - min));
      }, delai);
    };
    planifier(premier);
    return () => {
      actif = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monte, mode, balade, pathname]);

  // Fenêtre redimensionnée / passage mobile : on rentre à la maison.
  useEffect(() => {
    const onResize = () => {
      if (!grandEcran()) {
        setX(null);
        setCache(false);
        setDureeMarche(0);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* --------------------------- Nettoyage ---------------------------- */
  useEffect(
    () => () => {
      [bulleTimer, gesteTimer, regardTimer, survolTimer].forEach((t) => t.current && clearTimeout(t.current));
    },
    [],
  );

  if (!monte) return null;

  /* ---------------------------- Visage ------------------------------ */
  const bouche =
    humeur === "surpris"
      ? "M100 100 a10 11 0 1 0 20 0 a10 11 0 1 0 -20 0"
      : humeur === "boude"
      ? "M88 108 Q110 100 132 108"
      : humeur === "content" || humeur === "clin"
      ? "M82 94 Q110 128 138 94 Z"
      : "M85 98 Q110 120 135 98";
  const sourcilY = -sourcils * 4 + (survol ? -2 : 0) + (humeur === "surpris" ? -5 : 0);
  const sourcilRot = humeur === "boude" ? 14 : 0;

  // Bulle : à gauche de la mascotte si elle est dans la moitié droite.
  const posX = x ?? (typeof window !== "undefined" ? maison() : 0);
  const bulleAGauche = typeof window !== "undefined" ? posX + largeur / 2 > window.innerWidth / 2 : true;
  const style: React.CSSProperties = {
    left: x === null ? undefined : x,
    right: x === null ? MARGE : undefined,
    bottom: 10,
    width: largeur,
    transition: dureeMarche ? `left ${dureeMarche}ms linear` : undefined,
    visibility: cache ? "hidden" : "visible",
  };

  return (
    <div ref={racineRef} className={`mymy-masc fixed z-40 select-none ${geste ? `mymy-masc--${geste}` : ""}`} style={style}>
      {/* ------------------------------ Bulle ------------------------------ */}
      {bulle && (
        <div
          key={bulle.id}
          className={`mymy-masc-bulle mymy-bulle absolute bottom-[92%] text-[13px] leading-snug shadow-lg ${
            bulleAGauche ? "right-[60%] rounded-2xl rounded-br-sm" : "left-[60%] rounded-2xl rounded-bl-sm"
          } ${mode === "vitrine" ? "mymy-masc-bulle--claire" : ""}`}
          role="status"
        >
          <button type="button" onClick={taire} aria-label="Fermer" className="mymy-masc-fermer">
            ×
          </button>
          <div className="pr-4">{bulle.texte}</div>
          {bulle.href && (
            <button
              type="button"
              onClick={() => {
                taire();
                router.push(bulle.href!);
              }}
              className="mymy-lien mt-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
            >
              {bulle.label || "Voir"} →
            </button>
          )}
        </div>
      )}

      {/* ---------------------------- Personnage --------------------------- */}
      <button
        type="button"
        onClick={onClic}
        onMouseEnter={onEntrer}
        onMouseLeave={onSortir}
        aria-label={mode === "appli" ? "Ouvrir l'assistant MY-MY" : "MY-MY, la mascotte"}
        title={mode === "appli" ? "MY-MY — ton assistant" : "Coucou, c'est MY-MY"}
        className="mymy-masc-corps block w-full cursor-pointer bg-transparent p-0"
      >
        <svg
          viewBox="0 0 220 240"
          width="100%"
          height="auto"
          aria-hidden="true"
          className="mymy-masc-svg overflow-visible"
          style={{ transform: `scaleX(${face})` }}
        >
          {/* Jambes */}
          <g className="mymy-masc-jambe mymy-masc-jambe--g" stroke="#1f1f1f" strokeWidth="3.5" strokeLinecap="round" fill="none">
            <path d="M92 168 V212 L80 217" />
          </g>
          <g className="mymy-masc-jambe mymy-masc-jambe--d" stroke="#1f1f1f" strokeWidth="3.5" strokeLinecap="round" fill="none">
            <path d="M128 168 V212 L140 217" />
          </g>
          {/* Bras */}
          <g className="mymy-masc-bras mymy-masc-bras--g" stroke="#1f1f1f" strokeWidth="3.5" strokeLinecap="round" fill="none">
            <path d="M31 112 C 12 126, 7 152, 19 166" />
          </g>
          <g className="mymy-masc-bras mymy-masc-bras--d" stroke="#1f1f1f" strokeWidth="3.5" strokeLinecap="round" fill="none">
            <path d="M189 112 C 208 126, 213 152, 201 166" />
          </g>
          {/* Corps */}
          <g className="mymy-masc-torse">
            <rect x="30" y="18" width="160" height="152" rx="16" fill="#ee2a8e" stroke="#1f1f1f" strokeWidth="3" />
            <rect x="42" y="30" width="136" height="98" rx="9" fill="#fbf3ea" stroke="#2a2a2a" strokeWidth="2" />
            {/* Sourcils */}
            <g
              className="mymy-masc-sourcils"
              stroke="#1f1f1f"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
              style={{ transform: `translateY(${sourcilY}px)`, transition: "transform 180ms ease-out" }}
            >
              <path d="M70 58 Q84 48 98 56" style={{ transform: `rotate(${sourcilRot}deg)`, transformOrigin: "84px 54px", transition: "transform 200ms" }} />
              <path d="M122 56 Q136 48 150 58" style={{ transform: `rotate(${-sourcilRot}deg)`, transformOrigin: "136px 54px", transition: "transform 200ms" }} />
            </g>
            {/* Yeux */}
            <g className="mymy-masc-yeux" style={{ transform: `translate(${regard.x}px, ${regard.y}px)`, transition: "transform 90ms linear" }}>
              <circle className="mymy-masc-oeil" cx="86" cy="76" r="6.5" fill="#1f1f1f" />
              <circle className={`mymy-masc-oeil ${humeur === "clin" ? "mymy-masc-oeil--ferme" : ""}`} cx="134" cy="76" r="6.5" fill="#1f1f1f" />
            </g>
            {/* Bouche */}
            <path
              className="mymy-masc-bouche"
              d={bouche}
              fill={humeur === "content" || humeur === "clin" ? "#1f1f1f" : humeur === "surpris" ? "#1f1f1f" : "none"}
              stroke="#1f1f1f"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transition: "d 200ms" }}
            />
            {/* Croix directionnelle */}
            <g fill="#5b9fae" stroke="#1f1f1f" strokeWidth="1.5">
              <rect x="60" y="143" width="34" height="12" rx="3" />
              <rect x="71" y="132" width="12" height="34" rx="3" />
              <rect x="72" y="144" width="10" height="10" rx="1" stroke="none" />
            </g>
            {/* Trois petites touches */}
            <g fill="#8cc58f" stroke="#1f1f1f" strokeWidth="1.2">
              <rect x="100" y="138" width="11" height="5.5" rx="2.75" />
              <rect x="115" y="138" width="11" height="5.5" rx="2.75" />
              <rect x="130" y="138" width="11" height="5.5" rx="2.75" />
            </g>
            {/* Boutons A/B/X/Y */}
            <g stroke="#1f1f1f" strokeWidth="1.3">
              <circle cx="158" cy="138" r="5.5" fill="#5b9fae" />
              <circle cx="147" cy="150" r="5.5" fill="#f2b04a" />
              <circle cx="169" cy="150" r="5.5" fill="#f2b04a" />
              <circle cx="158" cy="162" r="5.5" fill="#5b9fae" />
            </g>
          </g>
        </svg>
        {mode === "appli" && <span className="mymy-masc-badge" aria-hidden="true" />}
      </button>
    </div>
  );
}
