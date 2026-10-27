"use client";

// ============================================================
//  « PLUS » (v13.50) — l'onglet mobile qui remplace le tiroir ☰ : toutes
//  les rubriques de la barre latérale en listes tactiles, puis le profil,
//  le thème, la déconnexion et la version. Sur grand écran, la page reste
//  accessible mais la barre latérale fait déjà le travail.
// ============================================================

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SECTIONS } from "@/components/Sidebar";
import ThemeToggle from "@/components/ThemeToggle";
import Salutation from "@/components/Salutation";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { useMetier } from "@/components/MetierProvider";
import { METIER_INFOS, termes } from "@/lib/metier";
import { estAdmin } from "@/lib/support";
import { aFlotteHorsGarage } from "@/lib/flotte";
import { VERSION_LABEL } from "@/lib/version";
import { compterNonLus, lireRole } from "@/lib/conversation";

const ICONES: Record<string, string> = {
  "/": "🏠", "/sinistres": "📁", "/conversation": "💬", "/vehicules": "🚗", "/flotte": "🚙",
  "/flotte/guide-assureurs": "📘", "/extranets": "🧑‍💼", "/annuaire": "📇", "/archives": "🗄️", "/historique": "🕘",
  "/factures": "🧾", "/finance": "💶", "/compta": "📊", "/banque": "🏦", "/rentabilite": "📈", "/emails": "✉️",
  "/courriers": "📮", "/planning": "🗓️", "/agenda": "📅", "/sauvegarde": "💾", "/support": "🛟", "/etat": "🟢",
  "/import": "📄", "/profil": "👤", "/prospects": "👥", "/prospects/demarchage": "📞", "/prospects/documents": "📄",
};

export default function PlusPage() {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [nonLus, setNonLus] = useState(0);
  const { metier } = useMetier();
  const t = termes(metier);
  const admin = estAdmin(email);
  const horsGarage = aFlotteHorsGarage(email);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    compterNonLus(lireRole()).then(setNonLus).catch(() => setNonLus(0));
  }, [pathname]);

  const Ligne = ({ href, label, badge }: { href: string; label: string; badge?: number }) => (
    <Link href={href} className="ligne-liste">
      <span className="tuile-ico" aria-hidden>{ICONES[href] || "•"}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      {badge ? <span className="badge badge-warn">{badge}</span> : null}
      <span aria-hidden style={{ color: "var(--mea-texte-3)" }}>›</span>
    </Link>
  );

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center gap-3 px-1">
        <Image src="/logo.png" alt="My Easy Auto" width={44} height={44} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <Salutation className="block" />
          <div className="truncate text-xs" style={{ color: "var(--mea-texte-3)" }}>{METIER_INFOS[metier].sousTitre}</div>
        </div>
      </div>

      <Link href="/import" className="btn-primary flex items-center justify-center gap-2 text-center">{t.importer}</Link>

      {(metier === "commercial" || admin) && (
        <section>
          <div className="etiquette mb-1.5 px-1">Commercial</div>
          <div className="groupe-liste">
            <Ligne href="/prospects" label="Mes clients" />
            <Ligne href="/prospects/demarchage" label="Session d'appels" />
            <Ligne href="/prospects/documents" label="Mes documents" />
          </div>
        </section>
      )}

      {SECTIONS.map((sec) => (
        <section key={sec.titre}>
          <div className="etiquette mb-1.5 px-1">{sec.titre}</div>
          <div className="groupe-liste">
            {sec.items
              .flatMap((it) => (it.href === "/flotte" && horsGarage ? [it, { href: "/flotte/hors-garage", label: "Flotte hors garage" }] : [it]))
              .map((it) => (
                <Ligne key={it.href} href={it.href} label={it.href === "/sinistres" ? t.dossiers : it.label} badge={it.href === "/conversation" ? nonLus : undefined} />
              ))}
          </div>
        </section>
      ))}

      <section>
        <div className="etiquette mb-1.5 px-1">Compte</div>
        <div className="groupe-liste">
          <Ligne href="/profil" label="Profil du garage" />
          {admin && <Ligne href="/support/admin" label="🛠️ Console d'assistance" />}
          {admin && <Ligne href="/admin" label="📈 Espace éditeur" />}
          <div className="px-2 py-1"><ThemeToggle /></div>
          {email && (
            <button type="button" className="ligne-liste" onClick={() => supabase.auth.signOut()}>
              <span className="tuile-ico" aria-hidden>🚪</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">Se déconnecter</span>
            </button>
          )}
        </div>
        <p className="mt-2 px-1 text-[11px]" style={{ color: "var(--mea-texte-3)" }}>
          {email ? `${email} · ` : ""}My Easy Auto · {VERSION_LABEL}
        </p>
      </section>
    </div>
  );
}
