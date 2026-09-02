"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import BandeauService from "@/components/BandeauService";
import BandeauHorsLigne from "@/components/BandeauHorsLigne";
import MyMyChat from "@/components/MyMyChat";
import BandeauCompte from "@/components/BandeauCompte";
import { estRoutePublique } from "@/lib/routesPubliques";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
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
  useEffect(() => {
    if (publique || typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, [publique]);

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
      {/* Barre du haut (mobile uniquement) — fond opaque pour que le
          contenu ne soit pas visible derrière en défilant */}
      <div className="lg:hidden sticky top-0 z-30 p-3 topbar-mobile">
        <div className="glass-card glass-blur flex items-center gap-3 px-3 py-2">
          <button
            onClick={() => setOpen(true)}
            aria-label="Ouvrir le menu"
            className="btn-ghost btn-compact px-2.5 text-lg leading-none"
          >
            ☰
          </button>
          <Image src="/logo.png" alt="" width={28} height={28} />
          <span className="marque">My Easy Auto</span>
        </div>
      </div>

      {/* Fond sombre (mobile, quand le tiroir est ouvert) */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-md"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Tiroir / barre latérale. Sur grand écran (v10.6) : dans le FLUX de
          la page — sa hauteur est celle de SON contenu (self-start, h-auto),
          plus de bas épinglé ni de défilement interne : elle défile AVEC la
          page. Sur mobile, le tiroir reste plein écran et défile lui-même. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 p-3 transition-transform duration-200
          lg:static lg:h-auto lg:self-start lg:z-auto lg:translate-x-0 lg:shrink-0
          ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="relative h-full overflow-y-auto lg:h-auto lg:overflow-visible">
          {/* Bouton fermer (mobile) */}
          <button
            onClick={() => setOpen(false)}
            aria-label="Fermer le menu"
            className="lg:hidden absolute right-2 top-2 z-10 btn-ghost btn-compact px-2.5 text-lg leading-none"
          >
            ×
          </button>
          <Sidebar onNavigate={() => setOpen(false)} />
        </div>
      </aside>

        {/* Contenu */}
        <main className="min-w-0 flex-1 p-3 sm:p-4 lg:p-6">{children}</main>
      </div>
      {/* MY-MY (v9.5) : l'assistant du garage, en bas à droite de toutes les pages. */}
      <MyMyChat />
    </div>
  );
}
