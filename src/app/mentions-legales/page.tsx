"use client";

// MENTIONS LÉGALES — page PUBLIQUE (accessible sans connexion, liée depuis le
// pied de la page d'accueil). Les champs entre [crochets] sont à compléter
// avec les informations officielles de l'éditeur.

import Image from "next/image";
import Link from "next/link";

const EDITEUR = {
  nom: "My Easy Auto",
  structure: "IDEA", // [À compléter : raison sociale exacte / forme juridique]
  adresse: "[Adresse du siège à compléter]",
  siret: "[SIRET à compléter]",
  email: "contact.ideaforma@gmail.com",
  directeur: "[Nom du directeur de la publication à compléter]",
};

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="glass-card p-6">
      <h2 className="font-pixel text-[0.7rem] text-accent-teal">{titre.toUpperCase()}</h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-white/65">{children}</div>
    </section>
  );
}

export default function MentionsLegalesPage() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-8 text-center">
          <Link href="/" className="inline-block">
            <Image
              src="/logo.png"
              alt="My Easy Auto"
              width={64}
              height={64}
              className="mx-auto mb-4 rounded-xl border-2 border-white/20"
            />
          </Link>
          <h1 className="font-pixel bg-gradient-to-r from-accent-violet via-accent-pink to-accent-teal bg-clip-text text-transparent">
            MENTIONS LÉGALES
          </h1>
          <p className="mt-3 text-sm text-white/50">
            Informations légales relatives au site et à l&apos;application My Easy Auto.
          </p>
        </header>

        <div className="space-y-5">
          <Bloc titre="Éditeur du site">
            <p>
              Le site et l&apos;application <strong className="text-white">{EDITEUR.nom}</strong>{" "}
              sont édités par <strong className="text-white">{EDITEUR.structure}</strong>.
            </p>
            <p>
              Adresse : {EDITEUR.adresse}
              <br />
              SIRET : {EDITEUR.siret}
              <br />
              Contact :{" "}
              <a href={`mailto:${EDITEUR.email}`} className="text-accent-pink hover:underline">
                {EDITEUR.email}
              </a>
            </p>
            <p>Directeur de la publication : {EDITEUR.directeur}</p>
          </Bloc>

          <Bloc titre="Hébergement">
            <p>
              Le site est hébergé par <strong className="text-white">Vercel Inc.</strong>,
              440 N Barranca Ave #4133, Covina, CA 91723, États-Unis —{" "}
              <a
                href="https://vercel.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-pink hover:underline"
              >
                vercel.com
              </a>
              .
            </p>
            <p>
              Les données de l&apos;application (dossiers, documents, fichiers) sont hébergées par{" "}
              <strong className="text-white">Supabase Inc.</strong> —{" "}
              <a
                href="https://supabase.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-pink hover:underline"
              >
                supabase.com
              </a>
              .
            </p>
          </Bloc>

          <Bloc titre="Données personnelles (RGPD)">
            <p>
              My Easy Auto est un outil de gestion destiné aux professionnels de la réparation
              automobile. Les données saisies dans l&apos;application (coordonnées de clients,
              véhicules, documents de sinistre…) sont traitées{" "}
              <strong className="text-white">pour le compte du garage utilisateur</strong>, qui en
              demeure responsable de traitement au sens du Règlement général sur la protection des
              données (RGPD).
            </p>
            <p>
              Ces données sont utilisées exclusivement pour la gestion des dossiers de réparation
              (devis, factures, relances, signatures) et ne sont ni revendues ni transmises à des
              tiers à des fins commerciales.
            </p>
            <p>
              Conformément au RGPD et à la loi « Informatique et Libertés », toute personne dispose
              d&apos;un droit d&apos;accès, de rectification, d&apos;effacement et d&apos;opposition
              sur les données la concernant. Pour l&apos;exercer, contactez :{" "}
              <a href={`mailto:${EDITEUR.email}`} className="text-accent-pink hover:underline">
                {EDITEUR.email}
              </a>
              . Vous pouvez également introduire une réclamation auprès de la CNIL (
              <a
                href="https://www.cnil.fr"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-pink hover:underline"
              >
                cnil.fr
              </a>
              ).
            </p>
          </Bloc>

          <Bloc titre="Cookies et stockage local">
            <p>
              Le site n&apos;utilise <strong className="text-white">aucun cookie publicitaire ni
              traceur d&apos;audience</strong>. Seul un stockage local strictement technique est
              utilisé : maintien de la session de connexion et mémorisation du thème
              d&apos;affichage (clair/sombre). Ces éléments sont indispensables au fonctionnement
              du service et ne nécessitent pas de consentement.
            </p>
          </Bloc>

          <Bloc titre="Propriété intellectuelle">
            <p>
              L&apos;ensemble du site (structure, textes, logo, interface) est protégé par le droit
              de la propriété intellectuelle. Toute reproduction ou représentation, totale ou
              partielle, sans autorisation écrite préalable est interdite.
            </p>
          </Bloc>

          <Bloc titre="Responsabilité">
            <p>
              L&apos;éditeur s&apos;efforce d&apos;assurer l&apos;exactitude des informations et la
              disponibilité du service, sans pouvoir garantir l&apos;absence d&apos;erreurs ou
              d&apos;interruptions. Les documents générés par l&apos;application (devis, factures,
              cessions de créance…) sont établis sous la responsabilité du garage utilisateur, à
              qui il appartient d&apos;en vérifier le contenu avant envoi.
            </p>
          </Bloc>
        </div>

        <footer className="mt-10 text-center">
          <Link href="/" className="btn-ghost inline-block">
            ← Retour à l&apos;accueil
          </Link>
          <p className="mt-4 text-xs text-white/30">
            © {new Date().getFullYear()} My Easy Auto
          </p>
        </footer>
      </div>
    </div>
  );
}
