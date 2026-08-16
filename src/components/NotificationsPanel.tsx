"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatDateTime, messageErreur } from "@/lib/format";
import { PushAbonnement } from "@/lib/types";
import {
  CLE_PUBLIQUE_VAPID,
  abonnementCourant,
  activerPush,
  desactiverPush,
  estInstallee,
  estIphone,
  nomAppareil,
  pushSupporte,
  testerPush,
} from "@/lib/push";

/**
 * NOTIFICATIONS PUSH (v42) — écran de réglages, dans Profil du garage.
 *
 * Trois choses à comprendre pour l'utilisateur, dans cet ordre :
 *   1. sur iPhone, il FAUT d'abord ajouter l'appli à l'écran d'accueil ;
 *   2. l'autorisation se donne appareil par appareil ;
 *   3. le résumé part chaque matin — d'où le bouton « test » pour ne pas
 *      attendre le lendemain pour savoir si ça marche.
 */

type Prefs = { push_rdv: boolean; push_rappels: boolean; push_urgents: boolean };

const LIGNES_PREFS: { cle: keyof Prefs; label: string; aide: string }[] = [
  { cle: "push_rdv", label: "Rendez-vous du jour", aide: "Expertise, restitution, RDV client ou expert." },
  { cle: "push_rappels", label: "Rappels datés", aide: "Ceux que tu programmes dans le bloc « À faire »." },
  {
    cle: "push_urgents",
    label: "Dossiers urgents",
    aide: "Les lignes rouges du bloc « À faire » qui traînent.",
  },
];

