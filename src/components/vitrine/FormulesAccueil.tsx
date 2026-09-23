"use client";

// ============================================================
//  FORMULES — section de la page d'accueil publique (v13.26).
//
//  Objectif : des prix CLAIRS, sans pression. Pas de compte à rebours,
//  pas de « meilleure offre » : le visiteur choisit l'engagement, lit ce
//  que chaque formule change, et trouve les conditions en une ligne.
//
//  Les prix viennent de la même grille que le contrat (economie.ts) : la
//  grille par défaut s'affiche tout de suite, puis celle enregistrée par
//  l'éditeur (/api/tarifs) la remplace si elle diffère.
// ============================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { tarifFormule } from "@/lib/admin/economie";
import { eur, useGrille } from "./useGrille";
import { FICHES } from "./formules";

const CARTES = FICHES;

const QUESTIONS: [string, string][] = [
  [
    "Qui intervient sur mes dossiers ?",
    "Des chargés de mission spécialisés dans les dossiers de sinistres, prestataires indépendants sélectionnés par IDEAFORMA. Ils agissent à distance, sur votre instruction, avec un accès nominatif. Vous pouvez demander un autre interlocuteur à tout moment.",
  ],
  [
    "Comment je sais ce qui a été fait ?",
    "Chaque intervention est enregistrée dans l'application avec sa durée, une description et les dossiers concernés. Vous voyez à tout moment le temps utilisé sur votre forfait.",
  ],
  [
    "Et si je n'utilise pas toutes mes heures ?",
    "Les heures non consommées sont reportables à 50 % sur le mois suivant. Les heures au-delà du forfait ne sont jamais facturées sans votre accord écrit.",
  ],
  [
    "Puis-je changer de formule ?",
    "Oui. Vous pouvez passer à une formule supérieure à tout moment. Pour descendre en gamme : avec un mois de préavis sans engagement, ou après six mensualités réglées si vous êtes engagé.",
  ],
  [
    "Mes données sont-elles protégées ?",
    "Elles sont hébergées dans l'Union européenne, cloisonnées par compte et sauvegardées chaque jour. Le contrat comprend l'accord de traitement des données prévu par le RGPD.",
  ],
];

export default function FormulesAccueil() {
  const params = useGrille();
  const [engage, setEngage] = useState(true);

  const tarifs = useMemo(
    () => Object.fromEntries(CARTES.map((c) => [c.formule, tarifFormule(c.formule, params)])),
    [params],
  );
  const remiseMax = Math.max(...CARTES.map((c) => tarifs[c.formule].remiseEngagementPct));

  return (
    <section id="formules" className="scroll-mt-20 pb-16 sm:pb-20">
      <span className="lp-chip">Formules</span>
      <h2 className="mt-3 max-w-3xl">Une application complète, et un renfort si vous en avez besoin.</h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">
        Toutes les formules donnent accès à toute l&apos;application, avec utilisateurs, dossiers et documents
        illimités. Ce qui change, c&apos;est le temps d&apos;un chargé de mission pour débloquer vos dossiers.
      </p>

      {/* Choix de l'engagement : deux boutons, l'effet est immédiat sur les prix. */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Durée d'engagement" className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
          {[
            { v: true, label: "Engagement 12 mois" },
            { v: false, label: "Sans engagement" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={engage === o.v}
              onClick={() => setEngage(o.v)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                engage === o.v ? "bg-violet-600 text-white shadow" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">
          {engage
            ? `Jusqu'à ${remiseMax} % de remise et mise en service offerte.`
            : "Résiliable chaque mois, avec un mois de préavis."}
        </span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CARTES.map((c) => {
          const t = tarifs[c.formule];
          const prix = engage ? t.mensuelEngage : t.mensuel;
          const autre = engage ? t.mensuel : t.mensuelEngage;
          return (
            <Link
              key={c.formule}
              href={`/formules/${c.slug}`}
              aria-label={`Voir le détail de la formule ${c.nom}`}
              className="lp-card lp-formule flex flex-col p-5 text-inherit no-underline"
            >
              <div className="font-semibold">{c.nom}</div>
              <div className="mt-2">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    t.heures > 0 ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {t.heures > 0 ? `${t.heures} h / mois de chargé de mission` : "Application seule"}
                </span>
              </div>
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold tracking-tight">{eur(prix)}</span>
                <span className="text-sm text-slate-500">HT / mois</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {engage ? `${eur(autre)} HT sans engagement` : `${eur(autre)} HT avec engagement de 12 mois`}
              </div>
              <p className="mt-4 text-sm leading-relaxed text-slate-600 lg:min-h-[4.5rem]">{c.pourQui}</p>
              <ul className="mt-4 flex-1 space-y-2 border-t border-slate-100 pt-4">
                {c.inclus.map((i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden="true">
                      <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>{i}</span>
                  </li>
                ))}
              </ul>
              <span className="lp-formule-cta mt-5">
                Voir le détail de la formule <span aria-hidden="true">→</span>
              </span>
            </Link>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Les missions possibles sont les mêmes dans les trois formules Adhésion Service : seul le nombre d&apos;heures
        change. Les exemples de chaque carte sont des repères pour choisir.
      </p>

      {/* Conditions : tout ce qu'on se demande avant de signer, en une bande. */}
      <div className="mt-5 rounded-2xl border-2 border-slate-800 bg-white p-5 text-sm leading-relaxed text-slate-600">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="font-semibold text-slate-900">Mise en service</div>
            Paramétrage du compte, reprise de vos dossiers en cours et formation à distance :{" "}
            {eur(params.miseEnService)}&nbsp;HT, <b>offerte</b> avec l&apos;engagement de 12 mois ou l&apos;année payée en une fois.
          </div>
          <div>
            <div className="font-semibold text-slate-900">Vos heures</div>
            Reportables à 50 % sur le mois suivant. Au-delà du forfait : {eur(params.heureHorsForfait)}&nbsp;HT de
            l&apos;heure, uniquement sur votre accord écrit.
          </div>
          <div>
            <div className="font-semibold text-slate-900">Souplesse</div>
            Passage à une formule supérieure à tout moment. Pas de jetons, pas d&apos;option cachée. Prix hors
            taxes, TVA 20 % en sus.
          </div>
        </div>
      </div>

      {/* Comment fonctionne le renfort : trois temps, sans jargon. */}
      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <h3 className="!text-lg font-semibold">Comment fonctionne l&apos;Adhésion Service ?</h3>
          <ol className="mt-4 space-y-4">
            {[
              ["Vous confiez", "Dans l'application, vous écrivez ce que vous voulez voir avancer et rattachez les dossiers concernés."],
              ["Le chargé de mission agit", "Il appelle, relance, prépare les courriers et vous rend compte par écrit. Demandes courantes traitées sous un jour ouvré."],
              ["Vous décidez", "Tout ce qui engage votre garage (montant, courrier, signature) reste entre vos mains."],
            ].map(([titre, texte], i) => (
              <li key={titre} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-300 bg-violet-50 text-sm font-bold text-violet-700">
                  {i + 1}
                </span>
                <div>
                  <div className="font-semibold">{titre}</div>
                  <p className="text-sm leading-relaxed text-slate-500">{texte}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h3 className="!text-lg font-semibold">Vos questions</h3>
          <div className="mt-4 space-y-2">
            {QUESTIONS.map(([q, r]) => (
              <details key={q} className="group lp-card px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
                  {q}
                  <span className="text-violet-600 transition group-open:rotate-45" aria-hidden="true">＋</span>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{r}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
