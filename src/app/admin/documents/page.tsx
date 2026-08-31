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

import { useState } from "react";
import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import { DOCS_COMMERCIAL, DOCS_SECRETAIRE, DocPack } from "@/lib/admin/packDocs";
import { VERSION_CGU } from "@/lib/admin/cgu";
import { VERSION_CGV } from "@/lib/admin/contratGarage";
import { VERSION_CONTRAT_APPORTEUR, VERSION_CONTRAT_PRESTATION } from "@/lib/admin/contratCollaborateur";
import { fetchAuth } from "@/lib/apiClient";

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

  const textes: { titre: string; version: string; href: string; aide: string }[] = [
    { titre: "Conditions générales d'utilisation (CGU)", version: VERSION_CGU, href: "/cgu", aide: "Acceptées par le garage à la vente depuis la v11.7." },
    { titre: "Conditions générales de vente (CGV)", version: VERSION_CGV, href: "/vente", aide: "Affichées et signées sur la page de vente." },
    { titre: "Mentions légales", version: "—", href: "/mentions-legales", aide: "Page publique." },
    { titre: "Politique de confidentialité", version: "—", href: "/confidentialite", aide: "Page publique." },
  ];

  return (
    <AdminShell titre="Documents">
      {erreur && <p className="badge badge-danger">{erreur}</p>}

      <div className="space-y-4">
        <div className="alerte alerte-info text-xs">
          <div className="alerte-titre">Modèles de contrats</div>
          <p className="mt-1">
            Les contrats se génèrent <b>préremplis depuis la fiche du collaborateur</b>
            {" "}(Collaborateurs → une fiche → « Générer le contrat prérempli ») :
            prestation <b>{VERSION_CONTRAT_PRESTATION}</b>, apporteur d&apos;affaires <b>{VERSION_CONTRAT_APPORTEUR}</b>.
            Les versions papier ci-dessous servent de support de lecture — vérifie qu&apos;elles sont
            à jour avant de les remettre.
          </p>
        </div>

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