export default function NotificationsPanel() {
  const [pret, setPret] = useState(false);
  const [supporte, setSupporte] = useState(false);
  const [iphoneAInstaller, setIphoneAInstaller] = useState(false);
  const [abonneIci, setAbonneIci] = useState(false);
  const [appareils, setAppareils] = useState<PushAbonnement[]>([]);
  const [tableDispo, setTableDispo] = useState(true);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [entrepriseId, setEntrepriseId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const chargerAppareils = useCallback(async () => {
    const { data, error } = await supabase
      .from("push_abonnements")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setTableDispo(false);
      return;
    }
    setTableDispo(true);
    setAppareils((data as PushAbonnement[]) || []);
  }, []);

  const chargerPrefs = useCallback(async () => {
    const { data, error } = await supabase
      .from("entreprise")
      .select("id,push_rdv,push_rappels,push_urgents")
      .maybeSingle();
    if (error || !data) return; // colonnes absentes ou profil pas encore créé
    const e = data as Record<string, unknown>;
    setEntrepriseId(e.id as string);
    setPrefs({
      push_rdv: e.push_rdv !== false,
      push_rappels: e.push_rappels !== false,
      push_urgents: e.push_urgents !== false,
    });
  }, []);

  useEffect(() => {
    (async () => {
      const ok = pushSupporte();
      setSupporte(ok);
      setIphoneAInstaller(estIphone() && !estInstallee());
      if (ok) setAbonneIci(Boolean(await abonnementCourant()));
      await Promise.all([chargerAppareils(), chargerPrefs()]);
      setPret(true);
    })();
  }, [chargerAppareils, chargerPrefs]);

  async function activer() {
    setBusy(true);
    setMsg(null);
    setErreur(null);
    const res = await activerPush();
    if (res.ok) {
      setAbonneIci(true);
      setMsg(`Notifications activées sur cet appareil (${nomAppareil()}).`);
      await chargerAppareils();
    } else {
      setErreur(res.erreur || "Activation impossible.");
    }
    setBusy(false);
  }

  async function desactiver() {
    setBusy(true);
    setMsg(null);
    setErreur(null);
    await desactiverPush();
    setAbonneIci(false);
    setMsg("Notifications coupées sur cet appareil.");
    await chargerAppareils();
    setBusy(false);
  }

  async function tester() {
    setBusy(true);
    setMsg(null);
    setErreur(null);
    const res = await testerPush();
    if (res.ok) setMsg("Notification de test envoyée — regarde ton téléphone.");
    else setErreur(res.erreur || "Envoi impossible.");
    setBusy(false);
  }

  async function retirerAppareil(a: PushAbonnement) {
    const avant = appareils;
    setAppareils((prev) => prev.filter((x) => x.id !== a.id));
    const { error } = await supabase.from("push_abonnements").delete().eq("id", a.id);
    if (error) {
      setAppareils(avant);
      setErreur(messageErreur(error, "Suppression impossible."));
    }
  }

  async function basculerPref(cle: keyof Prefs, valeur: boolean) {
    if (!prefs || !entrepriseId) return;
    const avant = prefs;
    setPrefs({ ...prefs, [cle]: valeur });
    const { error } = await supabase
      .from("entreprise")
      .update({ [cle]: valeur })
      .eq("id", entrepriseId);
    if (error) {
      setPrefs(avant);
      setErreur(messageErreur(error, "Préférence non enregistrée."));
    }
  }

  if (!pret) return <p className="text-sm text-white/40">Chargement…</p>;

  /* ------------------------- Cas bloquants ------------------------- */

  if (!CLE_PUBLIQUE_VAPID) {
    return (
      <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
        <p className="font-medium">Notifications pas encore configurées sur le serveur.</p>
        <p className="mt-1 text-xs text-amber-200/80">
          Génère une paire de clés avec <code>npx web-push generate-vapid-keys</code>, puis ajoute
          <code className="mx-1">NEXT_PUBLIC_VAPID_PUBLIC_KEY</code>,
          <code className="mx-1">VAPID_PRIVATE_KEY</code> et
          <code className="mx-1">VAPID_SUBJECT</code> dans les variables d&apos;environnement Vercel, et
          redéploie.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* iPhone : la contrainte d'Apple, expliquée simplement */}
      {iphoneAInstaller && (
        <div className="rounded-lg border border-accent-teal/30 bg-white/5 px-3 py-2.5 text-sm">
          <p className="font-medium text-white">Sur iPhone, une étape avant tout le reste</p>
          <p className="mt-1 text-xs text-white/70">
            Apple n&apos;autorise les notifications que si l&apos;appli est installée sur l&apos;écran
            d&apos;accueil. Dans Safari : bouton <b>Partager</b> (le carré avec la flèche) →{" "}
            <b>Sur l&apos;écran d&apos;accueil</b>. Rouvre ensuite My Easy Auto <b>depuis l&apos;icône</b>,
            reviens ici, et le bouton ci-dessous fonctionnera.
          </p>
        </div>
      )}

      {!supporte && !iphoneAInstaller && (
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/70">
          Ce navigateur ne gère pas les notifications. Sur Android, utilise Chrome ; sur iPhone,
          installe l&apos;appli sur l&apos;écran d&apos;accueil.
        </div>
      )}

      {/* Bouton principal */}
      <div className="flex flex-wrap items-center gap-2">
        {abonneIci ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              ● Activées sur cet appareil
            </span>
            <button onClick={tester} disabled={busy} className="btn-ghost btn-compact">
              Envoyer un test
            </button>
            <button onClick={desactiver} disabled={busy} className="btn-ghost btn-compact">
              Désactiver ici
            </button>
          </>
        ) : (
          <button onClick={activer} disabled={busy || !supporte} className="btn-primary">
            {busy ? "…" : "Activer les notifications sur cet appareil"}
          </button>
        )}
      </div>

      <p className="text-xs text-white/45">
        Chaque matin vers 8 h, tu reçois un résumé : rendez-vous du jour, rappels arrivés à échéance
        et dossiers urgents. Rien à signaler = pas de notification.
      </p>

      {/* Ce que le garage veut recevoir */}
      {prefs && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
            Contenu du résumé
          </div>
          <div className="space-y-2">
            {LIGNES_PREFS.map((l) => (
              <label key={l.cle} className="flex cursor-pointer items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={prefs[l.cle]}
                  onChange={(e) => basculerPref(l.cle, e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500"
                />
                <span className="min-w-0">
                  <span className="block text-white/85">{l.label}</span>
                  <span className="block text-xs text-white/45">{l.aide}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Appareils déjà autorisés */}
      {tableDispo && appareils.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-white/40">
            Appareils autorisés ({appareils.length})
          </div>
          <ul className="divide-y divide-white/5">
            {appareils.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block text-white/85">
                    {a.appareil || "Appareil"}
                    {!a.actif && <span className="ml-2 text-xs text-rose-300">(désinscrit)</span>}
                  </span>
                  <span className="block text-xs text-white/40">
                    Ajouté le {formatDateTime(a.created_at)}
                    {a.dernier_envoi ? ` · dernier envoi ${formatDateTime(a.dernier_envoi)}` : ""}
                  </span>
                  {a.derniere_erreur && (
                    <span className="block text-xs text-rose-300/80">{a.derniere_erreur}</span>
                  )}
                </span>
                <button
                  onClick={() => retirerAppareil(a)}
                  className="shrink-0 text-white/30 hover:text-rose-300"
                  title="Retirer cet appareil"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!tableDispo && (
        <p className="text-xs text-amber-200/80">
          Table des appareils introuvable — exécute la migration v42 dans Supabase.
        </p>
      )}

      {msg && (
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">
          {msg}
        </div>
      )}
      {erreur && (
        <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
          {erreur}
        </div>
      )}
    </div>
  );
}
