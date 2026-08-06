"use client";

// ANALYSE D'UN RAPPORT D'EXPERTISE — orchestration côté navigateur (v6.9).
//
// POURQUOI DEUX APPELS : le temps d'une analyse est dominé par les tokens de
// SORTIE. Sur un rapport SCANNÉ, produire d'un coup les identités ET les
// dizaines de lignes du chiffrage dépassait les 60 s de la fonction
// serverless — l'hébergeur coupait, et l'analyse échouait entièrement.
//
// On lance donc les deux moitiés EN PARALLÈLE : deux requêtes = deux
// invocations = deux budgets de temps distincts, chacune produisant deux fois
// moins de texte. Et si l'une échoue, l'autre reste exploitable : le dossier
// est pré-rempli quand même (analyse partielle plutôt qu'échec total).

import { Dossier } from "./types";
import { LigneExtraite } from "./documents";
import { fetchAuth, lireReponse } from "./apiClient";

export type Extraction = Partial<Dossier> & {
  lignes?: LigneExtraite[];
  tva?: number | null;
  montant?: number | null;
};

export type ResultatAnalyse = {
  data: Extraction;
  /** Message à afficher quand une seule des deux moitiés a abouti. */
  avertissement: string | null;
};

async function appeler(file: File, partie: "identite" | "chiffrage"): Promise<Extraction> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetchAuth(`/api/extract-rapport?partie=${partie}`, {
    method: "POST",
    body: fd,
  });
  const { ok, data, error } = await lireReponse<{ data: Extraction }>(res);
  if (!ok || !data?.data) throw new Error(error || "Échec de l'analyse.");
  return data.data;
}

export async function analyserRapport(file: File): Promise<ResultatAnalyse> {
  const [identite, chiffrage] = await Promise.allSettled([
    appeler(file, "identite"),
    appeler(file, "chiffrage"),
  ]);

  const okId = identite.status === "fulfilled";
  const okCh = chiffrage.status === "fulfilled";

  // Les deux moitiés ont échoué → on remonte l'erreur la plus parlante.
  if (!okId && !okCh) {
    const msg =
      (identite as PromiseRejectedResult).reason instanceof Error
        ? ((identite as PromiseRejectedResult).reason as Error).message
        : "Échec de l'analyse.";
    throw new Error(msg);
  }

  const data: Extraction = {
    ...(okId ? identite.value : {}),
    ...(okCh ? chiffrage.value : {}),
  };

  let avertissement: string | null = null;
  if (okId && !okCh) {
    avertissement =
      "Les informations du dossier ont été récupérées, mais PAS le chiffrage " +
      "(rapport scanné ou très détaillé). Saisis le montant et les lignes à la main " +
      "dans le devis, ou relance l'analyse.";
  } else if (!okId && okCh) {
    avertissement =
      "Le chiffrage a été récupéré, mais pas les informations du dossier " +
      "(véhicule, client, assurance) : complète-les à la main.";
  }

  return { data, avertissement };
}
