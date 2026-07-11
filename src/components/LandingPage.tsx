"use client";

// Page d'accueil PUBLIQUE (avant connexion) : vitrine de l'appli.
// Présente le produit (héros, étapes, fonctions, bénéfices) puis le choix de
// l'espace (Carrosserie ou Vitrage) qui ouvre l'écran de connexion.
// Thème rétro (classes maison : glass-card, glass-soft, btn-*, font-pixel).
// Photos : banque d'images gratuite Unsplash (licence Unsplash — crédit en pied de page).

import Image from "next/image";
import Link from "next/link";
import { METIER_INFOS, Metier } from "@/lib/metier";

// Images libres de droits (Unsplash). Le paramètre ?q&w&auto=format optimise le poids.
const IMG = {
  hero: "https://images.unsplash.com/photo-1625047509168-a7026f36de04?auto=format&w=1200&q=70", // peinture carrosserie
  atelier: "https://images.unsplash.com/photo-1487754180451-c456f719a1fc?auto=format&w=800&q=70", // mécanique atelier
  livraison: "https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&w=800&q=70", // remise des clés
  resultat: "https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&w=800&q=70", // véhicule impeccable
  carrosserie: "https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&w=900&q=70", // finition carrosserie
  vitrage: "https://images.unsplash.com/photo-1428592953211-077101b2021b?auto=format&w=900&q=70", // pare-brise
};

const ETAPES = [
  {
    titre: "Importez le chiffrage",
    texte:
      "Photographiez ou déposez le rapport d'expertise : l'intelligence artificielle lit tout — client, véhicule, assurance, chiffrage ligne par ligne.",
  },
  {
    titre: "Les documents se créent tout seuls",
    texte:
      "Devis, facture, ordre de réparation et cession de créance sont générés automatiquement, à votre charte, prêts à envoyer.",
  },
  {
    titre: "Faites signer en 30 secondes",
    texte:
      "Signature électronique sur tablette à l'atelier, ou lien de signature envoyé au client à distance. Fini les papiers qui se perdent.",
  },
  {
    titre: "Encaissez sans courir",
    texte:
      "Relances automatiques aux assurances, suivi des paiements, rapprochement bancaire : l'appli vous dit chaque matin quoi faire pour être payé.",
  },
];

const FONCTIONS: { titre: string; texte: string; accent: string }[] = [
  {
    titre: "Import intelligent",
    texte: "Le rapport d'expertise est lu par l'IA : dossier pré-rempli, chiffrage repris ligne pour ligne, zéro ressaisie.",
    accent: "text-accent-pink",
  },
  {
    titre: "Documents automatiques",
    texte: "Devis, factures, ordres de réparation, cessions de créance et PV de restitution — avec votre logo et votre tampon.",
    accent: "text-accent-teal",
  },
  {
    titre: "Signature électronique",
    texte: "À l'atelier sur l'écran, ou à distance par un simple lien. Chaque document signé est daté et archivé au dossier.",
    accent: "text-accent-violet",
  },
  {
    titre: "Encaissement & relances",
    texte: "Relances graduées (jusqu'à la mise en demeure), relances automatiques planifiées, suivi banque et reste à encaisser.",
    accent: "text-accent-pink",
  },
  {
    titre: "Planning & atelier",
    texte: "Calendrier des réparations, commandes de pièces, véhicules présents au garage et flotte de prêt avec alertes assurance.",
    accent: "text-accent-teal",
  },
  {
    titre: "Emails intégrés",
    texte: "Envoyez devis, factures et relances depuis votre propre boîte mail, avec journal des envois et listes de diffusion.",
    accent: "text-accent-violet",
  },
];

