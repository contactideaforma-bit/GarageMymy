"use client";

// ============================================================
//  BARRE D'ONGLETS DU BAS (v13.50) — la navigation mobile de l'appli.
//  Accueil · Dossiers · (+) · Recherche · Plus. Le tiroir et ses 24 entrées
//  disparaissent sur téléphone : tout le reste du menu vit dans « Plus ».
//  Le bouton « + » ouvre les RACCOURCIS : nouveau dossier, photos d'un
//  véhicule, recherche, contacter un client. N'importe quel écran peut
//  ouvrir la recherche ou les raccourcis via les événements de lib/mobile.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMetier } from "@/components/MetierProvider";
import { termes } from "@/lib/metier";
import { EVT_ACTIONS, EVT_RECHERCHE, type ModeRecherche } from "@/lib/mobile";
import Feuille from "@/components/mobile/Feuille";
import RechercheMobile from "@/components/mobile/RechercheMobile";
import Ico from "@/components/Ico";

function IcoNav({ nom }: { nom: "accueil" | "dossiers" | "recherche" | "plus" }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (nom) {
    case "accueil":
      return <svg viewBox="0 0 24 24" {...p} aria-hidden><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h5v-6h4v6h5V10" /></svg>;
    case "dossiers":
      return <svg viewBox="0 0 24 24" {...p} aria-hidden><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
    case "recherche":
      return <svg viewBox="0 0 24 24" {...p} aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
    case "plus":
      return <svg viewBox="0 0 24 24" {...p} aria-hidden><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></svg>;
  }
}

export default function BarreMobile() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { metier } = useMetier();
  const t = termes(metier);
  const [recherche, setRecherche] = useState<ModeRecherche | null>(null);
  const [actions, setActions] = useState(false);

  useEffect(() => {
    const surRecherche = (e: Event) => {
      const mode = (e as CustomEvent<{ mode?: ModeRecherche }>).detail?.mode || "ouvrir";
      setActions(false);
      setRecherche(mode);
    };
    const surActions = () => {
      setRecherche(null);
      setActions(true);
    };
    window.addEventListener(EVT_RECHERCHE, surRecherche);
    window.addEventListener(EVT_ACTIONS, surActions);
    return () => {
      window.removeEventListener(EVT_RECHERCHE, surRecherche);
      window.removeEventListener(EVT_ACTIONS, surActions);
    };
  }, []);

  const fermerRecherche = useCallback(() => setRecherche(null), []);
  const fermerActions = useCallback(() => setActions(false), []);

  const actif = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
  const dansPlus = !["/", "/sinistres"].some(actif) && !recherche;

  const Onglet = ({ href, ico, lib }: { href: string; ico: "accueil" | "dossiers" | "plus"; lib: string }) => (
    <Link href={href} className={`barre-mobile-item ${(href === "/plus" ? dansPlus : actif(href)) ? "actif" : ""}`} aria-current={actif(href) ? "page" : undefined}>
      <IcoNav nom={ico} />
      <span>{lib}</span>
    </Link>
  );

  return (
    <>
      <nav className="barre-mobile lg:hidden" aria-label="Navigation principale">
        <div className="flex items-stretch">
          <Onglet href="/" ico="accueil" lib="Accueil" />
          <Onglet href="/sinistres" ico="dossiers" lib={t.dossiers} />
          <button type="button" className="barre-mobile-item" onClick={() => setActions(true)} aria-label="Actions rapides">
            <span className="barre-mobile-plus" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-7 w-7"><path d="M12 5v14M5 12h14" /></svg>
            </span>
          </button>
          <button type="button" className={`barre-mobile-item ${recherche ? "actif" : ""}`} onClick={() => setRecherche("ouvrir")}>
            <IcoNav nom="recherche" />
            <span>Recherche</span>
          </button>
          <Onglet href="/plus" ico="plus" lib="Plus" />
        </div>
      </nav>

      {actions && (
        <Feuille titre="Actions rapides" onClose={fermerActions}>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              className="tuile-action"
              onClick={() => {
                fermerActions();
                router.push("/import");
              }}
            >
              <span className="ico" aria-hidden><Ico n="file" /></span>
              <span className="lib">Nouveau dossier</span>
              <span className="sous">Importer un rapport d&apos;expertise</span>
            </button>
            <button type="button" className="tuile-action" onClick={() => setRecherche("photos")}>
              <span className="ico" aria-hidden><Ico n="camera" /></span>
              <span className="lib">Photos du véhicule</span>
              <span className="sous">État à l&apos;entrée / à la sortie</span>
            </button>
            <button type="button" className="tuile-action" onClick={() => setRecherche("ouvrir")}>
              <span className="ico" aria-hidden><Ico n="search" /></span>
              <span className="lib">Trouver un dossier</span>
              <span className="sous">Plaque, client, n° de sinistre</span>
            </button>
            <button type="button" className="tuile-action" onClick={() => setRecherche("contact")}>
              <span className="ico" aria-hidden><Ico n="phone" /></span>
              <span className="lib">Contacter un client</span>
              <span className="sous">Appel, SMS, WhatsApp, récap</span>
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/sinistres?nouveau=1" onClick={fermerActions} className="chip">+ Dossier manuel</Link>
            <Link href="/agenda" onClick={fermerActions} className="chip"><Ico n="calendar" /> Agenda</Link>
            <Link href="/conversation" onClick={fermerActions} className="chip"><Ico n="message" /> Conversation</Link>
            <Link href="/vehicules" onClick={fermerActions} className="chip"><Ico n="car" /> Véhicules au garage</Link>
          </div>
        </Feuille>
      )}

      {recherche && <RechercheMobile mode={recherche} onClose={fermerRecherche} />}
    </>
  );
}
