"use client";

// FACTURATION ÉLECTRONIQUE — page PUBLIQUE d'information (v52).
// Explique la réforme aux garages et ce que My Easy Auto fait / fera.

import { PageVitrine, BlocLegal } from "@/components/vitrine/Vitrine";
import { SOCIETE } from "@/components/vitrine/societe";

export default function FacturationElectroniquePage() {
  return (
    <PageVitrine
      titre="La facturation électronique, sans rien changer à votre atelier"
      sousTitre="Ce que la réforme 2026-2027 impose aux garages, et comment My Easy Auto s'en occupe."
      miseAJour="25 août 2026"
    >
      <BlocLegal titre="Le calendrier officiel">
        <ul>
          <li>
            <strong>1er septembre 2026</strong> — toutes les entreprises assujetties à la TVA doivent pouvoir{" "}
            <strong>recevoir</strong> des factures électroniques, donc avoir désigné une plateforme agréée par
            l&apos;État. Les grandes entreprises et les ETI doivent déjà émettre.
          </li>
          <li>
            <strong>1er septembre 2027</strong> — les PME, TPE et micro-entreprises doivent à leur tour{" "}
            <strong>émettre</strong> leurs factures par ce canal.
          </li>
        </ul>
        <p>
          Concrètement, plus de PDF envoyé par email entre entreprises : la facture transite par une plateforme
          agréée (PA), dans un format structuré — Factur-X, UBL ou CII — et son parcours (déposée, acceptée,
          rejetée, payée) est suivi.
        </p>
      </BlocLegal>

      <BlocLegal titre="Ce que ça change pour un carrossier">
        <ul>
          <li>
            <strong>Vos factures aux assureurs</strong> et aux experts sont des factures entre entreprises : elles
            passeront par la plateforme, avec le SIREN du destinataire et la nature de l&apos;opération (pièces =
            biens, main-d&apos;œuvre = services).
          </li>
          <li>
            <strong>Vos factures aux particuliers</strong> (franchise, vétusté) ne passent pas par la plateforme,
            mais leurs montants et leurs encaissements sont déclarés à l&apos;administration (« e-reporting »).
          </li>
          <li>
            <strong>Les factures de vos fournisseurs</strong> de pièces vous arrivent sur votre plateforme : c&apos;est
            ce qui devient obligatoire dès septembre 2026.
          </li>
        </ul>
      </BlocLegal>

      <BlocLegal titre="Ce que My Easy Auto fait déjà">
        <ul>
          <li>
            Vos factures sont produites au format <strong>Factur-X</strong> : un PDF lisible comme aujourd&apos;hui,
            avec le fichier XML structuré embarqué, prêt à être déposé sur votre plateforme.
          </li>
          <li>
            Les <strong>nouvelles mentions obligatoires</strong> sont imprimées : SIREN du client ou de
            l&apos;assureur, nature de l&apos;opération, lieu de la prestation, option TVA sur les débits.
          </li>
          <li>
            Le SIREN de chaque assureur est mémorisé dans votre annuaire et repris automatiquement sur les dossiers.
          </li>
          <li>
            Votre profil enregistre la plateforme agréée que vous avez désignée, pour ne pas l&apos;oublier le jour J.
          </li>
        </ul>
      </BlocLegal>

      <BlocLegal titre="Ce qui arrive avant l'échéance de 2027">
        <ul>
          <li>
            <strong>Transmission automatique</strong> de vos factures à votre plateforme agréée depuis la fiche dossier,
            sans dépôt manuel.
          </li>
          <li>
            <strong>Suivi du cycle de vie</strong> dans le dossier : une facture rejetée par un assureur devient une
            action à traiter dès le lendemain matin, comme vos relances aujourd&apos;hui.
          </li>
          <li>
            <strong>E-reporting</strong> des factures aux particuliers et des encaissements, alimenté par votre
            rapprochement bancaire.
          </li>
          <li>
            Récupération des <strong>factures fournisseurs</strong> reçues sur la plateforme et rapprochement avec vos
            commandes de pièces.
          </li>
        </ul>
      </BlocLegal>

      <BlocLegal titre="Ce que vous devez faire de votre côté">
        <ul>
          <li>
            <strong>Désigner une plateforme agréée</strong> avant le 1er septembre 2026 — la réception seule y est
            souvent gratuite ; votre expert-comptable en propose généralement une. Notez-la dans votre profil My Easy
            Auto.
          </li>
          <li>
            <strong>Renseigner le SIREN</strong> de vos assureurs dans l&apos;annuaire (une fois pour toutes) et celui
            de vos clients professionnels sur leurs dossiers.
          </li>
          <li>Vérifier que le SIRET et le numéro de TVA de votre garage sont exacts dans votre profil.</li>
        </ul>
        <p>
          Une question ? Écrivez-nous à <a href={`mailto:${SOCIETE.email}`}>{SOCIETE.email}</a> — nous accompagnons
          chaque garage dans le choix de sa plateforme.
        </p>
      </BlocLegal>

      <BlocLegal titre="Sources">
        <ul>
          <li>
            <a href="https://www.impots.gouv.fr/facturation-electronique" target="_blank" rel="noopener noreferrer">
              impots.gouv.fr — la facturation électronique
            </a>
          </li>
          <li>Numéro d&apos;assistance national de la réforme : 0 806 807 807.</li>
        </ul>
        <p className="text-xs text-slate-400">
          Ces informations sont fournies à titre indicatif et ne constituent pas un conseil juridique ou fiscal.
        </p>
      </BlocLegal>
    </PageVitrine>
  );
}
