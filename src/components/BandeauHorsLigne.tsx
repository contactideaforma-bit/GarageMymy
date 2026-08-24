"use client";

import { useCallback, useEffect, useState } from "react";
import {
  OperationEnAttente,
  enLigne,
  fileEnAttente,
  rejouerFile,
} from "@/lib/horsLigne";

/**
 * BANDEAU « HORS LIGNE » (v47).
 *
 * Deux états, jamais plus :
 *   · connexion perdue → orange, on explique ce qui reste possible ;
 *   · connexion revenue avec des modifications en attente → on les envoie
 *     tout seul et on l'annonce.
 *
 * Le rejeu est déclenché par l'évènement `online` ET par un contrôle
 * toutes les 30 s : sur mobile, `online` ne se déclenche pas toujours au
 * passage 4G ↔ Wi-Fi.
 */
export default function BandeauHorsLigne() {
  const [ligne, setLigne] = useState(true);
  const [attente, setAttente] = useState<OperationEnAttente[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const relireFile = useCallback(async () => {
    setAttente(await fileEnAttente());
  }, []);

  const synchroniser = useCallback(async () => {
    if (envoi || !enLigne()) return;
    const restant = await fileEnAttente();
    if (restant.length === 0) return;
    setEnvoi(true);
    const r = await rejouerFile();
    setEnvoi(false);
    await relireFile();
    if (r.envoyees > 0) {
      setMessage(
        `${r.envoyees} modification${r.envoyees > 1 ? "s" : ""} enregistrée${
          r.envoyees > 1 ? "s" : ""
        } après reconnexion.` + (r.erreurs ? ` ${r.erreurs} refusée(s) par le serveur.` : "")
      );
      setTimeout(() => setMessage(null), 8000);
    }
  }, [envoi, relireFile]);

  useEffect(() => {
    setLigne(enLigne());
    relireFile();

    const versEnLigne = () => {
      setLigne(true);
      synchroniser();
    };
    const versHorsLigne = () => setLigne(false);
    window.addEventListener("online", versEnLigne);
    window.addEventListener("offline", versHorsLigne);

    // Filet de sécurité : certains mobiles ne déclenchent pas « online ».
    const t = setInterval(() => {
      setLigne(enLigne());
      relireFile();
      synchroniser();
    }, 30000);

    return () => {
      window.removeEventListener("online", versEnLigne);
      window.removeEventListener("offline", versHorsLigne);
      clearInterval(t);
    };
  }, [relireFile, synchroniser]);

  if (ligne && attente.length === 0 && !message) return null;

  return (
    <div className="px-3 pt-3 sm:px-4 lg:px-6">
      {!ligne && (
        <div className="anim-apparition flex flex-wrap items-start justify-between gap-2 rounded-lg border-2 border-amber-400/50 bg-amber-500/15 px-3 py-2 text-amber-100">
          <div className="flex min-w-0 items-start gap-2">
            <span aria-hidden className="text-base leading-none">
              📶
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Pas de connexion</p>
              <p className="mt-0.5 text-xs opacity-90">
                Vous consultez la dernière copie enregistrée sur cet appareil. Les notes et les
                coches sont conservées et partiront toutes seules au retour du réseau. Évitez de
                créer un dossier ou une facture tant que le réseau n&apos;est pas revenu.
              </p>
            </div>
          </div>
        </div>
      )}

      {ligne && attente.length > 0 && (
        <div className="anim-apparition flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-violet-400/50 bg-violet-500/15 px-3 py-2 text-violet-100">
          <p className="text-sm">
            {envoi ? "Envoi en cours…" : `${attente.length} modification(s) en attente d'envoi.`}
          </p>
          <button onClick={synchroniser} disabled={envoi} className="btn-ghost btn-compact">
            Envoyer maintenant
          </button>
        </div>
      )}

      {message && (
        <div className="anim-apparition mt-2 rounded-lg border-2 border-emerald-400/40 bg-emerald-500/12 px-3 py-2 text-sm text-emerald-100">
          ✅ {message}
        </div>
      )}
    </div>
  );
}
