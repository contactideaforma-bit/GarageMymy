"use client";

// « MY-MY » — la bulle d'assistance en bas à droite (v9.5).
//
// Un bouton rond avec la mascotte ; au clic, une fenêtre de discussion.
// MY-MY répond d'abord LOCALEMENT (recherche de dossiers, à faire, impayés,
// véhicules présents, navigation) — instantané et sans quota — et ne
// sollicite l'IA que pour les questions ouvertes, en joignant un résumé des
// données du garage (cf. lib/mymy.ts).

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useMetier } from "@/components/MetierProvider";
import { fetchAuth, lireReponse } from "@/lib/apiClient";
import {
  ActionMyMy,
  ContexteMyMy,
  LienMyMy,
  MessageMyMy,
  SUGGESTIONS_MYMY,
  chargerContexteMyMy,
  decrireAction,
  executerAction,
  repondreLocalement,
  resumePourIA,
  validerAction,
} from "@/lib/mymy";

const ACCUEIL: MessageMyMy = {
  role: "assistant",
  texte:
    "Salut, moi c'est MY-MY 👋 Je connais tous tes dossiers.\n" +
    "Demande-moi un dossier (immat, client, « c'est une Polo »…), un téléphone, ce que tu as à faire, tes impayés… " +
    "Je peux aussi créer un rappel ou un RDV : je te demande toujours confirmation avant d'agir.",
};

// Les données sont rechargées au plus toutes les 2 minutes, ou quand on
// change de page (un dossier vient peut-être d'être modifié).
const FRAICHEUR_MS = 2 * 60 * 1000;

