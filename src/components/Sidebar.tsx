"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";

const SECTIONS: { titre: string; items: { href: string; label: string }[] }[] = [
  {
    titre: "Pilotage",
    items: [{ href: "/", label: "Tableau de bord" }],
  },
  {
    titre: "Dossiers",
    items: [
      { href: "/sinistres", label: "Sinistres" },
      { href: "/vehicules", label: "Véhicules" },
      { href: "/flotte", label: "Flotte du garage" },
      { href: "/annuaire", label: "Annuaire" },
    ],
  },
  {
    titre: "Documents",
    items: [
      { href: "/devis", label: "Devis" },
      { href: "/factures", label: "Factures" },
    ],
  },
  {
    titre: "Finance",
    items: [
      { href: "/finance", label: "Paiements & relances" },
      { href: "/banque", label: "Banque" },
      { href: "/emails", label: "Emails" },
    ],
  },
  {
    titre: "Organisation",
    items: [
      { href: "/planning", label: "Planning" },
      { href: "/agenda", label: "Agenda" },
    ],
  },
];

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function deconnexion() {
    await supabase.auth.signOut();
  }

  return (
    <div className="glass-card h-full flex flex-col p-4">
      <div className="px-2 py-3 flex items-center gap-3">
        <Image
          src="/logo.png"
          alt="My Easy Auto"
          width={44}
          height={44}
          className="rounded-md border-2 border-white/20 shrink-0"
        />
        <div>
          <div className="font-pixel text-[0.6rem] leading-[1.6] bg-gradient-to-r from-accent-violet via-accent-pink to-accent-teal bg-clip-text text-transparent">
            MY EASY AUTO
          </div>
          <div className="text-xs text-white/40">Gestion carrosserie</div>
        </div>
      </div>

      <Link href="/import" onClick={onNavigate} className="btn-primary mt-2 mb-4 flex items-center justify-center gap-2">
        Importer un rapport
      </Link>

      <nav className="flex-1 space-y-5 overflow-y-auto">
        {SECTIONS.map((sec) => (
          <div key={sec.titre}>
            <div className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/35">
              {sec.titre}
            </div>
            <div className="space-y-1">
              {sec.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-white/15 text-white font-medium shadow-inner"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-white/10 pt-3 mt-3">
        <Link
          href="/profil"
          onClick={onNavigate}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
            isActive("/profil")
              ? "bg-white/15 text-white font-medium"
              : "text-white/70 hover:bg-white/10 hover:text-white"
          }`}
        >
          Profil du garage
        </Link>
        <ThemeToggle />
        {email && (
          <button
            onClick={deconnexion}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            Se déconnecter
          </button>
        )}
        {email && <div className="px-3 pt-1 text-[11px] text-white/30 truncate">{email}</div>}
        <div className="px-3 pt-2 text-xs text-white/30">My Easy Auto · v2.9</div>
      </div>
    </div>
  );
}
