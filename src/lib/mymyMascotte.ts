// « MY-MY » MASCOTTE (v13.43) — textes de la mascotte animée.
//
// La mascotte (composants/MyMyMascotte.tsx) pioche ici ses astuces, ses
// petites phrases et ses réactions. Tout le contenu est centralisé pour
// pouvoir l'enrichir sans toucher à l'animation.

export type AstuceMyMy = {
  texte: string;
  /** Lien optionnel proposé sous la bulle. */
  href?: string;
  label?: string;
};

export type GesteMyMy = "coucou" | "saut" | "chatouille" | "tourne" | "boude" | "surprise" | "clin";

export type ReactionMyMy = { texte: string; geste: GesteMyMy };

/* ------------------------------------------------------------------ */
/*  Astuces du SITE VITRINE (visiteurs non connectés)                  */
/* ------------------------------------------------------------------ */

export const ASTUCES_VITRINE: AstuceMyMy[] = [
  { texte: "Salut ! Moi c'est MY-MY, la mascotte de My Easy Auto 👋 Clique sur moi, je ne mords pas." },
  { texte: "Un dossier sinistre, c'est des photos, un rapport d'expert, des relances… Ici tout est au même endroit.", href: "/#fonctions", label: "Voir les fonctionnalités" },
  { texte: "Tout est inclus dans l'abonnement : pas de surprise sur la facture.", href: "/#formules", label: "Les formules" },
  { texte: "Tu peux t'abonner en ligne en 5 minutes, contrat signé depuis ton téléphone.", href: "/inscription", label: "S'abonner" },
  { texte: "Dans l'appli, je réponds aux questions du garage : « où en est la Clio de M. Martin ? » et hop.", href: "/#etapes", label: "Comment ça marche" },
  { texte: "Facturation électronique : l'appli est prête pour la réforme, toi aussi du coup.", href: "/facturation-electronique", label: "En savoir plus" },
  { texte: "Une question avant de te lancer ? Un humain te rappelle (promis, pas un robot… enfin, pas moi).", href: "/contact", label: "Être rappelé" },
  { texte: "Astuce : regarde la vidéo de présentation, c'est plus parlant que mes bulles.", href: "/#video", label: "La vidéo" },
  { texte: "Le client suit son dossier tout seul grâce au lien de suivi : moins d'appels au comptoir, plus de temps à l'atelier." },
  { texte: "Je suis fait en SVG, je ne pèse rien et je bouge pour de vrai. Essaie de me suivre avec la souris 👀" },
];

/* ------------------------------------------------------------------ */
/*  Astuces de l'APPLI (garage connecté), par début de route           */
/* ------------------------------------------------------------------ */

const ASTUCES_APPLI_GENERALES: AstuceMyMy[] = [
  { texte: "Tu peux me poser une question directement : « qu'est-ce que j'ai à faire aujourd'hui ? »" },
  { texte: "Tape une immat ou un nom de client dans ma fenêtre, je retrouve le dossier." },
  { texte: "Pense à sauvegarder tes données de temps en temps, ça prend 10 secondes.", href: "/sauvegarde", label: "Sauvegarde" },
  { texte: "Un impayé qui traîne ? Je peux te lister les factures en retard.", href: "/factures", label: "Factures" },
  { texte: "Le planning te dit quels véhicules sont à l'atelier cette semaine.", href: "/planning", label: "Planning" },
  { texte: "Envoie le lien de suivi à ton client : il arrête de t'appeler pour savoir où en est sa voiture.", href: "/suivi", label: "Suivi client" },
  { texte: "Je peux créer un rappel ou un RDV pour toi — je te demande toujours confirmation avant d'écrire quoi que ce soit." },
  { texte: "Un bug, une idée ? Le support lit tout, même les messages grognons.", href: "/support", label: "Support" },
  { texte: "Mode clair ou sombre : le bouton est dans la barre latérale, selon l'humeur de l'atelier." },
  { texte: "Pause café ? Clique sur moi 5 fois de suite, tu verras." },
];

