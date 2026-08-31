"use client";

// ====================================================================
//  ESPACE ÉDITEUR — TOUS LES DOCUMENTS (v11.7)
//
//  Demande de l'éditeur : « on met à dispo l'ensemble des documents sur
//  mon espace admin, CGU inclus ». Jusqu'ici les documents du pack
//  n'étaient accessibles que depuis la FICHE d'un collaborateur : pour
//  relire un contrat type ou renvoyer une plaquette, il fallait ouvrir
//  la fiche de quelqu'un. Ici, tout est au même endroit.
//
//  Trois familles :
//   · les documents du pack COMMERCIAL (aussi servis au commercial dans
//     son espace « Mes documents ») ;
//   · les documents du pack SECRÉTAIRE (envoyés par email — elle n'a pas
//     de compte) ;
//   · les TEXTES CONTRACTUELS de référence (CGU, CGV, mentions légales,
//     confidentialité) qui vivent dans l'application, avec leur version.
// ====================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import { DOCS_COMMERCIAL, DOCS_SECRETAIRE, DocPack } from "@/lib/admin/packDocs";
import { VERSION_CGU } from "@/lib/admin/cgu";
import { VERSION_DPA } from "@/lib/admin/dpa";
import { VERSION_CGV } from "@/lib/admin/contratGarage";
import { VERSION_CONTRAT_APPORTEUR, VERSION_CONTRAT_PRESTATION } from "@/lib/admin/contratCollaborateur";
import { fetchAuth } from "@/lib/apiClient";
import { Collaborateur, lireParametres } from "@/lib/admin/client";
import { Parametres } from "@/lib/admin/economie";
import { contratDefaut } from "@/lib/admin/contratCollaborateur";
import { construireContratCollaborateurPdf, prechargerLogoPdf } from "@/lib/admin/contratPdf";

/** Fiche vide : sert à produire un modèle À BLANC, à faire lire avant signature. */
function collaborateurVide(type: "commercial" | "secretaire"): Collaborateur {
  return {
    id: "", created_at: "", type, nom: "", prenom: null, email: null, tel: null, siret: null,
    adresse: null, statut: "actif", date_debut: null, date_fin: null, iban: null,
    taux_retrocession: null, taux_horaire: null, notes: null,
  };
}

