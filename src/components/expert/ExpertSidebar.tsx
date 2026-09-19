"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { VERSION_LABEL } from "@/lib/version";
import Icone, { NomIcone } from "@/components/expert/Icone";

const LIENS: { href: string; label: string; icone: NomIcone; exact?: boolean }[] = [
  { href: "/expert", label: "Tableau de bord", icone: "tableau", exact: true },
  { href: "/expert/dossiers", label: "Dossiers d'expertise", icone: "dossiers" },
  { href: "/expert/agenda", label: "RDV expert", icone: "agenda" },
  { href: "/expert/rapports", label: "Rapports émis", icone: "rapport" },
  { href: "/expert/pieces", label: "Recherche de pièces", icone: "recherche" },
  { href: "/expert/annuaire", label: "Base de données", icone: "base" },
  { href: "/expert/cabinet", label: "Le cabinet", icone: "cabinet" },
];

export default function ExpertSidebar({ email, onNavigate }: { email: string | null; onNavigate?: () => void }) {
  const pathname = usePathname();
  const actif = (l: (typeof LIENS)[number]) => (l.exact ? pathname === l.href : pathname.startsWith(l.href));
  return (
    <div className="glass-card glass-blur min-h-full flex flex-col p-3">
      <Link href="/expert" onClick={onNavigate} className="px-2 py-3 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/alliance/logo.png" alt="Alliance Experts" className="h-12 w-auto" />
        <div className="mt-2 text-[11px] text-white/50">Cabinet d&apos;expertise automobile</div>
      </Link>

      <Link href="/expert/dossiers?nouveau=1" onClick={onNavigate} className="btn-primary mt-2 mb-4 flex items-center justify-center gap-2 text-center">
        + Nouvelle mission
      </Link>

      <nav className="space-y-0.5">
        {LIENS.map((l) => (
          <Link key={l.href} href={l.href} onClick={onNavigate} className={`nav-lien ${actif(l) ? "actif" : ""}`}>
            <Icone nom={l.icone} className="opacity-70" />
            {l.label}
          </Link>
        ))}
      </nav>

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
