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

/** 3 suggestions au hasard (jamais celle qu'on vient de poser). */
function tirerSuggestions(exclure?: string): string[] {
  const pool = SUGGESTIONS_MYMY.filter((s) => s !== exclure);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

function heureCourte(): string {
  return new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function MyMyChat() {
  const router = useRouter();
  const pathname = usePathname();
  const { metier } = useMetier();

  const [ouvert, setOuvert] = useState(false);
  const [messages, setMessages] = useState<MessageMyMy[]>([ACCUEIL]);
  const [saisie, setSaisie] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [coucou, setCoucou] = useState(false);
  // v12.7 — 3 suggestions tirées au sort, renouvelées à chaque réponse.
  const [suggestions, setSuggestions] = useState<string[]>(() => tirerSuggestions());
  // v12.7 — hauteur de la fenêtre calée sur la zone VISIBLE (clavier ouvert
  // sur iPhone : le viewport de mise en page ne bouge pas, seul
  // visualViewport rétrécit — sans ça, l'accueil de MY-MY disparaissait).
  const [cadre, setCadre] = useState<{ top: number; height: number } | null>(null);

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
    }
  }, [messages, ouvert, occupe]);

  useEffect(() => {
    if (!ouvert || typeof window === "undefined") return;
    const vv = window.visualViewport;
    const mobile = () => window.innerWidth < 640;
    const caler = () => {
      if (!mobile() || !vv) {
        setCadre(null);
        return;
      }
      setCadre({ top: Math.max(0, vv.offsetTop), height: vv.height });
    };
    caler();
    vv?.addEventListener("resize", caler);
    vv?.addEventListener("scroll", caler);
    window.addEventListener("resize", caler);
    return () => {
      vv?.removeEventListener("resize", caler);
      vv?.removeEventListener("scroll", caler);
      window.removeEventListener("resize", caler);
    };
  }, [ouvert]);

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
    // Sur ordinateur seulement : au téléphone, le clavier s'ouvrirait
    // aussitôt et masquerait l'accueil de MY-MY.
    if (typeof window !== "undefined" && window.innerWidth >= 640) setTimeout(() => inputRef.current?.focus(), 50);
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
        setSuggestions(tirerSuggestions(question));
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
      setSuggestions(tirerSuggestions(question));
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
  // /conversation a sa propre bulle MY-MY (astuces) et un composer en bas :
  // la mascotte flottante ferait doublon et gênerait la saisie.
  if (pathname === "/conversation") return null;

  return (
    <>
      {/* ---------- Fenêtre de discussion (façon messagerie, v12.7) ---------- */}
      {ouvert && (
        <div
          className="mymy-fenetre fixed z-40 flex flex-col overflow-hidden rounded-2xl inset-x-2 top-2 bottom-2 sm:inset-auto sm:bottom-24 sm:right-5 sm:h-[min(620px,calc(100vh-7.5rem))] sm:w-[390px]"
          style={cadre ? { top: cadre.top + 8, height: cadre.height - 16, bottom: "auto" } : undefined}
          role="dialog"
          aria-label="Assistant MY-MY"
        >
          {/* En-tête */}
          <div className="mymy-entete flex items-center gap-3 px-3 py-2.5">
            <div className="relative shrink-0">
              <Image src="/mymy-avatar.png" alt="" width={40} height={40} className="rounded-full bg-white p-0.5" />
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">MY-MY</div>
              <div className="truncate text-[11px] opacity-60">{occupe ? "écrit…" : "En ligne · ton assistant du garage"}</div>
            </div>
            <button
              onClick={() => {
                setMessages([ACCUEIL]);
                setSuggestions(tirerSuggestions());
              }}
              title="Nouvelle conversation"
              className="mymy-icone"
              aria-label="Nouvelle conversation"
            >
              ↺
            </button>
            <button onClick={() => setOuvert(false)} aria-label="Fermer" className="mymy-icone text-lg">
              ×
            </button>
          </div>

          {/* Fil */}
          <div ref={listeRef} className="mymy-fil flex-1 space-y-2 overflow-y-auto px-3 py-3">
            <div className="mymy-jour">Aujourd&apos;hui</div>
            {messages.map((m, i) => {
              const moi = m.role === "user";
              const suivantMeme = messages[i + 1]?.role === m.role;
              return (
                <div key={i} className={`flex items-end gap-2 ${moi ? "justify-end" : "justify-start"}`}>
                  {!moi && (
                    <div className="w-7 shrink-0">
                      {!suivantMeme && <Image src="/mymy-avatar.png" alt="" width={28} height={28} className="rounded-full bg-white p-0.5" />}
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] px-3 py-2 text-[14px] leading-snug whitespace-pre-wrap break-words ${
                      moi ? "mymy-bulle-user" : "mymy-bulle"
                    } ${suivantMeme ? (moi ? "rounded-2xl rounded-br-md" : "rounded-2xl rounded-bl-md") : moi ? "rounded-2xl rounded-br-sm" : "rounded-2xl rounded-bl-sm"}`}
                  >
                    {m.texte}
                    {m.action && (
                      <div className="mymy-action mt-2 rounded-xl p-2">
                        <div className="text-[11px] font-bold uppercase tracking-wide">
                          {m.etatAction === "confirmee" ? "✔ Confirmé" : m.etatAction === "annulee" ? "✖ Annulé" : "J'ai compris — je confirme ?"}
                        </div>
                        <div className="mt-1 text-xs opacity-90">{ctxPourDescription ? decrireAction(ctxPourDescription, m.action) : "…"}</div>
                        {!m.etatAction && (
                          <div className="mt-2 flex gap-2">
                            <button onClick={() => confirmer(i, m.action!)} disabled={occupe} className="btn-primary !px-3 !py-1.5 !text-xs">
                              Confirmer
                            </button>
                            <button onClick={() => annuler(i)} disabled={occupe} className="btn-ghost !px-3 !py-1.5 !text-xs">
                              Annuler
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {m.liens && m.liens.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.liens.map((l, j) => (
                          <button key={j} onClick={() => suivre(l)} className="mymy-lien rounded-full px-2.5 py-1 text-xs font-semibold">
                            {l.label} →
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {occupe && (
              <div className="flex items-end gap-2">
                <Image src="/mymy-avatar.png" alt="" width={28} height={28} className="rounded-full bg-white p-0.5" />
                <div className="mymy-bulle rounded-2xl rounded-bl-sm px-3 py-2">
                  <span className="mymy-points">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
            )}
            <div className="mymy-heure">{heureCourte()}</div>
          </div>

          {/* Suggestions : 3 au hasard, renouvelées à chaque réponse */}
          {!occupe && (
            <div className="flex gap-1.5 overflow-x-auto px-3 pb-2 pt-1 [scrollbar-width:none]">
              {suggestions.map((s) => (
                <button key={s} onClick={() => envoyer(s)} className="mymy-suggestion shrink-0 rounded-full px-3 py-1.5 text-[12px]">
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
            className="mymy-saisie flex items-center gap-2 px-2.5 py-2"
            style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
          >
            <input
              ref={inputRef}
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              placeholder="Écris à MY-MY…"
              className="mymy-champ min-w-0 flex-1 rounded-full px-4 py-2.5 text-[15px] outline-none"
              disabled={occupe}
              autoComplete="off"
              enterKeyHint="send"
            />
            <button
              type="submit"
              disabled={occupe || !saisie.trim()}
              aria-label="Envoyer"
              className="mymy-envoyer flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg disabled:opacity-40"
            >
              ➤
            </button>
          </form>
        </div>
      )}

      {/* ---------- Bouton flottant (mascotte) ---------- */}
      {!ouvert && (
        <div className="fixed bottom-4 right-4 z-40 flex items-end gap-2 sm:bottom-5 sm:right-5">
          {coucou && (
            <div className="mymy-bulle mb-3 max-w-[180px] rounded-2xl rounded-br-sm px-3 py-2 text-xs shadow-lg">
              Coucou, je suis MY-MY ! Une question sur un dossier ?
            </div>
          )}
          <button
            onClick={ouvrir}
            aria-label="Ouvrir l'assistant MY-MY"
            title="MY-MY — ton assistant"
            className="mymy-bouton group relative h-14 w-14 rounded-full bg-white transition hover:-translate-y-0.5 active:translate-y-0.5"
          >
            <Image src="/mymy-avatar.png" alt="MY-MY" width={56} height={56} className="rounded-full p-1 transition group-hover:scale-105" />
            <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-400" />
          </button>
        </div>
      )}
    </>
  );
}
