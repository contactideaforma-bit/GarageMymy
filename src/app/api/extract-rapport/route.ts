import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { DelaiDepasse, avecDelai } from "@/lib/delai";
import { appliquerRegles, blocRegles } from "@/lib/apprentissage";
import { IaRegle } from "@/lib/types";
import { estPosteMo } from "@/lib/documents";
import { texteDuPdf } from "@/lib/pdfTexte";
import { lireChiffrageGrille } from "@/lib/chiffrageGrille";
import { detecterMentions, fusionnerMentions, mentionObservations } from "@/lib/mentionsRapport";

export const runtime = "nodejs";
export const maxDuration = 60;

// On coupe NOUS-MÊMES avant la limite de la plateforme : au-delà, Vercel tue
// la fonction et renvoie une PAGE HTML d'erreur — le navigateur affichait
// alors « Unexpected token 'A', "An error o"… is not valid JSON ».
const BUDGET_MS = 50_000;

/* ==================================================================
 *  ANALYSE EN DEUX APPELS (v6.9)
 *
 *  Le temps d'une analyse est dominé par les TOKENS DE SORTIE : sur un
 *  rapport scanné, extraire d'un coup les identités ET les 30-60 lignes de
 *  chiffrage dépassait systématiquement les 60 s de la fonction serverless.
 *
 *  Le navigateur lance donc DEUX requêtes EN PARALLÈLE :
 *    - ?partie=identite  → véhicule, client, assurance, expert (sortie courte)
 *    - ?partie=chiffrage → montant, TVA et les lignes (sortie compacte)
 *  Deux requêtes = deux invocations = DEUX budgets de 60 s, et chacune produit
 *  deux fois moins de texte. Si l'une échoue, l'autre reste exploitable
 *  (analyse partielle plutôt qu'échec total).
 *
 *  ?partie=complet reste disponible (compatibilité / usage hors navigateur).
 * ================================================================== */

const REGLES_COMMUNES = `Le document peut être un SCAN (pages en images) : lis-le tel quel, ne commente jamais la qualité de l'image.
Réponds UNIQUEMENT par le JSON demandé, en COMPACT (aucun espace ni retour à la ligne superflu, aucun bloc markdown, aucun commentaire).
Dates au format AAAA-MM-JJ. Nombres sans symbole ni espace, point décimal (ex: 2450.50). N'invente rien : null si absent.
Si un bloc « TEXTE EXACT DU RAPPORT » t'est fourni, c'est LA source : recopie les libellés et les chiffres DEPUIS CE TEXTE, caractère par caractère. L'image du PDF ne sert qu'à comprendre la mise en page. Dans un tableau en grille, une valeur appartient à la colonne dont l'en-tête est aligné verticalement avec elle DANS CE TEXTE — compte les espaces, ne juge pas à l'œil.`;

