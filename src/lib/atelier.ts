// Helpers Atelier : ordre de réparation & PV de restitution.

export function genNumeroOR(): string {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  // Suffixe élargi (cf. genNumero de documents.ts) : l'ancien slice(-5)
  // bouclait toutes les 100 s → risque de numéros dupliqués.
  const alea = String(Math.floor(Math.random() * 100)).padStart(2, "0");
  return `OR-${ym}-${String(Date.now()).slice(-7)}${alea}`;
}

export const STATUTS_ATELIER: Record<string, { label: string; badge: string }> = {
  brouillon: { label: "Généré", badge: "bg-slate-100 text-slate-700" },
  signe: { label: "Signé", badge: "bg-emerald-100 text-emerald-700" },
};

export function labelStatutAtelier(s: string): string {
  return STATUTS_ATELIER[s]?.label || s;
}
export function badgeStatutAtelier(s: string): string {
  return STATUTS_ATELIER[s]?.badge || "bg-slate-100 text-slate-700";
}

// Texte d'autorisation imprimé sur l'ordre de réparation (v13.22 : étoffé —
// essais, démontage, mandat auprès de l'expert et de l'assureur, propriété,
// pièces, exécution immédiate). Signé, il vaut acceptation des conditions.
export const AUTORISATION_OR =
  "Je soussigné(e), client(e) désigné(e) ci-dessus, déclare être propriétaire du véhicule mentionné " +
  "ou dûment mandaté(e) par son propriétaire, et donne ordre au réparateur d'effectuer les travaux " +
  "décrits, ainsi que les démontages, contrôles et essais routiers nécessaires à leur bonne exécution " +
  "et à l'expertise. J'autorise le réparateur à échanger en mon nom avec l'expert et l'assureur " +
  "(transmission du présent ordre, des photos, du chiffrage et des pièces du dossier) et à solliciter " +
  "l'accord de réparation. Tout travail supplémentaire non prévu fera l'objet de mon accord préalable. " +
  "Je reconnais avoir pris connaissance des conditions ci-dessus, les accepte, et demande expressément " +
  "que les travaux commencent sans attendre l'expiration d'un éventuel délai de rétractation.";

/* ==================================================================
 *  CONDITIONS GÉNÉRALES DE L'ORDRE DE RÉPARATION (v13.22)
 *
 *  L'OR n'est plus un simple « bon pour accord » : c'est le contrat qui
 *  protège le garage sur les points où les litiges naissent — travaux
 *  supplémentaires, délais, franchise et TVA, pièces, garde du véhicule,
 *  gardiennage, rétractation à distance, mandat auprès de l'expert.
 *  Les textes sont adaptés au dossier (montant, tarif de gardiennage,
 *  pièces choisies…) et FIGÉS par version sur chaque OR signé.
 * ================================================================== */
export const CONDITIONS_OR_VERSION = 1;

export type ConditionOR = { numero: number; titre: string; texte: string };

export const LIBELLE_PIECES: Record<string, string> = {
  neuves: "pièces neuves d'origine constructeur",
  equivalentes: "pièces neuves de qualité équivalente (art. R.224-22 et suiv. du Code de la consommation)",
  reemploi: "pièces issues de l'économie circulaire (réemploi) lorsqu'elles sont disponibles et compatibles",
};

export const LIBELLE_CARBURANT = ["réserve", "1/4", "1/2", "3/4", "plein"];

