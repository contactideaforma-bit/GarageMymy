"use client";

// POLITIQUE DE CONFIDENTIALITÉ — page PUBLIQUE (v9.4).

import { PageVitrine, BlocLegal } from "@/components/vitrine/Vitrine";
import { SOCIETE, ADRESSE_COMPLETE } from "@/components/vitrine/societe";

export default function ConfidentialitePage() {
  return (
    <PageVitrine
      titre="Politique de confidentialité"
      sousTitre="Quelles données nous traitons, pourquoi, combien de temps, et vos droits."
      miseAJour="25 août 2026"
    >
      <BlocLegal titre="Responsable du traitement">
        <p>
          <strong>{SOCIETE.editeur}</strong>, {ADRESSE_COMPLETE}, SIRET {SOCIETE.siret} —{" "}
          <a href={`mailto:${SOCIETE.email}`}>{SOCIETE.email}</a>.
        </p>
        <p>
          Pour les données saisies dans l&apos;application par un garage (ses clients, véhicules,
          documents), le garage est <strong>responsable de traitement</strong> et {SOCIETE.editeur}
          agit comme <strong>sous-traitant</strong>.
        </p>
      </BlocLegal>

      <BlocLegal titre="Données traitées">
        <ul>
          <li>
            <strong>Visiteurs du site</strong> : aucune donnée collectée sans action de votre part. Le
            formulaire de contact recueille nom, email, téléphone (facultatif), société et message,
            ainsi que l&apos;adresse IP à des fins anti-abus.
          </li>
          <li>
            <strong>Utilisateurs de l&apos;application</strong> : email et mot de passe de connexion
            (haché), informations de l&apos;entreprise (raison sociale, coordonnées, logo, RIB pour
            l&apos;édition des factures), journal technique des actions.
          </li>
          <li>
            <strong>Données métier saisies par le garage</strong> : coordonnées des clients,
            véhicules, rapports d&apos;expertise, devis, factures, signatures, photographies, échanges
            avec les assureurs.
          </li>
        </ul>
      </BlocLegal>

      <BlocLegal titre="Finalités et bases légales">
        <ul>
          <li>Fourniture du service et exécution du contrat (base : contrat) ;</li>
          <li>Réponse aux demandes de contact et de démonstration (base : intérêt légitime) ;</li>
          <li>Sécurité, prévention des abus et journalisation technique (base : intérêt légitime) ;</li>
          <li>Obligations comptables et légales (base : obligation légale).</li>
        </ul>
        <p>Aucune donnée n&apos;est vendue, louée ni utilisée à des fins publicitaires.</p>
      </BlocLegal>

      <BlocLegal titre="Sous-traitants et hébergement">
        <ul>
          <li><strong>Vercel</strong> — hébergement du site et de l&apos;application ;</li>
          <li><strong>Supabase</strong> — base de données, authentification, stockage des fichiers ;</li>
          <li>
            <strong>Fournisseur d&apos;IA</strong> — lecture de repli des rapports d&apos;expertise : seul
            le document analysé est transmis, le temps du traitement, sans conservation à des fins
            d&apos;entraînement ;
          </li>
          <li>Votre propre serveur de messagerie (SMTP) ou Resend pour l&apos;envoi des emails.</li>
        </ul>
        <p>
          Ces prestataires sont certifiés (SOC 2) et encadrés par des clauses contractuelles
          conformes au RGPD lorsque des données transitent hors de l&apos;Union européenne.
        </p>
      </BlocLegal>

      <BlocLegal titre="Durées de conservation">
        <ul>
          <li>Messages de contact : 12 mois ;</li>
          <li>Données du compte et données métier : pendant la durée de l&apos;abonnement, puis 30 jours ;</li>
          <li>Documents comptables (factures émises) : 10 ans, conformément à la loi ;</li>
          <li>Journaux techniques : 12 mois.</li>
        </ul>
      </BlocLegal>

      <BlocLegal titre="Sécurité">
        <p>
          Connexions chiffrées (TLS), données chiffrées au repos, cloisonnement des données de chaque
          garage appliqué par la base de données (politiques de sécurité au niveau des lignes),
          secrets chiffrés en AES-256, sauvegardes régulières, journalisation des accès sensibles.
        </p>
      </BlocLegal>

      <BlocLegal titre="Vos droits">
        <p>
          Vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement, de limitation,
          d&apos;opposition et de portabilité. Écrivez à{" "}
          <a href={`mailto:${SOCIETE.email}`}>{SOCIETE.email}</a> ; nous répondons sous un mois. Vous
          pouvez introduire une réclamation auprès de la CNIL (
          <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">cnil.fr</a>). Si vous
          êtes client d&apos;un garage utilisateur, adressez-vous d&apos;abord à ce garage, responsable
          de vos données.
        </p>
      </BlocLegal>

      <BlocLegal titre="Cookies">
        <p>
          Aucun cookie publicitaire ni de mesure d&apos;audience. Seul un stockage local strictement
          nécessaire (session, thème, préférences d&apos;affichage) est utilisé.
        </p>
      </BlocLegal>
    </PageVitrine>
  );
}