const ASTUCES_APPLI_PAR_ROUTE: Record<string, AstuceMyMy[]> = {
  "/sinistres": [
    { texte: "Sur la liste des sinistres, les filtres se souviennent de ta sélection quand tu reviens d'un dossier." },
    { texte: "Un dossier sans photos d'état, c'est un litige qui attend. Prends-les dès la réception." },
    { texte: "Demande-moi « les dossiers en attente d'expert », je trie pour toi." },
  ],
  "/factures": [
    { texte: "Une facture envoyée, c'est bien. Une facture relancée au bon moment, c'est mieux : regarde les retards.", href: "/factures", label: "Retards" },
    { texte: "Les règlements encaissés se pointent dans le dossier, le reste à payer se met à jour tout seul." },
  ],
  "/devis": [{ texte: "Un devis signé en ligne vaut acceptation : plus besoin de courir après une signature papier.", href: "/signer", label: "Signature" }],
  "/planning": [{ texte: "Glisse un véhicule sur un autre jour pour le replanifier. Oui, au doigt aussi." }],
  "/agenda": [{ texte: "Dis-moi « rappelle-moi d'appeler l'expert demain » et je te propose le rappel." }],
  "/clients": [{ texte: "Chaque fiche client regroupe ses véhicules, ses dossiers et ses factures. Fini le classeur." }],
  "/vehicules": [{ texte: "Scanne la carte grise plutôt que de tout retaper : l'immat, le VIN, tout rentre." }],
  "/courriers": [{ texte: "Les courriers de litige suivent un circuit guidé : imprimer, poster, confirmer, garder l'AR." }],
  "/archives": [{ texte: "Un dossier archivé n'est jamais perdu : la recherche le retrouve quand même." }],
  "/rentabilite": [{ texte: "Regarde la rentabilité par dossier avant de négocier avec l'expert : les chiffres parlent pour toi." }],
  "/prospects": [{ texte: "Un prospect relancé sous 48 h a deux fois plus de chances de passer à l'atelier." }],
  "/extranets": [{ texte: "Les identifiants des extranets assureurs sont rangés ici, plus de post-it sur l'écran." }],
};

/** Astuces pertinentes pour la page en cours (spécifiques + générales). */
export function astucesPourRoute(pathname: string | null): AstuceMyMy[] {
  const p = pathname || "/";
  const cle = Object.keys(ASTUCES_APPLI_PAR_ROUTE).find((k) => p === k || p.startsWith(k + "/"));
  const specifiques = cle ? ASTUCES_APPLI_PAR_ROUTE[cle] : [];
  // Les astuces de la page passent en double pour sortir plus souvent.
  return [...specifiques, ...specifiques, ...ASTUCES_APPLI_GENERALES];
}

/* ------------------------------------------------------------------ */
/*  Réactions quand on clique sur MY-MY (site vitrine)                 */
/* ------------------------------------------------------------------ */

export const REACTIONS_CLIC: ReactionMyMy[] = [
  { texte: "Coucou ! 👋", geste: "coucou" },
  { texte: "Hihi, ça chatouille !", geste: "chatouille" },
  { texte: "Youhou !", geste: "saut" },
  { texte: "Wouuuh, ça tourne…", geste: "tourne" },
  { texte: "Bon. Ça suffit maintenant 😤", geste: "boude" },
  { texte: "… d'accord, je t'aime bien quand même 😉", geste: "clin" },
];

/** Petites phrases quand MY-MY réapparaît par surprise. */
export const SURPRISES: string[] = ["Bouh ! 👻", "Tu m'as cherché ?", "Me revoilà !", "Psst… par ici !", "Je m'étais caché, tu n'as rien vu ?"];

/** Petites phrases quand on survole longtemps sans cliquer. */
export const TAQUINERIES: string[] = ["Je te vois 👀", "Oui ? Tu voulais me dire quelque chose ?", "Allez, clique."];

/** Un élément au hasard, différent du précédent si possible. */
export function tirerAuHasard<T>(liste: T[], sauf?: T): T {
  const pool = liste.length > 1 && sauf !== undefined ? liste.filter((x) => x !== sauf) : liste;
  return pool[Math.floor(Math.random() * pool.length)];
}
