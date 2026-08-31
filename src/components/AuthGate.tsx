"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import LandingPage from "@/components/LandingPage";
import { METIER_INFOS, Metier } from "@/lib/metier";
import { estRoutePublique } from "@/lib/routesPubliques";
import BarreChargement from "@/components/BarreChargement";

/* ====================================================================
 *  SESSION QUI TIENT (v11.2) — retour iPhone : « déconnexions, l'appli ne
 *  se reconnecte pas forcément toute seule ».
 *
 *  Ce qui se passait : au lancement (PWA ou onglet ré-ouvert le lendemain),
 *  le jeton d'accès est expiré (1 h) et supabase-js tente de le
 *  rafraîchir. Si ce PREMIER appel réseau échoue — réseau pas encore prêt
 *  au réveil de l'appli, 4G capricieuse dans l'atelier — `getSession()`
 *  rend `null` ALORS QUE la session est toujours en mémoire du téléphone :
 *  on affichait l'accueil et l'écran de connexion. La session revenait
 *  ensuite d'elle-même (TOKEN_REFRESHED), mais trop tard : l'utilisateur
 *  s'était déjà reconnecté à la main, ou avait abandonné.
 *
 *  Désormais :
 *  1. si une session est enregistrée sur l'appareil mais indisponible, on
 *     affiche « Reconnexion… » et on RÉESSAIE le rafraîchissement (1,5 s,
 *     4 s, 10 s), puis à chaque retour de réseau (`online`) et à chaque
 *     retour au premier plan (`visibilitychange`) ;
 *  2. seul un refus DÉFINITIF du serveur (jeton révoqué / déjà utilisé /
 *     session close par l'éditeur) mène à l'écran de connexion ;
 *  3. l'écran de connexion arrive directement sur l'espace et l'email du
 *     dernier utilisateur de l'appareil (plus de passage par l'accueil) :
 *     il ne reste que le mot de passe à saisir (ou le trousseau iOS).
 *
 *  Reste HORS de portée du code : Safari (hors PWA installée) efface le
 *  stockage d'un site non visité depuis 7 jours ; et les réglages Supabase
 *  « Inactivity timeout » / « Time-box » ferment les sessions côté serveur.
 * ==================================================================== */

const CLE_EMAIL = "mea.auth.email";
const CLE_ESPACE = "mea.auth.espace";
const DELAIS_RECONNEXION = [1500, 4000, 10000];

function lireLocal(cle: string): string | null {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
}
function ecrireLocal(cle: string, valeur: string | null) {
  try {
    if (valeur) localStorage.setItem(cle, valeur);
    else localStorage.removeItem(cle);
  } catch {
    /* stockage indisponible */
  }
}

