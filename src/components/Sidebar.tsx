"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import SnakeGame from "@/components/SnakeGame";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { useMetier } from "@/components/MetierProvider";
import { METIER_INFOS, termes } from "@/lib/metier";
import { estAdmin } from "@/lib/support";
import { aFlotteHorsGarage } from "@/lib/flotte";
import { VERSION_LABEL } from "@/lib/version";
import { compterNonLus, lireRole } from "@/lib/conversation";

const SECTIONS: { titre: string; items: { href: string; label: string }[] }[] = [
  {
    titre: "Pilotage",
    items: [
      { href: "/", label: "Tableau de bord" },
      { href: "/sinistres", label: "Sinistres" },
      { href: "/conversation", label: "Conversation" },
    ],
  },
  {
    titre: "Suivi",
    items: [
      { href: "/vehicules", label: "Véhicules" },
      { href: "/flotte", label: "Flotte du garage" },
      { href: "/extranets", label: "Espaces experts" },
      { href: "/annuaire", label: "Base de données" },
      { href: "/archives", label: "Archives" },
      { href: "/historique", label: "Historique" },
      { href: "/factures", label: "Factures" },
    ],
  },
  {
    titre: "Finance",
    items: [
      { href: "/finance", label: "Paiements & relances" },
      { href: "/compta", label: "Export comptable" },
      { href: "/banque", label: "Banque" },
      { href: "/rentabilite", label: "Rentabilité" },
    ],
  },
  {
    titre: "Organisation",
    items: [
      { href: "/emails", label: "Emails" },
      { href: "/planning", label: "Planning réparation" },
      { href: "/agenda", label: "Agenda" },
      { href: "/sauvegarde", label: "Sauvegarde" },
    ],
  },
  {
    titre: "Assistance",
    items: [
      { href: "/support", label: "Aide & incidents" },
      { href: "/etat", label: "État du service" },
    ],
  },
];

/** Sections repliables (v12.2) : la section de la page courante s'ouvre
 *  d'elle-même ; un clic sur un titre replie/déplie, et le choix est
 *  mémorisé sur l'appareil (localStorage). */
