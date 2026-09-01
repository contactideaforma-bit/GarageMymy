// ====================================================================
//  MENTIONS PARTICULIÈRES D'UN RAPPORT D'EXPERTISE (v11.2)
//
//  Certains rapports portent une mention qui change TOUT pour le garage :
//  « expertise à titre conservatoire » (pas d'accord de réparation),
//  « sursis à travaux », procédure VGE, véhicule économiquement
//  irréparable, absence de règlement direct, TVA récupérable par le
//  client, franchise ou vétusté à encaisser… Facturer ou démarrer les
//  travaux sans les avoir vues coûte cher.
//
//  Ce module est PARTAGÉ serveur / navigateur (aucune dépendance) :
//  - `detecterMentions(texte)` lit le calque texte du PDF (ou le bloc
//    « observations » rendu par l'IA sur un scan) et renvoie une liste
//    de mentions typées, DÉTERMINISTE (regex), avec l'extrait du rapport ;
//  - `fusionnerMentions` dédoublonne les deux moitiés de l'analyse ;
//  - les libellés / conseils sont centralisés ici pour l'affichage.
//
//  Règle du projet : l'appli SIGNALE, l'humain décide. Aucune mention ne
//  bloque une action — elle s'affiche en alerte là où elle compte (fiche
//  dossier, formulaire d'import, éditeur de facture, liste).
// ====================================================================

export type GraviteMention = "danger" | "warn" | "info";

export type MentionRapport = {
  /** Code stable (sert au dédoublonnage et aux badges). */
  code: string;
  gravite: GraviteMention;
  /** Titre court affiché en gras. */
  libelle: string;
  /** Ce que ça implique pour le garage. */
  conseil: string;
  /** Extrait du rapport (ligne) qui a déclenché la mention. */
  extrait?: string | null;
  /** Montant lu (franchise, vétusté) le cas échéant. */
  montant?: number | null;
};

type Regle = {
  code: string;
  gravite: GraviteMention;
  libelle: string;
  conseil: string;
  /** Une des expressions doit matcher (sur une LIGNE normalisée). */
  motifs: RegExp[];
  /** Si présent, la ligne est ignorée quand elle matche (ex. « VGE : Non »). */
  exclure?: RegExp;
  /** Extraction d'un montant sur la ligne (franchise, vétusté). */
  montant?: boolean;
};

// Lignes de pied de page présentes sur TOUS les rapports : jamais une mention.
const BOILERPLATE = [
  /ne constitue en aucun cas un ordre de r[ée]paration/i,
  /[ée]tabli sous r[ée]serve de garanties/i,
  /sous les r[ée]serves habituelles/i,
  /r[ée]serve sous garantie acquise/i,
  /ne pourra (?:être )?pris(?:e)? en (?:compte|consid[ée]ration)/i,
];