/** Une session Supabase est-elle enregistrée sur cet appareil ? */
function sessionEnregistree(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      if (/^sb-.*-auth-token$/.test(k)) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Le serveur a REFUSÉ le jeton : inutile d'insister, il faut se reconnecter. */
function refusDefinitif(err: { message?: string; status?: number; code?: string } | null | undefined): boolean {
  if (!err) return false;
  const msg = (err.message || "").toLowerCase();
  const code = (err.code || "").toLowerCase();
  return (
    /refresh token|refresh_token|invalid.*token|already used|session.*(expired|not found|missing)|revoked|user not found|banned/.test(msg) ||
    /refresh_token|session_not_found|user_not_found|user_banned/.test(code) ||
    err.status === 400 ||
    err.status === 401 ||
    err.status === 403
  );
}

type EtatAuth = "chargement" | "reconnexion" | "connecte" | "deconnecte";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [etat, setEtatBrut] = useState<EtatAuth>("chargement");
  // Miroir synchrone de l'état pour les écouteurs `online` / `visibilitychange`.
  const etatRef = useRef<EtatAuth>("chargement");
  const setEtat = (e: EtatAuth) => {
    etatRef.current = e;
    setEtatBrut(e);
  };
  const [session, setSession] = useState<Session | null>(null);
  // Espace choisi sur la page d'accueil (null = on affiche l'accueil).
  // Mémorisé par appareil : un garage déjà connecté ici retrouve directement
  // son écran de connexion.
  const [espace, setEspace] = useState<Metier | null>(null);
  const [emailMemo, setEmailMemo] = useState<string>("");
  const [reconnexionEchouee, setReconnexionEchouee] = useState(false);

  useEffect(() => {
    // Si Supabase n'est pas configuré, on n'impose pas l'authentification
    // (le ConfigBanner guidera la configuration).
    if (!isSupabaseConfigured) {
      setEtat("connecte");
      return;
    }
    let mounted = true;
    let tentative = 0;
    let minuteur: ReturnType<typeof setTimeout> | null = null;

    const memoEspace = lireLocal(CLE_ESPACE);
    if (memoEspace === "carrosserie" || memoEspace === "vitrage") setEspace(memoEspace);
    setEmailMemo(lireLocal(CLE_EMAIL) || "");

    const connecter = (s: Session) => {
      if (!mounted) return;
      setSession(s);
      setEtat("connecte");
      setReconnexionEchouee(false);
      tentative = 0;
      if (s.user?.email) ecrireLocal(CLE_EMAIL, s.user.email);
      const m = (s.user?.app_metadata as { metier?: string } | undefined)?.metier;
      if (m === "carrosserie" || m === "vitrage") ecrireLocal(CLE_ESPACE, m);
    };
    const deconnecter = () => {
      if (!mounted) return;
      setSession(null);
      setEtat("deconnecte");
    };

    // Réessaie de rafraîchir la session enregistrée. Programme la tentative
    // suivante tant que l'échec n'est pas définitif.
    const reessayer = async (immediat = false) => {
      if (!mounted) return;
      if (!sessionEnregistree()) {
        deconnecter();
        return;
      }
      setEtat("reconnexion");
      if (typeof navigator !== "undefined" && navigator.onLine === false && !immediat) {
        // Hors ligne : on attend l'événement `online`, sans consommer de tentative.
        setReconnexionEchouee(true);
        return;
      }
      const { data, error } = await supabase.auth.refreshSession();
      if (!mounted) return;
      if (data.session) {
        connecter(data.session);
        return;
      }
      if (refusDefinitif(error)) {
        deconnecter();
        return;
      }
      if (tentative < DELAIS_RECONNEXION.length) {
        const delai = DELAIS_RECONNEXION[tentative++];
        minuteur = setTimeout(() => reessayer(), delai);
      } else {
        // On reste en « reconnexion » : bouton Réessayer + retour réseau / premier plan.
        setReconnexionEchouee(true);
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) connecter(data.session);
      else if (sessionEnregistree()) reessayer(true);
      else deconnecter();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Lien « mot de passe oublié » : où que la redirection atterrisse
      // (même à la racine si les Redirect URLs Supabase sont incomplètes),
      // on force l'ouverture de la page de réinitialisation.
      if (event === "PASSWORD_RECOVERY" && window.location.pathname !== "/reinitialisation") {
        window.location.replace("/reinitialisation");
        return;
      }
      if (s) connecter(s);
      else if (event === "SIGNED_OUT") deconnecter();
    });

    // Retour de réseau ou au premier plan : si on n'est pas connecté alors
    // qu'une session est enregistrée, on retente tout de suite.
    const surRetour = () => {
      if (!mounted) return;
      if (document.visibilityState === "hidden") return;
      const e = etatRef.current;
      if (e === "reconnexion" || (e === "deconnecte" && sessionEnregistree())) {
        tentative = 0;
        reessayer(true);
      }
    };
    window.addEventListener("online", surRetour);
    document.addEventListener("visibilitychange", surRetour);

    return () => {
      mounted = false;
      if (minuteur) clearTimeout(minuteur);
      sub.subscription.unsubscribe();
      window.removeEventListener("online", surRetour);
      document.removeEventListener("visibilitychange", surRetour);
    };
  }, []);

  // Pages PUBLIQUES : signature à distance (accès par jeton) et mentions
  // légales (liées depuis la page d'accueil) — pas de login.
  if (estRoutePublique(pathname)) {
    return <>{children}</>;
  }

  if (etat === "chargement") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-white/50 text-sm">Chargement…</p>
      </div>
    );
  }

  if (isSupabaseConfigured && etat === "reconnexion") {
    return (
      <EcranReconnexion
        echec={reconnexionEchouee}
        onReessayer={async () => {
          setReconnexionEchouee(false);
          const { data, error } = await supabase.auth.refreshSession();
          if (data.session) {
            setSession(data.session);
            setEtat("connecte");
          } else if (refusDefinitif(error)) {
            setEtat("deconnecte");
          } else {
            setReconnexionEchouee(true);
          }
        }}
        onAutreCompte={async () => {
          try {
            await supabase.auth.signOut({ scope: "local" });
          } catch {
            /* ignore */
          }
          setEtat("deconnecte");
        }}
      />
    );
  }

  if (isSupabaseConfigured && (!session || etat === "deconnecte")) {
    // Pas connecté : d'abord la page d'accueil, puis l'écran de connexion
    // de l'espace choisi (avec possibilité de revenir à l'accueil). Un
    // appareil déjà utilisé arrive directement sur son écran de connexion.
    if (!espace) return <LandingPage onChoisir={setEspace} />;
    return (
      <LoginScreen
        metier={espace}
        emailInitial={emailMemo}
        onRetour={() => {
          ecrireLocal(CLE_ESPACE, null);
          setEspace(null);
        }}
      />
    );
  }

  return <>{children}</>;
}

