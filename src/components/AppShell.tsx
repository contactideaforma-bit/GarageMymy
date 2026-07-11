"use client";

import { useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Pages publiques (signature à distance, mentions légales) : pas de barre
  // latérale ni de menu.
  if (pathname?.startsWith("/signer/") || pathname === "/mentions-legales") {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <div className="lg:flex min-h-screen">
      {/* Barre du haut (mobile uniquement) — fond opaque pour que le
          contenu ne soit pas visible derrière en défilant */}
      <div className="lg:hidden sticky top-0 z-30 p-3 topbar-mobile">
        <div className="glass-card flex items-center gap-3 px-3 py-2">
          <button
            onClick={() => setOpen(true)}
            aria-label="Ouvrir le menu"
            className="rounded-lg px-2 py-1 text-2xl leading-none text-white/80 hover:bg-white/10"
          >
            ☰
          </button>
          <Image src="/logo.png" alt="" width={28} height={28} className="rounded border border-white/20" />
          <span className="font-pixel text-[0.6rem] bg-gradient-to-r from-accent-violet via-accent-pink to-accent-teal bg-clip-text text-transparent">
            MY EASY AUTO
          </span>
        </div>
      </div>

      {/* Fond sombre (mobile, quand le tiroir est ouvert) */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Tiroir / barre latérale */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 p-3 transition-transform duration-200
          lg:static lg:z-auto lg:translate-x-0 lg:shrink-0
          ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="relative h-full">
          {/* Bouton fermer (mobile) */}
          <button
            onClick={() => setOpen(false)}
            aria-label="Fermer le menu"
            className="lg:hidden absolute right-1 top-1 z-10 rounded-lg px-2 py-1 text-xl text-white/70 hover:bg-white/10"
          >
            ×
          </button>
          <Sidebar onNavigate={() => setOpen(false)} />
        </div>
      </aside>

      {/* Contenu */}
      <main className="flex-1 min-w-0 p-4 lg:p-6">{children}</main>
    </div>
  );
}
