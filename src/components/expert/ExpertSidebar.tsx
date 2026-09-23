"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import BoutonActualiser from "@/components/BoutonActualiser";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { VERSION_LABEL } from "@/lib/version";
import Icone, { NomIcone } from "@/components/expert/Icone";

type Lien = { href: string; label: string; icone: NomIcone; exact?: boolean };

// v13.23 : l'appli est centrée sur le CONTRÔLE DU DEVIS ; le reste passe
// au second plan dans « Outils » (rien n'est supprimé).
const PRINCIPAUX: Lien[] = [
  { href: "/expert/controles", label: "Devis à contrôler", icone: "check" },
  { href: "/expert", label: "Tableau de bord", icone: "tableau", exact: true },
  { href: "/expert/dossiers", label: "Dossiers", icone: "dossiers" },
  { href: "/expert/reparateurs", label: "Réparateurs", icone: "outil" },
];
const OUTILS: Lien[] = [
  { href: "/expert/rapports", label: "Rapports émis", icone: "rapport" },
  { href: "/expert/agenda", label: "RDV expert", icone: "agenda" },
  { href: "/expert/pieces", label: "Recherche de pièces", icone: "recherche" },
  { href: "/expert/annuaire", label: "Base de données", icone: "base" },
  { href: "/expert/cabinet", label: "Le cabinet", icone: "cabinet" },
];

export default function ExpertSidebar({ email, onNavigate }: { email: string | null; onNavigate?: () => void }) {
  const pathname = usePathname();
  const actif = (l: Lien) => (l.exact ? pathname === l.href : pathname.startsWith(l.href));
  const dansOutils = OUTILS.some(actif);
  const [outils, setOutils] = useState(dansOutils);
  useEffect(() => { if (dansOutils) setOutils(true); }, [dansOutils]);
  return (
    <div className="glass-card glass-blur min-h-full flex flex-col p-3">
      <div className="flex items-start gap-2 px-2 py-3">
        <Link href="/expert" onClick={onNavigate} className="block min-w-0 flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/alliance/logo.png" alt="Alliance Experts" className="h-12 w-auto" />
          <div className="mt-2 text-[11px] text-white/50">Cabinet d&apos;expertise automobile</div>
        </Link>
        {/* v13.21 : actualiser la page (grand écran). */}
        <div className="hidden lg:block"><BoutonActualiser inline /></div>
      </div>

      <Link href="/expert/controles?nouveau=1" onClick={onNavigate} className="btn-primary mt-2 mb-4 flex items-center justify-center gap-2 text-center">
        <Icone nom="plus" /> Nouveau contrôle
      </Link>

      <nav className="space-y-0.5">
        {PRINCIPAUX.map((l) => (
          <Link key={l.href} href={l.href} onClick={onNavigate} className={`nav-lien ${actif(l) ? "actif" : ""}`}>
            <Icone nom={l.icone} className="opacity-70" />
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="mt-3 border-t border-white/10 pt-2">
        <button type="button" onClick={() => setOutils((o) => !o)} className="nav-lien nav-compact w-full justify-between" aria-expanded={outils}>
          <span className="flex items-center gap-2"><Icone nom="outil" className="opacity-70" /> Outils</span>
          <Icone nom="chevron" className={`opacity-50 transition-transform ${outils ? "rotate-90" : ""}`} />
        </button>
        {outils && (
          <nav className="mt-0.5 space-y-0.5 pl-2">
            {OUTILS.map((l) => (
              <Link key={l.href} href={l.href} onClick={onNavigate} className={`nav-lien nav-compact ${actif(l) ? "actif" : ""}`}>
                <Icone nom={l.icone} className="opacity-70" />
                {l.label}
              </Link>
            ))}
          </nav>
        )}
      </div>

      <div className="space-y-0 border-t border-white/10 pt-2 mt-4">
        <Link href="/expert/profil" onClick={onNavigate} className={`nav-lien nav-compact ${pathname.startsWith("/expert/profil") ? "actif" : ""}`}>
          <Icone nom="profil" className="opacity-70" /> Profil expert
        </Link>
        {email && (
          <button onClick={() => supabase.auth.signOut()} className="nav-lien nav-compact">
            Se déconnecter
          </button>
        )}
        {email && <div className="px-3 pt-0.5 text-[10px] text-white/30 truncate">{email}</div>}
        <div className="px-3 pt-1 text-[10px] text-white/30">Propulsé par My Easy Auto · {VERSION_LABEL}</div>
      </div>
    </div>
  );
}