const REGLES: Regle[] = [
  {
    code: "conservatoire",
    gravite: "danger",
    libelle: "Expertise à titre conservatoire",
    conseil:
      "L'expert n'a PAS donné d'accord de réparation : le chiffrage est une estimation de sauvegarde. Ne démarre pas les travaux et ne facture pas l'assurance sans un accord écrit (rapport définitif ou règlement direct).",
    motifs: [/[àa]\s+titre\s+conservatoire/i, /expertise\s+conservatoire/i, /\bconservatoire\b/i],
  },
  {
    code: "sursis",
    gravite: "danger",
    libelle: "Sursis à travaux",
    conseil:
      "L'expert demande de SURSEOIR aux travaux : rien ne doit être engagé tant que l'accord (assurance, expert ou client) n'est pas reçu. Programme un rappel et ne facture pas.",
    motifs: [
      /surs(?:is|eoir|oir|oire)\s+(?:aux?\s+|à\s+|a\s+)?(?:travaux|r[ée]parations?)/i,
      /(?:travaux|r[ée]parations?)\s+(?:en\s+)?surs(?:is|oir)/i,
      /\bsursis\b/i,
      /ne\s+pas\s+(?:engager|commencer|d[ée]buter|entreprendre)\s+(?:les\s+)?(?:travaux|r[ée]parations?)/i,
      /(?:travaux|r[ée]parations?)\s+(?:non\s+autoris[ée]s?|en\s+attente\s+d.accord|soumis\s+[àa]\s+accord)/i,
      /attente\s+(?:de\s+l.)?accord\s+(?:pr[ée]alable\s+)?(?:de\s+)?(?:la\s+)?(?:compagnie|assurance|assureur|mandant)/i,
      /accord\s+pr[ée]alable\s+(?:de\s+la\s+compagnie|de\s+l.assureur|obligatoire|requis|n[ée]cessaire)/i,
    ],
  },
  {
    code: "vge",
    gravite: "danger",
    libelle: "Procédure VGE (véhicule gravement endommagé)",
    conseil:
      "Le véhicule est sous procédure VGE (art. L327-5 du Code de la route) : immatriculation bloquée jusqu'au rapport de conformité de l'expert. Les réparations doivent suivre exactement le rapport, avec contre-visite obligatoire avant restitution.",
    motifs: [
      /proc[ée]dure\s+VGE\s*:?\s*(?:oui|✓|x)\b/i,
      /objet\s+de\s+la\s+proc[ée]dure\s+VGE/i,
      /suivi\s+VGE/i,
      /v[ée]hicule\s+gravement\s+endommag/i,
      /\bVGE\s*:?\s*oui\b/i,
    ],
    exclure: /VGE\s*:?\s*non\b/i,
  },
  {
    code: "vei",
    gravite: "danger",
    libelle: "Véhicule économiquement irréparable (VEI)",
    conseil:
      "Le coût des réparations dépasse la valeur du véhicule : l'assurance indemnise en valeur (cession de l'épave possible). Ne répare pas sans accord exprès et écrit du propriétaire ET de l'assurance.",
    motifs: [
      /[ée]conomiquement\s+(?:non\s+r[ée]parable|irr[ée]parable)/i,
      /economiquement\s+r[ée]parable\s*:?\s*non\b/i,
      /\bV\.?\s?E\.?\s?I\b/,
      /techniquement\s+(?:non\s+r[ée]parable|irr[ée]parable)/i,
      /perte\s+totale/i,
      /\b[ée]pave\b/i,
    ],
    exclure: /[ée]conomiquement\s+r[ée]parable\s+et\s+techniquement\s+r[ée]parable|economiquement\s+r[ée]parable\s*:?\s*oui/i,
  },
  {
    code: "pec_non",
    gravite: "danger",
    libelle: "Prise en charge non accordée",
    conseil:
      "Selon le rapport, l'assurance n'a pas (encore) accordé la prise en charge. Vérifie auprès de l'assureur avant de facturer autre chose que le client.",
    motifs: [/prise\s+en\s+charge\s+(?:accord[ée]e\s*)?:?\s*(?:non|refus[ée]e?)\b/i, /refus\s+de\s+prise\s+en\s+charge/i],
  },
  {
    code: "rapport_provisoire",
    gravite: "warn",
    libelle: "Rapport provisoire / pré-rapport",
    conseil:
      "Le chiffrage n'est pas définitif : attends le rapport définitif avant de facturer, ou signale à l'expert les écarts constatés au démontage.",
    motifs: [/rapport\s+provisoire/i, /pr[ée]-?rapport/i, /chiffrage\s+provisoire/i, /estimation\s+provisoire/i],
  },
  {
    code: "reglement_direct_suspendu",
    gravite: "warn",
    libelle: "Règlement direct suspendu",
    conseil:
      "Le règlement direct par l'assurance est SUSPENDU : tant qu'il n'est pas délivré, la facture est à régler par le client. Relance l'expert ou la compagnie.",
    motifs: [/r[èe]glement\s+direct[^\n]{0,30}:\s*suspendu/i],
  },
  {
    code: "reglement_direct_reserve",
    gravite: "warn",
    libelle: "Règlement direct sous réserve de la compagnie",
    conseil:
      "L'expert accorde le règlement direct SOUS RÉSERVE de la compagnie : attends le document de règlement direct avant d'adresser la facture à l'assurance (sinon, facture au client).",
    motifs: [/r[èe]glement\s+direct[^\n]{0,30}:\s*accord[ée][^\n]{0,20}sous\s+r[ée]serve/i],
  },
  {
    // v11.9 — « R.D.R. OUI » remontait en « mention relevée par l'analyse »,
    // donc en avertissement, alors que c'est une BONNE nouvelle. On la type
    // pour qu'elle s'affiche en information utile plutôt qu'en alarme.
    code: "reglement_direct_oui",
    gravite: "info",
    libelle: "Règlement direct accordé",
    conseil:
      "L'assurance règle directement le garage : la facture lui est adressée (sous déduction de la franchise et de la vétusté éventuelles, qui restent au client).",
    motifs: [
      /r[èe]glement\s+direct[^\n]{0,30}:\s*(?:oui|accord[ée])/i,
      /\bR\.?\s?D\.?\s?R\.?\s*:?\s*OUI\b/i,
    ],
  },
  {
    code: "reglement_direct_non",
    gravite: "warn",
    libelle: "Pas de règlement direct",
    conseil:
      "Aucun règlement direct délivré par la compagnie : la facture est à adresser au CLIENT (pas à l'assurance), sauf document de règlement direct reçu ensuite.",
    motifs: [
      /absence\s+de\s+r[èe]glement\s+direct/i,
      /r[èe]glement\s+direct[^\n]{0,30}:\s*(?:non|refus[ée]e?)\b/i,
      /sans\s+r[èe]glement\s+direct/i,
    ],
  },
  {
    code: "accord_reparateur_non",
    gravite: "warn",
    libelle: "Accord réparateur : non",
    conseil:
      "Le rapport indique que le réparateur n'a pas donné son accord sur le chiffrage : vérifie les postes (heures, taux, pièces) et fais valoir tes observations à l'expert.",
    motifs: [/accord\s+r[ée]parateur\s*:?\s*non\b/i],
  },
  {
    code: "tva_recuperable",
    // v11.9 — était "warn". Retour utilisateur : « la TVA, ce n'est pas
    // nécessaire d'avertir à chaque fois, ce n'est pas pertinent ». C'est une
    // information utile à la facturation, pas un problème à régler : elle
    // reste affichée, mais en observation, avec les autres informations.
    gravite: "info",
    libelle: "Client assujetti : TVA récupérable",
    conseil:
      "Le client récupère la TVA : l'assurance indemnise HORS TAXES, la TVA est à facturer et à encaisser auprès du client.",
    motifs: [/TVA\s+(?:ouvrant\s+droit|d[ée]ductible|r[ée]cup[ée]rable)\s*:?\s*oui\b/i, /assujetti\s+[àa]\s+la\s+TVA\s*:?\s*oui\b/i],
  },
  {
    code: "tva_non_recuperable",
    gravite: "info",
    libelle: "Client non assujetti : indemnisation TTC",
    conseil: "Le client ne récupère pas la TVA : l'assurance indemnise TTC.",
    motifs: [/TVA\s+(?:ouvrant\s+droit|d[ée]ductible|r[ée]cup[ée]rable)\s*:?\s*non\b/i, /assujetti\s+[àa]\s+la\s+TVA\s*:?\s*non\b/i],
  },
  {
    code: "franchise",
    gravite: "warn",
    libelle: "Franchise à encaisser",
    conseil:
      "Une franchise est prévue : elle reste à la charge du client et se déduit de la part réglée par l'assurance. Encaisse-la à la restitution.",
    // Le mot doit être IMMÉDIATEMENT suivi du montant (« FRANCHISE (4) 300,00 € ») :
    // sur une ligne de grille fusionnée, « FRANCHISE Action Q 115,00 » prenait
    // le taux des ingrédients pour la franchise.
    motifs: [/\bfranchise\b\s*(?:\(\d+\))?\s*:?\s*\d[\d\s.]*,\d{2}/i],
    montant: true,
  },
  {
    code: "vetuste",
    gravite: "warn",
    libelle: "Vétusté déduite",
    conseil:
      "L'expert déduit une vétusté : ce montant n'est PAS pris en charge par l'assurance et reste à la charge du client (à facturer ou à négocier).",
    motifs: [/v[ée]tust[ée]s?(?:\(s\))?\s*:?\s*\d[\d\s.]*,\d{2}/i],
    montant: true,
  },
  {
    code: "dommages_apparents",
    gravite: "info",
    libelle: "Chiffrage sur dommages apparents (avant démontage)",
    conseil:
      "Le rapport est établi sans démontage : tout dommage caché découvert en atelier doit être signalé à l'expert (complément d'expertise) AVANT d'être réparé et facturé.",
    motifs: [/dommages?\s+apparents?/i, /sans\s+d[ée]montage/i, /avant\s+d[ée]montages?/i, /estimation\s+des\s+d[ée]g[âa]ts\s+apparents/i],
  },
  {
    code: "complement",
    gravite: "info",
    libelle: "Complément d'expertise / contre-visite prévu",
    conseil: "Une nouvelle intervention de l'expert est prévue : ne restitue pas le véhicule avant, et garde les pièces remplacées à disposition.",
    motifs: [/compl[ée]ment\s+d.expertise/i, /expertise\s+compl[ée]mentaire/i, /contre-?\s?visite/i, /rapport\s+compl[ée]mentaire/i],
  },
  {
    code: "reemploi",
    gravite: "info",
    libelle: "Pièces de réemploi (occasion) prévues",
    conseil: "Le rapport retient des pièces de réemploi : commande-les conformes (traçabilité) — une pièce neuve à la place ne sera pas prise en charge sans accord.",
    motifs: [/r[ée]emploi/i, /pi[èe]ces?\s+d.occasion/i, /\bPIEC\b/],
    // Les LÉGENDES des rapports (« PRE pièce de réemploi, PQE… », « S=Echange
    // pièce réemploi ») ne sont pas des mentions : on les écarte.
    exclure: /=|indique|l[ée]gende|(?:^|\s)[A-Z]{1,3}\s+[a-zéè]+(?:\s+[a-zéè]+)*,\s/,
  },
  {
    code: "taux_recours",
    gravite: "info",
    libelle: "Taux du garage maintenus pour recours",
    conseil: "L'expert a conservé tes taux horaires pour le recours : la facture doit reprendre exactement ces taux.",
    motifs: [/taux\s+(?:du\s+garage\s+)?maintenus?\s+pour\s+recours/i],
  },
];

