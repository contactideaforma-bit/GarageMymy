"use client";

// ÉLÉMENTS PARTAGÉS DE LA VITRINE PUBLIQUE (v9.4)
// Barre du haut, pied de page et gabarit des pages légales. Tout ce qui
// est visible AVANT connexion passe par ici, pour une identité cohérente :
// « MY EASY AUTO by IDEAFORMA ».

import Image from "next/image";
import Link from "next/link";
import { SOCIETE, ADRESSE_COMPLETE } from "./societe";

/* ----------------------------- Icônes ----------------------------- */

export const ICONES = {
  scan: (
    <path d="M4 8V6a2 2 0 0 1 2-2h2M4 16v2a2 2 0 0 0 2 2h2m8-16h2a2 2 0 0 1 2 2v2m-4 12h2a2 2 0 0 0 2-2v-2M7 12h10" />
  ),
  documents: (
    <path d="M8 3h6l4 4v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm6 0v4h4M9.5 12h5m-5 4h5" />
  ),
  signature: (
    <path d="M4 17c2.5 0 3.5-6 5.5-6s1 4 2.5 4 1.5-2.5 3-2.5S16.5 15 20 15M4 21h16" />
  ),
  euro: <path d="M17 6.5A6.5 6.5 0 1 0 17 17.5M4.5 10.5h8m-8 3h8" />,
  calendrier: (
    <path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm-2 5h16M9 2.5v3m6-3v3M8 13h3m-3 4h6" />
  ),
  mail: (
    <path d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm0 1 8 6 8-6" />
  ),
  voiture: (
    <path d="M5 13 6.5 8a2 2 0 0 1 1.9-1.4h7.2A2 2 0 0 1 17.5 8L19 13m-14 0h14a1 1 0 0 1 1 1v4h-2.5a1.5 1.5 0 0 1-3 0h-5a1.5 1.5 0 0 1-3 0H4v-4a1 1 0 0 1 1-1Z" />
  ),
  vitre: (
    <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Zm6 4 5-5m-2.5 9.5L15 12m-6.5 6L15 11.5" />
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  bouclier: (
    <path d="M12 3 5 6v5c0 4.5 3 8.2 7 9.5 4-1.3 7-5 7-9.5V6l-7-3Zm-3 9 2 2 4-4" />
  ),
  cadenas: (
    <path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Zm6 4v3" />
  ),
  serveur: (
    <path d="M4 5h16a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm0 9h16a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Zm3-6.5h.01M7 16.5h.01" />
  ),
  sauvegarde: (
    <path d="M12 4v10m0 0 4-4m-4 4-4-4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  ),
  horsligne: (
    <path d="M5 12.5a7 7 0 0 1 14 0M8 15.5a3.8 3.8 0 0 1 8 0M12 19h.01M3 3l18 18" />
  ),
  support: (
    <path d="M4 12a8 8 0 0 1 16 0v4a2 2 0 0 1-2 2h-2v-6h4M4 12v4a2 2 0 0 0 2 2h2v-6H4m6 8h4" />
  ),
  eclair: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  telephone: (
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
  ),
  lieu: (
    <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
  ),
  fleche: <path d="M5 12h14m-6-6 6 6-6 6" />,
};

export function Icone({
  nom,
  className = "h-5 w-5",
}: {
  nom: keyof typeof ICONES;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {ICONES[nom]}
    </svg>
  );
}

/* ------------------------------ Logo ------------------------------ */

export function Marque({ taille = 36 }: { taille?: number }) {
  return (
    <Link href="/" className="flex items-center gap-3">
      <Image
        src="/logo.png"
        alt={SOCIETE.produit}
        width={taille}
        height={taille}
        className="rounded-lg"
        priority
      />
      <span className="leading-tight">
        <span className="block text-sm font-bold tracking-tight">MY EASY AUTO</span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-700">
          by {SOCIETE.editeur}
        </span>
      </span>
    </Link>
  );
}

/* --------------------------- Barre du haut --------------------------- */

const LIENS_NAV: [string, string][] = [
  ["/#fonctions", "Fonctionnalités"],
  ["/#etapes", "Comment ça marche"],
  ["/contact", "Contact"],
];

export function VitrineNav() {
  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Marque />
        <div className="flex items-center gap-5">
          {LIENS_NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="hidden text-sm text-slate-500 hover:text-slate-900 md:block"
            >
              {label}
            </Link>
          ))}
          <Link href="/#espaces" className="lp-btn !px-4 !py-2 text-sm">
            Se connecter
          </Link>
        </div>
      </div>
    </nav>
  );
}

/* --------------------------- Pied de page --------------------------- */

export function VitrineFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white/60">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-3">
        <div>
          <Marque />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-500">
            La gestion des sinistres pour les carrossiers et les spécialistes du
            vitrage : du rapport d&apos;expertise à l&apos;encaissement, sans ressaisie.
          </p>
        </div>
        <div className="text-sm text-slate-500">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            L&apos;éditeur
          </div>
          <p className="font-semibold text-slate-700">{SOCIETE.editeur}</p>
          <p>{ADRESSE_COMPLETE}</p>
          <p>SIRET {SOCIETE.siret}</p>
          <a href={`mailto:${SOCIETE.email}`} className="text-violet-700 hover:underline">
            {SOCIETE.email}
          </a>
        </div>
        <div className="text-sm text-slate-500">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Informations
          </div>
          <ul className="space-y-1.5">
            <li><Link href="/contact" className="hover:text-slate-900 hover:underline">Contact & démonstration</Link></li>
            <li><Link href="/mentions-legales" className="hover:text-slate-900 hover:underline">Mentions légales</Link></li>
            <li><Link href="/cgu" className="hover:text-slate-900 hover:underline">Conditions générales d&apos;utilisation</Link></li>
            <li><Link href="/confidentialite" className="hover:text-slate-900 hover:underline">Politique de confidentialité</Link></li>
            <li><Link href="/etat" className="hover:text-slate-900 hover:underline">État du service</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-slate-400">
          <p>© {new Date().getFullYear()} {SOCIETE.signature} — Tous droits réservés</p>
          <p>Fait en France · Neuilly-sur-Seine</p>
        </div>
      </div>
    </footer>
  );
}

/* ---------------------- Gabarit des pages légales ---------------------- */

export function PageVitrine({
  titre,
  sousTitre,
  miseAJour,
  children,
}: {
  titre: string;
  sousTitre?: string;
  miseAJour?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="landing-pro min-h-screen">
      <VitrineNav />
      <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <header className="mb-10">
          <span className="lp-chip">{SOCIETE.signature}</span>
          <h1 className="mt-3">{titre}</h1>
          {sousTitre && <p className="mt-3 text-slate-500">{sousTitre}</p>}
          {miseAJour && <p className="mt-2 text-xs text-slate-400">Dernière mise à jour : {miseAJour}</p>}
        </header>
        <div className="space-y-5">{children}</div>
      </div>
      <VitrineFooter />
    </div>
  );
}

/** Bloc d'un texte légal : titre numéroté + paragraphes. */
export function BlocLegal({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="lp-card p-6">
      <h2 className="!text-base font-semibold">{titre}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-600 [&_a]:text-violet-700 [&_a]:hover:underline [&_strong]:text-slate-800 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