const PROMPT_IDENTITE = `Tu es un assistant pour une carrosserie. On te fournit un RAPPORT D'EXPERTISE automobile.
Extrais UNIQUEMENT les informations d'identité (PAS le chiffrage, PAS la liste des pièces) et renvoie cet objet JSON :

{
"immatriculation":string|null,
"marque_modele":string|null,
"numero_serie":string|null,
"premiere_circulation":string|null,
"date_sinistre":string|null,
"numero_sinistre":string|null,
"cabinet_expert":string|null,
"cabinet_adresse":string|null,
"cabinet_tel":string|null,
"cabinet_email":string|null,
"expert_nom":string|null,
"expert_tel":string|null,
"expert_email":string|null,
"date_expertise":string|null,
"numero_police":string|null,
"assureur":string|null,
"assureur_adresse":string|null,
"assureur_tel":string|null,
"assureur_email":string|null,
"client_nom":string|null,
"client_email":string|null,
"client_tel":string|null,
"client_adresse":string|null,
"client_code_postal":string|null,
"client_ville":string|null,
"observations":string|null,
"mentions_particulieres":string[]
}

Où chercher :
- CABINET D'EXPERTISE : coordonnées presque toujours dans l'EN-TÊTE (logo/adresse en haut).
  L'expert en charge est signalé par "Vu par", "Expert :" ou la signature.
- ASSURANCE : bloc "MANDANT" (nom + adresse, parfois tél/fax).
- CLIENT : bloc "ASSURÉ" ou "LÉSÉ" (nom, adresse, CP, ville, tél, email).
- ATTENTION : le bloc "RÉPARATEUR" est le GARAGE — ne le mets nulle part.
  L'adresse du cabinet n'est pas celle de l'assurance.
- Téléphones gardés tels quels (ex: 04 69 42 01 80).
- "observations" = le texte du bloc « OBSERVATIONS » / « COMMENTAIRES » / « CONCLUSIONS »
  de l'expert, recopié tel quel (300 caractères max, null si absent). Ignore les
  mentions de pied de page communes à tous les rapports (« ne constitue en aucun cas
  un ordre de réparation », « sous réserve de garanties »).
- "mentions_particulieres" = liste (peut être vide) des mentions qui changent la conduite
  du dossier, recopiées TELLES QUELLES depuis le rapport : « expertise à titre
  conservatoire », « sursis à travaux », « procédure VGE », « véhicule économiquement
  irréparable », « règlement direct : non / suspendu / sous réserve », « TVA ouvrant
  droit : oui », « franchise … € », « vétusté … », « rapport provisoire », « accord
  réparateur : non », « prise en charge : non ». Rien d'autre.

${REGLES_COMMUNES}`;

