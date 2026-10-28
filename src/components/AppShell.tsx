"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import BandeauService from "@/components/BandeauService";
import BandeauHorsLigne from "@/components/BandeauHorsLigne";
import MyMyChat from "@/components/MyMyChat";
import TableauxFluides from "@/components/TableauxFluides";
import BoutonHaut from "@/components/BoutonHaut";
import BoutonActualiser from "@/components/BoutonActualiser";
import Salutation from "@/components/Salutation";
import Link from "next/link";
import BandeauCompte from "@/components/BandeauCompte";
import BarreMobile from "@/components/mobile/BarreMobile";
import { estRoutePublique } from "@/lib/routesPubliques";
import { annulerRetourAttendu } from "@/lib/filtresListe";
import { estRouteExpert } from "@/lib/expertise/acces";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // NOTIFICATIONS PUSH (v42) : on ré-enregistre le service worker à chaque
  // ouverture de l'appli. Sans ça, une correction de /sw.js ne s'appliquerait
  // que le jour où l'utilisateur ferme tous ses onglets. L'appel est silencieux
  // (aucune autorisation demandée ici) et sans effet si le navigateur ne gère
  // pas les service workers. Exclu des pages publiques.
  // ÉTAT DU SERVICE (v9.9) : page publique (consultable sans compte), mais
  // quand on est CONNECTÉ elle garde la barre latérale — on y vient depuis
  // le menu, on doit pouvoir en repartir de la même façon.
  const [connecte, setConnecte] = useState(false);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => setConnecte(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setConnecte(Boolean(session)));
    return () => sub.subscription.unsubscribe();
  }, []);
  const publique = estRoutePublique(pathname) && !(pathname === "/etat" && connecte);
  // v13.22 : les filtres de la liste des sinistres ne sont restaurés qu'au
  // retour direct d'un dossier. Dès qu'on va ailleurs, on oublie.
  useEffect(() => {
    if (!pathname || pathname === "/sinistres" || pathname.startsWith("/sinistres/")) return;
    annulerRetourAttendu("sinistres.selection");
  }, [pathname]);
  useEffect(() => {
    if (publique || typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, [publique]);

  // MODE EXPERT (v13.5) : coque dédiée (ExpertShell dans app/expert/layout.tsx).
  if (estRouteExpert(pathname)) {
    return <>{children}</>;
  }

  // Pages publiques (signature à distance, mentions légales) : pas de barre
  // latérale ni de menu.
  if (publique) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <div>
      {/* Bandeau d'incident (v45) : au-dessus de tout, sur toutes les pages
          de l'appli — un garage bloqué doit savoir tout de suite que ça ne
          vient pas de lui. */}
      <BandeauService />
      {/* Mode dégradé (v47) : coupure réseau et modifications en attente. */}
      <BandeauHorsLigne />
      {/* État du compte (v10.1) : suspension pour impayé, lecture seule à la
          fin du contrat, fermeture — piloté depuis l'espace éditeur. */}
      <BandeauCompte />
      <div className="lg:flex min-h-screen">
      {/* COQUE MOBILE (v13.50) : plus de tiroir sur téléphone — la
          navigation passe par la barre d'onglets du bas (BarreMobile) et
          l'onglet « Plus ». En haut, une barre fine : logo → accueil,
          salutation, actualiser. */}
      <div className="lg:hidden sticky top-0 z-30 px-3 py-1.5 topbar-mobile">
        <div className="flex items-center gap-2.5 px-1 py-1">
          <Link href="/" aria-label="Tableau de bord" title="Retour au tableau de bord" className="flex min-w-0 flex-1 items-center gap-2">
            <Image src="/logo.png" alt="" width={30} height={30} className="shrink-0" />
            <Salutation />
          </Link>
          <BoutonActualiser inline />
        </div>
      </div>

      {/* Barre latérale (grand écran seulement, v10.6 : dans le FLUX de la
          page, hauteur = son contenu, défile avec la page). */}
      <aside className="hidden w-64 shrink-0 self-start p-3 lg:block">
        <Sidebar />
      </aside>

        {/* Contenu */}
        <main className="contenu-appli min-w-0 flex-1 p-3 sm:p-4 lg:p-6">{children}</main>
      </div>
      {/* MY-MY (v9.5) : l'assistant du garage, en bas à droite de toutes les pages. */}
      <MyMyChat />
      {/* v12.6 : tous les tableaux tiennent dans l'écran, colonnes réglables au doigt. */}
      <TableauxFluides />
      {/* v12.7 : remonter en haut dès qu'on a défilé. */}
      <BoutonHaut />
      {/* v13.50 : barre d'onglets du bas + raccourcis + recherche (téléphone / tablette). */}
      <BarreMobile />
    </div>
  );
}
