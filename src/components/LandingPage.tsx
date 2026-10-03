"use client";

// Page d'accueil PUBLIQUE (avant connexion) — vitrine PROFESSIONNELLE, MODE CLAIR.
// Design volontairement distinct du thème rétro interne (classes .lp-* et
// .landing-pro définies dans globals.css) : fond clair sobre, typographie
// classique, cartes blanches fines. Aucune photo de banque d'images : l'appli
// est illustrée par une maquette de fiche dossier en HTML (volontairement
// sombre, comme un écran produit, pour contraster avec la page claire).
//
// VERSION MOBILE (v13.35) : menu burger dans la barre du haut, héros
// resserré (photo recadrée, boutons pleine largeur), chiffres en 2 colonnes,
// étapes et formules en CARROUSEL à faire glisser (.lp-carrousel), fonctions
// en liste compacte, et barre d'action collante en bas d'écran
// (Démo / Se connecter). Le rendu ordinateur ne change pas.

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { METIER_INFOS, METIERS_PUBLICS, Metier } from "@/lib/metier";
import FormulesAccueil from "@/components/vitrine/FormulesAccueil";

/* ------------------------------ Contenus ------------------------------ */

const ETAPES = [
  {
    titre: "Importez le rapport d'expertise",
    texte:
      "Déposez ou photographiez le chiffrage : l'IA lit le client, le véhicule, l'assurance et chaque ligne du chiffrage. Zéro ressaisie.",
  },
  {
    titre: "Les documents se génèrent seuls",
    texte:
      "Devis, facture, ordre de réparation et cession de créance sont créés automatiquement, à votre charte, avec logo et tampon.",
  },
  {
    titre: "Faites signer en 30 secondes",
    texte:
      "Signature sur tablette à l'atelier, ou par lien envoyé au client. Chaque document signé est daté et archivé au dossier.",
  },
  {
    titre: "Encaissez sans y penser",
    texte:
      "Relances graduées et automatiques, suivi des paiements, rapprochement bancaire : chaque matin, l'appli vous dit quoi faire pour être payé.",
  },
];

const FONCTIONS: { titre: string; texte: string; icone: keyof typeof ICONES }[] = [
  {
    titre: "Import intelligent",
    texte:
      "Le rapport d'expertise est analysé par l'IA : dossier pré-rempli, chiffrage repris ligne pour ligne.",
    icone: "scan",
  },
  {
    titre: "Documents automatiques",
    texte:
      "Devis, factures, ordres de réparation, cessions de créance et PV de restitution, à votre charte.",
    icone: "documents",
  },
  {
    titre: "Signature électronique",
    texte:
      "À l'atelier sur l'écran, ou à distance par un simple lien envoyé au client.",
    icone: "signature",
  },
  {
    titre: "Encaissement & relances",
    texte:
      "Relances graduées jusqu'à la mise en demeure, relances automatiques, suivi banque et reste à encaisser.",
    icone: "euro",
  },
  {
    titre: "Planning & atelier",
    texte:
      "Calendrier des réparations, commandes de pièces, véhicules présents au garage, flotte de prêt avec alertes.",
    icone: "calendrier",
  },
  {
    titre: "Emails intégrés",
    texte:
      "Envoyez devis, factures et relances depuis votre propre boîte mail, avec journal des envois.",
    icone: "mail",
  },
];

const CHIFFRES: [string, string][] = [
  ["1 page", "par dossier, de l'expertise au paiement"],
  ["4 documents", "générés automatiquement depuis le rapport"],
  ["30 secondes", "pour faire signer un document"],
  ["0 oubli", "la prochaine action de chaque dossier, chaque matin"],
];

/* ------------------------- Icônes (SVG sobres) ------------------------- */

const ICONES = {
  scan: (
    <path d="M4 8V6a2 2 0 0 1 2-2h2M4 16v2a2 2 0 0 0 2 2h2m8-16h2a2 2 0 0 1 2 2v2m-4 12h2a2 2 0 0 0 2-2v-2M7 12h10" />
  ),
  documents: (
    <path d="M8 3h6l4 4v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm6 0v4h4M9.5 12h5m-5 4h5" />
  ),
  signature: (
    <path d="M4 17c2.5 0 3.5-6 5.5-6s1 4 2.5 4 1.5-2.5 3-2.5S16.5 15 20 15M4 21h16" />
  ),
  euro: (
    <path d="M17 6.5A6.5 6.5 0 1 0 17 17.5M4.5 10.5h8m-8 3h8" />
  ),
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
};

