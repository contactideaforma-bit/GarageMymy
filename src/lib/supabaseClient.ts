import { createClient } from "@supabase/supabase-js";

// Valeurs de repli pour que le build ne plante pas si les variables
// d'environnement ne sont pas encore configurées. Les appels réels
// échoueront tant que .env.local n'est pas renseigné.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "public-anon-key-placeholder";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ============================================================
//  LECTURE SEULE (v10.1) — fin de contrat.
//
//  Quand l'éditeur passe un compte en lecture seule (comptes_etat), le
//  garage consulte et exporte ses données mais n'écrit plus. Plutôt que de
//  désactiver chaque bouton de l'appli, on intercepte ici TOUTES les
//  écritures du client Supabase (insert / update / upsert / delete, dépôts
//  et suppressions de fichiers) : elles lèvent une erreur explicite que
//  chaque écran affiche déjà via messageErreur. Les lectures passent.
// ============================================================
export const MESSAGE_LECTURE_SEULE =
  "Compte en lecture seule : votre contrat est terminé. Vous pouvez consulter et exporter vos données (Organisation → Sauvegarde), mais plus les modifier. Contactez IDEAFORMA pour réactiver l'abonnement.";

let lectureSeule = false;
export function definirLectureSeule(v: boolean): void {
  lectureSeule = v;
}
export function estEnLectureSeule(): boolean {
  return lectureSeule;
}

function bloque(): never {
  throw new Error(MESSAGE_LECTURE_SEULE);
}

const fromOrigine = supabase.from.bind(supabase);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(supabase as any).from = (table: string) => {
  const q = fromOrigine(table);
  if (lectureSeule) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = q as any;
    b.insert = bloque;
    b.update = bloque;
    b.upsert = bloque;
    b.delete = bloque;
  }
  return q;
};
const storageFromOrigine = supabase.storage.from.bind(supabase.storage);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(supabase.storage as any).from = (bucket: string) => {
  const b = storageFromOrigine(bucket);
  if (lectureSeule) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const x = b as any;
    x.upload = bloque;
    x.remove = bloque;
    x.update = bloque;
  }
  return b;
};