const BENEFICES = [
  {
    titre: "Des heures gagnées chaque semaine",
    texte: "Plus de ressaisie, plus de documents à mettre en page : tout part du rapport d'expertise.",
  },
  {
    titre: "Payé plus vite par les assurances",
    texte: "Cession de créance, relances automatiques et suivi des demandes : rien ne traîne, rien n'est oublié.",
  },
  {
    titre: "Zéro dossier qui dort",
    texte: "Chaque matin, l'appli vous liste la prochaine action de chaque dossier : à faire, urgent ou en attente.",
  },
  {
    titre: "Dans la poche, à l'atelier",
    texte: "Pensée mobile : photographiez une carte grise, faites signer sur tablette, consultez le planning depuis le téléphone.",
  },
];

export default function LandingPage({ onChoisir }: { onChoisir: (m: Metier) => void }) {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
        {/* ============================ Héros ============================ */}
        <header className="grid items-center gap-8 md:grid-cols-2">
          <div className="text-center md:text-left">
            <Image
              src="/logo.png"
              alt="My Easy Auto"
              width={80}
              height={80}
              className="mx-auto mb-5 rounded-xl border-2 border-white/20 md:mx-0"
              priority
            />
            <h1 className="font-pixel bg-gradient-to-r from-accent-violet via-accent-pink to-accent-teal bg-clip-text text-transparent">
              MY EASY AUTO
            </h1>
            <p className="mt-4 text-lg text-white/80">
              Le copilote de gestion des carrossiers et spécialistes vitrage.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/55">
              Du sinistre à l&apos;encaissement, tout votre dossier sur une seule page :
              import du rapport d&apos;expertise par IA, documents générés automatiquement,
              signature électronique et relances qui font rentrer l&apos;argent.
              Simple comme un jeu, même sans être à l&apos;aise avec l&apos;informatique.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3 md:justify-start">
              <a href="#espaces" className="btn-primary">Se connecter</a>
              <a href="#fonctions" className="btn-ghost">Découvrir l&apos;appli</a>
            </div>
          </div>
          <figure className="glass-card overflow-hidden p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={IMG.hero}
              alt="Peinture en cabine dans un atelier de carrosserie"
              className="h-56 w-full rounded-lg object-cover sm:h-72"
              loading="eager"
            />
            <figcaption className="px-2 py-2 text-center text-xs text-white/40">
              Vous réparez. My Easy Auto s&apos;occupe du reste.
            </figcaption>
          </figure>
        </header>

        {/* ======================= Bande de promesses ======================= */}
        <section className="mt-10 grid gap-3 sm:grid-cols-3">
          {[
            ["1 SEULE PAGE", "par dossier, de l'expertise au paiement"],
            ["4 DOCUMENTS", "générés en 1 clic depuis le rapport"],
            ["0 OUBLI", "la prochaine action de chaque dossier, chaque matin"],
          ].map(([chiffre, texte]) => (
            <div key={chiffre} className="glass-soft px-4 py-4 text-center">
              <div className="font-pixel text-[0.75rem] text-accent-teal">{chiffre}</div>
              <div className="mt-2 text-xs text-white/55">{texte}</div>
            </div>
          ))}
        </section>

        {/* ======================= Comment ça marche ======================= */}
        <section className="mt-14">
          <h2 className="mb-6 text-center font-pixel text-white/80">COMMENT ÇA MARCHE ?</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {ETAPES.map((e, i) => (
              <div key={e.titre} className="glass-card flex gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-violet/20 font-pixel text-[0.8rem] text-accent-violet">
                  {i + 1}
                </div>
                <div>
                  <div className="font-medium text-white">{e.titre}</div>
                  <p className="mt-1 text-sm leading-relaxed text-white/55">{e.texte}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ========================= Fonctionnalités ========================= */}
        <section id="fonctions" className="mt-14 scroll-mt-8">
          <h2 className="mb-2 text-center font-pixel text-white/80">TOUT CE QU&apos;IL VOUS FAUT</h2>
          <p className="mb-6 text-center text-sm text-white/50">
            Une seule appli remplace le classeur, le tableur, la pile de papiers et les post-it.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FONCTIONS.map((f) => (
              <div key={f.titre} className="glass-card p-5">
                <div className={`font-pixel text-[0.62rem] ${f.accent}`}>{f.titre.toUpperCase()}</div>
                <p className="mt-3 text-sm leading-relaxed text-white/60">{f.texte}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ===================== Votre quotidien, en images ===================== */}
        <section className="mt-14">
          <h2 className="mb-6 text-center font-pixel text-white/80">PENSÉ POUR VOTRE QUOTIDIEN</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              [IMG.atelier, "À l'atelier", "Le chiffrage devient ordre de réparation, les pièces sont commandées et suivies."],
              [IMG.livraison, "À la restitution", "PV signé sur l'écran, véhicule rendu, dossier qui avance tout seul."],
              [IMG.resultat, "Après le départ du client", "Relances automatiques : vous travaillez, l'appli se fait payer."],
            ].map(([src, titre, texte]) => (
              <figure key={titre} className="glass-card overflow-hidden p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={titre} className="h-36 w-full rounded-lg object-cover" loading="lazy" />
                <figcaption className="px-2 pb-1 pt-3">
                  <div className="text-sm font-medium text-white">{titre}</div>
                  <div className="mt-1 text-xs leading-relaxed text-white/50">{texte}</div>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* ========================= Pourquoi l'adopter ========================= */}
        <section className="mt-14">
          <h2 className="mb-6 text-center font-pixel text-white/80">
            VOUS NE POURREZ PLUS VOUS EN PASSER
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {BENEFICES.map((b) => (
              <div key={b.titre} className="glass-soft flex items-start gap-3 p-4">
                <span className="mt-0.5 text-accent-teal">✓</span>
                <div>
                  <div className="text-sm font-medium text-white">{b.titre}</div>
                  <p className="mt-1 text-sm leading-relaxed text-white/55">{b.texte}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ========================= Choix de l'espace ========================= */}
        <section id="espaces" className="mt-14 scroll-mt-8">
          <h2 className="mb-2 text-center font-pixel text-white/80">CHOISISSEZ VOTRE ESPACE</h2>
          <p className="mb-6 text-center text-sm text-white/50">
            Deux métiers, deux espaces dédiés — le vocabulaire et les documents s&apos;adaptent.
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            {(Object.keys(METIER_INFOS) as Metier[]).map((m) => (
              <EspaceCard key={m} metier={m} onChoisir={onChoisir} />
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-white/30">
            Vous avez déjà un compte ? Choisissez votre espace ci-dessus pour vous connecter.
            <br />
            Les comptes sont créés par l&apos;administrateur —{" "}
            <a href="mailto:contact.ideaforma@gmail.com" className="text-accent-pink hover:underline">
              demander une démonstration
            </a>
            .
          </p>
        </section>

        {/* ============================== Pied de page ============================== */}
        <footer className="mt-14 border-t border-white/10 pt-6 text-center text-xs text-white/35">
          <p>
            © {new Date().getFullYear()} My Easy Auto ·{" "}
            <Link href="/mentions-legales" className="text-white/50 hover:text-white hover:underline">
              Mentions légales
            </Link>
          </p>
          <p className="mt-2">
            Photos :{" "}
            <a
              href="https://unsplash.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              Unsplash
            </a>{" "}
            (banque d&apos;images gratuite, licence Unsplash).
          </p>
        </footer>
      </div>
    </div>
  );
}

function EspaceCard({ metier, onChoisir }: { metier: Metier; onChoisir: (m: Metier) => void }) {
  const info = METIER_INFOS[metier];
  const accentText = info.accent === "teal" ? "text-accent-teal" : "text-accent-pink";
  const image = metier === "vitrage" ? IMG.vitrage : IMG.carrosserie;
  const alt =
    metier === "vitrage"
      ? "Pare-brise d'un véhicule"
      : "Finition de la carrosserie d'un véhicule";
  return (
    <div className="glass-card flex flex-col overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt={alt} className="h-32 w-full object-cover" loading="lazy" />
      <div className="flex flex-1 flex-col p-6">
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
    </div>
  );
}