const PROMPT_CHIFFRAGE = `Tu es un assistant pour une carrosserie. On te fournit un RAPPORT D'EXPERTISE automobile.
Extrais UNIQUEMENT le CHIFFRAGE (aucune information d'identité) et renvoie cet objet JSON :

{"montant":number|null,"tva":number|null,"recap":{"mo":number|null,"pieces":number|null,"ingredients":number|null,"total":number|null},"l":[[designation,quantite,prix_unitaire,remise,categorie],...]}

CE QUE TU PRODUIS DEVIENT UNE FACTURE, telle quelle, sans relecture ligne à ligne.
La facture reprend le rapport en TROIS tableaux, et rien d'autre :
  "p" → tableau 1 « Pièces, fournitures & prestations » (Désignation / Qté / PU HT / Remise / Total HT) ;
  "m" → tableau 2 « Main d'œuvre & peinture », LISTE FERMÉE : T1, T2, T3, Peinture, Ingrédients de peinture ;
  "a" → tableau 3 « Autres éléments retenus au rapport ».
Une ligne oubliée, un taux recalculé « au jugé » ou une remise confondue avec une
vétusté produisent une facture FAUSSE envoyée à l'assurance. Dans le doute :
recopie le rapport, ne l'interprète pas, n'arrondis rien, n'invente aucune ligne.

- "montant" = total des réparations HT ; "tva" = taux en % (ex: 20), null si absent.
- Chaque ligne est un TABLEAU de 5 valeurs, dans cet ordre exact :
  [designation:string, quantite:number, prix_unitaire:number, remise:number, categorie:"m"|"p"|"a"]
  Ce format court est OBLIGATOIRE (il divise par deux la longueur de ta réponse).
- categorie "m" = LISTE FERMÉE : UNIQUEMENT T1, T2, T3, Peinture et Ingrédients de
  peinture. Rien d'autre ne prend "m" — une main d'œuvre générique, de la tôlerie,
  un forfait ou une prestation annexe prennent "a". Les pièces prennent "p".

⚠️ LES RAPPORTS N'ONT PAS TOUS LA MÊME MISE EN PAGE. Repère D'ABORD le format
du chiffrage, puis applique la règle correspondante. Ne suppose jamais qu'un
tableau absent n'existe pas : cherche-le sous une autre forme.

1. POSTES DE MAIN D'ŒUVRE ("m") — DEUX MISES EN PAGE POSSIBLES.

   FORMAT A — un tableau EN LIGNES (bloc « CONCLUSIONS », cabinets Adenes /
   Roadia…), colonnes « Postes / Temps / Taux Hor. / Total HT », une ligne par
   poste (T1, T2, T3, Peinture, Ingrédients (MV), Ingr.) :
   → quantite = colonne « Temps » ; prix_unitaire = colonne « Taux Hor. ».

   FORMAT B — une GRILLE / MATRICE (BCA, Allianz, Stelliant…) : les POSTES sont
   des COLONNES (T1, T2, T3, TP) et les natures de travaux sont des LIGNES
   (« Dép. Chgt. Contrôle », « Redressage », « Remplacement », « Tôlerie »,
   « Sellerie »…), avec une ligne « Taux horaires » et parfois une ligne
   « Forfait ». Exemple RÉEL, à savoir lire :

        PUB                     T1       T2       T3       TP
        Dép. Chgt. Contrôle    6,00                       9,00
        Redressage                      0,50
        Taux horaires        120,00   120,00   120,00   120,00
        Forfait                        20,00

   → pour CHAQUE colonne de poste : quantite = SOMME des heures de la colonne
     (toutes les lignes de travaux confondues), prix_unitaire = le taux de la
     ligne « Taux horaires » DE CETTE COLONNE.
     Sur cet exemple, tu dois produire EXACTEMENT :
       ["T1", 6, 120, 0, "m"]  et  ["T2", 0.5, 120, 0, "m"]  et  ["Peinture", 9, 120, 0, "m"]
     Une colonne SANS heure (ici T3) ne produit AUCUNE ligne.
   → « TP », « T.P. », « T Peinture », « Peint. » = le poste PEINTURE. La
     designation que tu renvoies est « Peinture » — JAMAIS « TP ».
   → la case « Forfait » d'une grille est un MONTANT EN EUROS, pas des heures :
     elle totalise les lignes « F » (forfait MO) du tableau des libellés. Ne la
     transforme pas en poste et ne la compte pas deux fois.

   INGRÉDIENTS DE PEINTURE : souvent donnés dans le récapitulatif sous la forme
   « Ingredients peinture HT   <taux>   <total> » (ex. : 115,00 puis 1035,00).
   → prix_unitaire = le TAUX (115,00) ; quantite = total ÷ taux (1035 ÷ 115 = 9),
     qui doit tomber sur le temps de peinture ; designation = « Ingrédients de
     peinture ». Le taux des ingrédients DIFFÈRE de celui de la peinture : lis-le,
     ne le recopie pas.

   RECOPIE les heures et les taux tels quels. Ne les recalcule JAMAIS depuis un
   total. Vérifie poste par poste : quantite × prix_unitaire = le montant imprimé.

2. PIÈCES ET OPÉRATIONS ("p") — EXHAUSTIVITÉ ABSOLUE.
   Le tableau des libellés porte selon les cabinets les colonnes
   « N° / Act / Libellé / Prix (HT) / Q / T » ou
   « Qté ! Libellé ! Réf. Constr. ! Opé. ! Mnt HT ! %Vét. ! %Rem. ! TVA ».
   Extrais TOUTES les lignes, dans l'ordre du rapport, SANS AUCUNE EXCEPTION :
   - designation = le libellé complet (recolle les libellés coupés sur deux
     lignes) + le code opération entre parenthèses s'il est dans une colonne
     séparée, ex. « PORTE AR D (R P) » ;
   - quantite = colonne Q / Qté (1 si la colonne est vide) ;
   - prix_unitaire = « Prix (HT) », ou « Mnt HT » ÷ quantite ;
   - ⚠️⚠️ COLONNE DE PRIX VIDE → prix_unitaire = 0, ET LA LIGNE EST EXTRAITE
     QUAND MÊME. Ce sont les opérations de peinture, de remise en état, de
     dépose/repose (Act = P, R, D, T, G) dont le coût est DÉJÀ dans les heures
     de main d'œuvre. Exemples réels à ne surtout pas perdre :
       « AILE AV G PEINTURE S3 G », « AILE AV G REMISE EN ETAT G »,
       « AILE AR G SECTION CENTRALE PEINTURE S2 G »,
       « POIGNEE EXTERIEURE DE PORTE AV G PEINTURE S2 G », « PEC peinture ».
     Les omettre est l'erreur la PLUS visible pour le garage : la facture ne
     décrit plus le travail réellement fait. Compte tes lignes : tu dois en
     avoir autant que le rapport.
   - remise = colonne « %Rem. » (0 si vide). NE CONFONDS PAS avec « %Vét. »
     (vétusté) : la vétusté n'est PAS une remise, ignore-la. Si le montant est
     déjà net de remise, mets 0.
   - une ligne dont le code opération est « F » (forfait MO, ex. « AGRAFES /
     VISSERIE », « ENLEVEMENT DECHET ») prend la catégorie "a", avec son prix.

3. AUTRES ("a") : forfaits, petites fournitures, frais de gestion, recyclage,
   enlèvement des déchets, calibrage, géométrie, produits divers, ingrédients
   autres que peinture.

4. RÉCAPITULATIF — remplis "recap" ET sers-t'en pour te corriger.
   La plupart des rapports impriment les sous-totaux : « Main d'oeuvre HT »,
   « Pièces HT », « Ingredients peinture HT », « Total HTVA » ou « Montant
   réparation HTVA ». Renseigne-les dans "recap" tels qu'ils sont imprimés
   (null si absent), puis VÉRIFIE, vraiment, dans cet ordre :
   a) somme de tes postes "m" HORS ingrédients + tes forfaits « F » = « Main
      d'oeuvre HT » ;
   b) somme de tes lignes "p" = « Pièces HT » ;
   c) ta ligne d'ingrédients = « Ingredients peinture HT » ;
   d) somme de TOUTES tes lignes = « Total HTVA », à ±1 € près.
   Un sous-total qui ne tombe pas veut dire : une colonne de poste oubliée, une
   pièce manquante, ou un forfait compté deux fois. NE RENDS PAS ta réponse —
   reprends la lecture, corrige, recompte.

5. NE COMPTE PAS DEUX FOIS : si le récapitulatif donne un total « Pièces » ET
   que le détail des pièces existe, n'extrais QUE le détail. Sans détail :
   ["Pièces selon rapport d'expertise",1,montant_pieces,0,"p"].

6. "montant" = le total HORS TAXES des réparations (« Total HTVA », « Montant
   réparation HTVA », « TOTAL HT »). JAMAIS un montant TTC : si le rapport
   n'affiche qu'un TTC en haut de page (ex. « Montant réparat. : 6010 TTC »),
   ignore-le et prends le HT du récapitulatif.
   Si le rapport ne donne qu'un montant global : [["Réparations selon rapport d'expertise",1,montant_global,0,"p"]].
   Si aucun montant : "l":[].

${REGLES_COMMUNES}`;

