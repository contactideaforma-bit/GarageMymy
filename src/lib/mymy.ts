// « MY-MY » — l'assistant du garage (v9.5).
//
// Cerveau CÔTÉ CLIENT : on charge les données du garage (RLS : uniquement
// celles du compte connecté), on répond localement à tout ce qui se calcule
// (recherche d'un dossier, liste des choses à faire, encours) — instantané et
// gratuit — et on ne sollicite l'IA (/api/mymy, quota 15 €/mois) que pour
// les questions ouvertes, en lui joignant un résumé compact des données.

import { supabase } from "./supabaseClient";
import {
  ActionFaite,
  CessionCreance,
  DemandeAssurance,
  Document,
  Dossier,
  OrdreReparation,
  Paiement,
  PieceDossier,
  Relance,
  Restitution,
} from "./types";
import { ProchaineAction, calculeProchaineAction } from "./actions";
import { estActionFaite } from "./aFaire";
import { estActif, formatDate, formatEuros, labelStatut } from "./format";
import { resteAPayer, totalPaye } from "./paiements";

export type LienMyMy = { label: string; href: string };

export type MessageMyMy = {
  role: "user" | "assistant";
  texte: string;
  liens?: LienMyMy[];
};

export type ContexteMyMy = {
  dossiers: Dossier[];
  documents: Document[];
  paiements: Paiement[];
  relances: Relance[];
  aFaire: { dossier: Dossier; action: ProchaineAction }[];
  impayes: { doc: Document; dossier: Dossier | undefined; reste: number; retard: boolean }[];
  chargeLe: string;
};

// Raccourcis proposés dans la bulle (chips) et compris localement.
export const SUGGESTIONS_MYMY = [
  "Qu'est-ce que j'ai à faire aujourd'hui ?",
  "Quels dossiers sont impayés ?",
  "Quels véhicules sont au garage ?",
  "Résume mon activité",
];

// ---------------------------------------------------------------------------
//  Chargement des données (même périmètre que le tableau de bord)
// ---------------------------------------------------------------------------
export async function chargerContexteMyMy(metier: string | null): Promise<ContexteMyMy> {
  const [d, docs, p, r, ors, rests, cess, pcs, dem, af] = await Promise.all([
    supabase.from("dossiers").select("*").order("created_at", { ascending: false }),
    supabase.from("documents").select("*").order("created_at", { ascending: false }),
    supabase.from("paiements").select("*"),
    supabase.from("relances").select("*").order("date_relance", { ascending: false }),
    supabase.from("ordres_reparation").select("*"),
    supabase.from("restitutions").select("*"),
    supabase.from("cessions_creance").select("*"),
    supabase.from("pieces_dossier").select("dossier_id,type"),
    supabase.from("demandes_assurance").select("dossier_id,demande,date_envoi"),
    supabase.from("actions_faites").select("*"),
  ]);
  if (d.error) throw d.error;
  const dossiers = ((d.data as Dossier[]) || []).filter((x) => !x.archive);
  const documents = (docs.data as Document[]) || [];
  const paiements = (p.data as Paiement[]) || [];
  const relances = (r.data as Relance[]) || [];
  const ordres = (ors.data as OrdreReparation[]) || [];
  const restitutions = (rests.data as Restitution[]) || [];
  const cessions = (cess.data as CessionCreance[]) || [];
  const pieces = (pcs.data as Pick<PieceDossier, "dossier_id" | "type">[]) || [];
  const demandes = (dem.data as Pick<DemandeAssurance, "dossier_id" | "demande" | "date_envoi">[]) || [];
  const faites = (af.data as ActionFaite[]) || [];

  const aFaire = dossiers
    .filter((x) => estActif(x.statut))
    .map((dossier) => ({
      dossier,
      action: calculeProchaineAction({
        dossier,
        documents: documents.filter((x) => x.dossier_id === dossier.id),
        paiements: paiements.filter((x) => x.dossier_id === dossier.id),
        relances: relances.filter((x) => x.dossier_id === dossier.id),
        ordres: ordres.filter((x) => x.dossier_id === dossier.id),
        restitutions: restitutions.filter((x) => x.dossier_id === dossier.id),
        cessions: cessions.filter((x) => x.dossier_id === dossier.id),
        pieces: pieces.filter((x) => x.dossier_id === dossier.id),
        demandes: demandes.filter((x) => x.dossier_id === dossier.id),
        metier,
      }),
    }))
    .filter((x): x is { dossier: Dossier; action: ProchaineAction } =>
      Boolean(x.action && x.action.urgence !== "attente" && !estActionFaite(faites, x.dossier.id, x.action!.code))
    )
    .sort((a, b) => (a.action.urgence === "haute" ? -1 : 0) - (b.action.urgence === "haute" ? -1 : 0));

  const parId = new Map(dossiers.map((x) => [x.id, x]));
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const impayes = documents
    .filter((f) => f.type === "facture")
    .map((doc) => {
      const paye = totalPaye(paiements.filter((x) => x.document_id === doc.id));
      const reste = resteAPayer(doc.total_ttc, paye);
      const retard = Boolean(doc.date_echeance && doc.date_echeance < aujourdhui);
      return { doc, dossier: parId.get(doc.dossier_id), reste, retard };
    })
    .filter((x) => x.reste > 0.01)
    .sort((a, b) => Number(b.retard) - Number(a.retard));

  return { dossiers, documents, paiements, relances, aFaire, impayes, chargeLe: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
//  Petits helpers de présentation
// ---------------------------------------------------------------------------
export function libelleDossier(d: Dossier): string {
  return [d.marque_modele, d.immatriculation, d.client_nom].filter(Boolean).join(" · ") || "Dossier sans nom";
}

export function lienDossier(d: Dossier): LienMyMy {
  return { label: libelleDossier(d), href: `/sinistres/${d.id}` };
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-\s]/g, "");
}