const CLE_NAV = "mea.nav.";

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : // « Aide & incidents » ne doit pas s'allumer quand on est sur la
        // console d'assistance (/support/admin), qui a son propre lien.
        href === "/support"
        ? pathname === "/support"
        : pathname.startsWith(href);

  const [ouvertes, setOuvertes] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const init: Record<string, boolean> = {};
    for (const sec of SECTIONS) {
      let v: string | null = null;
      try { v = window.localStorage.getItem(CLE_NAV + sec.titre); } catch { /* ignoré */ }
      init[sec.titre] = v === "1" ? true : v === "0" ? false : false;
    }
    setOuvertes(init);
  }, []);
  // La section qui contient la page courante est toujours visible.
  const sectionCourante = SECTIONS.find((sec) => sec.items.some((it) => isActive(it.href)))?.titre;
  function basculerSection(titre: string) {
    setOuvertes((prev) => {
      const suivant = !(prev[titre] ?? titre === sectionCourante);
      try { window.localStorage.setItem(CLE_NAV + titre, suivant ? "1" : "0"); } catch { /* ignoré */ }
      return { ...prev, [titre]: suivant };
    });
  }
  const estOuverte = (titre: string) => (ouvertes[titre] ?? false) || titre === sectionCourante;

  const [email, setEmail] = useState<string | null>(null);
  // Messages de la conversation garage ↔ secrétaire pas encore lus par le
  // rôle de CET appareil (v10.7). Best-effort : table absente → 0.
  const [nonLus, setNonLus] = useState(0);
  useEffect(() => {
    compterNonLus(lireRole()).then(setNonLus).catch(() => setNonLus(0));
  }, [pathname]);
  // Onglet console d'assistance : visible pour l'éditeur uniquement.
  // (Affichage seulement — le contrôle réel est fait côté serveur.)
  const admin = estAdmin(email);
  // Onglet « Flotte hors garage » (v12.3) : réservé à certains comptes.
  const horsGarage = aFlotteHorsGarage(email);
  const { metier } = useMetier();
  const sousTitre = METIER_INFOS[metier].sousTitre;
  const t = termes(metier);
  // Libellé de la rubrique "Sinistres" adapté au métier (route inchangée).
  const labelNav = (href: string, label: string) =>
    href === "/sinistres" ? t.dossiers : label;

  // LOGO → tableau de bord. EASTER EGG conservé : 5 clics rapides → Snake.
  const router = useRouter();
  const [snakeOpen, setSnakeOpen] = useState(false);
  const clics = useRef(0);
  const dernierClic = useRef(0);
  function clicLogo() {
    const maintenant = Date.now();
    if (maintenant - dernierClic.current > 2000) clics.current = 0; // série expirée
    dernierClic.current = maintenant;
    clics.current += 1;
    if (clics.current >= 5) {
      clics.current = 0;
      setSnakeOpen(true);
      return;
    }
    router.push("/");
    onNavigate?.();
  }
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function deconnexion() {
    await supabase.auth.signOut();
  }

  return (
    <div className="glass-card glass-blur min-h-full flex flex-col p-3">
      <div className="px-2 py-3 flex items-center gap-3">
        <button onClick={clicLogo} className="shrink-0" aria-label="Tableau de bord" title="Retour au tableau de bord">
          <Image
            src="/logo.png"
            alt="My Easy Auto"
            width={44}
            height={44}
            className="drop-shadow-[0_0_10px_rgba(236,72,153,0.3)]"
          />
        </button>
        <div className="min-w-0">
          <div className="marque">My Easy Auto</div>
          <div className="truncate text-xs text-white/45">{sousTitre}</div>
        </div>
      </div>

      <Link href="/import" onClick={onNavigate} className="btn-primary mt-2 mb-4 flex items-center justify-center gap-2 text-center">
        {t.importer}
      </Link>

      <nav className="space-y-1">
        {/* ESPACE CLIENTS (v10.2) : comptes commerciaux et éditeur, en tête de menu. */}
        {(metier === "commercial" || admin) && (
          <div>
            <div className="nav-section">Commercial</div>
            <Link
              href="/prospects"
              onClick={onNavigate}
              className={`nav-lien ${isActive("/prospects") && !isActive("/prospects/documents") ? "actif" : ""}`}
            >
              👥 Mes clients
            </Link>
            <Link
              href="/prospects/documents"
              onClick={onNavigate}
              className={`nav-lien ${isActive("/prospects/documents") ? "actif" : ""}`}
            >
              📄 Mes documents
            </Link>
          </div>
        )}
        {SECTIONS.map((sec) => (
          <div key={sec.titre}>
            <button
              type="button"
              onClick={() => basculerSection(sec.titre)}
              className={`nav-titre ${estOuverte(sec.titre) ? "ouvert" : ""}`}
              aria-expanded={estOuverte(sec.titre)}
            >
              <span>{sec.titre}</span>
              <span className="chevron" aria-hidden>▶</span>
            </button>
            <div className={`nav-sous space-y-0.5 ${estOuverte(sec.titre) ? "" : "hidden"}`}>
              {sec.items
                .flatMap((item) =>
                  item.href === "/flotte" && horsGarage
                    ? [item, { href: "/flotte/hors-garage", label: "Flotte hors garage" }]
                    : [item]
                )
                .map((item) => {
                const active = item.href === "/flotte" ? pathname.startsWith("/flotte") && !pathname.startsWith("/flotte/hors-garage") : isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`nav-lien ${active ? "actif" : ""}`}
                  >
                    {labelNav(item.href, item.label)}
                    {item.href === "/conversation" && nonLus > 0 && (
                      <span className="badge badge-warn ml-auto">{nonLus}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-0 border-t border-white/10 pt-2 mt-3">
        <Link
          href="/profil"
          onClick={onNavigate}
          className={`nav-lien nav-compact ${isActive("/profil") ? "actif" : ""}`}
        >
          Profil du garage
        </Link>
        {admin && (
          <Link
            href="/support/admin"
            onClick={onNavigate}
            className={`nav-lien nav-compact ${isActive("/support/admin") ? "actif" : ""}`}
          >
            🛠️ Console d&apos;assistance
          </Link>
        )}
        {admin && (
          <Link
            href="/admin"
            onClick={onNavigate}
            className={`nav-lien nav-compact ${isActive("/admin") ? "actif" : ""}`}
          >
            📈 Espace éditeur
          </Link>
        )}
        <ThemeToggle />
        {email && (
          <button
            onClick={deconnexion}
            className="nav-lien nav-compact"
          >
            Se déconnecter
          </button>
        )}
        {email && <div className="px-3 pt-0.5 text-[10px] text-white/30 truncate">{email}</div>}
        <div className="px-3 pt-1 text-[10px] text-white/30">My Easy Auto · {VERSION_LABEL}</div>
      </div>

      {snakeOpen && <SnakeGame onClose={() => setSnakeOpen(false)} />}
    </div>
  );
}
