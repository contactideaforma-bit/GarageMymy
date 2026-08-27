"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Incident, chargerEtat, depuis, infoNiveau } from "@/lib/etatService";
import { formatDateTime } from "@/lib/format";
import { Ticket } from "@/lib/types";
import { chargerMesTickets, estOuvert, iconeCategorie, infoGravite, infoStatut } from "@/lib/support";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";

/**
 * ÉTAT DU SERVICE — page PUBLIQUE (v45).
 *
 * Consultable sans être connecté, volontairement : c'est la page qu'on
 * ouvre quand plus rien ne répond. Elle dit une seule chose, clairement —
 * est-ce que ça vient de nous, oui ou non.
 */
export default function EtatPage() {
  const [actifs, setActifs] = useState<Incident[]>([]);
  const [historique, setHistorique] = useState<Incident[]>([]);
  const [charge, setCharge] = useState(false);
  const router = useRouter();
  // MES SIGNALEMENTS (v9.9) : les tickets d'incident du garage connecté.
  // L'« état du service » restait muet sur ce que le garage venait de
  // signaler lui-même : il croyait son ticket perdu.
  const [connecte, setConnecte] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);

  useEffect(() => {
    (async () => {
      const e = await chargerEtat();
      setActifs(e.actifs);
      setHistorique(e.historique);
      setCharge(true);
    })();
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      setConnecte(true);
      const t = await chargerMesTickets();
      setTickets(t.tickets);
    });
  }, []);
  const ouverts = tickets.filter(estOuvert);
  const fermes = tickets.filter((t) => !estOuvert(t)).slice(0, 5);

  const toutVaBien = charge && actifs.length === 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <button
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
          className="btn-ghost py-1.5 px-3 text-sm"
          title="Revenir à la page précédente"
        >
          ← Retour
        </button>
        <Image src="/logo.png" alt="" width={40} height={40} className="rounded-md border-2 border-white/20" />
        <div>
          <h1 className="titre-page">État du service</h1>
          <p className="text-xs text-white/50">My Easy Auto · mis à jour en direct</p>
        </div>
      </div>

      {/* Verdict principal */}
      <section className="glass-card mb-6 p-5 text-center">
        {!charge ? (
          <div className="mx-auto h-6 w-56 skeleton" />
        ) : toutVaBien ? (
          <>
            <div className="text-4xl">✅</div>
            <p className="mt-2 text-lg font-semibold text-emerald-300">
              Tous les services fonctionnent normalement
            </p>
            <p className="mt-1 text-sm text-white/55">
              Si l&apos;appli ne répond pas de votre côté, vérifiez votre connexion internet, puis
              signalez-le depuis « Aide &amp; incidents ».
            </p>
          </>
        ) : (
          <>
            <div className="text-4xl">{infoNiveau(actifs[0].niveau).icone}</div>
            <p className="mt-2 text-lg font-semibold text-white">
              {actifs.length === 1 ? "Un incident est en cours" : `${actifs.length} incidents en cours`}
            </p>
            <p className="mt-1 text-sm text-white/55">
              Nous sommes au courant et nous travaillons dessus. Le détail est ci-dessous.
            </p>
          </>
        )}
      </section>

      {/* Incidents ouverts */}
      {actifs.length > 0 && (
        <section className="mb-6 space-y-3">
          {actifs.map((i) => {
            const n = infoNiveau(i.niveau);
            return (
              <article key={i.id} className="glass-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="titre-bloc">{i.titre}</h2>
                  <span className={n.badge}>{n.label}</span>
                </div>
                {i.perimetre && (
                  <p className="mt-1 text-xs text-white/50">Concerne : {i.perimetre}</p>
                )}
                <p className="mt-2 whitespace-pre-wrap text-sm text-white/80">{i.message}</p>
                {i.suivi && (
                  <p className="mt-2 rounded-lg border-2 border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75">
                    <span className="font-semibold">Dernière info : </span>
                    {i.suivi}
                  </p>
                )}
                <p className="mt-2 text-[11px] text-white/40">
                  Début : {formatDateTime(i.debut)} ({depuis(i.debut)})
                </p>
              </article>
            );
          })}
        </section>
      )}

      {/* Mes signalements (garage connecté) */}
      {connecte && (
        <section className="glass-card mb-6 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="titre-section">Mes signalements</h2>
            <Link href="/support" className="text-xs text-accent-teal hover:underline">
              Aide &amp; incidents → suivre / signaler
            </Link>
          </div>
          {tickets.length === 0 ? (
            <p className="text-sm text-white/45">
              Aucun ticket. Un problème ? Signale-le depuis « Aide &amp; incidents » : il apparaîtra ici avec son suivi.
            </p>
          ) : (
            <ul className="divide-y divide-white/10">
              {[...ouverts, ...fermes].map((t) => {
                const st = infoStatut(t.statut);
                const gr = infoGravite(t.gravite);
                return (
                  <li key={t.id}>
                    <Link href="/support" className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:bg-white/5">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-white/85">
                          {iconeCategorie(t.categorie)} {t.sujet}
                          {t.numero ? <span className="text-white/40"> · {t.numero}</span> : null}
                        </p>
                        <p className="text-[11px] text-white/40">
                          Signalé le {formatDateTime(t.created_at)}
                          {t.maj_le && t.maj_le !== t.created_at ? ` · mis à jour le ${formatDateTime(t.maj_le)}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={gr.badge}>{gr.label}</span>
                        <span className={st.badge}>{st.label}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* Historique */}
      <section className="glass-card p-4">
        <h2 className="titre-section mb-3">Incidents récents</h2>
        {historique.length === 0 ? (
          <p className="text-sm text-white/45">Aucun incident enregistré.</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {historique.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-white/85">{i.titre}</p>
                  <p className="text-[11px] text-white/40">
                    {formatDateTime(i.debut)}
                    {i.fin ? ` → ${formatDateTime(i.fin)}` : ""}
                  </p>
                </div>
                <span className="badge badge-ok">Résolu</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-6 text-center text-xs text-white/40">
        <Link href="/" className="underline hover:text-white">
          Retour à l&apos;application
        </Link>
        {" · "}
        <Link href="/mentions-legales" className="underline hover:text-white">
          Mentions légales
        </Link>
      </p>
    </div>
  );
}