export function conditionsOR(opts: {
  garage?: string | null;
  gardiennageJour?: number | null;
  delaiGratuitJours?: number | null;
  piecesChoix?: string | null;
  piecesRestituees?: boolean | null;
  mediateur?: string | null;
  ville?: string | null;
  estVitrage?: boolean;
  rapportRef?: string | null; // « rapport d'expertise n° … du … »
}): ConditionOR[] {
  const garage = opts.garage || "le réparateur";
  const gard = opts.gardiennageJour && opts.gardiennageJour > 0 ? `${opts.gardiennageJour} € TTC par jour` : "au tarif affiché au garage";
  const delaiGratuit = opts.delaiGratuitJours ?? 8;
  const pieces = LIBELLE_PIECES[opts.piecesChoix || ""] || LIBELLE_PIECES.neuves;
  const ref = opts.rapportRef ? ` (${opts.rapportRef})` : "";
  const travaux = opts.estVitrage ? "l'intervention" : "les travaux";
  const out: ConditionOR[] = [
    {
      numero: 1,
      titre: "Objet et étendue des travaux",
      texte:
        `Le présent ordre couvre exclusivement ${travaux} décrits ci-dessus, établis d'après le chiffrage de l'expert${ref} ou le devis accepté. ` +
        "Les dommages non visibles ou l'aggravation constatée au démontage donnent lieu à un chiffrage complémentaire soumis à l'accord préalable du client " +
        "(et de l'expert le cas échéant) ; un accord donné par email ou SMS vaut accord écrit. Sans réponse du client sous 5 jours ouvrés, le véhicule est remonté en l'état et les frais engagés restent dus.",
    },
    {
      numero: 2,
      titre: "Prix et règlement",
      texte:
        "Le montant indiqué est exprimé hors taxes, conforme au chiffrage retenu ; la facture définitive détaille les pièces, la main-d'œuvre, la peinture et la TVA. " +
        `Le règlement est dû à la restitution du véhicule. Lorsque l'assureur règle directement ${garage} (prise en charge, cession de créance), le client reste redevable de la franchise, ` +
        "de la vétusté, de la TVA non prise en charge et de tout montant refusé ou réduit par l'assureur, quel qu'en soit le motif. " +
        "Toute somme impayée à l'échéance porte intérêts au taux légal (majoré et assorti de l'indemnité forfaitaire de 40 € de recouvrement pour les professionnels, art. L.441-10 du Code de commerce).",
    },
    {
      numero: 3,
      titre: "Délais",
      texte:
        "Les dates de début et de fin sont indicatives. Elles sont prolongées de plein droit en cas d'attente de pièces, d'accord de l'expert ou de l'assureur, de contre-visite, de travaux complémentaires ou de force majeure, sans indemnité. " +
        `${garage} informe le client de tout décalage significatif.`,
    },
    {
      numero: 4,
      titre: "Pièces",
      texte:
        `Sauf mention contraire, les pièces posées sont des ${pieces}. Conformément à l'art. L.224-67 du Code de la consommation, le client a été informé de la possibilité d'opter pour des pièces de réemploi pour certaines catégories. ` +
        (opts.piecesRestituees
          ? "Le client a demandé la restitution des pièces remplacées : elles lui sont remises à la restitution du véhicule, à l'exception des pièces soumises à échange standard, consigne, garantie constructeur ou conservées à la demande de l'expert."
          : "Les pièces remplacées sont tenues à la disposition du client jusqu'à la restitution du véhicule, puis éliminées selon la filière réglementaire, à l'exception de celles conservées à la demande de l'expert."),
    },
    {
      numero: 5,
      titre: "Prise en charge et garde du véhicule",
      texte:
        "L'état du véhicule à la prise en charge est celui constaté ci-dessus et sur les photos d'état d'entrée, qui font foi entre les parties. " +
        `${garage} est responsable du véhicule en qualité de dépositaire (art. 1927 et suivants du Code civil), à l'exclusion des dommages résultant d'un vice propre, de l'usure, d'une aggravation du sinistre initial, ou d'un cas de force majeure. ` +
        "Les objets, effets et valeurs laissés à bord ne sont pas couverts ; le client est invité à les retirer. Les essais routiers nécessaires sont réalisés sous la responsabilité du réparateur.",
    },
    {
      numero: 6,
      titre: "Restitution et gardiennage",
      texte:
        `Le véhicule est tenu à disposition dès la notification de fin des travaux (appel, SMS ou email). Passé un délai de ${delaiGratuit} jours calendaires après cette notification, des frais de gardiennage de ${gard} sont dus. ` +
        "La restitution donne lieu à un procès-verbal signé ; toute réserve non mentionnée à ce moment ne pourra être invoquée ultérieurement, hors défaut caché.",
    },
    {
      numero: 7,
      titre: "Droit de rétractation (ordre signé à distance)",
      texte:
        "Lorsque le présent ordre est signé à distance (lien de signature) ou hors établissement, le client consommateur dispose d'un délai de rétractation de 14 jours (art. L.221-18 du Code de la consommation). " +
        "En signant, il demande expressément que les travaux commencent avant la fin de ce délai et reconnaît qu'en cas de rétractation, il devra le prix des prestations déjà réalisées et des pièces déjà commandées (art. L.221-25).",
    },
    {
      numero: 8,
      titre: "Propriété du véhicule et mandat",
      texte:
        "Le client déclare être propriétaire du véhicule ou disposer du pouvoir d'en ordonner la réparation ; pour un véhicule financé (LOA, LLD, crédit), il fait son affaire de l'accord de l'organisme. " +
        `Il mandate ${garage} pour communiquer avec l'expert et l'assureur, leur transmettre le présent ordre, les photos et le chiffrage, et solliciter l'accord de réparation en son nom.`,
    },
    {
      numero: 9,
      titre: "Garantie des travaux",
      texte:
        "Les travaux sont garantis contre tout défaut d'exécution, et les pièces neuves bénéficient de la garantie légale de conformité (art. L.217-3 et suivants du Code de la consommation) et de la garantie du fabricant. " +
        "Sont exclus l'usure normale, un défaut d'entretien, un nouveau sinistre, ou une intervention ultérieure d'un tiers sur les éléments réparés.",
    },
    {
      numero: 10,
      titre: "Données personnelles et litiges",
      texte:
        `Les données recueillies servent à l'exécution du présent ordre et à la gestion du sinistre avec l'expert et l'assureur ; le client dispose d'un droit d'accès, de rectification et d'effacement auprès de ${garage}. ` +
        (opts.mediateur ? `En cas de litige non résolu à l'amiable, le client consommateur peut saisir gratuitement le médiateur de la consommation : ${opts.mediateur}. ` : "En cas de litige non résolu à l'amiable, le client consommateur peut recourir gratuitement à un médiateur de la consommation (coordonnées affichées au garage). ") +
        `À défaut, les tribunaux${opts.ville ? ` de ${opts.ville}` : " du siège du réparateur"} sont compétents, sous réserve des règles d'ordre public.`,
    },
  ];
  return out;
}