// Mode « complet » : conservé pour un usage hors navigateur (script, test).
// L'application, elle, appelle TOUJOURS les deux moitiés en parallèle.
const PROMPT_COMPLET = `${PROMPT_IDENTITE.replace(
  "Extrais UNIQUEMENT les informations d'identité (PAS le chiffrage, PAS la liste des pièces) et renvoie cet objet JSON :",
  "Extrais les informations d'identité ET le chiffrage, et renvoie cet objet JSON :"
)}

Ajoute dans le MÊME objet les clés du chiffrage :
"montant":number|null,"tva":number|null,"recap":{"mo":number|null,"pieces":number|null,"ingredients":number|null,"total":number|null},"l":[[designation,quantite,prix_unitaire,remise,"m"|"p"|"a"],...]

${PROMPT_CHIFFRAGE.replace(
  "Extrais UNIQUEMENT le CHIFFRAGE (aucune information d'identité) et renvoie cet objet JSON :",
  "Règles du chiffrage :"
)}`;

type Partie = "identite" | "chiffrage" | "complet";

const CATEGORIES: Record<string, string> = { m: "mo", p: "piece", a: "autre" };

type LigneExtraite = {
  designation: string;
  quantite: number;
  prix_unitaire: number;
  remise: number;
  categorie: string;
};