async function telecharger(d: DocPack) {
  const res = await fetchAuth(`/api/admin/pack-doc?cle=${encodeURIComponent(d.cle)}`);
  if (!res.ok) throw new Error("Téléchargement impossible.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = d.fichier.split("/").pop() || `${d.cle}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

function Famille({ titre, aide, docs, onErreur }: { titre: string; aide: string; docs: DocPack[]; onErreur: (m: string) => void }) {
  return (
    <section className="glass-card p-4">
      <h2 className="titre-bloc">{titre}</h2>
      <p className="mb-3 text-xs text-white/45">{aide}</p>
      <ul className="divide-y divide-white/10">
        {docs.map((d) => (
          <li key={d.cle} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 break-words text-sm text-white/85">📄 {d.titre}</span>
            <button
              className="shrink-0 text-sm text-accent-pink hover:underline"
              onClick={() => telecharger(d).catch((e) => onErreur(e instanceof Error ? e.message : "Erreur"))}
            >
              Télécharger
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function DocumentsAdminPage() {
  const [erreur, setErreur] = useState<string | null>(null);
  const [params, setParams] = useState<Parametres | null>(null);

  useEffect(() => {
    lireParametres().then(setParams).catch(() => undefined);
  }, []);

  /**
   * MODÈLE À BLANC généré depuis l'application (v11.8).
   * L'audit du 31/08/2026 avait relevé que le contrat de prestation PAPIER
   * était resté en v1 — avec la période d'essai de 2 mois qu'on avait
   * justement retirée — pendant que l'appli était en v2.1. Plutôt que
   * d'entretenir des .docx qui rediviergeront, on produit le PDF depuis
   * le MÊME modèle que celui utilisé pour les contrats réels : le papier
   * ne peut plus être en retard sur l'écran.
   */
  async function modeleABlanc(type: "commercial" | "secretaire") {
    if (!params) return setErreur("Paramètres non chargés.");
    try {
      await prechargerLogoPdf();
      const contenu = contratDefaut(collaborateurVide(type), params);
      const pdf = construireContratCollaborateurPdf(contenu, {
        nomCollaborateur: "",
        signatureEditeur: null,
        signatureCollaborateur: null,
        signeLe: null,
      });
      pdf.save(`modele-${type === "commercial" ? "contrat-apporteur" : "contrat-prestation"}-${contenu.version}.pdf`);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Génération impossible.");
    }
  }

  const textes: { titre: string; version: string; href: string; aide: string }[] = [
    { titre: "Conditions générales d'utilisation (CGU)", version: VERSION_CGU, href: "/cgu", aide: "Acceptées par le garage à la vente depuis la v11.7." },
    { titre: "Conditions générales de vente (CGV)", version: VERSION_CGV, href: "/vente", aide: "Affichées et signées sur la page de vente." },
    { titre: "Accord de traitement des données (annexe RGPD)", version: VERSION_DPA, href: "/vente", aide: "Annexe au contrat d'abonnement : porte l'autorisation d'intervention des secrétaires indépendantes." },
    { titre: "Mentions légales", version: "—", href: "/mentions-legales", aide: "Page publique." },
    { titre: "Politique de confidentialité", version: "—", href: "/confidentialite", aide: "Page publique." },
  ];

  return (
    <AdminShell titre="Documents">
      {erreur && <p className="badge badge-danger">{erreur}</p>}

      <div className="space-y-4">
        <section className="glass-card p-4">
          <h2 className="titre-bloc">Modèles de contrats — toujours à jour</h2>
          <p className="mb-3 text-xs text-white/45">
            Ces PDF sont produits à partir des <b>modèles de l&apos;application</b>, ceux-là mêmes qui
            servent aux contrats réels : le papier ne peut donc plus être en retard sur l&apos;écran.
            Pour un contrat nominatif, passer par Collaborateurs → une fiche → « Générer le contrat prérempli ».
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost btn-compact" disabled={!params} onClick={() => modeleABlanc("secretaire")}>
              📄 Contrat de prestation (secrétaire) — {VERSION_CONTRAT_PRESTATION}
            </button>
            <button className="btn-ghost btn-compact" disabled={!params} onClick={() => modeleABlanc("commercial")}>
              📄 Contrat d&apos;apporteur d&apos;affaires — {VERSION_CONTRAT_APPORTEUR}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-white/40">
            Le contrat d&apos;abonnement du garage (conditions particulières + CGV + CGU + accord RGPD)
            se lit et se signe sur la page de vente ; le PDF signé est produit à chaque vente.
          </p>
        </section>

        <Famille
          titre="Pack commercial"
          aide="Remis aux apporteurs d'affaires. Ils les retrouvent aussi dans leur espace « Mes documents »."
          docs={DOCS_COMMERCIAL}
          onErreur={setErreur}
        />
        <Famille
          titre="Pack secrétaire"
          aide="Envoyés par email à la signature (la secrétaire n'a pas de compte dédié)."
          docs={DOCS_SECRETAIRE}
          onErreur={setErreur}
        />

        <section className="glass-card p-4">
          <h2 className="titre-bloc">Textes contractuels de référence</h2>
          <p className="mb-3 text-xs text-white/45">
            Ils vivent dans l&apos;application : la version affichée ici est celle qui fait foi.
          </p>
          <ul className="divide-y divide-white/10">
            {textes.map((t) => (
              <li key={t.titre} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block break-words text-sm text-white/85">⚖️ {t.titre}</span>
                  <span className="block text-[11px] text-white/45">{t.aide}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="badge badge-neutral">{t.version}</span>
                  <Link href={t.href} target="_blank" className="text-sm text-accent-pink hover:underline">Ouvrir</Link>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AdminShell>
  );
}
