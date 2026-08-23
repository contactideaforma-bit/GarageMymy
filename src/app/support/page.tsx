"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDateTime, messageErreur } from "@/lib/format";
import { Ticket, TicketMessage } from "@/lib/types";
import {
  chargerMesTickets,
  chargerMessages,
  cloturerTicket,
  estOuvert,
  iconeCategorie,
  infoGravite,
  infoStatut,
  labelCategorie,
  marquerLuGarage,
  repondreGarage,
} from "@/lib/support";
import TicketModal from "@/components/TicketModal";
import StatCard from "@/components/StatCard";
import Accordeon from "@/components/Accordeon";

/**
 * AIDE & INCIDENTS (v43) — côté garage.
 *
 * Un seul endroit pour : signaler un souci, suivre où en est le
 * signalement, et échanger avec l'assistance sans quitter l'appli.
 */

const AIDE_RAPIDE: { question: string; reponse: string }[] = [
  {
    question: "L'analyse du rapport ne trouve rien / échoue",
    reponse:
      "Le rapport est probablement un SCAN (pages en images). Envoyez seulement les pages utiles : les conclusions (chiffrage) et la liste des pièces. Vous pouvez aussi saisir le dossier à la main puis ajouter le rapport en pièce jointe.",
  },
  {
    question: "Je ne reçois pas les emails que j'envoie depuis l'appli",
    reponse:
      "Vérifiez « Profil du garage → Envoi des emails ». Avec Gmail, il faut un MOT DE PASSE D'APPLICATION (pas votre mot de passe habituel). Le journal des emails indique la cause exacte de l'échec.",
  },
  {
    question: "Je n'ai pas les notifications sur mon iPhone",
    reponse:
      "Apple n'autorise les notifications que si l'appli est ajoutée à l'écran d'accueil : Safari → bouton Partager → « Sur l'écran d'accueil ». Ouvrez ensuite l'appli depuis cette icône et acceptez les notifications.",
  },
  {
    question: "Un montant ne correspond pas au rapport d'expertise",
    reponse:
      "Ouvrez la facture : les postes T1/T2/T3, peinture et ingrédients sont modifiables ligne par ligne. Vos corrections sont mémorisées et l'analyse s'améliore au fil des rapports.",
  },
];

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [dispo, setDispo] = useState(true);
  const [loading, setLoading] = useState(true);
  const [ouvert, setOuvert] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [reponse, setReponse] = useState("");
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const { tickets: t, dispo: ok } = await chargerMesTickets();
    setTickets(t);
    setDispo(ok);
    setLoading(false);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const ouvrir = useCallback(async (t: Ticket) => {
    setOuvert(t);
    setReponse("");
    setMessages(await chargerMessages(t.id));
    if (!t.lu_garage) {
      marquerLuGarage(t);
      setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, lu_garage: true } : x)));
    }
  }, []);

  const enCours = useMemo(() => tickets.filter(estOuvert), [tickets]);
  const resolus = useMemo(() => tickets.filter((t) => !estOuvert(t)), [tickets]);

  async function envoyerReponse() {
    if (!ouvert || !reponse.trim() || busy) return;
    setBusy(true);
    setErreur(null);
    try {
      const m = await repondreGarage(ouvert, reponse);
      setMessages((prev) => [...prev, m]);
      setReponse("");
      setSucces("Message transmis à l'assistance.");
    } catch (err) {
      setErreur(messageErreur(err, "Message non envoyé."));
    }
    setBusy(false);
  }

  async function cloturer() {
    if (!ouvert) return;
    try {
      await cloturerTicket(ouvert);
      setTickets((prev) =>
        prev.map((x) => (x.id === ouvert.id ? { ...x, statut: "ferme" } : x))
      );
      setOuvert({ ...ouvert, statut: "ferme" });
      setSucces("Ticket clôturé. Merci !");
    } catch (err) {
      setErreur(messageErreur(err, "Clôture impossible."));
    }
  }

  /* ------------------------------ Rendu ------------------------------ */

  const carteTicket = (t: Ticket) => {
    const st = infoStatut(t.statut);
    const gr = infoGravite(t.gravite);
    const actif = ouvert?.id === t.id;
    return (
      <button
        key={t.id}
        onClick={() => ouvrir(t)}
        className={`carte-liste w-full p-3 text-left ${actif ? "carte-liste-active" : ""}`}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 items-start gap-2">
            <span className="text-base leading-none">{iconeCategorie(t.categorie)}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">{t.sujet}</span>
              <span className="mt-0.5 block text-[11px] text-white/45">
                {t.numero} · {formatDateTime(t.created_at)}
              </span>
            </span>
          </span>
          {!t.lu_garage && <span className="pastille-neuve" title="Nouvelle réponse" />}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={st.badge}>{st.label}</span>
          <span className={gr.badge}>{gr.label}</span>
        </span>
      </button>
    );
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titre-page">Aide &amp; incidents</h1>
          <p className="mt-1 text-xs text-white/50">
            Un souci dans l&apos;appli ? Signalez-le : chaque signalement arrive directement chez
            l&apos;éditeur, avec le contexte technique.
          </p>
        </div>
        <button onClick={() => setModal(true)} className="btn-primary">
          Signaler un problème
        </button>
      </div>

      {!dispo && !loading && (
        <div className="mb-5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Les signalements ne sont pas encore activés sur cette base : exécutez la migration
          <code className="mx-1 rounded bg-black/30 px-1">migration_v43.sql</code> dans Supabase.
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard accent="pink" icone="🎫" label="Signalements ouverts" value={String(enCours.length)} hint="en attente de correction" />
        <StatCard accent="emerald" icone="✅" label="Traités" value={String(resolus.length)} hint="résolus ou clôturés" />
        <StatCard accent="violet" icone="📨" label="Total envoyés" value={String(tickets.length)} hint="depuis le début" />
        <StatCard accent="teal" icone="⏱️" label="Réponse visée" value="< 24 h" hint="jours ouvrés" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
        {/* Colonne gauche : mes signalements */}
        <section className="glass-card p-3 sm:p-4">
          <h2 className="titre-section mb-3">Mes signalements</h2>
          {loading ? (
            <div className="space-y-2">
              <div className="skeleton h-16 w-full" />
              <div className="skeleton h-16 w-full" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-white/55">Aucun signalement pour le moment.</p>
              <p className="mt-1 text-xs text-white/40">
                Tant mieux — et au moindre blocage, le bouton est en haut.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {enCours.map(carteTicket)}
              {resolus.length > 0 && (
                <>
                  <div className="pt-2 text-[10px] font-semibold uppercase tracking-wider text-white/35">
                    Historique
                  </div>
                  {resolus.map(carteTicket)}
                </>
              )}
            </div>
          )}
        </section>

        {/* Colonne droite : détail + aide rapide */}
        <div className="space-y-4">
          {ouvert ? (
            <section className="glass-card p-3 sm:p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="titre-bloc break-words">{ouvert.sujet}</h2>
                  <p className="mt-1 text-[11px] text-white/45">
                    {ouvert.numero} · {labelCategorie(ouvert.categorie)} ·{" "}
                    {formatDateTime(ouvert.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={infoStatut(ouvert.statut).badge}>
                    {infoStatut(ouvert.statut).label}
                  </span>
                  <button
                    onClick={() => setOuvert(null)}
                    className="text-white/40 hover:text-white"
                    title="Fermer"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg border-2 p-3 text-sm ${
                      m.auteur === "support"
                        ? "border-accent-teal/40 bg-white/10"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-white/70">
                        {m.auteur === "support" ? "🛠️ Assistance My Easy Auto" : "Vous"}
                      </span>
                      <span className="text-white/35">{formatDateTime(m.created_at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-white/85">{m.message}</p>
                  </div>
                ))}
              </div>

              {ouvert.statut !== "ferme" && (
                <div className="mt-3">
                  <textarea
                    className="field-input min-h-[80px]"
                    placeholder="Ajouter une précision, un numéro de dossier, une nouvelle observation…"
                    value={reponse}
                    onChange={(e) => setReponse(e.target.value)}
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <button
                      onClick={cloturer}
                      className="text-xs text-white/45 hover:text-emerald-300 hover:underline"
                    >
                      C&apos;est réglé — clôturer ce ticket
                    </button>
                    <button
                      onClick={envoyerReponse}
                      disabled={busy || !reponse.trim()}
                      className="btn-ghost btn-compact"
                    >
                      Envoyer
                    </button>
                  </div>
                </div>
              )}

              {succes && <p className="mt-2 text-xs text-emerald-300">{succes}</p>}
              {erreur && (
                <div className="mt-2 rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
                  {erreur}
                </div>
              )}
            </section>
          ) : (
            <section className="glass-card p-5 text-center">
              <div className="text-3xl">🛟</div>
              <h2 className="titre-bloc mt-2">Une assistance qui répond</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-white/60">
                Décrivez le problème avec vos mots. L&apos;appli joint toute seule la page, la
                version et l&apos;appareil : vous n&apos;avez rien de technique à chercher.
              </p>
              <button onClick={() => setModal(true)} className="btn-primary mt-4">
                Signaler un problème
              </button>
            </section>
          )}

          <Accordeon titre="Réponses aux questions les plus fréquentes" cle="support.faq" defautOuvert={false}>
            <div className="space-y-2">
              {AIDE_RAPIDE.map((a) => (
                <div key={a.question} className="glass-soft rounded-lg p-3">
                  <p className="text-sm font-semibold text-white">{a.question}</p>
                  <p className="mt-1 text-sm text-white/65">{a.reponse}</p>
                </div>
              ))}
            </div>
          </Accordeon>
        </div>
      </div>

      {modal && (
        <TicketModal
          onFerme={() => setModal(false)}
          onCree={(t) => {
            setModal(false);
            setTickets((prev) => [t, ...prev]);
            setSucces("Signalement envoyé. Vous recevrez la réponse ici et par email.");
            ouvrir(t);
          }}
        />
      )}
    </div>
  );
}