// Le format court [designation, qte, pu, remise, cat] revient au format
// attendu par l'application (lib/documents.ts).
function developperLignes(brut: unknown): LigneExtraite[] {
  if (!Array.isArray(brut)) return [];
  return brut
    .map((l): LigneExtraite | null => {
      if (Array.isArray(l)) {
        return {
          designation: String(l[0] ?? "Prestation"),
          quantite: Number(l[1]) || 0,
          prix_unitaire: Number(l[2]) || 0,
          remise: Number(l[3]) || 0,
          categorie: CATEGORIES[String(l[4] || "p")] || "piece",
        };
      }
      // Tolérance : si le modèle renvoie quand même des objets détaillés.
      if (l && typeof l === "object") {
        const o = l as Record<string, unknown>;
        const cat = String(o.categorie ?? "piece");
        return {
          designation: String(o.designation ?? "Prestation"),
          quantite: Number(o.quantite) || 0,
          prix_unitaire: Number(o.prix_unitaire) || 0,
          remise: Number(o.remise) || 0,
          categorie: CATEGORIES[cat] || (["piece", "mo", "autre"].includes(cat) ? cat : "piece"),
        };
      }
      return null;
    })
    .filter((l): l is LigneExtraite => l !== null)
    // FILET DE SÉCURITÉ (v8.8) : le tableau « Main d'œuvre » est une LISTE
    // FERMÉE (T1, T2, T3, Peinture, Ingrédients de peinture). Le prompt le dit,
    // mais un modèle peut s'en écarter — on le corrige ici, à la source, plutôt
    // que de laisser une tôlerie ou un forfait polluer le tableau des postes.
    .map((l) =>
      l.categorie === "mo" && !estPosteMo(l.designation)
        ? { ...l, categorie: "autre" }
        : l
    );
}

const centimes = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * CONTRÔLE DE COHÉRENCE (v7.7) — la somme des lignes extraites doit retomber
 * sur le TOTAL HT du rapport. C'est LE garde-fou contre une facture fausse :
 * on ne corrige rien automatiquement (l'humain tranche), mais on le dit.
 *
 * Effet de bord utile : si le modèle n'a pas su lire le total global alors
 * qu'il a lu le détail, on renseigne le montant depuis la somme des lignes —
 * sinon le dossier partait avec un montant vide et plus aucun contrôle.
 */
/** Sous-totaux imprimés dans le récapitulatif du rapport. */
type Recap = {
  mo?: unknown;
  pieces?: unknown;
  ingredients?: unknown;
  total?: unknown;
};

const nombreOuNull = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? centimes(n) : null;
};

const totalLignes = (lignes: LigneExtraite[]): number =>
  centimes(
    lignes.reduce(
      (s, l) =>
        s + l.quantite * l.prix_unitaire * (1 - Math.min(100, Math.max(0, l.remise || 0)) / 100),
      0
    )
  );

/**
 * CONTRÔLE PAR BLOC (v8.9) — le total global ne suffisait pas à dire CE QUI
 * manque. Les rapports impriment « Main d'oeuvre HT », « Pièces HT » et
 * « Ingredients peinture HT » : on confronte chaque bloc et on nomme le
 * coupable, pour que le garage sache exactement où regarder.
 *
 * ⚠️ Le sous-total « Main d'oeuvre » des rapports en grille INCLUT les
 * forfaits (lignes « F ») : on les additionne donc aux postes.
 */