// Recherche « tolérante » : immatriculation (avec ou sans tirets), client,
// véhicule, n° de sinistre, n° de police, assureur.
export function chercherDossiers(ctx: ContexteMyMy, requete: string, max = 6): Dossier[] {
  const q = normalise(requete);
  if (q.length < 2) return [];
  return ctx.dossiers
    .filter((d) =>
      [d.immatriculation, d.client_nom, d.marque_modele, d.numero_sinistre, d.numero_police, d.assureur]
        .filter(Boolean)
        .some((v) => normalise(String(v)).includes(q))
    )
    .slice(0, max);
}

// ---------------------------------------------------------------------------
//  Réponses LOCALES (sans IA) — renvoie null si la question ne s'y prête pas
// ---------------------------------------------------------------------------
export function repondreLocalement(ctx: ContexteMyMy, question: string): MessageMyMy | null {
  const q = question
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

  // À faire
  if (/a faire|taches?|tache du jour|quoi faire|programme|to ?do|urgent/.test(q)) {
    if (ctx.aFaire.length === 0) {
      return { role: "assistant", texte: "Rien d'urgent aujourd'hui : tous tes dossiers en cours attendent un tiers ou sont à jour. 🎉" };
    }
    const hautes = ctx.aFaire.filter((x) => x.action.urgence === "haute");
    const lignes = ctx.aFaire
      .slice(0, 8)
      .map((x) => `${x.action.urgence === "haute" ? "🔴" : "🟠"} ${x.action.titre} — ${libelleDossier(x.dossier)}`);
    const suite = ctx.aFaire.length > 8 ? `\n… et ${ctx.aFaire.length - 8} autre(s) sur le tableau de bord.` : "";
    return {
      role: "assistant",
      texte: `Tu as ${ctx.aFaire.length} chose(s) à faire${hautes.length ? `, dont ${hautes.length} urgente(s)` : ""} :\n${lignes.join("\n")}${suite}`,
      liens: [
        ...ctx.aFaire.slice(0, 4).map((x) => ({ label: x.action.ctaLabel + " · " + (x.dossier.immatriculation || x.dossier.client_nom || ""), href: x.action.href })),
        { label: "Voir le tableau de bord", href: "/" },
      ],
    };
  }

  // Impayés
  if (/impaye|pas paye|non paye|reste a encaisser|retard de paiement|relance/.test(q)) {
    if (ctx.impayes.length === 0) {
      return { role: "assistant", texte: "Aucune facture en attente de paiement. Tout est encaissé ! 💰" };
    }
    const total = ctx.impayes.reduce((s, x) => s + x.reste, 0);
    const lignes = ctx.impayes.slice(0, 8).map(
      (x) =>
        `${x.retard ? "⏰" : "•"} ${x.doc.numero || "Facture"} — ${x.dossier ? libelleDossier(x.dossier) : "?"} : ${formatEuros(x.reste)} restant${x.doc.date_echeance ? ` (échéance ${formatDate(x.doc.date_echeance)})` : ""}`
    );
    return {
      role: "assistant",
      texte: `${ctx.impayes.length} facture(s) en attente, ${formatEuros(total)} à encaisser :\n${lignes.join("\n")}`,
      liens: [
        ...ctx.impayes.slice(0, 3).filter((x) => x.dossier).map((x) => lienDossier(x.dossier!)),
        { label: "Paiements & relances", href: "/finance" },
      ],
    };
  }

  // Véhicules présents
  if (/au garage|present|dans l.atelier|vehicules? (sur place|ici)/.test(q)) {
    const presents = ctx.dossiers.filter((d) => d.au_garage);
    if (presents.length === 0) return { role: "assistant", texte: "Aucun véhicule n'est marqué comme présent au garage.", liens: [{ label: "Véhicules", href: "/vehicules" }] };
    return {
      role: "assistant",
      texte: `${presents.length} véhicule(s) au garage :\n${presents.map((d) => `🚗 ${libelleDossier(d)} — ${labelStatut(d.statut)}`).join("\n")}`,
      liens: [...presents.slice(0, 4).map(lienDossier), { label: "Véhicules", href: "/vehicules" }],
    };
  }

  // Résumé d'activité
  if (/resume|synthese|bilan|activite|ou en (suis|est)|point (du|de la) (jour|semaine)/.test(q)) {
    const actifs = ctx.dossiers.filter((d) => estActif(d.statut));
    const parStatut = new Map<string, number>();
    for (const d of actifs) parStatut.set(d.statut, (parStatut.get(d.statut) || 0) + 1);
    const encours = actifs.reduce((s, d) => s + (d.montant || 0), 0);
    const aEncaisser = ctx.impayes.reduce((s, x) => s + x.reste, 0);
    const repartition = Array.from(parStatut.entries())
      .map(([s, n]) => `${labelStatut(s)} : ${n}`)
      .join(", ");
    return {
      role: "assistant",
      texte:
        `📋 ${actifs.length} dossier(s) en cours (${repartition || "aucun"}), ${formatEuros(encours)} HT d'encours.\n` +
        `💶 ${ctx.impayes.length} facture(s) à encaisser pour ${formatEuros(aEncaisser)}.\n` +
        `✅ ${ctx.aFaire.length} action(s) à faire${ctx.aFaire.filter((x) => x.action.urgence === "haute").length ? ` dont ${ctx.aFaire.filter((x) => x.action.urgence === "haute").length} urgente(s)` : ""}.\n` +
        `🚗 ${ctx.dossiers.filter((d) => d.au_garage).length} véhicule(s) au garage.`,
      liens: [
        { label: "Tableau de bord", href: "/" },
        { label: "Sinistres", href: "/sinistres" },
        { label: "Rentabilité", href: "/rentabilite" },
      ],
    };
  }

  // Aller quelque part
  const pages: [RegExp, string, string][] = [
    [/planning/, "Planning réparation", "/planning"],
    [/agenda|rendez.?vous|rdv/, "Agenda", "/agenda"],
    [/annuaire|contacts?/, "Annuaire", "/annuaire"],
    [/factures?$/, "Factures", "/factures"],
    [/banque/, "Banque", "/banque"],
    [/emails?|mails?/, "Emails", "/emails"],
    [/profil|parametres?|reglages?/, "Profil du garage", "/profil"],
    [/nouveau dossier|creer un dossier|importer? (un )?rapport|ajouter un dossier/, "Nouveau dossier", "/import"],
  ];
  if (/^(ouvre|va|aller|montre|affiche|acces|acceder)/.test(q) || /^(le |la |les |mon |mes )?(planning|agenda|annuaire|factures|banque|emails|profil)$/.test(q)) {
    for (const [re, label, href] of pages) {
      if (re.test(q)) return { role: "assistant", texte: `Je t'emmène : ${label}.`, liens: [{ label, href }] };
    }
  }

  // Recherche de dossier : « dossier AB-123-CD », « dupont », immat brute…
  const m = q.match(/(?:dossier|client|vehicule|immat(?:riculation)?|sinistre|cherche|trouve|recherche|ouvre)\s+(?:de |du |le |la |les |d')?(.{2,})/);
  const cle = m ? m[1] : /^[a-z]{2}-?\d{3}-?[a-z]{2}$|^\d{1,4}\s?[a-z]{2,3}\s?\d{2}$/.test(q.replace(/\s/g, "")) ? q : null;
  if (cle) {
    const trouves = chercherDossiers(ctx, cle.replace(/[?.!]/g, "").trim());
    if (trouves.length === 1) {
      const d = trouves[0];
      return { role: "assistant", texte: `Trouvé : ${libelleDossier(d)} — ${labelStatut(d.statut)}${d.montant ? `, ${formatEuros(d.montant)} HT` : ""}${d.assureur ? `, ${d.assureur}` : ""}.`, liens: [lienDossier(d)] };
    }
    if (trouves.length > 1) {
      return { role: "assistant", texte: `J'ai trouvé ${trouves.length} dossiers, lequel veux-tu ouvrir ?`, liens: trouves.map(lienDossier) };
    }
    if (m) {
      return { role: "assistant", texte: `Je ne trouve aucun dossier pour « ${cle.trim()} ». Essaie avec l'immatriculation, le nom du client ou le n° de sinistre.`, liens: [{ label: "Tous les sinistres", href: "/sinistres" }] };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
//  Résumé compact envoyé à l'IA (questions ouvertes)
// ---------------------------------------------------------------------------
export function resumePourIA(ctx: ContexteMyMy): string {
  const actifs = ctx.dossiers.filter((d) => estActif(d.statut));
  const lignes = actifs.slice(0, 60).map((d) => {
    const factures = ctx.documents.filter((f) => f.dossier_id === d.id && f.type === "facture");
    const paye = totalPaye(ctx.paiements.filter((p) => p.dossier_id === d.id));
    const action = ctx.aFaire.find((x) => x.dossier.id === d.id)?.action;
    return (
      `- id=${d.id} | ${libelleDossier(d)} | statut=${labelStatut(d.statut)} | ` +
      `montant HT=${d.montant ?? "?"} | assureur=${d.assureur || "?"} | expert=${d.expert_nom || d.cabinet_expert || "?"} | ` +
      `sinistre le ${d.date_sinistre || "?"} | au garage=${d.au_garage ? "oui" : "non"} | ` +
      `réparation ${d.reparation_debut || "?"}→${d.reparation_fin || "?"} | ` +
      `factures=${factures.map((f) => `${f.numero || "s/n"} ${f.total_ttc ?? "?"}€ TTC ${f.statut}`).join(";") || "aucune"} | payé=${paye} | ` +
      `à faire=${action ? `${action.titre} (${action.urgence})` : "rien"}`
    );
  });
  const termines = ctx.dossiers.length - actifs.length;
  return (
    `Date du jour : ${new Date().toLocaleDateString("fr-FR")}\n` +
    `Dossiers en cours : ${actifs.length} (+ ${termines} terminés non listés)\n` +
    `Factures impayées : ${ctx.impayes.length}, total restant ${ctx.impayes.reduce((s, x) => s + x.reste, 0).toFixed(2)} €\n` +
    `Actions à faire : ${ctx.aFaire.length}\n\nDOSSIERS EN COURS :\n${lignes.join("\n")}`
  );
}
