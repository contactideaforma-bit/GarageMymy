"use client";

// MENTIONS LÉGALES — page PUBLIQUE (v9.4, habillage vitrine).
// Les informations de l'éditeur viennent de components/vitrine/societe.ts.

import { PageVitrine, BlocLegal } from "@/components/vitrine/Vitrine";
import { SOCIETE, ADRESSE_COMPLETE } from "@/components/vitrine/societe";

export default function MentionsLegalesPage() {
  return (
    <PageVitrine
      titre="Mentions légales"
      sousTitre="Informations légales relatives au site myeasyauto.fr et à l'application My Easy Auto."
      miseAJour="25 août 2026"
    >
      <BlocLegal titre="Éditeur du site et de l'application">
        <p>
          Le site <strong>myeasyauto.fr</strong> et l&apos;application <strong>{SOCIETE.produit}</strong> sont
          édités par <strong>{SOCIETE.editeur}</strong>.
        </p>
        <p>
          Siège : {ADRESSE_COMPLETE}, {SOCIETE.pays}
          <br />
          SIRET : {SOCIETE.siret}
          <br />
          Email : <a href={`mailto:${SOCIETE.email}`}>{SOCIETE.email}</a>
        </p>
        <p>Directeur de la publication : le représentant légal d&apos;{SOCIETE.editeur}.</p>
      </BlocLegal>

      <BlocLegal titre="Hébergement">
        <p>
          Le site est hébergé par <strong>Vercel Inc.</strong>, 440 N Barranca Ave #4133, Covina, CA 91723,
          États-Unis — <a href="https://vercel.com" target="_blank" rel="noopener noreferrer">vercel.com</a>.
        </p>
        <p>
          Les données de l&apos;application (dossiers, documents, fichiers) sont hébergées par{" "}
          <strong>Supabase Inc.</strong> —{" "}
          <a href="https://supabase.com" target="_blank" rel="noopener noreferrer">supabase.com</a>.
        </p>
      </BlocLegal>

      <BlocLegal titre="Données personnelles">
        <p>
          Le traitement des données personnelles est détaillé dans la{" "}
          <a href="/confidentialite">politique de confidentialité</a>. Pour exercer vos droits
          (accès, rectification, effacement, opposition, portabilité), écrivez à{" "}
          <a href={`mailto:${SOCIETE.email}`}>{SOCIETE.email}</a>. Vous pouvez également saisir la
          CNIL (<a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">cnil.fr</a>).
        </p>
      </BlocLegal>

      <BlocLegal titre="Cookies et stockage local">
        <p>
          Le site n&apos;utilise <strong>aucun cookie publicitaire ni traceur d&apos;audience</strong>. Seul un
          stockage local strictement technique est utilisé : maintien de la session de connexion,
          mémorisation du thème d&apos;affichage et des préférences d&apos;affichage des listes. Ces éléments
          sont indispensables au fonctionnement du service et ne nécessitent pas de consentement.
        </p>
      </BlocLegal>

      <BlocLegal titre="Propriété intellectuelle">
        <p>
          L&apos;ensemble du site et de l&apos;application (structure, textes, logo, interface, code) est
          protégé par le droit de la propriété intellectuelle et demeure la propriété exclusive
          d&apos;{SOCIETE.editeur}. Toute reproduction ou représentation, totale ou partielle, sans
          autorisation écrite préalable est interdite. Les marques et logos cités appartiennent à
          leurs propriétaires respectifs.
        </p>
      </BlocLegal>

      <BlocLegal titre="Responsabilité">
        <p>
          L&apos;éditeur s&apos;efforce d&apos;assurer l&apos;exactitude des informations et la disponibilité du
          service, sans pouvoir garantir l&apos;absence d&apos;erreurs ou d&apos;interruptions. Les documents
          générés par l&apos;application (devis, factures, cessions de créance…) sont établis sous la
          responsabilité du garage utilisateur, à qui il appartient d&apos;en vérifier le contenu avant
          envoi. Les conditions d&apos;utilisation du service sont précisées dans les{" "}
          <a href="/cgu">conditions générales d&apos;utilisation</a>.
        </p>
      </BlocLegal>
    </PageVitrine>
  );
}
