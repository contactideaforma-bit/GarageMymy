"use client";

// ============================================================
//  IDENTITÉ DU DOSSIER « D'UN COUP D'ŒIL » (v13.54)
//  Remplace les sept cartes repliables (Véhicule, Sinistre, Expert,
//  Assurance, Réparation, Client, Suivi) par UNE grille de tuiles denses :
//  photo du véhicule conservée, valeurs cliquables (appel, e-mail,
//  itinéraire), lignes vides masquées. Tout tient sur un écran.
// ============================================================

import Link from "next/link";
import type { ReactNode } from "react";
import type { Dossier } from "@/lib/types";
import { formatDate, formatEuros } from "@/lib/format";
import { montantTtc, tauxTva } from "@/lib/tva";
import { labelNatureIntervention, labelTypeVitrage } from "@/lib/vitrage";
import PhotoVehicule from "@/components/PhotoVehicule";
import { formaterTel, lienCarte, lienTelephone } from "@/components/annuaire/CarteContact";

function L({ label, children, href, externe, vide = false }: { label: string; children?: ReactNode; href?: string | null; externe?: boolean; vide?: boolean }) {
  if (!children && !vide) return null;
  return (
    <div className="tuile-info-ligne">
      <dt>{label}</dt>
      <dd title={typeof children === "string" ? children : undefined}>
        {children ? (href ? <a href={href} target={externe ? "_blank" : undefined} rel={externe ? "noreferrer" : undefined} className="tuile-info-lien">{children}</a> : children) : <span className="opacity-40">—</span>}
      </dd>
    </div>
  );
}

function Tuile({ ico, titre, children, action, large = false }: { ico: string; titre: string; children: ReactNode; action?: ReactNode; large?: boolean }) {
  return (
    <section className={`tuile-info ${large ? "tuile-info-large" : ""}`}>
      <header className="flex items-center justify-between gap-2">
        <h4><span aria-hidden>{ico}</span> {titre}</h4>
        {action}
      </header>
      <dl className="mt-1.5">{children}</dl>
    </section>
  );
}