/** Normalise une ligne du calque (espaces multiples, séparateurs « ! »). */
function normaliser(ligne: string): string {
  return ligne.replace(/[!|]/g, "  ").replace(/\s+/g, " ").trim();
}

/** Fenêtre de texte autour du motif (les lignes de grille fusionnent des colonnes). */
function extraitAutour(ligne: string, motif: RegExp): string {
  if (ligne.length <= 140) return ligne;
  const m = ligne.match(motif);
  const i = m && m.index != null ? m.index : 0;
  const debut = Math.max(0, i - 40);
  const fin = Math.min(ligne.length, i + (m ? m[0].length : 0) + 80);
  return (debut > 0 ? "…" : "") + ligne.slice(debut, fin).trim() + (fin < ligne.length ? "…" : "");
}

/** Lit le premier montant « 1 234,56 » qui suit le mot clé. */
function lireMontant(ligne: string, cle: RegExp): number | null {
  const m = ligne.match(cle);
  if (!m) return null;
  const reste = ligne.slice(m.index! + m[0].length);
  const nombre = reste.match(/(\d[\d\s.]*,\d{2})/);
  if (!nombre) return null;
  const n = Number(nombre[1].replace(/[\s.]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Détection DÉTERMINISTE des mentions particulières dans un texte de
 * rapport (calque texte du PDF, ou bloc d'observations rendu par l'IA).
 * Une mention n'apparaît qu'une fois (première ligne qui la déclenche).
 */
export function detecterMentions(texte: string | null | undefined): MentionRapport[] {
  if (!texte) return [];
  const resultat: MentionRapport[] = [];
  const vus = new Set<string>();
  // Le calque peut placer deux colonnes sur une même ligne : on coupe aussi
  // sur les séparateurs verticaux pour ne pas mélanger les contextes.
  const lignes = texte.split(/\r?\n/).flatMap((l) => l.split(/\s[!|]\s?/)).map(normaliser).filter(Boolean);

  for (const ligne of lignes) {
    if (BOILERPLATE.some((b) => b.test(ligne))) continue;
    for (const regle of REGLES) {
      if (vus.has(regle.code)) continue;
      if (regle.exclure && regle.exclure.test(ligne)) continue;
      if (!regle.motifs.some((m) => m.test(ligne))) continue;
      const motif = regle.motifs.find((m) => m.test(ligne))!;
      let montant: number | null = null;
      if (regle.montant) {
        montant = lireMontant(
          ligne,
          regle.code === "franchise" ? /franchise\s*(?:\(\d+\))?\s*:?\s*/i : /v[ée]tust[ée]s?(?:\(s\))?\s*:?\s*/i
        );
        // « Total vétusté 0,00 € » : rien à signaler.
        if (montant === null || montant <= 0) continue;
      }
      vus.add(regle.code);
      resultat.push({
        code: regle.code,
        gravite: regle.gravite,
        libelle: regle.libelle,
        conseil: regle.conseil,
        extrait: extraitAutour(ligne, motif),
        montant,
      });
    }
  }

  // Un seul état de règlement direct : le plus précis l'emporte.
  const rd = ["reglement_direct_suspendu", "reglement_direct_reserve", "reglement_direct_non", "reglement_direct_oui"];
  const presents = rd.filter((c) => vus.has(c));
  if (presents.length > 1) {
    const garder = presents[0];
    return trier(resultat.filter((m) => !rd.includes(m.code) || m.code === garder));
  }
  // TVA : « oui » et « non » ne peuvent pas coexister — on garde le premier lu.
  if (vus.has("tva_recuperable") && vus.has("tva_non_recuperable")) {
    const premier = resultat.find((m) => m.code.startsWith("tva_"))!.code;
    return trier(resultat.filter((m) => !m.code.startsWith("tva_") || m.code === premier));
  }
  return trier(resultat);
}

const POIDS: Record<GraviteMention, number> = { danger: 0, warn: 1, info: 2 };

export function trier(mentions: MentionRapport[]): MentionRapport[] {
  return mentions.slice().sort((a, b) => POIDS[a.gravite] - POIDS[b.gravite]);
}

/** Fusionne plusieurs listes (les deux moitiés de l'analyse) sans doublon de code. */
export function fusionnerMentions(...listes: (MentionRapport[] | null | undefined)[]): MentionRapport[] {
  const parCode = new Map<string, MentionRapport>();
  for (const liste of listes) {
    for (const m of liste || []) {
      if (!m || !m.code) continue;
      const existante = parCode.get(m.code);
      // On préfère la version qui porte un extrait / un montant.
      if (!existante || (!existante.extrait && m.extrait) || (existante.montant == null && m.montant != null)) {
        parCode.set(m.code, m);
      }
    }
  }
  return trier(Array.from(parCode.values()));
}

/**
 * Bloc d'observations libre rendu par l'IA (rapport scanné) : on le garde
 * comme mention « info » SEULEMENT s'il dit quelque chose (pas un pied de
 * page, pas vide), tronqué pour l'affichage.
 */
export function mentionObservations(texte: string | null | undefined): MentionRapport | null {
  const t = (texte || "").replace(/\s+/g, " ").trim();
  if (t.length < 12) return null;
  if (BOILERPLATE.some((b) => b.test(t)) && t.length < 140) return null;
  return {
    code: "observations",
    gravite: "info",
    libelle: "Observations de l'expert",
    conseil: "Lis ces observations avant de facturer : elles peuvent contenir une condition (accord, pièces, délai).",
    extrait: t.length > 400 ? t.slice(0, 397) + "…" : t,
    montant: null,
  };
}

/** Relit une valeur jsonb (dossiers.mentions_rapport) de façon tolérante. */
export function mentionsDepuisJson(brut: unknown): MentionRapport[] {
  if (!Array.isArray(brut)) return [];
  return trier(
    brut
      .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === "object")
      .map((m) => ({
        code: String(m.code || ""),
        gravite: (["danger", "warn", "info"].includes(String(m.gravite)) ? m.gravite : "info") as GraviteMention,
        libelle: String(m.libelle || m.code || "Mention particulière"),
        conseil: String(m.conseil || ""),
        extrait: m.extrait ? String(m.extrait) : null,
        montant: typeof m.montant === "number" ? m.montant : null,
      }))
      .filter((m) => m.code)
  );
}

/** Mentions qui BLOQUENT la facturation / les travaux (affichées en rouge). */
export function mentionsBloquantes(mentions: MentionRapport[] | null | undefined): MentionRapport[] {
  return (mentions || []).filter((m) => m.gravite === "danger");
}

/** Résumé court pour un badge ou une infobulle : « Conservatoire · VGE ». */
export function resumeMentions(mentions: MentionRapport[] | null | undefined, max = 2): string {
  const l = (mentions || []).filter((m) => m.gravite !== "info");
  if (l.length === 0) return "";
  const courts: Record<string, string> = {
    conservatoire: "Conservatoire",
    sursis: "Sursis travaux",
    vge: "VGE",
    vei: "VEI",
    pec_non: "PEC refusée",
    rapport_provisoire: "Provisoire",
    reglement_direct_suspendu: "RD suspendu",
    reglement_direct_reserve: "RD sous réserve",
    reglement_direct_non: "Sans RD",
    accord_reparateur_non: "Sans accord réparateur",
    franchise: "Franchise",
    vetuste: "Vétusté",
  };
  const noms = l.map((m) => courts[m.code] || m.libelle);
  return noms.slice(0, max).join(" · ") + (noms.length > max ? ` +${noms.length - max}` : "");
}
