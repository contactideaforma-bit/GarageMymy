"use client";

// Page d'accueil PUBLIQUE (avant connexion) — vitrine PROFESSIONNELLE.
// Design volontairement distinct du thème rétro interne (classes .lp-* et
// .landing-pro définies dans globals.css) : fond sobre, typographie classique,
// cartes fines. Plus AUCUNE photo de banque d'images : l'appli est illustrée
// par une maquette de fiche dossier dessinée en HTML, fidèle au produit.

import Image from "next/image";
import Link from "next/link";
import { METIER_INFOS, Metier } from "@/lib/metier";

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
// Illustration FIDÈLE du produit (pas une photo générique) : un aperçu
// statique et simplifié de la fiche dossier telle qu'elle existe dans l'appli.

function ApercuFicheDossier() {
  return (
    <div
      className="lp-card p-5 shadow-2xl shadow-violet-950/40"
      aria-label="Aperçu simplifié d'une fiche dossier dans My Easy Auto"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Dossier 2026-0847</div>
          <div className="text-xs text-white/45">Renault Clio V · AB-123-CD · AXA</div>
        </div>
        <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-medium text-amber-300">
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
        <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-300">
          Prochaine action
        </div>
        <div className="mt-0.5 text-xs text-white/80">
          Envoyer la facture à l&apos;assurance (cession de créance signée)
        </div>
      </div>

      <div className="mt-4 space-y-2 text-xs">
        {[
          ["Ordre de réparation OR-202606-041", "Signé", "text-emerald-300", "bg-emerald-400/15"],
          ["Facture FAC-2026-112 · 4 236 € TTC", "Envoyée", "text-sky-300", "bg-sky-400/15"],
          ["Cession de créance", "Signée", "text-emerald-300", "bg-emerald-400/15"],
        ].map(([doc, statut, couleur, fond]) => (
          <div
            key={doc}
            className="flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2"
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

export default function LandingPage({ onChoisir }: { onChoisir: (m: Metier) => void }) {
  return (
    <div className="landing-pro min-h-screen">
      {/* ============================ Barre du haut ============================ */}
      <nav className="sticky top-0 z-40 border-b border-white/8 bg-[#0b0e1a]/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="My Easy Auto"
              width={36}
              height={36}
              className="rounded-lg"
              priority
            />
            <span className="text-sm font-semibold tracking-tight">My Easy Auto</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="#fonctions" className="hidden text-sm text-white/60 hover:text-white sm:block">
              Fonctionnalités
            </a>
            <a href="#etapes" className="hidden text-sm text-white/60 hover:text-white sm:block">
              Comment ça marche
            </a>
            <a href="#espaces" className="lp-btn !px-4 !py-2 text-sm">
              Se connecter
            </a>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-4">
        {/* ============================== Héros ============================== */}
        <header className="grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-2">
          <div>
            <span className="lp-chip">Carrosserie · Vitrage · Gestion des sinistres</span>
            <h1 className="mt-4">
              Du rapport d&apos;expertise à l&apos;encaissement,{" "}
              <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-teal-300 bg-clip-text text-transparent">
                sans ressaisie
              </span>
              .
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/60">
              My Easy Auto centralise chaque dossier de sinistre sur une seule page :
              import du chiffrage par IA, documents générés automatiquement, signature
              électronique et relances qui font rentrer l&apos;argent.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#espaces" className="lp-btn">Se connecter</a>
              <a href="mailto:contact.ideaforma@gmail.com?subject=Demande de démonstration — My Easy Auto" className="lp-btn-ghost">
                Demander une démonstration
              </a>
            </div>
            <p className="mt-5 text-xs text-white/35">
              Conçu avec des carrossiers, pour le travail réel de l&apos;atelier — sur ordinateur, tablette et téléphone.
            </p>
          </div>
          <ApercuFicheDossier />
        </header>

        {/* ========================== Chiffres clés ========================== */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CHIFFRES.map(([chiffre, texte]) => (
            <div key={chiffre} className="lp-card px-5 py-4">
              <div className="text-xl font-bold tracking-tight">{chiffre}</div>
              <div className="mt-1 text-xs leading-relaxed text-white/50">{texte}</div>
            </div>
          ))}
        </section>

        {/* ======================== Comment ça marche ======================== */}
        <section id="etapes" className="scroll-mt-20 py-16 sm:py-20">
          <span className="lp-chip">Comment ça marche</span>
          <h2 className="mt-3 max-w-2xl">
            Quatre étapes, du dépôt du rapport au paiement.
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ETAPES.map((e, i) => (
              <div key={e.titre} className="lp-card lp-card-hover p-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-violet-400/40 text-sm font-bold text-violet-300">
                  {i + 1}
                </div>
                <div className="mt-4 font-semibold">{e.titre}</div>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{e.texte}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ========================= Fonctionnalités ========================= */}
        <section id="fonctions" className="scroll-mt-20 pb-16 sm:pb-20">
          <span className="lp-chip">Fonctionnalités</span>
          <h2 className="mt-3 max-w-2xl">
            Une seule application remplace le classeur, le tableur et la pile de papiers.
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FONCTIONS.map((f) => (
              <div key={f.titre} className="lp-card lp-card-hover p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
                  <Icone nom={f.icone} />
                </div>
                <div className="mt-4 font-semibold">{f.titre}</div>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{f.texte}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ========================= Choix de l'espace ========================= */}
        <section id="espaces" className="scroll-mt-20 pb-16 sm:pb-20">
          <span className="lp-chip">Votre espace</span>
          <h2 className="mt-3 max-w-2xl">Deux métiers, deux espaces dédiés.</h2>
          <p className="mt-3 max-w-2xl text-sm text-white/55">
            Le vocabulaire, les statuts et les documents s&apos;adaptent à votre activité.
          </p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {(Object.keys(METIER_INFOS) as Metier[]).map((m) => (
              <EspaceCard key={m} metier={m} onChoisir={onChoisir} />
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-white/35">
            Les comptes sont créés par l&apos;administrateur —{" "}
            <a
              href="mailto:contact.ideaforma@gmail.com?subject=Demande de démonstration — My Easy Auto"
              className="text-violet-300 hover:underline"
            >
              demander une démonstration
            </a>
            .
          </p>
        </section>

        {/* ============================ Bande finale ============================ */}
        <section className="pb-16 sm:pb-20">
          <div className="lp-card relative overflow-hidden p-8 text-center sm:p-12">
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-violet-600/15 via-fuchsia-600/10 to-teal-500/15"
              aria-hidden="true"
            />
            <h2 className="relative">Voyez My Easy Auto sur vos propres dossiers.</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-sm text-white/55">
              Une démonstration avec l&apos;un de vos rapports d&apos;expertise vaut mieux
              qu&apos;un long discours : le dossier, les documents et la facture se créent
              devant vous.
            </p>
            <a
              href="mailto:contact.ideaforma@gmail.com?subject=Demande de démonstration — My Easy Auto"
              className="lp-btn relative mt-6"
            >
              Demander une démonstration
            </a>
          </div>
        </section>
      </div>

      {/* ============================== Pied de page ============================== */}
      <footer className="border-t border-white/8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-white/35">
          <p>© {new Date().getFullYear()} My Easy Auto — Tous droits réservés</p>
          <Link href="/mentions-legales" className="hover:text-white/70 hover:underline">
            Mentions légales
          </Link>
        </div>
      </footer>
    </div>
  );
}

/* --------------------------- Carte d'espace --------------------------- */

function EspaceCard({ metier, onChoisir }: { metier: Metier; onChoisir: (m: Metier) => void }) {
  const info = METIER_INFOS[metier];
  const teal = info.accent === "teal";
  const couleurTexte = teal ? "text-teal-300" : "text-fuchsia-300";
  const couleurFond = teal ? "bg-teal-400/12" : "bg-fuchsia-400/12";
  return (
    <div className="lp-card lp-card-hover flex flex-col p-6">
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${couleurFond} ${couleurTexte}`}>
          <Icone nom={metier === "vitrage" ? "vitre" : "voiture"} className="h-6 w-6" />
        </div>
        <div>
          <div className="font-semibold">{info.espace}</div>
          <div className="text-xs text-white/45">{info.accroche}</div>
        </div>
      </div>
      <ul className="mt-5 flex-1 space-y-2.5">
        {info.points.map((p) => (
          <li key={p} className="flex items-start gap-2.5 text-sm text-white/65">
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
