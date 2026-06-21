"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Tableau de bord", icon: "▦" },
  { href: "/sinistres", label: "Sinistres", icon: "🗂" },
  { href: "/agenda", label: "Agenda", icon: "📅" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 bg-brand-dark text-white flex flex-col">
      <div className="px-6 py-6 border-b border-white/10">
        <div className="text-lg font-semibold tracking-tight">GarageMYMY</div>
        <div className="text-xs text-white/50">Gestion carrosserie</div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-white/15 text-white font-medium"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-6 py-4 text-xs text-white/40 border-t border-white/10">
        v0.1
      </div>
    </aside>
  );
}