export default function MyMyChat() {
  const router = useRouter();
  const pathname = usePathname();
  const { metier } = useMetier();

  const [ouvert, setOuvert] = useState(false);
  const [messages, setMessages] = useState<MessageMyMy[]>([ACCUEIL]);
  const [saisie, setSaisie] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [coucou, setCoucou] = useState(false);

  const ctxRef = useRef<{ ctx: ContexteMyMy; le: number } | null>(null);
  const chargementRef = useRef<Promise<ContexteMyMy> | null>(null);
  const listeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Petit « coucou » une seule fois par appareil, pour signaler la bulle.
  useEffect(() => {
    try {
      if (!localStorage.getItem("mymy-vu")) {
        setCoucou(true);
        const t = setTimeout(() => setCoucou(false), 6000);
        return () => clearTimeout(t);
      }
    } catch {
      /* stockage indisponible */
    }
  }, []);

  // Changement de page : les données seront rechargées à la prochaine question.
  useEffect(() => {
    if (ctxRef.current) ctxRef.current.le = 0;
  }, [pathname]);

  useEffect(() => {
    if (ouvert) {
      listeRef.current?.scrollTo({ top: listeRef.current.scrollHeight, behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [messages, ouvert, occupe]);

  const contexte = useCallback(async (): Promise<ContexteMyMy> => {
    const c = ctxRef.current;
    if (c && Date.now() - c.le < FRAICHEUR_MS) return c.ctx;
    if (!chargementRef.current) {
      chargementRef.current = chargerContexteMyMy(metier)
        .then((ctx) => {
          ctxRef.current = { ctx, le: Date.now() };
          return ctx;
        })
        .finally(() => {
          chargementRef.current = null;
        });
    }
    return chargementRef.current;
  }, [metier]);

  const ouvrir = () => {
    setOuvert(true);
    setCoucou(false);
    try {
      localStorage.setItem("mymy-vu", "1");
    } catch {
      /* ignore */
    }
    // Préchargement discret pour que la première réponse soit instantanée.
    contexte().catch(() => undefined);
  };

  const suivre = (lien: LienMyMy) => {
    router.push(lien.href);
    // Sur mobile la fenêtre couvre l'écran : on la referme pour laisser voir
    // la page. Sur grand écran on la garde ouverte.
    if (typeof window !== "undefined" && window.innerWidth < 640) setOuvert(false);
  };

  const envoyer = async (texteBrut?: string) => {
    const question = (texteBrut ?? saisie).trim();
    if (!question || occupe) return;
    setSaisie("");
    const historique = messages;
    setMessages((prev) => [...prev, { role: "user", texte: question }]);
    setOccupe(true);
    try {
      const ctx = await contexte();
      const locale = repondreLocalement(ctx, question);
      if (locale) {
        setMessages((prev) => [...prev, locale]);
        return;
      }
      const res = await fetchAuth("/api/mymy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          resume: resumePourIA(ctx, question),
          historique: historique
            .filter((m) => m !== ACCUEIL)
            .slice(-8)
            .map((m) => ({ role: m.role, texte: m.texte })),
        }),
      });
      const lu = await lireReponse<{ reponse: string; liens?: LienMyMy[]; action?: unknown }>(res);
      if (!lu.ok || !lu.data) {
        setMessages((prev) => [...prev, { role: "assistant", texte: "😕 " + (lu.error || "Je n'ai pas pu répondre.") }]);
        return;
      }
      // ACTION PROPOSÉE : validée contre les données locales (dossier
      // existant), puis affichée avec Confirmer / Annuler. Rien n'est écrit ici.
      const action = validerAction(ctx, lu.data.action) || undefined;
      setMessages((prev) => [...prev, { role: "assistant", texte: lu.data!.reponse, liens: lu.data!.liens || [], action }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          texte: /fetch|network|réseau/i.test(msg)
            ? "Pas de réseau pour le moment : je ne peux pas lire tes dossiers."
            : "Oups, je n'ai pas réussi à lire tes dossiers. Réessaie dans un instant.",
        },
      ]);
    } finally {
      setOccupe(false);
    }
  };

  // Confirmation d'une action : seule porte d'entrée vers une écriture.
  const confirmer = async (index: number, action: ActionMyMy) => {
    if (occupe) return;
    setOccupe(true);
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, etatAction: "confirmee" } : m)));
    try {
      const ctx = await contexte();
      const resultat = await executerAction(ctx, action);
      setMessages((prev) => [...prev, resultat]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setMessages((prev) => [...prev, { role: "assistant", texte: "😕 Je n'ai pas réussi à enregistrer : " + (msg || "erreur inconnue") }]);
    } finally {
      setOccupe(false);
    }
  };
  const annuler = (index: number) => {
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, etatAction: "annulee" } : m)));
    setMessages((prev) => [...prev, { role: "assistant", texte: "D'accord, j'annule. Reformule si je n'avais pas bien compris." }]);
  };

  const [ctxPourDescription, setCtxPourDescription] = useState<ContexteMyMy | null>(null);
  useEffect(() => {
    if (messages.some((m) => m.action && !m.etatAction)) contexte().then(setCtxPourDescription).catch(() => undefined);
  }, [messages, contexte]);

  // FICHE DOSSIER : la bulle « note de dossier » occupe déjà le coin bas-droit
  // (NoteDossier). Les deux se chevauchaient → MY-MY s'efface sur cette page.
  if (/^\/sinistres\/[^/]+/.test(pathname || "")) return null;

  return (
    <>
      {/* ---------- Fenêtre de discussion ---------- */}
      {ouvert && (
        <div
          className="fixed z-40 inset-0 sm:inset-auto sm:bottom-24 sm:right-5 sm:h-[min(600px,calc(100vh-7.5rem))] sm:w-[380px] flex flex-col glass-card overflow-hidden"
          role="dialog"
          aria-label="Assistant MY-MY"
        >
          {/* En-tête */}
          <div className="flex items-center gap-3 border-b-2 border-white/10 px-3 py-2 bg-accent-pink/20">
            <Image src="/mymy-avatar.png" alt="" width={36} height={36} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-pixel text-[0.6rem] text-white">MY-MY</div>
              <div className="truncate text-[11px] text-white/60">Ton assistant du garage</div>
            </div>
            <button
              onClick={() => setMessages([ACCUEIL])}
              title="Nouvelle conversation"
              className="rounded-md px-2 py-1 text-xs text-white/60 hover:bg-white/10"
            >
              ↺
            </button>
            <button
              onClick={() => setOuvert(false)}
              aria-label="Fermer"
              className="rounded-md px-2 py-1 text-xl leading-none text-white/70 hover:bg-white/10"
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div ref={listeRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <Image src="/mymy-avatar.png" alt="" width={26} height={26} className="mr-2 mt-1 shrink-0 self-start" />
                )}
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                    m.role === "user" ? "bg-accent-pink text-white" : "glass-soft text-white/90"
                  }`}
                >
                  {m.texte}
                  {m.action && (
                    <div className="mt-2 rounded-md border-2 border-accent-pink/70 bg-accent-pink/10 p-2">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-accent-pink">
                        {m.etatAction === "confirmee" ? "✔ Confirmé" : m.etatAction === "annulee" ? "✖ Annulé" : "J'ai compris — je confirme ?"}
                      </div>
                      <div className="mt-1 text-xs text-white/90">
                        {ctxPourDescription ? decrireAction(ctxPourDescription, m.action) : "…"}
                      </div>
                      {!m.etatAction && (
                        <div className="mt-2 flex gap-2">
                          <button onClick={() => confirmer(i, m.action!)} disabled={occupe} className="btn-primary !px-3 !py-1.5 !text-xs">
                            Confirmer
                          </button>
                          <button onClick={() => annuler(i)} disabled={occupe} className="rounded-md border-2 border-white/30 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10">
                            Annuler
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {m.liens && m.liens.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.liens.map((l, j) => (
                        <button
                          key={j}
                          onClick={() => suivre(l)}
                          className="rounded-md border-2 border-accent-teal/60 bg-accent-teal/15 px-2 py-1 text-xs font-semibold text-white hover:bg-accent-teal/30"
                        >
                          {l.label} →
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {occupe && (
              <div className="flex items-center gap-2 text-xs text-white/60">
                <Image src="/mymy-avatar.png" alt="" width={26} height={26} className="animate-bounce" />
                MY-MY réfléchit…
              </div>
            )}
          </div>

          {/* Suggestions (au début seulement) */}
          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-1.5 px-3 pb-2">
              {SUGGESTIONS_MYMY.map((s) => (
                <button
                  key={s}
                  onClick={() => envoyer(s)}
                  className="rounded-full border border-white/25 px-2.5 py-1 text-[11px] text-white/80 hover:bg-white/10"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Saisie */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              envoyer();
            }}
            className="flex items-center gap-2 border-t-2 border-white/10 p-2"
          >
            <input
              ref={inputRef}
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              placeholder="Immat, client, question…"
              className="field-input flex-1 !py-2 text-sm"
              disabled={occupe}
            />
            <button type="submit" disabled={occupe || !saisie.trim()} className="btn-primary !px-3 !py-2">
              ➤
            </button>
          </form>
        </div>
      )}

      {/* ---------- Bouton flottant (mascotte) ---------- */}
      {!ouvert && (
        <div className="fixed bottom-4 right-4 z-40 flex items-end gap-2 sm:bottom-5 sm:right-5">
          {coucou && (
            <div className="glass-soft mb-3 max-w-[180px] rounded-lg px-3 py-2 text-xs text-white/90 shadow-lg">
              Coucou, je suis MY-MY ! Une question sur un dossier ?
            </div>
          )}
          <button
            onClick={ouvrir}
            aria-label="Ouvrir l'assistant MY-MY"
            title="MY-MY — ton assistant"
            className="group relative h-16 w-16 rounded-full border-[3px] border-accent-pink bg-white shadow-[4px_4px_0_rgba(0,0,0,0.45)] transition hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
          >
            <Image src="/mymy-avatar.png" alt="MY-MY" width={64} height={64} className="rounded-full p-1 transition group-hover:scale-105" />
            <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-accent-teal" />
          </button>
        </div>
      )}
    </>
  );
}