/** Écran d'attente pendant la reprise de session (v11.2). */
function EcranReconnexion({
  echec,
  onReessayer,
  onAutreCompte,
}: {
  echec: boolean;
  onReessayer: () => void;
  onAutreCompte: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm glass-card p-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="My Easy Auto" className="mx-auto mb-3 h-16 w-16 rounded-lg border-2 border-white/20" />
        <div className="font-pixel text-[0.7rem] leading-relaxed bg-gradient-to-r from-accent-violet via-accent-pink to-accent-teal bg-clip-text text-transparent">
          MY EASY AUTO
        </div>
        {echec ? (
          <>
            <p className="mt-4 text-sm text-white/80">
              Impossible de reprendre ta session pour l&apos;instant (connexion internet ?). Ta session est conservée sur cet appareil.
            </p>
            <button type="button" onClick={onReessayer} className="btn-primary mt-4 w-full justify-center">
              Réessayer
            </button>
            <button type="button" onClick={onAutreCompte} className="mt-3 w-full text-center text-xs text-white/40 hover:text-white/70">
              Se connecter avec le mot de passe
            </button>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm text-white/70">Reconnexion en cours…</p>
            <BarreChargement actif />
          </>
        )}
      </div>
    </div>
  );
}

function LoginScreen({
  metier,
  emailInitial = "",
  onRetour,
}: {
  metier: Metier;
  emailInitial?: string;
  onRetour: () => void;
}) {
  const info = METIER_INFOS[metier];
  const accentText = info.accent === "teal" ? "text-accent-teal" : "text-accent-pink";
  const [email, setEmail] = useState(emailInitial);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modeOubli, setModeOubli] = useState(false);
  const [info2, setInfo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);

    // Mot de passe oublié : envoi du lien de réinitialisation
    if (modeOubli) {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reinitialisation`,
      });
      if (err) setError(err.message);
      else setInfo("Email envoyé ! Clique sur le lien reçu pour choisir un nouveau mot de passe (regarde aussi les spams).");
      setSubmitting(false);
      return;
    }

    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(
        err.message === "Invalid login credentials"
          ? "Email ou mot de passe incorrect."
          : err.message === "Email not confirmed"
            ? "Email non confirmé : clique sur le lien reçu par email avant de te connecter."
            : err.message
      );
      setSubmitting(false);
    }
    // En cas de succès, onAuthStateChange (AuthGate) bascule sur l'app.
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm glass-card p-8">
        <div className="text-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="My Easy Auto" className="mx-auto mb-3 h-20 w-20 rounded-lg border-2 border-white/20" />
          <div className="font-pixel text-[0.75rem] leading-relaxed bg-gradient-to-r from-accent-violet via-accent-pink to-accent-teal bg-clip-text text-transparent">
            MY EASY AUTO
          </div>
          <div className={`mt-2 font-pixel text-[0.55rem] ${accentText}`}>{info.espace.toUpperCase()}</div>
          <div className="mt-2 text-sm text-white/50">Connexion à l&apos;espace gestion</div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="field-label">Email</label>
            <input
              type="email"
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@…"
              autoComplete="username"
              required
            />
          </div>
          {!modeOubli && (
            <div>
              <label className="field-label">Mot de passe</label>
              <input
                type="password"
                className="field-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                // Email déjà connu de l'appareil : on va droit au mot de passe.
                autoFocus={Boolean(emailInitial)}
                required
              />
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          )}
          {info2 && (
            <div className="rounded-lg bg-emerald-500/15 border border-emerald-400/30 px-3 py-2 text-sm text-emerald-200">
              {info2}
            </div>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full justify-center">
            {submitting
              ? "Un instant…"
              : modeOubli
                ? "M'envoyer le lien de réinitialisation"
                : "Se connecter"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setModeOubli((m) => !m); setError(null); setInfo(null); }}
          className="mt-4 w-full text-center text-sm text-accent-pink hover:underline"
        >
          {modeOubli ? "Retour à la connexion" : "Mot de passe oublié ?"}
        </button>

        <button
          type="button"
          onClick={onRetour}
          className="mt-3 w-full text-center text-xs text-white/40 hover:text-white/70"
        >
          ← Retour à l&apos;accueil
        </button>

        <p className="mt-4 text-center text-xs text-white/30">
          Compte créé par l&apos;administrateur.
        </p>
      </div>
    </div>
  );
}
