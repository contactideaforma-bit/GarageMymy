"use client";

// Page d'accueil PUBLIQUE (avant connexion) : présentation de l'appli et choix
// de l'espace (Carrosserie ou Vitrage). Le clic sur un espace ouvre l'écran de
// connexion correspondant. Thème rétro (classes maison : glass-card, btn-*).

import Image from "next/image";
import { METIER_INFOS, Metier } from "@/lib/metier";

export default function LandingPage({ onChoisir }: { onChoisir: (m: Metier) => void }) {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
        {/* En-tête / héros */}
        <header className="text-center">
          <Image
            src="/logo.png"
            alt="My Easy Auto"
            width={88}
            height={88}
            className="mx-auto mb-5 rounded-xl border-2 border-white/20"
            priority
          />
          <h1 className="font-pixel bg-gradient-to-r from-accent-violet via-accent-pink to-accent-teal bg-clip-text text-transparent">
            MY EASY AUTO
          </h1>
          <p className="mt-4 text-lg text-white/70">
            La plateforme qui gère vos dossiers d&apos;assurance auto — simple comme un jeu.
          </p>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-white/50">
            Du sinistre à l&apos;encaissement : import du rapport, devis, facture, signature
            électronique, relances et suivi des paiements. Pensée pour aller vite, même sans
            être à l&apos;aise avec l&apos;informatique.
          </p>
        </header>

        {/* Choix de l'espace */}
        <section className="mt-12">
          <h2 className="mb-5 text-center font-pixel text-white/70">CHOISISSEZ VOTRE ESPACE</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {(Object.keys(METIER_INFOS) as Metier[]).map((m) => (
              <EspaceCard key={m} metier={m} onChoisir={onChoisir} />
            ))}
          </div>
        </section>

        <p className="mt-10 text-center text-xs text-white/30">
          Vous avez déjà un compte ? Choisissez votre espace ci-dessus pour vous connecter.
          <br />
          Les comptes sont créés par l&apos;administrateur.
        </p>
      </div>
    </div>
  );
}

function EspaceCard({ metier, onChoisir }: { metier: Metier; onChoisir: (m: Metier) => void }) {
  const info = METIER_INFOS[metier];
  const accentText = info.accent === "teal" ? "text-accent-teal" : "text-accent-pink";
  return (
    <div className="glass-card flex flex-col p-6">
      <div className={`font-pixel text-[0.8rem] ${accentText}`}>{info.espace.toUpperCase()}</div>
      <p className="mt-3 text-sm text-white/70">{info.accroche}</p>
      <ul className="mt-4 flex-1 space-y-2">
        {info.points.map((p) => (
          <li key={p} className="flex items-start gap-2 text-sm text-white/60">
            <span className={`mt-0.5 ${accentText}`}>✓</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onChoisir(metier)}
        className="btn-primary mt-6 w-full justify-center"
      >
        Se connecter — {info.label}
      </button>
    </div>
  );
}
