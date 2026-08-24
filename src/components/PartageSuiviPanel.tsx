"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Dossier, PartageSuivi } from "@/lib/types";
import { formatDateTime, messageErreur } from "@/lib/format";
import { usePliage } from "@/lib/pliage";

/**
 * PARTAGE DU SUIVI AU CLIENT (v48).
 *
 * Un lien, trois façons de l'envoyer (copier, SMS, email). Le garage voit
 * si le client l'a ouvert — c'est ce compteur qui remplace le « il ne m'a
 * jamais rappelé ».
 *
 * Le lien expire au bout de 90 jours et peut être coupé à tout moment.
 */

const DUREE_JOURS = 90;

export default function PartageSuiviPanel({ dossier }: { dossier: Dossier }) {
  const { plie, basculerPliage } = usePliage("dossier.partageSuivi", true);
  const [partage, setPartage] = useState<PartageSuivi | null>(null);
  const [dispo, setDispo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copie, setCopie] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const { data, error } = await supabase
      .from("partages_suivi")
      .select("*")
      .eq("dossier_id", dossier.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      setDispo(false);
      return;
    }
    setPartage((data as PartageSuivi) || null);
  }, [dossier.id]);

  useEffect(() => {
    charger();
  }, [charger]);

  const lien = partage
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/suivi/${partage.token}`
    : "";

  async function creer() {
    setBusy(true);
    setErreur(null);
    try {
      const expire = new Date();
      expire.setDate(expire.getDate() + DUREE_JOURS);
      const { data, error } = await supabase
        .from("partages_suivi")
        .insert({ dossier_id: dossier.id, expire_le: expire.toISOString() })
        .select("*")
        .single();
      if (error) throw error;
      setPartage(data as PartageSuivi);
    } catch (err) {
      setErreur(messageErreur(err, "Lien non créé (migration v48 exécutée ?)."));
    }
    setBusy(false);
  }

  async function basculerActif() {
    if (!partage) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("partages_suivi")
        .update({ actif: !partage.actif })
        .eq("id", partage.id);
      if (error) throw error;
      setPartage({ ...partage, actif: !partage.actif });
    } catch (err) {
      setErreur(messageErreur(err, "Modification impossible."));
    }
    setBusy(false);
  }

  async function copier() {
    try {
      await navigator.clipboard.writeText(lien);
      setCopie(true);
      setTimeout(() => setCopie(false), 2500);
    } catch {
      setErreur("Copie impossible : sélectionnez le lien à la main.");
    }
  }

  const messageClient =
    `Bonjour${dossier.client_nom ? ` ${dossier.client_nom}` : ""}, ` +
    `vous pouvez suivre la réparation de votre ${dossier.marque_modele || "véhicule"} ici : ${lien}`;

  return (
    <section className="glass-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={basculerPliage} className="flex min-w-0 items-center gap-2 text-left">
          <span className={`shrink-0 text-white/40 transition-transform ${plie ? "" : "rotate-90"}`} aria-hidden>
            ▸
          </span>
          <h2 className="titre-bloc">
            Suivi partagé au client
            {partage && partage.actif && <span className="badge badge-ok ml-2">actif</span>}
            {partage && !partage.actif && <span className="badge badge-neutral ml-2">coupé</span>}
            {partage && partage.vues > 0 && (
              <span className="badge badge-info ml-1.5">
                {partage.vues} consultation{partage.vues > 1 ? "s" : ""}
              </span>
            )}
          </h2>
        </button>
      </div>

      {!plie && (
        <div className="mt-3">
          {!dispo ? (
            <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              Partage indisponible : exécutez la migration
              <code className="mx-1 rounded bg-black/30 px-1">migration_v48.sql</code>.
            </p>
          ) : !partage ? (
            <>
              <p className="mb-3 text-sm text-white/65">
                Envoyez au client un lien pour suivre sa réparation : avancement, photos d&apos;état,
                documents à signer, et un bouton pour laisser un avis à la restitution. Il arrête
                d&apos;appeler, et vous gagnez une vitrine.
              </p>
              <button onClick={creer} disabled={busy} className="btn-primary btn-compact">
                Créer le lien de suivi
              </button>
            </>
          ) : (
            <>
              <div className="glass-soft mb-3 flex flex-wrap items-center gap-2 rounded-lg p-2">
                <input readOnly value={lien} className="field-input field-compact min-w-0 flex-1" />
                <button onClick={copier} className="btn-ghost btn-compact">
                  {copie ? "✓ Copié" : "Copier"}
                </button>
                <a href={lien} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-compact">
                  Ouvrir
                </a>
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                {dossier.client_tel && (
                  <a
                    href={`sms:${dossier.client_tel.replace(/\s/g, "")}?&body=${encodeURIComponent(messageClient)}`}
                    className="btn-primary btn-compact"
                  >
                    Envoyer par SMS
                  </a>
                )}
                {dossier.client_email && (
                  <a
                    href={`mailto:${dossier.client_email}?subject=${encodeURIComponent(
                      "Suivi de la réparation de votre véhicule"
                    )}&body=${encodeURIComponent(messageClient)}`}
                    className="btn-ghost btn-compact"
                  >
                    Envoyer par email
                  </a>
                )}
                <button onClick={basculerActif} disabled={busy} className="btn-ghost btn-compact">
                  {partage.actif ? "Couper le lien" : "Réactiver le lien"}
                </button>
              </div>

              <p className="text-[11px] text-white/45">
                {partage.vues > 0
                  ? `Consulté ${partage.vues} fois — dernière visite le ${formatDateTime(partage.derniere_vue || "")}.`
                  : "Le client ne l'a pas encore ouvert."}
                {partage.expire_le && ` Expire le ${formatDateTime(partage.expire_le)}.`}
              </p>
              {(!dossier.client_tel && !dossier.client_email) && (
                <p className="mt-1 text-[11px] text-amber-300">
                  Renseignez le téléphone ou l&apos;email du client pour l&apos;envoyer en un clic.
                </p>
              )}
            </>
          )}

          {erreur && (
            <div className="mt-2 rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
              {erreur}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