function Icone({ nom, className = "h-5 w-5" }: { nom: keyof typeof ICONES; className?: string }) {
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

/* ----------------------- Maquette de fiche dossier ----------------------- */
// Illustration FIDÈLE du produit : un aperçu statique et simplifié de la
// fiche dossier. Carte volontairement SOMBRE (écran produit) sur page claire.
// NB : éviter ici les classes surchargées par le mode clair de l'appli
// (text-amber-300, text-emerald-300…) — on utilise les nuances 400.

function ApercuFicheDossier() {
  return (
    <div
      className="rounded-2xl border border-white/10 bg-[#181534] p-5 text-[#eef0fb] shadow-2xl shadow-violet-900/25"
      aria-label="Aperçu simplifié d'une fiche dossier dans My Easy Auto"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Dossier 2026-0847</div>
          <div className="text-xs text-white/45">Renault Clio V · AB-123-CD · AXA</div>
        </div>
        <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-medium text-amber-400">
          En réparation
        </span>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-[11px] text-white/45">
          <span>Avancement</span>
          <span>55 %</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-teal-400"
            style={{ width: "55%" }}
          />
        </div>
      </div>

      <div className="mt-4 rounded-lg border-l-4 border-violet-500 bg-violet-500/10 px-3 py-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-400">
          Prochaine action
        </div>
        <div className="mt-0.5 text-xs text-white/80">
          Envoyer la facture à l&apos;assurance (cession de créance signée)
        </div>
      </div>

      <div className="mt-4 space-y-2 text-xs">
        {[
          ["Ordre de réparation OR-202606-041", "Signé", "text-emerald-400", "bg-emerald-400/15"],
          ["Facture FAC-2026-112 · 4 236 € TTC", "Envoyée", "text-sky-400", "bg-sky-400/15"],
          ["Cession de créance", "Signée", "text-emerald-400", "bg-emerald-400/15"],
        ].map(([doc, statut, couleur, fond]) => (
          <div
            key={doc}
            className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2"
          >
            <span className="truncate text-white/75">{doc}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${couleur} ${fond}`}>
              {statut}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
        <div>
          <div className="text-[11px] text-white/45">Reste à encaisser</div>
          <div className="text-sm font-semibold">1 842,00 €</div>
        </div>
        <span className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-white/70">
          Relancer l&apos;assurance
        </span>
      </div>
    </div>
  );
}

/* ------------------------------- La page ------------------------------- */

const LIENS_MENU: [string, string][] = [
  ["#video", "La démo"],
  ["#fonctions", "Fonctionnalités"],
  ["#etapes", "Comment ça marche"],
  ["#formules", "Formules"],
  ["#facturation-electronique", "Facturation électronique"],
];

const MAILTO_DEMO = "mailto:contact@myeasyauto.fr?subject=Demande de démonstration — My Easy Auto";

export default function LandingPage({ onChoisir }: { onChoisir: (m: Metier) => void }) {
  // Menu mobile (burger) ; fermé par Échap ou au passage en grand écran.
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    const onResize = () => window.innerWidth >= 640 && setMenu(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [menu]);

  return (
    <div className="landing-pro min-h-screen">
      {/* ============================ Barre du haut ============================ */}
      <nav className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:py-3">
          <a href="#" className="flex items-center gap-2.5 sm:gap-3" onClick={() => setMenu(false)}>
            <Image
              src="/logo.png"
              alt="My Easy Auto"
              width={36}
              height={36}
              className="rounded-lg"
              priority
            />
            <span className="text-sm font-semibold tracking-tight">My Easy Auto</span>
          </a>

          {/* ----- Mobile : connexion + burger ----- */}
          <div className="flex items-center gap-2 sm:hidden">
            <a href="#espaces" className="lp-btn !px-3.5 !py-2 text-sm" onClick={() => setMenu(false)}>
              Connexion
            </a>
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              aria-expanded={menu}
              aria-controls="lp-menu-mobile"
              aria-label={menu ? "Fermer le menu" : "Ouvrir le menu"}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
                {menu ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>

          {/* ----- Grand écran : liens ----- */}
          <div className="hidden items-center gap-5 sm:flex">
            <a href="#fonctions" className="hidden text-sm text-slate-500 hover:text-slate-900 sm:block">
              Fonctionnalités
            </a>
            <a href="#etapes" className="hidden text-sm text-slate-500 hover:text-slate-900 sm:block">
              Comment ça marche
            </a>
            <a href="#formules" className="text-sm text-slate-500 hover:text-slate-900">
              Formules
            </a>
            <a href="#espaces" className="lp-btn !px-4 !py-2 text-sm">
              Se connecter
            </a>
          </div>
        </div>

        {/* Panneau du menu mobile */}
        {menu && (
          <div id="lp-menu-mobile" className="border-t border-slate-200 bg-white px-4 pb-4 pt-2 shadow-lg sm:hidden">
            <ul className="divide-y divide-slate-100">
              {LIENS_MENU.map(([href, label]) => (
                <li key={href}>
                  <a
                    href={href}
                    onClick={() => setMenu(false)}
                    className="flex items-center justify-between py-3.5 text-[15px] font-medium text-slate-700"
                  >
                    {label}
                    <span className="text-slate-300" aria-hidden="true">›</span>
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a href={MAILTO_DEMO} className="lp-btn-ghost !px-3 text-sm" onClick={() => setMenu(false)}>
                Demander une démo
              </a>
              <a href="#espaces" className="lp-btn !px-3 text-sm" onClick={() => setMenu(false)}>
                Se connecter
              </a>
            </div>
          </div>
        )}
      </nav>

      <div className="mx-auto max-w-6xl px-4">
        {/* ============================== Héros ============================== */}
        <header className="grid items-center gap-7 pb-10 pt-7 sm:gap-10 sm:py-20 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
          <div>
            <span className="lp-chip">Carrosserie · Vitrage · Gestion des sinistres</span>
            <h1 className="mt-4">
              Du rapport d&apos;expertise à l&apos;encaissement,{" "}
              <span className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-teal-500 bg-clip-text text-transparent">
                sans ressaisie
              </span>
              .
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-500 sm:mt-5 sm:text-base">
              My Easy Auto centralise chaque dossier de sinistre sur une seule page :
              import du chiffrage par IA, documents générés automatiquement, signature
              électronique et relances qui font rentrer l&apos;argent.
            </p>
            <div className="mt-6 flex flex-col gap-2.5 sm:mt-7 sm:flex-row sm:flex-wrap sm:gap-3">
              <a href="#video" className="lp-btn w-full sm:w-auto">▶ Voir la démo (1 min 30)</a>
              <a href={MAILTO_DEMO} className="lp-btn-ghost w-full sm:w-auto">
                Demander une démonstration
              </a>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-400 sm:mt-5">
              Conçu avec des carrossiers, pour le travail réel de l&apos;atelier — sur ordinateur, tablette et téléphone.{" "}
              <a href="#formules" className="text-violet-700 hover:underline">Voir les formules et les prix</a>
            </p>
          </div>
          {/* Mobile : photo recadrée (4/3) pour ne pas occuper tout l'écran. */}
          <div className="mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-2xl border border-black/5 shadow-xl shadow-violet-900/20 sm:aspect-auto sm:shadow-2xl lg:max-w-[440px] xl:max-w-[480px]">
            <Image
              src="/hero-atelier.jpeg"
              alt="My Easy Auto en situation dans l'atelier"
              width={1122}
              height={1402}
              priority
              sizes="(min-width: 1280px) 480px, (min-width: 1024px) 440px, 90vw"
              className="h-full w-full object-cover object-[50%_30%] sm:h-auto"
            />
          </div>
        </header>

        {/* ============================ Vidéo (v12.7) ============================
            Présentation de 90 s : du rapport d'expertise à la facture. Fichier
            public/presentation.mp4 (720p, ~5 Mo, encodé pour le web) + affiche
            presentation-poster.jpg ; chargée seulement au clic (preload none). */}
        <section id="video" className="scroll-mt-20 pb-10 sm:pb-20">
          <div className="lp-card overflow-hidden">
            <div className="grid items-center gap-5 p-3 sm:gap-6 sm:p-8 lg:grid-cols-[1.4fr_1fr]">
              <div className="overflow-hidden rounded-2xl bg-slate-900 shadow-xl ring-1 ring-slate-200">
                <video
                  className="aspect-video w-full"
                  controls
                  playsInline
                  preload="none"
                  poster="/presentation-poster.jpg"
                  src="/presentation.mp4"
                  aria-label="Vidéo de présentation de My Easy Auto"
                >
                  Votre navigateur ne lit pas les vidéos —{" "}
                  <a href="/presentation.mp4" className="underline">
                    télécharger la vidéo
                  </a>
                  .
                </video>
              </div>
              <div className="px-2 pb-2 sm:p-0">
                <span className="lp-chip">La démo en 1 min 30</span>
                <h2 className="mt-3">Passer du rapport d&apos;expertise à la facture, en direct.</h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-500">
                  Un rapport déposé, le chiffrage lu automatiquement, le dossier créé, les documents générés et signés,
                  la relance qui part. Pas de montage : c&apos;est l&apos;application telle que vous l&apos;utiliserez demain.
                </p>
                <a href={MAILTO_DEMO} className="lp-btn-ghost mt-5 w-full sm:w-auto">
                  Demander une démonstration personnalisée
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ========================== Chiffres clés ========================== */}
        <section className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          {CHIFFRES.map(([chiffre, texte]) => (
            <div key={chiffre} className="lp-card px-4 py-3.5 sm:px-5 sm:py-4">
              <div className="text-lg font-bold tracking-tight sm:text-xl">{chiffre}</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-500">{texte}</div>
            </div>
          ))}
        </section>

        {/* ======================== Comment ça marche ======================== */}
        <section id="etapes" className="scroll-mt-20 py-12 sm:py-20">
          <span className="lp-chip">Comment ça marche</span>
          <h2 className="mt-3 max-w-2xl">
            Quatre étapes, du dépôt du rapport au paiement.
          </h2>
          <div className="lp-carrousel mt-6 sm:mt-8 sm:grid sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            {ETAPES.map((e, i) => (
              <div key={e.titre} className="lp-card lp-card-hover p-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-violet-300 bg-violet-50 text-sm font-bold text-violet-700">
                  {i + 1}
                </div>
                <div className="mt-4 font-semibold">{e.titre}</div>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{e.texte}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-slate-400 sm:hidden">Faites glisser pour voir les 4 étapes →</p>
        </section>

        {/* ========================= Fonctionnalités ========================= */}
        <section id="fonctions" className="scroll-mt-20 pb-12 sm:pb-20">
          <span className="lp-chip">Fonctionnalités</span>
          <h2 className="mt-3 max-w-2xl">
            Une seule application remplace le classeur, le tableur et la pile de papiers.
          </h2>
          {/* Mobile : liste compacte (icône à gauche) ; grand écran : grille de cartes. */}
          <div className="mt-6 grid gap-2.5 sm:mt-8 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {FONCTIONS.map((f) => (
              <div key={f.titre} className="lp-card lp-card-hover flex gap-3.5 p-4 sm:block sm:p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                  <Icone nom={f.icone} />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold sm:mt-4">{f.titre}</div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500 sm:mt-2">{f.texte}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ============================ Formules (v13.26) ============================ */}
        <FormulesAccueil />

        {/* ========================= Choix de l'espace ========================= */}
        <section id="espaces" className="scroll-mt-20 pb-12 sm:pb-20">
          <span className="lp-chip">Votre espace</span>
          <h2 className="mt-3 max-w-2xl">Deux métiers, deux espaces dédiés.</h2>
          <p className="mt-3 max-w-2xl text-sm text-slate-500">
            Le vocabulaire, les statuts et les documents s&apos;adaptent à votre activité.
          </p>
          <div className="mt-6 grid gap-4 sm:mt-8 sm:grid-cols-2 sm:gap-5">
            {METIERS_PUBLICS.map((m) => (
              <EspaceCard key={m} metier={m} onChoisir={onChoisir} />
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-slate-400">
            Les comptes sont créés par l&apos;administrateur —{" "}
            <a href={MAILTO_DEMO} className="text-violet-700 hover:underline">
              demander une démonstration
            </a>
            .
          </p>
        </section>

        {/* ===================== Note d'information — facturation électronique (v52) ===================== */}
        <section id="facturation-electronique" className="scroll-mt-20 pb-12 sm:pb-20">
          <div className="lp-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="max-w-2xl">
              <span className="lp-chip">Réforme 2026-2027 · Facturation électronique</span>
              <h3 className="mt-2 !text-lg font-semibold">Vos factures sont déjà prêtes pour la facturation électronique.</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Depuis le 1er septembre 2026, chaque entreprise doit recevoir ses factures via une plateforme agréée ;
                à partir du 1er septembre 2027, les PME devront aussi les émettre par ce canal. My Easy Auto produit
                vos factures au format Factur-X avec les nouvelles mentions obligatoires, et la transmission
                automatique à votre plateforme arrive avant l&apos;échéance de 2027.
              </p>
            </div>
            <Link href="/facturation-electronique" className="lp-btn-ghost w-full shrink-0 sm:w-auto">
              Comprendre ce qui change
            </Link>
          </div>
        </section>

        {/* ============================ Bande finale ============================ */}
        <section className="pb-12 sm:pb-20">
          <div className="lp-card relative overflow-hidden px-5 py-8 text-center sm:p-12">
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-violet-600/10 via-fuchsia-600/5 to-teal-500/10"
              aria-hidden="true"
            />
            <h2 className="relative">Voyez My Easy Auto sur vos propres dossiers.</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-sm text-slate-500">
              Une démonstration avec l&apos;un de vos rapports d&apos;expertise vaut mieux
              qu&apos;un long discours : le dossier, les documents et la facture se créent
              devant vous.
            </p>
            <a href={MAILTO_DEMO} className="lp-btn relative mt-6 w-full sm:w-auto">
              Demander une démonstration
            </a>
          </div>
        </section>
      </div>

      {/* ============================== Pied de page ============================== */}
      <footer className="border-t border-slate-200 pb-20 sm:pb-0">
        <div className="mx-auto flex max-w-6xl flex-col-reverse items-center justify-between gap-3 px-4 py-6 text-center text-xs text-slate-400 sm:flex-row sm:flex-wrap sm:text-left">
          <p>© {new Date().getFullYear()} My Easy Auto — Tous droits réservés</p>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
            <Link href="/contact" className="hover:text-slate-700 hover:underline">Contact</Link>
            <Link href="/mentions-legales" className="hover:text-slate-700 hover:underline">Mentions légales</Link>
            <Link href="/cgu" className="hover:text-slate-700 hover:underline">CGU</Link>
            <Link href="/confidentialite" className="hover:text-slate-700 hover:underline">Confidentialité</Link>
          </div>
        </div>
      </footer>

      {/* Barre d'action collante — MOBILE uniquement (v13.35). */}
      {!menu && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pt-2.5 backdrop-blur sm:hidden"
          style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))" }}
        >
          <div className="grid grid-cols-2 gap-2">
            <a href="#video" className="lp-btn-ghost !px-3 !py-2.5 text-sm">▶ La démo</a>
            <a href="#espaces" className="lp-btn !px-3 !py-2.5 text-sm">Se connecter</a>
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------- Carte d'espace --------------------------- */

function EspaceCard({ metier, onChoisir }: { metier: Metier; onChoisir: (m: Metier) => void }) {
  const info = METIER_INFOS[metier];
  const teal = info.accent === "teal";
  const couleurTexte = teal ? "text-teal-700" : "text-fuchsia-700";
  const couleurFond = teal ? "bg-teal-100" : "bg-fuchsia-100";
  return (
    <div className="lp-card lp-card-hover flex flex-col p-6">
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${couleurFond} ${couleurTexte}`}>
          <Icone nom={metier === "vitrage" ? "vitre" : "voiture"} className="h-6 w-6" />
        </div>
        <div>
          <div className="font-semibold">{info.espace}</div>
          <div className="text-xs text-slate-400">{info.accroche}</div>
        </div>
      </div>
      <ul className="mt-5 flex-1 space-y-2.5">
        {info.points.map((p) => (
          <li key={p} className="flex items-start gap-2.5 text-sm text-slate-600">
            <span className={`mt-0.5 shrink-0 ${couleurTexte}`}>
              <Icone nom="check" className="h-4 w-4" />
            </span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => onChoisir(metier)} className="lp-btn mt-6 w-full">
        Se connecter — {info.label}
      </button>
    </div>
  );
}
