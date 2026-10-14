// ====================================================================
//  FORMULE DU GARAGE CONNECTÉ (v13.42)
//  Le suivi des impayés et le suivi des litiges sont réservés aux
//  formules Adhésion Service (Plus / Premium / Ultimate). Dans la
//  formule ESSENTIEL (appli seule) ils sont grisés et invitent à passer
//  à la formule supérieure.
//  La formule vient de la fonction SQL `ma_formule()` (migration v99) ;
//  NULL (aucun abonnement connu : démo, essai, éditeur, migration absente)
//  = accès complet, pour ne jamais bloquer une démonstration.
// ====================================================================

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export type FormuleGarage = "essentiel" | "starter" | "confort" | "serenite";

export const LIBELLE_FORMULE: Record<FormuleGarage, string> = {
  essentiel: "Essentiel",
  starter: "Adhésion Service Plus",
  confort: "Adhésion Service Premium",
  serenite: "Adhésion Service Ultimate",
};

export type AccesFormule = {
  formule: FormuleGarage | null;
  /** Suivi des impayés + suivi des litiges (Adhésion Service). */
  serviceInclus: boolean;
  charge: boolean;
};

const ACCES_COMPLET: AccesFormule = { formule: null, serviceInclus: true, charge: true };
let cache: AccesFormule | null = null;
let enCours: Promise<AccesFormule> | null = null;

/** Formule du compte connecté (mise en cache pour la session de page). */
export async function chargerFormule(force = false): Promise<AccesFormule> {
  if (cache && !force) return cache;
  if (enCours && !force) return enCours;
  enCours = (async () => {
    try {
      const { data, error } = await supabase.rpc("ma_formule");
      if (error) return ACCES_COMPLET; // fonction absente (migration v99 non exécutée) → accès complet
      const f = (typeof data === "string" ? data : null) as FormuleGarage | null;
      cache = { formule: f, serviceInclus: f !== "essentiel", charge: true };
      return cache;
    } catch {
      return ACCES_COMPLET;
    } finally { enCours = null; }
  })();
  return enCours;
}

export function oublierFormule() { cache = null; }

/** Hook : accès aux fonctions de service selon la formule (accès complet tant que ce n'est pas chargé). */
export function useFormuleGarage(): AccesFormule {
  const [acces, setAcces] = useState<AccesFormule>(cache || { formule: null, serviceInclus: true, charge: false });
  useEffect(() => { let actif = true; chargerFormule().then((a) => { if (actif) setAcces(a); }); return () => { actif = false; }; }, []);
  return acces;
}

export const TEXTE_FORMULE_SUPERIEURE =
  "Réservé aux formules Adhésion Service (Plus, Premium, Ultimate) : un chargé de mission reprend vos dossiers bloqués — impayés, litiges avec l'assureur — et l'appli vous guide pas à pas.";
