"use client";

// ============================================================
//  DÉTAIL D'UNE FORMULE — page PUBLIQUE (v13.26), ouverte en cliquant une
//  carte de la section Formules de l'accueil. Même ton que l'accueil :
//  clair, factuel, sans pression. Prix issus de la grille (useGrille).
// ============================================================

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { VitrineNav, VitrineFooter } from "@/components/vitrine/Vitrine";
import FormulaireContact from "@/components/vitrine/FormulaireContact";
import { tarifFormule } from "@/lib/admin/economie";
import { eur, useGrille } from "@/components/vitrine/useGrille";
import { APPLICATION, FICHES, JAMAIS, MISSIONS, ficheParSlug } from "@/components/vitrine/formules";

function Coche({ className = "text-violet-600" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`mt-0.5 h-4 w-4 shrink-0 ${className}`} aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PageFormule() {
  const { slug } = useParams<{ slug: string }>();
  const fiche = ficheParSlug(String(slug || ""));
  const params = useGrille();
  const [engage, setEngage] = useState(true);

  if (!fiche) {
    return (
      <div className="landing-pro min-h-screen">
        <VitrineNav />
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h1>Formule introuvable</h1>
          <Link href="/#formules" className="lp-btn mt-6">Voir toutes les formules</Link>
        </div>
        <VitrineFooter />
      </div>
    );
  }

  const t = tarifFormule(fiche.formule, params);
  const service = t.heures > 0;
  const prix = engage ? t.mensuelEngage : t.mensuel;

  return (
    <div className="landing-pro min-h-screen">
      <VitrineNav />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
        <Link href="/#formules" className="text-sm text-slate-500 hover:text-slate-900">
          ‹ Toutes les formules
        </Link>

        {/* ============================ En-tête + prix ============================ */}
        <header className="mt-4 grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
          <div>
            <span className="lp-chip">Formule</span>
            <h1 className="mt-2">{fiche.nom}</h1>
            <span
              className={`mt-3 inline-block rounded-full px-3 py-1 text-sm font-semibold ${
                service ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-600"
              }`}
            >
              {service ? `${t.heures} h / mois de chargé de mission` : "Application seule"}
            </span>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-600">{fiche.intro}</p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">
              <b className="text-slate-700">Pour qui ?</b> {fiche.pourQui}
            </p>
          </div>

          <div className="lp-card p-5">
            <div role="radiogroup" aria-label="Durée d'engagement" className="inline-flex w-full rounded-xl border border-slate-200 bg-white p-1">
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
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    engage === o.v ? "bg-violet-600 text-white shadow" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="mt-5 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tracking-tight">{eur(prix)}</span>
              <span className="text-sm text-slate-500">HT / mois</span>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              {engage ? (
                <>
                  <li className="flex gap-2"><Coche />Remise de {t.remiseEngagementPct} % (au lieu de {eur(t.mensuel)} HT sans engagement)</li>
                  <li className="flex gap-2"><Coche />Mise en service offerte ({eur(t.miseEnService)} HT)</li>
                  <li className="flex gap-2">
                    <Coche />
                    <span>
                      Ou l&apos;année payée en une fois : {eur(t.annuelUnique)} HT
                      {t.bonusAnnuel > 0 ? ` (${t.bonusAnnuelLibelle})` : ""}
                    </span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex gap-2"><Coche />Résiliable chaque mois, avec un mois de préavis</li>
                  <li className="flex gap-2"><Coche />Mise en service : {eur(t.miseEnService)} HT</li>
                  <li className="flex gap-2"><Coche />Avec engagement de 12 mois : {eur(t.mensuelEngage)} HT / mois</li>
                </>
              )}
            </ul>
            <a href="#contact" className="lp-btn mt-5 w-full">Demander à en parler</a>
            <p className="mt-2 text-center text-xs text-slate-400">Prix hors taxes, TVA 20 % en sus.</p>
          </div>
        </header>

        {/* ============================ Contenu ============================ */}
        <section className="mt-14 grid gap-6 lg:grid-cols-2">
          <div className="lp-card p-6">
            <h2 className="!text-xl">L&apos;application complète</h2>
            <p className="mt-1 text-sm text-slate-500">Incluse dans toutes les formules.</p>
            <ul className="mt-4 space-y-2.5">
              {APPLICATION.map((a) => (
                <li key={a} className="flex gap-2 text-sm text-slate-600"><Coche />{a}</li>
              ))}
            </ul>
          </div>

          {service ? (
            <div className="lp-card p-6">
              <h2 className="!text-xl">Votre chargé de mission, {t.heures} h / mois</h2>
              <p className="mt-1 text-sm text-slate-500">
                Spécialisé dans les dossiers de sinistres, à distance, du lundi au vendredi aux horaires ouvrés.
              </p>
              <ul className="mt-4 space-y-2.5">
                {MISSIONS.map((m) => (
                  <li key={m} className="flex gap-2 text-sm text-slate-600"><Coche className="text-fuchsia-600" />{m}</li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-slate-500">
                Les missions possibles sont les mêmes dans les trois formules Adhésion Service : seul le nombre d&apos;heures change.
              </p>
            </div>
          ) : (
            <div className="lp-card p-6">
              <h2 className="!text-xl">Besoin d&apos;un renfort plus tard ?</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Vous pouvez passer à tout moment à une formule Adhésion Service : un chargé de mission reprend alors vos
                dossiers bloqués, vos litiges et vos impayés, 10, 20 ou 40 h / mois selon la formule. Vos données et vos
                documents restent en place.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {FICHES.filter((f) => f.slug !== "essentiel").map((f) => (
                  <Link key={f.slug} href={`/formules/${f.slug}`} className="lp-btn-ghost !py-2 !text-sm">{f.nom}</Link>
                ))}
              </div>
            </div>
          )}
        </section>

        {service && (
          <section className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="lp-card p-6 lg:col-span-2">
              <h2 className="!text-xl">Comment ça se passe</h2>
              <ol className="mt-4 grid gap-4 sm:grid-cols-3">
                {[
                  ["Vous confiez", "Dans l'application, vous écrivez ce que vous voulez voir avancer et rattachez les dossiers."],
                  ["Il agit", "Il appelle, relance, prépare et vous rend compte par écrit. Demandes courantes : un jour ouvré."],
                  ["Vous décidez", "Tout ce qui engage votre garage reste entre vos mains : montants, courriers, signatures."],
                ].map(([titre, texte], i) => (
                  <li key={titre}>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-violet-300 bg-violet-50 text-sm font-bold text-violet-700">{i + 1}</span>
                    <div className="mt-2 font-semibold">{titre}</div>
                    <p className="text-sm leading-relaxed text-slate-500">{texte}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-5 text-sm text-slate-600">
                <b>Transparence :</b> chaque intervention est enregistrée avec sa durée, une description et les dossiers
                concernés. Vous voyez à tout moment le temps utilisé sur vos {t.heures} h / mois.
              </p>
            </div>
            <div className="lp-card p-6">
              <h2 className="!text-xl">Jamais confié</h2>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                {JAMAIS.map((j) => (
                  <li key={j} className="flex gap-2"><span className="text-slate-400">—</span>{j}</li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ============================ Conditions ============================ */}
        <section className="mt-6 rounded-2xl border-2 border-slate-800 bg-white p-6 text-sm leading-relaxed text-slate-600">
          <h2 className="!text-xl text-slate-900">Les conditions, en clair</h2>
          <div className="mt-4 grid gap-5 md:grid-cols-3">
            <div>
              <div className="font-semibold text-slate-900">Engagement</div>
              Sans engagement : résiliable avec un mois de préavis. Avec engagement de 12 mois : remise de{" "}
              {t.remiseEngagementPct} % et mise en service offerte ; au terme, le contrat continue au mois, au même tarif.
            </div>
            <div>
              <div className="font-semibold text-slate-900">Changer de formule</div>
              Formule supérieure à tout moment. Formule inférieure : avec un mois de préavis sans engagement, ou après six
              mensualités réglées si vous êtes engagé.
            </div>
            <div>
              <div className="font-semibold text-slate-900">{service ? "Vos heures" : "Tout est inclus"}</div>
              {service
                ? `Reportables à 50 % sur le mois suivant. Au-delà du forfait : ${eur(params.heureHorsForfait)} HT de l'heure, uniquement sur votre accord écrit.`
                : "Utilisateurs, dossiers, documents et stockage illimités. Pas de jetons, pas d'option payante cachée."}
            </div>
          </div>
        </section>

        {/* ============================ Autres formules ============================ */}
        <nav aria-label="Autres formules" className="mt-8 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">Comparer avec :</span>
          {FICHES.filter((f) => f.slug !== fiche.slug).map((f) => (
            <Link key={f.slug} href={`/formules/${f.slug}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 hover:border-pink-400">
              {f.nom}
            </Link>
          ))}
        </nav>

        {/* ============================ Contact ============================ */}
        <section id="contact" className="mt-14 grid scroll-mt-20 gap-8 lg:grid-cols-[2fr_3fr]">
          <div>
            <span className="lp-chip">Une question ?</span>
            <h2 className="mt-2">Parlons de votre carrosserie.</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              Dites-nous combien de dossiers vous suivez et ce qui vous prend du temps : nous vous aidons à choisir la
              formule adaptée, sans engagement de votre part. Réponse sous 24 h ouvrées.
            </p>
          </div>
          <FormulaireContact key={fiche.slug} sujetDefaut={`Bonjour, je souhaite en savoir plus sur la formule ${fiche.nom}.`} />
        </section>
      </div>
      <VitrineFooter />
    </div>
  );
}