// Texte juridique de la cession de créance (art. 1321 à 1326 du Code civil).
// Les parties et montants sont injectés par le PDF.
export const CESSION_OBJET =
  "Par la présente, le cédant cède au cessionnaire, qui l'accepte, la créance " +
  "d'indemnisation qu'il détient sur le débiteur cédé au titre du sinistre " +
  "désigné ci-dessus, conformément aux articles 1321 et suivants du Code civil. " +
  "Le cessionnaire est en conséquence autorisé à percevoir directement du " +
  "débiteur cédé le règlement de l'indemnité, à hauteur du montant indiqué.";

export const CESSION_NOTIFICATION =
  "La présente cession sera notifiée au débiteur cédé, à qui elle est opposable " +
  "à compter de cette notification (art. 1324 du Code civil). Le cédant garantit " +
  "l'existence de la créance cédée mais non la solvabilité du débiteur.";

// Texte de décharge imprimé sur le PV de restitution.
export const DECHARGE_RESTITUTION =
  "Je soussigné(e), client(e) désigné(e) ci-dessus, reconnais avoir récupéré ce jour " +
  "le véhicule mentionné, réparé conformément aux travaux convenus, et n'avoir " +
  "constaté aucune anomalie apparente au moment de la restitution, sous réserve " +
  "des observations éventuelles notées ci-dessus.";