export default function IdentiteDossier({
  dossier,
  estVitrage,
  t,
  onPlanifier,
  onOuvrirRapport,
  boutonPlaque,
}: {
  dossier: Dossier;
  estVitrage: boolean;
  t: { reparation: string; reparateur: string; rapport: string };
  onPlanifier: () => void;
  onOuvrirRapport: () => void;
  boutonPlaque?: ReactNode;
}) {
  const adresseClient = [dossier.client_adresse, [dossier.client_code_postal, dossier.client_ville].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const telExpert = dossier.expert_tel || dossier.cabinet_tel;
  const mailExpert = dossier.expert_email || dossier.cabinet_email;

  return (
    <div className="identite-dossier">
      {/* Véhicule : photo + identité, sur deux colonnes */}
      <section className="tuile-info tuile-info-large tuile-vehicule">
        <div className="tuile-vehicule-photo"><PhotoVehicule marqueModele={dossier.marque_modele} /></div>
        <div className="min-w-0 flex-1">
          <header className="flex items-center justify-between gap-2">
            <h4><span aria-hidden>🚗</span> Véhicule</h4>
            {boutonPlaque}
          </header>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {dossier.immatriculation && <span className="plaque">{dossier.immatriculation}</span>}
            <span className="truncate text-sm font-semibold" style={{ color: "var(--mea-texte)" }}>{dossier.marque_modele || "Modèle à renseigner"}</span>
          </div>
          <dl className="mt-1.5">
            <L label="VIN">{dossier.numero_serie}</L>
            <L label="1ère mise en circulation">{dossier.premiere_circulation ? formatDate(dossier.premiere_circulation) : null}</L>
            {estVitrage && <L label="Vitrage">{labelTypeVitrage(dossier.type_vitrage)}</L>}
            {estVitrage && <L label="Nature">{labelNatureIntervention(dossier.nature_intervention)}</L>}
            {estVitrage && <L label="Calibrage ADAS">{dossier.calibrage_requis ? (dossier.calibrage_fait ? "Requis — réalisé" : "Requis — à faire") : "Non nécessaire"}</L>}
          </dl>
        </div>
      </section>

      <Tuile ico="💥" titre={estVitrage ? "Bris de glace" : "Sinistre"} action={dossier.rapport_path ? <button type="button" onClick={onOuvrirRapport} className="tuile-info-bouton" title={dossier.rapport_nom || t.rapport}>📄 {t.rapport}</button> : undefined}>
        <L label={estVitrage ? "Date du bris" : "Date"} vide>{dossier.date_sinistre ? formatDate(dossier.date_sinistre) : null}</L>
        <L label="N° de dossier" vide>{dossier.numero_sinistre}</L>
        {!estVitrage && <L label="Expertisé le">{dossier.date_expertise ? formatDate(dossier.date_expertise) : null}</L>}
        <L label="Montant HT" vide>{dossier.montant != null ? formatEuros(dossier.montant) : null}</L>
        <L label={`TTC (TVA ${tauxTva(dossier)} %)`}>{dossier.montant != null ? formatEuros(montantTtc(dossier)) : null}</L>
        {estVitrage && <L label="Franchise client">{dossier.franchise != null ? formatEuros(dossier.franchise) : null}</L>}
      </Tuile>

      <Tuile ico="👤" titre="Client">
        <L label="Nom" vide>{dossier.client_nom}</L>
        <L label="Téléphone" href={lienTelephone(dossier.client_tel)}>{dossier.client_tel ? formaterTel(dossier.client_tel) : null}</L>
        <L label="E-mail" href={dossier.client_email ? `mailto:${dossier.client_email}` : null}>{dossier.client_email}</L>
        <L label="Adresse" href={lienCarte(dossier.client_adresse, dossier.client_code_postal, dossier.client_ville)} externe>{adresseClient || null}</L>
      </Tuile>

      {(!estVitrage || dossier.cabinet_expert || dossier.expert_nom) && (
        <Tuile ico="🧑‍💼" titre="Expert">
          <L label="Cabinet" vide>{dossier.cabinet_expert}</L>
          <L label="Expert">{dossier.expert_nom}</L>
          <L label="Téléphone" href={lienTelephone(telExpert)}>{telExpert ? formaterTel(telExpert) : null}</L>
          <L label="E-mail" href={mailExpert ? `mailto:${mailExpert}` : null}>{mailExpert}</L>
          <L label="Adresse" href={lienCarte(dossier.cabinet_adresse, null, null)} externe>{dossier.cabinet_adresse}</L>
        </Tuile>
      )}

      <Tuile ico="🛡️" titre="Assurance">
        <L label="Assureur" vide>{dossier.assureur}</L>
        <L label="N° de police">{dossier.numero_police}</L>
        <L label="Téléphone" href={lienTelephone(dossier.assureur_tel)}>{dossier.assureur_tel ? formaterTel(dossier.assureur_tel) : null}</L>
        <L label="E-mail" href={dossier.assureur_email ? `mailto:${dossier.assureur_email}` : null}>{dossier.assureur_email}</L>
        <L label="Adresse" href={lienCarte(dossier.assureur_adresse, null, null)} externe>{dossier.assureur_adresse}</L>
      </Tuile>

      <Tuile
        ico="🔧"
        titre={t.reparation}
        action={
          <span className="flex items-center gap-2">
            <Link href="/planning" className="tuile-info-bouton">Planning</Link>
            <button type="button" onClick={onPlanifier} className="tuile-info-bouton tuile-info-bouton-principal">{dossier.reparation_debut ? "Modifier" : "Planifier"}</button>
          </span>
        }
      >
        <L label="Début" vide>{dossier.reparation_debut ? formatDate(dossier.reparation_debut) : null}</L>
        <L label="Fin" vide>{dossier.reparation_fin ? formatDate(dossier.reparation_fin) : null}</L>
        <L label={t.reparateur}>{dossier.reparateur}</L>
        <L label="Dossier créé le">{formatDate(dossier.created_at)}</L>
      </Tuile>
    </div>
  );
}