function controlerBlocs(lignes: LigneExtraite[], recap: Recap | undefined): string[] {
  if (!recap) return [];
  const ecarts: string[] = [];
  const euros = (n: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

  const postes = lignes.filter((l) => l.categorie === "mo" && !/ingr/i.test(l.designation));
  const ingredients = lignes.filter((l) => l.categorie === "mo" && /ingr/i.test(l.designation));
  const pieces = lignes.filter((l) => l.categorie === "piece");
  const autres = lignes.filter((l) => l.categorie === "autre");

  const verifier = (libelle: string, calcule: number, attendu: number | null) => {
    if (attendu === null) return;
    const ecart = centimes(calcule - attendu);
    if (Math.abs(ecart) > 1) {
      ecarts.push(
        `${libelle} : ${euros(calcule)} lu contre ${euros(attendu)} au rapport (${
          ecart > 0 ? "+" : "−"
        }${euros(Math.abs(ecart))})`
      );
    }
  };

  // Main d'œuvre = postes T1/T2/T3/Peinture + forfaits, hors ingrédients.
  verifier("Main d'œuvre", totalLignes([...postes, ...autres]), nombreOuNull(recap.mo));
  verifier("Pièces", totalLignes(pieces), nombreOuNull(recap.pieces));
  verifier("Ingrédients de peinture", totalLignes(ingredients), nombreOuNull(recap.ingredients));
  return ecarts;
}

function controlerChiffrage(lignes: LigneExtraite[], montantBrut: unknown) {
  const somme = centimes(
    lignes.reduce(
      (s, l) =>
        s + l.quantite * l.prix_unitaire * (1 - Math.min(100, Math.max(0, l.remise || 0)) / 100),
      0
    )
  );
  const ref = Number(montantBrut);
  const montantConnu = Number.isFinite(ref) && ref > 0;
  const montant = montantConnu ? centimes(ref) : somme > 0 ? somme : null;
  const ecart = montantConnu ? centimes(somme - ref) : 0;
  return {
    montant,
    somme,
    ecart,
    coherent: Math.abs(ecart) <= 1,
    /** true quand le montant a été déduit de la somme des lignes. */
    montantDeduit: !montantConnu && somme > 0,
  };
}

export async function POST(req: NextRequest) {
  // SÉCURITÉ : analyse réservée aux utilisateurs connectés (crédits IA).
  const { utilisateurDepuisRequete, REPONSE_401 } = await import("@/lib/apiAuth");
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });

  // QUOTA : 15 €/mois par utilisateur (+ crédits achetés)
  const { etatQuota, enregistrerUsage, MESSAGE_QUOTA_DEPASSE } = await import("@/lib/quotaIA");
  const quota = await etatQuota(user.id);
  if (quota.depasse) {
    return NextResponse.json({ error: MESSAGE_QUOTA_DEPASSE }, { status: 402 });
  }

  // MÉMOIRE DE L'ANALYSE : les règles apprises des corrections du garage
  // sont ajoutées au prompt ET appliquées aux lignes extraites (v7.7).
  let regles: IaRegle[] = [];
  try {
    const { chargerReglesServeur } = await import("@/lib/apprentissageServeur");
    regles = await chargerReglesServeur(user.id);
  } catch {
    /* mémoire indisponible : on analyse sans */
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Clé ANTHROPIC_API_KEY manquante. Ajoute-la dans .env.local (et sur Vercel)." },
      { status: 500 }
    );
  }

  const partieBrute = req.nextUrl.searchParams.get("partie") || "complet";
  const partie: Partie =
    partieBrute === "identite" || partieBrute === "chiffrage" ? partieBrute : "complet";

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 15 Mo)." }, { status: 413 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const base64 = bytes.toString("base64");
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    // maxRetries VOLONTAIREMENT BAS : chaque nouvelle tentative consomme le
    // budget de la fonction serverless.
    const client = new Anthropic({ apiKey, maxRetries: 1 });
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

    const documentBlock = isPdf
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: file.type || "image/jpeg",
            data: base64,
          },
        };

    const base =
      partie === "identite" ? PROMPT_IDENTITE : partie === "chiffrage" ? PROMPT_CHIFFRAGE : PROMPT_COMPLET;
    // Les règles apprises ne concernent que le chiffrage (libellés, tableaux,
    // taux) : inutile d'alourdir le prompt d'identité avec.
    const prompt = partie === "identite" ? base : base + blocRegles(regles);

    // Le bloc "document" (PDF) n'est pas encore typé dans certaines versions du SDK,
    // mais l'API l'accepte : on contourne le typage via un cast.
    // CALQUE TEXTE (v9.0) — LA correction des « factures fausses ».
    //
    // Envoyé seul, le PDF est lu comme une IMAGE : le modèle devait deviner
    // visuellement quelle valeur se trouve sous quelle colonne. Sur les
    // rapports en grille (BCA), il ratait T1 et T2 et le total tombait faux.
    // On joint donc le TEXTE EXACT du PDF, colonnes reconstituées à partir
    // des coordonnées de chaque fragment. Le modèle n'a plus rien à deviner.
    //
    // Un scan (aucun calque texte) renvoie une chaîne vide : on retombe alors
    // sur la lecture de l'image, comme avant.
    const calqueTexte = isPdf ? texteDuPdf(bytes) : "";
    // ================================================================
    //  LECTURE DÉTERMINISTE D'ABORD (v9.1)
    //
    //  Les rapports en GRILLE (BCA/Allianz) ont une mise en page
    //  parfaitement régulière : à partir du calque texte, les colonnes
    //  T1/T2/T3/TP sont des positions de caractères. On les lit EN CODE,
    //  et on ne retient le résultat QUE s'il retombe sur le total imprimé
    //  par le rapport. Quand ça marche, on n'appelle même pas l'IA :
    //  c'est exact, instantané et gratuit. Sinon, l'analyse IA reprend.
    // ================================================================
    if (partie === "chiffrage" && calqueTexte) {
      const grille = lireChiffrageGrille(calqueTexte);
      if (grille) {
        const brutes = grille.lignes.map((l) => ({
          designation: l.designation,
          quantite: l.quantite,
          prix_unitaire: l.prix_unitaire,
          remise: l.remise,
          categorie: l.categorie as string,
        }));
        const { lignes, appliquees } = appliquerRegles(brutes, regles);
        const controle = controlerChiffrage(lignes, grille.montant);
        return NextResponse.json({
          data: {
            montant: grille.montant,
            tva: grille.tva,
            lignes,
            regles_appliquees: appliquees,
            controle: {
              ...controle,
              blocs: controlerBlocs(lignes, {
                mo: grille.recap.mo,
                pieces: grille.recap.pieces,
                ingredients: grille.recap.ingTotal,
                total: grille.recap.total,
              }),
              source: "grille" as const,
            },
            // MENTIONS PARTICULIÈRES (v11.2) : lues dans le calque texte,
            // sans IA — renvoyées aussi ici pour que « Relire le rapport »
            // les rafraîchisse sur un dossier ancien.
            mentions: detecterMentions(calqueTexte),
          },
          partie,
        });
      }
    }

    const blocTexte = calqueTexte
      ? [
          {
            type: "text",
            text:
              "TEXTE EXACT DU RAPPORT (extrait du calque texte du PDF, colonnes et " +
              "alignements conservés). IL FAIT FOI pour TOUS les libellés et TOUS les " +
              "chiffres : lis-les ici, caractère par caractère. L'image du PDF ne sert " +
              "qu'à comprendre la mise en page (cadres, regroupements).\n" +
              "Dans un tableau en grille, la valeur appartient à la colonne dont " +
              "l'en-tête est ALIGNÉ VERTICALEMENT avec elle dans ce texte.\n\n" +
              "-----DÉBUT DU TEXTE DU RAPPORT-----\n" +
              calqueTexte +
              "\n-----FIN DU TEXTE DU RAPPORT-----",
          },
        ]
      : [];

    const content = [
      documentBlock,
      ...blocTexte,
      { type: "text", text: prompt },
    ] as unknown as Anthropic.MessageParam["content"];

    // Sortie plafonnée selon la partie : les identités tiennent largement en
    // 1200 tokens, inutile de laisser la porte ouverte à une réponse bavarde.
    const maxTokens = partie === "identite" ? 1500 : 6000;

    const message = await avecDelai(
      client.messages.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content }],
      }),
      BUDGET_MS
    );

    // Comptabilise la consommation (tokens réels de l'appel)
    await enregistrerUsage(user.id, message.usage?.input_tokens || 0, message.usage?.output_tokens || 0);

    const textPart = message.content.find((c) => c.type === "text");
    const raw = textPart && "text" in textPart ? textPart.text : "";

    // Récupère le JSON même s'il est entouré de texte
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json(
        { error: "Extraction impossible : réponse non exploitable.", raw: raw.slice(0, 400) },
        { status: 422 }
      );
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      // Réponse tronquée (limite de tokens atteinte sur un très gros chiffrage)
      return NextResponse.json(
        {
          error:
            "Le chiffrage du rapport est trop volumineux pour être lu d'un seul tenant. " +
            "Envoie séparément la page des conclusions et celle de la liste des pièces, " +
            "ou complète les lignes à la main dans le devis.",
        },
        { status: 422 }
      );
    }

    // Format court → format applicatif, puis application des règles apprises
    // (libellés et tableau d'affectation UNIQUEMENT — jamais les montants).
    if (data.l !== undefined) {
      const brutes = developperLignes(data.l);
      const { lignes, appliquees } = appliquerRegles(brutes, regles);
      data.lignes = lignes;
      data.regles_appliquees = appliquees;
      delete data.l;

      // Le total des lignes doit retomber sur le total HT du rapport.
      // Le récapitulatif sert de repli quand « montant » n'a pas été lu, et
      // de grille de diagnostic bloc par bloc.
      const recap = (data as { recap?: Recap }).recap;
      const reference = data.montant ?? (recap ? nombreOuNull(recap.total) : null);
      const controle = controlerChiffrage(lignes, reference);
      if (controle.montant != null) data.montant = controle.montant;
      data.controle = { ...controle, blocs: controlerBlocs(lignes, recap) };
      delete (data as { recap?: Recap }).recap;
    }

    // ================================================================
    //  MENTIONS PARTICULIÈRES (v11.2)
    //  Deux sources fusionnées : la lecture DÉTERMINISTE du calque texte
    //  (fiable, gratuite) et, pour les scans sans calque, le bloc
    //  d'observations + la liste rendue par le modèle, repassés dans le
    //  même détecteur (mêmes codes, mêmes conseils). Le texte libre des
    //  observations est conservé en mention « info » quand il dit
    //  quelque chose.
    // ================================================================
    if (partie !== "chiffrage" || calqueTexte) {
      const obs = typeof data.observations === "string" ? data.observations : "";
      const listeIa = Array.isArray(data.mentions_particulieres)
        ? (data.mentions_particulieres as unknown[]).map((m) => String(m ?? "")).join("\n")
        : "";
      const mentions = fusionnerMentions(
        detecterMentions(calqueTexte),
        detecterMentions(obs),
        detecterMentions(listeIa),
        // Sans calque texte, la liste IA fait foi même si aucun motif connu ne
        // matche : on l'affiche telle quelle en avertissement.
        !calqueTexte && listeIa
          ? listeIa
              .split("\n")
              .map((t) => t.trim())
              .filter((t) => t.length > 3)
              .slice(0, 6)
              .map((t, i) => ({
                code: `ia_${i}`,
                gravite: "warn" as const,
                libelle: "Mention relevée par l'analyse",
                conseil: "Vérifie cette mention dans le rapport avant de facturer ou d'engager les travaux.",
                extrait: t.slice(0, 200),
                montant: null,
              }))
          : [],
        (() => {
          const o = mentionObservations(obs);
          return o ? [o] : [];
        })()
      );
      data.mentions = mentions;
    }
    delete data.observations;
    delete data.mentions_particulieres;

    return NextResponse.json({ data, partie });
  } catch (err: unknown) {
    if (err instanceof DelaiDepasse) {
      return NextResponse.json(
        {
          error:
            partie === "chiffrage"
              ? "Le chiffrage n'a pas pu être lu dans le temps imparti (rapport scanné ou très détaillé). " +
                "Les informations du dossier, elles, ont pu être récupérées : complète le montant et les " +
                "lignes à la main, ou réessaie l'analyse."
              : "L'analyse a pris trop de temps et a été interrompue. Réessaie une fois — souvent ça passe —, " +
                "sinon n'envoie que les pages utiles (conclusions + liste des pièces), ou saisis le dossier à la main.",
        },
        { status: 504 }
      );
    }
    const anyErr = err as { status?: number; message?: string };
    const status = anyErr?.status;
    const overloaded =
      status === 529 ||
      status === 429 ||
      (typeof anyErr?.message === "string" && anyErr.message.toLowerCase().includes("overloaded"));
    if (overloaded) {
      return NextResponse.json(
        {
          error:
            "Le service d'analyse IA est momentanément surchargé. Réessaie dans quelques secondes.",
        },
        { status: 503 }
      );
    }
    const msg = err instanceof Error ? err.message : "Erreur d'extraction.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
