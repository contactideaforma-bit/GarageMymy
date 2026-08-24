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
import { LigneExtraite, normaliseLignes } from "./documents";
import { fetchAuth, lireReponse } from "./apiClient";
import { supabase } from "./supabaseClient";

/**
 * Contrôle rendu par le serveur : la somme des lignes extraites retombe-t-elle
 * sur le TOTAL HT du rapport ? (v7.7 — on signale, on ne corrige jamais.)
 */
export type ControleChiffrage = {
  montant: number | null;
  somme: number;
  ecart: number;
  coherent: boolean;
  montantDeduit: boolean;
  /**
   * Écarts constatés BLOC PAR BLOC (v8.9) — « Main d'œuvre : 1 160 € lu
   * contre 1 880 € au rapport ». Vide quand tout tombe juste ou quand le
   * rapport n'imprime pas de sous-totaux.
   */
  blocs?: string[];
  /**
   * « grille » = chiffrage lu DIRECTEMENT dans le rapport par le code, sans
   * IA, et vérifié contre les totaux imprimés (v9.1). Absent = lecture IA.
   */
  source?: "grille" | "ia";
};

export type Extraction = Partial<Dossier> & {
  lignes?: LigneExtraite[];
  tva?: number | null;
  montant?: number | null;
  controle?: ControleChiffrage | null;
  /** Nombre de corrections appliquées depuis la mémoire de l'analyse. */
  regles_appliquees?: number | null;
};

export type ResultatAnalyse = {
  data: Extraction;
  /** Message à afficher quand une seule des deux moitiés a abouti. */
  avertissement: string | null;
  /** Cohérence du chiffrage avec le total du rapport (null si non calculé). */
  controle: ControleChiffrage | null;
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

  return { data, avertissement, controle: data.controle ?? null };
}

/* ====================================================================
 *  RÉ-ANALYSE DU CHIFFRAGE D'UN DOSSIER EXISTANT (v9.2)
 *
 *  Le chiffrage est FIGÉ sur `dossiers.chiffrage` au moment de l'import.
 *  Quand la lecture des rapports s'améliore (v9.1 : lecture déterministe
 *  des grilles BCA/Allianz), les dossiers déjà importés gardent l'ancienne
 *  lecture — et « + Facture » ou « ↺ Reprendre le chiffrage » reproduisent
 *  fidèlement… l'erreur d'origine. C'est exactement ce qui s'est passé sur
 *  EP-242-VP : T1 et T2 absents, total faux, alors que le code corrigé
 *  lisait le rapport au centime près.
 *
 *  Cette fonction relit le PDF conservé dans le Storage, relance UNIQUEMENT
 *  la partie « chiffrage » (lecture en grille d'abord, IA en repli), puis
 *  remplace le chiffrage et le montant du dossier. Elle ne touche à rien
 *  d'autre (ni aux identités, ni aux documents déjà émis).
 * ==================================================================== */

export type ResultatReanalyse = {
  lignes: ReturnType<typeof normaliseLignes>;
  montant: number | null;
  tva: number | null;
  controle: ControleChiffrage | null;
};

export async function reanalyserChiffrage(
  dossier: Pick<Dossier, "id" | "rapport_path" | "rapport_nom">
): Promise<ResultatReanalyse> {
  if (!dossier.rapport_path) {
    throw new Error("Aucun rapport d'expertise n'est enregistré sur ce dossier.");
  }
  const { data, error } = await supabase.storage.from("rapports").download(dossier.rapport_path);
  if (error || !data) {
    throw new Error("Impossible de relire le rapport dans le Storage (connexion requise).");
  }
  const nom = dossier.rapport_nom || dossier.rapport_path.split("/").pop() || "rapport.pdf";
  const type = nom.toLowerCase().endsWith(".pdf") ? "application/pdf" : data.type || "application/pdf";
  const file = new File([data], nom, { type });

  const extrait = await appeler(file, "chiffrage");
  const montant = extrait.montant != null && !Number.isNaN(Number(extrait.montant)) ? Number(extrait.montant) : null;
  const lignes = normaliseLignes(extrait.lignes, montant);
  if (lignes.length === 0) {
    throw new Error("La ré-analyse n'a rendu aucune ligne : le chiffrage du dossier est conservé tel quel.");
  }
  const tva = extrait.tva != null && !Number.isNaN(Number(extrait.tva)) ? Number(extrait.tva) : null;

  const patch: Record<string, unknown> = { chiffrage: lignes };
  if (montant != null) patch.montant = montant;
  if (tva != null) patch.tva = tva;
  const { error: eMaj } = await supabase.from("dossiers").update(patch).eq("id", dossier.id);
  if (eMaj) throw new Error(`Chiffrage relu mais non enregistré : ${eMaj.message}`);

  return { lignes, montant, tva, controle: extrait.controle ?? null };
}
