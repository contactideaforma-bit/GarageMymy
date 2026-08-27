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
  Assureur,
  CessionCreance,
  Client,
  Expert,
  DemandeAssurance,
  Document,
  Dossier,
  Evenement,
  LigneArdoise,
  OrdreReparation,
  Paiement,
  PieceDossier,
  Relance,
  Restitution,
} from "./types";
import { ProchaineAction, calculeProchaineAction } from "./actions";
import { ajouterRappel } from "./ardoise";
import { estActionFaite } from "./aFaire";
import { STATUTS_ORDRE, estActif, formatDate, formatDateTime, formatEuros, labelStatut } from "./format";
import { resteAPayer, totalPaye } from "./paiements";

export type LienMyMy = { label: string; href: string };

// ACTION proposée par MY-MY (v9.6) : jamais exécutée sans confirmation.
// L'IA (ou l'analyse locale) décrit ce qu'elle a compris ; la bulle affiche
// une carte « J'ai compris : … Confirmer ? » ; l'écriture ne part qu'au clic.
export type ActionMyMy =
  | { type: "rappel"; dossier_id: string | null; texte: string; echeance: string | null }
  | { type: "rdv"; dossier_id: string | null; titre: string; date: string; categorie: "rdv_client" | "rdv_expert" | "autre"; avec_qui: string | null }
  | { type: "note"; dossier_id: string; texte: string }
  | { type: "au_garage"; dossier_id: string; valeur: boolean }
  | { type: "statut"; dossier_id: string; statut: string };

export type MessageMyMy = {
  role: "user" | "assistant";
  texte: string;
  liens?: LienMyMy[];
  /** Action en attente de confirmation (undefined = message ordinaire). */
  action?: ActionMyMy;
  /** confirmee | annulee | undefined (en attente) */
  etatAction?: "confirmee" | "annulee";
};

export type ContexteMyMy = {
  dossiers: Dossier[];
  documents: Document[];
  paiements: Paiement[];
  relances: Relance[];
  clients: Client[];
  assureurs: Assureur[];
  experts: Expert[];
  /** Agenda : RDV et rappels datés (evenements) — 60 jours passés → 120 jours à venir. */
  evenements: Evenement[];
  /** Rappels écrits (bloc « À faire »), non cochés. */
  rappels: LigneArdoise[];
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
  "Rappelle-moi d'appeler un client demain",
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
  // Annuaire (clients / assurances / experts) : pour répondre « c'est quoi le
  // téléphone de … ». Chargé à part : une table absente ne bloque rien.
  const depuis = new Date(Date.now() - 60 * 86400000).toISOString();
  const jusqua = new Date(Date.now() + 120 * 86400000).toISOString();
  const [cl, ass, ex, ev, ard] = await Promise.all([
    supabase.from("clients").select("*"),
    supabase.from("assureurs").select("*"),
    supabase.from("experts").select("*"),
    supabase.from("evenements").select("*").gte("date_evenement", depuis).lte("date_evenement", jusqua).order("date_evenement", { ascending: true }),
    supabase.from("ardoise").select("*").eq("fait", false),
  ]);
  const evenements = (ev.data as Evenement[]) || [];
  const rappels = (ard.data as LigneArdoise[]) || [];
  const clients = (cl.data as Client[]) || [];
  const assureurs = (ass.data as Assureur[]) || [];
  const experts = (ex.data as Expert[]) || [];
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

  return { dossiers, documents, paiements, relances, clients, assureurs, experts, evenements, rappels, aFaire, impayes, chargeLe: new Date().toISOString() };
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

const MOTS_VIDES = new Set(
  "je tu il on nous vous ils le la les un une des du de d l et ou mais que qui quoi dont ne pas plus pour par dans sur avec sans chez est sont ai as suis cherche cherches trouve trouver recherche dossier dossiers client clients vehicule vehicules voiture immat immatriculation sinistre sais plus lequel exactement c'est cest une un ce cette ces mon ma mes son sa ses leur leurs me moi lui y en a au aux quel quelle quels quelles ouvre montre affiche donne dis moi peux tu mymy my-my bonjour salut stp svp merci telephone tel numero mail email adresse assurance assureur expert cabinet".split(
    " "
  )
);

// Recherche « par mots » : « je cherche un dossier… je sais que c'est une
// polo » → chaque mot utile de la phrase est essayé, les dossiers touchés
// par au moins un mot sont renvoyés (les plus touchés d'abord).
export function chercherParMots(ctx: ContexteMyMy, phrase: string, max = 8): { dossiers: Dossier[]; mots: string[] } {
  const mots = phrase
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[?.!,;:'"()]/g, " ")
    .split(/\s+/)
    .filter((m) => m.length >= 3 && !MOTS_VIDES.has(m));
  if (mots.length === 0) return { dossiers: [], mots };
  const scores = ctx.dossiers
    .map((d) => {
      const champs = [d.immatriculation, d.client_nom, d.marque_modele, d.numero_sinistre, d.numero_police, d.assureur, d.cabinet_expert, d.expert_nom, d.reparateur]
        .filter(Boolean)
        .map((v) => normalise(String(v)));
      const score = mots.filter((m) => champs.some((c) => c.includes(normalise(m)))).length;
      return { d, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return { dossiers: scores.slice(0, max).map((x) => x.d), mots };
}

function ficheDossier(d: Dossier): string {
  const l: string[] = [`${libelleDossier(d)} — ${labelStatut(d.statut)}`];
  if (d.montant) l.push(`Montant : ${formatEuros(d.montant)} HT`);
  if (d.assureur) l.push(`Assurance : ${d.assureur}`);
  if (d.date_sinistre) l.push(`Sinistre du ${formatDate(d.date_sinistre)}`);
  if (d.reparation_debut || d.reparation_fin) l.push(`Réparation : ${formatDate(d.reparation_debut)} → ${formatDate(d.reparation_fin)}`);
  if (d.au_garage) l.push("🚗 Véhicule au garage");
  return l.join("\n");
}

// ---------------------------------------------------------------------------
//  Infos de contact : « c'est quoi le téléphone du client Dupont / de l'assurance ? »
// ---------------------------------------------------------------------------
function contactsDuDossier(ctx: ContexteMyMy, d: Dossier, cible: "client" | "assurance" | "expert" | "tous"): string[] {
  const out: string[] = [];
  const cl = ctx.clients.find((c) => c.nom && d.client_nom && normalise(c.nom) === normalise(d.client_nom));
  const as = ctx.assureurs.find((a) => a.nom && d.assureur && normalise(a.nom) === normalise(d.assureur));
  const ex = ctx.experts.find((e) => e.cabinet && d.cabinet_expert && normalise(e.cabinet) === normalise(d.cabinet_expert));
  const ligne = (titre: string, tel?: string | null, email?: string | null, adresse?: string | null) => {
    const parts = [tel ? `📞 ${tel}` : null, email ? `✉️ ${email}` : null, adresse ? `📍 ${adresse}` : null].filter(Boolean);
    return `${titre} : ${parts.length ? parts.join("  ") : "aucune coordonnée enregistrée"}`;
  };
  if (cible === "client" || cible === "tous") {
    out.push(
      ligne(
        `Client ${d.client_nom || "?"}`,
        d.client_tel || cl?.telephone,
        d.client_email || cl?.email,
        [d.client_adresse || cl?.adresse, d.client_code_postal || cl?.code_postal, d.client_ville || cl?.ville].filter(Boolean).join(" ")
      )
    );
  }
  if (cible === "assurance" || cible === "tous") {
    out.push(ligne(`Assurance ${d.assureur || "?"}`, d.assureur_tel || as?.tel, d.assureur_email || as?.email, d.assureur_adresse || [as?.adresse, as?.code_postal, as?.ville].filter(Boolean).join(" ")));
  }
  if (cible === "expert" || cible === "tous") {
    out.push(ligne(`Cabinet ${d.cabinet_expert || "?"}`, d.cabinet_tel || ex?.tel, d.cabinet_email || ex?.email, d.cabinet_adresse || [ex?.adresse, ex?.code_postal, ex?.ville].filter(Boolean).join(" ")));
    if (d.expert_nom || d.expert_tel || d.expert_email) out.push(ligne(`Expert ${d.expert_nom || ""}`.trim(), d.expert_tel || ex?.expert_tel, d.expert_email || ex?.expert_email));
  }
  return out;
}

// Coordonnées d'une entrée d'annuaire (hors dossier) : « téléphone d'Allianz ».
function contactsAnnuaire(ctx: ContexteMyMy, q: string): string[] {
  const out: string[] = [];
  const nq = normalise(q);
  for (const a of ctx.assureurs) if (a.nom && nq.includes(normalise(a.nom))) out.push(`Assurance ${a.nom} : ${[a.tel && `📞 ${a.tel}`, a.email && `✉️ ${a.email}`].filter(Boolean).join("  ") || "aucune coordonnée"}`);
  for (const e of ctx.experts) if (e.cabinet && nq.includes(normalise(e.cabinet))) out.push(`Cabinet ${e.cabinet} : ${[e.tel && `📞 ${e.tel}`, e.email && `✉️ ${e.email}`, e.expert_nom && `expert ${e.expert_nom}${e.expert_tel ? ` 📞 ${e.expert_tel}` : ""}`].filter(Boolean).join("  ") || "aucune coordonnée"}`);
  for (const c of ctx.clients) if (c.nom && c.nom.length >= 3 && nq.includes(normalise(c.nom))) out.push(`Client ${c.nom} : ${[c.telephone && `📞 ${c.telephone}`, c.email && `✉️ ${c.email}`].filter(Boolean).join("  ") || "aucune coordonnée"}`);
  return out.slice(0, 6);
}

// ---------------------------------------------------------------------------
//  Agenda : période demandée dans la question → bornes [debut, fin[
// ---------------------------------------------------------------------------
type Periode = { libelle: string; debut: Date; fin: Date };

const JOURS_SEMAINE = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

function debutJour(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function plusJours(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function periodeDemandee(q: string): Periode | null {
  // On ne répond « agenda » que si la phrase parle bien de faire / prévoir / rdv,
  // pas pour « la voiture arrive demain » (qui est une action).
  const contexteOk = /faire|prevu|prevue|programme|agenda|rdv|rendez|planning|planifie|attend|quoi|qu.est|y a|as tu|ai je|j.ai|rappel/.test(q);
  if (!contexteOk) return null;
  const auj = debutJour(new Date());
  if (/aujourd.?hui|ce jour|ce matin|cet apres.?midi|ce soir/.test(q)) return { libelle: "aujourd'hui", debut: auj, fin: plusJours(auj, 1) };
  if (/apres.?demain/.test(q)) return { libelle: "après-demain", debut: plusJours(auj, 2), fin: plusJours(auj, 3) };
  if (/\bdemain\b/.test(q)) return { libelle: "demain", debut: plusJours(auj, 1), fin: plusJours(auj, 2) };
  if (/semaine prochaine|la semaine pro/.test(q)) {
    const lundi = plusJours(auj, ((8 - auj.getDay()) % 7) || 7);
    return { libelle: "la semaine prochaine", debut: lundi, fin: plusJours(lundi, 7) };
  }
  if (/cette semaine|la semaine|dans la semaine/.test(q)) {
    const lundi = plusJours(auj, -((auj.getDay() + 6) % 7));
    return { libelle: "cette semaine", debut: lundi, fin: plusJours(lundi, 7) };
  }
  if (/ce mois|dans le mois|mois prochain/.test(q)) {
    const debut = /prochain/.test(q) ? new Date(auj.getFullYear(), auj.getMonth() + 1, 1) : new Date(auj.getFullYear(), auj.getMonth(), 1);
    return { libelle: /prochain/.test(q) ? "le mois prochain" : "ce mois-ci", debut, fin: new Date(debut.getFullYear(), debut.getMonth() + 1, 1) };
  }
  for (let i = 1; i <= 7; i++) {
    const nom = JOURS_SEMAINE[i % 7];
    if (new RegExp(`\\b${nom}\\b`).test(q)) {
      const delta = ((i % 7) - auj.getDay() + 7) % 7 || 7;
      const jour = plusJours(auj, delta);
      return { libelle: nom, debut: jour, fin: plusJours(jour, 1) };
    }
  }
  return null;
}

function reponseAgenda(ctx: ContexteMyMy, p: Periode): MessageMyMy {
  const dans = (iso: string | null | undefined) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d >= p.debut && d < p.fin;
  };
  const evs = ctx.evenements.filter((e) => dans(e.date_evenement));
  // Rappels datés déjà représentés par leur évènement d'agenda → on évite le doublon.
  const rappelsDates = ctx.rappels.filter((r) => r.echeance && dans(r.echeance) && !evs.some((e) => e.id === r.evenement_id));
  const parId = new Map(ctx.dossiers.map((d) => [d.id, d]));
  const plusieursJours = p.fin.getTime() - p.debut.getTime() > 86400000;
  const quand = (iso: string) => {
    const d = new Date(iso);
    const h = `${d.getHours()}h${String(d.getMinutes()).padStart(2, "0")}`;
    return plusieursJours ? `${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} ${h}` : h;
  };
  const lignes = [
    ...evs.map((e) => {
      const d = e.dossier_id ? parId.get(e.dossier_id) : undefined;
      return `📅 ${quand(e.date_evenement)} — ${e.titre}${e.avec_qui ? ` avec ${e.avec_qui}` : ""}${d ? ` (${libelleDossier(d)})` : ""}`;
    }),
    ...rappelsDates.map((r) => {
      const d = r.dossier_id ? parId.get(r.dossier_id) : undefined;
      return `🔔 ${quand(r.echeance!)} — ${r.texte}${d ? ` (${libelleDossier(d)})` : ""}`;
    }),
  ];
  const liens: LienMyMy[] = [];
  for (const e of evs) {
    const d = e.dossier_id ? parId.get(e.dossier_id) : undefined;
    if (d && !liens.some((l) => l.href === `/sinistres/${d.id}`)) liens.push(lienDossier(d));
  }
  for (const r of rappelsDates) {
    const d = r.dossier_id ? parId.get(r.dossier_id) : undefined;
    if (d && !liens.some((l) => l.href === `/sinistres/${d.id}`)) liens.push(lienDossier(d));
  }
  liens.push({ label: "Agenda", href: "/agenda" });

  const sansDate = ctx.rappels.filter((r) => !r.echeance);
  const rappelsTexte = sansDate.length
    ? `\n\nEt ${sansDate.length} rappel(s) sans date dans « À faire » : ${sansDate.slice(0, 3).map((r) => r.texte).join(" · ")}${sansDate.length > 3 ? "…" : ""}`
    : "";
  const urgentes = ctx.aFaire.filter((x) => x.action.urgence === "haute");
  const urgentTexte = urgentes.length ? `\n\n🔴 Par ailleurs, ${urgentes.length} action(s) urgente(s) sur tes dossiers — demande-moi « qu'est-ce que j'ai à faire ».` : "";

  if (lignes.length === 0) {
    return {
      role: "assistant",
      texte: `Rien de prévu dans l'agenda ${p.libelle}.${rappelsTexte}${urgentTexte}`,
      liens: liens.slice(0, 4),
    };
  }
  return {
    role: "assistant",
    texte: `Voilà ce qui est prévu ${p.libelle} :\n${lignes.join("\n")}${rappelsTexte}${urgentTexte}`,
    liens: liens.slice(0, 5),
  };
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

  // Demande d'ACTION (« rappelle-moi… », « note sur… », « ajoute un rdv »,
  // « la voiture est arrivée », « passe le dossier en… ») : c'est l'IA qui
  // interprète et propose, la bulle demande confirmation.
  if (/^(mymy|my-my)?[\s,]*(rappel|rappelle|note|ajoute|cree|creer|planifie|programme|passe|marque|mets|met)\b/.test(q) || /(est arrivee?|est repartie?|est sortie?|au garage aujourd)/.test(q)) {
    return null;
  }

  // AGENDA : « je dois faire quoi demain ? », « qu'est-ce qu'il y a lundi ? »,
  // « cette semaine », « aujourd'hui »… → RDV + rappels datés + rappels sans date.
  const periode = periodeDemandee(q);
  if (periode) {
    return reponseAgenda(ctx, periode);
  }

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

  // Coordonnées : « c'est quoi le téléphone du client Dupont », « mail de l'assurance du dossier AB-123-CD »
  if (/telephone|tel\b|numero de tel|portable|mail|email|adresse|coordonnees|contact/.test(q) && !/^(ouvre|va|aller)/.test(q)) {
    const cible: "client" | "assurance" | "expert" | "tous" = /assur/.test(q)
      ? "assurance"
      : /expert|cabinet/.test(q)
        ? "expert"
        : /client|proprietaire/.test(q)
          ? "client"
          : "tous";
    const { dossiers: trouves } = chercherParMots(ctx, q, 4);
    if (trouves.length === 1) {
      const d = trouves[0];
      return { role: "assistant", texte: `${libelleDossier(d)}\n${contactsDuDossier(ctx, d, cible).join("\n")}`, liens: [lienDossier(d), { label: "Annuaire", href: "/annuaire" }] };
    }
    if (trouves.length > 1) {
      const texte = trouves.map((d) => `▪ ${libelleDossier(d)}\n${contactsDuDossier(ctx, d, cible).map((x) => "   " + x).join("\n")}`).join("\n");
      return { role: "assistant", texte: `Plusieurs dossiers correspondent :\n${texte}`, liens: trouves.map(lienDossier) };
    }
    const annuaire = contactsAnnuaire(ctx, q);
    if (annuaire.length) return { role: "assistant", texte: annuaire.join("\n"), liens: [{ label: "Annuaire", href: "/annuaire" }] };
    // sinon → IA (elle a l'annuaire dans son résumé)
  }

  // Recherche libre : « je cherche un dossier, je sais que c'est une polo »
  if (/cherche|recherche|trouve|retrouve|je sais (que|plus)|lequel|c.est (une|un) /.test(q)) {
    const { dossiers: trouves, mots } = chercherParMots(ctx, q);
    if (trouves.length === 1) return { role: "assistant", texte: `Je pense que c'est celui-ci :\n${ficheDossier(trouves[0])}`, liens: [lienDossier(trouves[0])] };
    if (trouves.length > 1) {
      return {
        role: "assistant",
        texte: `J'ai ${trouves.length} dossier(s) qui correspondent à « ${mots.join(", ")} » :\n${trouves.map((d) => `▪ ${libelleDossier(d)} — ${labelStatut(d.statut)}${d.date_sinistre ? `, sinistre du ${formatDate(d.date_sinistre)}` : ""}`).join("\n")}`,
        liens: trouves.slice(0, 6).map(lienDossier),
      };
    }
    if (mots.length) return { role: "assistant", texte: `Aucun dossier ne contient « ${mots.join(", ")} ». Donne-moi un autre indice : un nom, une immat, une marque, l'assurance…`, liens: [{ label: "Tous les sinistres", href: "/sinistres" }] };
  }

  // Recherche de dossier : « dossier AB-123-CD », « dupont », immat brute…
  const m = q.match(/(?:dossier|client|vehicule|immat(?:riculation)?|sinistre|cherche|trouve|recherche|ouvre)\s+(?:de |du |le |la |les |d')?(.{2,})/);
  const cle = m ? m[1] : /^[a-z]{2}-?\d{3}-?[a-z]{2}$|^\d{1,4}\s?[a-z]{2,3}\s?\d{2}$/.test(q.replace(/\s/g, "")) ? q : null;
  if (cle) {
    const trouves = chercherDossiers(ctx, cle.replace(/[?.!]/g, "").trim());
    if (trouves.length === 1) {
      const d = trouves[0];
      return { role: "assistant", texte: `Trouvé :\n${ficheDossier(d)}`, liens: [lienDossier(d)] };
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
export function resumePourIA(ctx: ContexteMyMy, question = ""): string {
  const actifs = ctx.dossiers.filter((d) => estActif(d.statut));
  // Les dossiers TERMINÉS que la question semble viser sont ajoutés (un
  // rappel peut concerner un dossier payé — ex. « rappelle-moi d'appeler Dupont »).
  const vises = question ? chercherParMots(ctx, question, 10).dossiers.filter((d) => !estActif(d.statut)) : [];
  const lignes = [...actifs.slice(0, 120), ...vises].map((d) => {
    const factures = ctx.documents.filter((f) => f.dossier_id === d.id && f.type === "facture");
    const paye = totalPaye(ctx.paiements.filter((p) => p.dossier_id === d.id));
    const action = ctx.aFaire.find((x) => x.dossier.id === d.id)?.action;
    return (
      `- id=${d.id} | ${libelleDossier(d)} | statut=${labelStatut(d.statut)} | ` +
      `montant HT=${d.montant ?? "?"} | assureur=${d.assureur || "?"} (tel ${d.assureur_tel || "?"}, mail ${d.assureur_email || "?"}) | ` +
      `client tel=${d.client_tel || "?"} mail=${d.client_email || "?"} | ` +
      `expert=${d.expert_nom || d.cabinet_expert || "?"} (tel ${d.expert_tel || d.cabinet_tel || "?"}, mail ${d.expert_email || d.cabinet_email || "?"}) | ` +
      `sinistre le ${d.date_sinistre || "?"} | au garage=${d.au_garage ? "oui" : "non"} | ` +
      `réparation ${d.reparation_debut || "?"}→${d.reparation_fin || "?"} | ` +
      `factures=${factures.map((f) => `${f.numero || "s/n"} ${f.total_ttc ?? "?"}€ TTC ${f.statut}`).join(";") || "aucune"} | payé=${paye} | ` +
      `à faire=${action ? `${action.titre} (${action.urgence})` : "rien"}`
    );
  });
  const termines = ctx.dossiers.length - actifs.length;
  const annuaire = [
    ...ctx.clients.slice(0, 80).map((c) => `- client ${c.nom || "?"} | tel ${c.telephone || "?"} | mail ${c.email || "?"}`),
    ...ctx.assureurs.slice(0, 40).map((a) => `- assurance ${a.nom || "?"} | tel ${a.tel || "?"} | mail ${a.email || "?"}`),
    ...ctx.experts.slice(0, 40).map((e) => `- cabinet ${e.cabinet || "?"} | tel ${e.tel || "?"} | mail ${e.email || "?"} | expert ${e.expert_nom || "?"} tel ${e.expert_tel || "?"}`),
  ];
  const now = new Date();
  const parId = new Map(ctx.dossiers.map((d) => [d.id, d]));
  const agenda = ctx.evenements
    .filter((e) => new Date(e.date_evenement) >= new Date(now.getTime() - 7 * 86400000))
    .slice(0, 60)
    .map((e) => {
      const d = e.dossier_id ? parId.get(e.dossier_id) : undefined;
      return `- ${new Date(e.date_evenement).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} | ${e.titre}${e.avec_qui ? ` avec ${e.avec_qui}` : ""}${d ? ` | dossier ${libelleDossier(d)} (id=${d.id})` : ""}`;
    });
  const rappels = ctx.rappels.slice(0, 40).map((r) => {
    const d = r.dossier_id ? parId.get(r.dossier_id) : undefined;
    return `- ${r.echeance ? new Date(r.echeance).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "sans date"} | ${r.texte}${d ? ` | dossier ${libelleDossier(d)}` : ""}`;
  });
  return (
    `Date du jour : ${now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} (${now.toISOString().slice(0, 10)})\n` +
    `AGENDA (7 derniers jours → 120 jours) :\n${agenda.join("\n") || "(vide)"}\n` +
    `RAPPELS ÉCRITS non faits :\n${rappels.join("\n") || "(aucun)"}\n` +
    `Codes de statut possibles : ${STATUTS_ORDRE.join(", ")}\n` +
    `ANNUAIRE :\n${annuaire.join("\n") || "(vide)"}\n` +
    `Dossiers en cours : ${actifs.length} (+ ${termines} terminés non listés)\n` +
    `Factures impayées : ${ctx.impayes.length}, total restant ${ctx.impayes.reduce((s, x) => s + x.reste, 0).toFixed(2)} €\n` +
    `Actions à faire : ${ctx.aFaire.length}\n\nDOSSIERS EN COURS :\n${lignes.join("\n")}`
  );
}

// ---------------------------------------------------------------------------
//  ACTIONS (v9.6) — validation, description lisible, exécution après confirmation
// ---------------------------------------------------------------------------

/** Vérifie une action renvoyée par l'IA : dossier existant, champs cohérents. */
export function validerAction(ctx: ContexteMyMy, brut: unknown): ActionMyMy | null {
  if (!brut || typeof brut !== "object") return null;
  const a = brut as Record<string, unknown>;
  const idOk = (id: unknown): string | null =>
    typeof id === "string" && ctx.dossiers.some((d) => d.id === id) ? id : null;
  const str = (v: unknown, max = 500): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const dateOk = (v: unknown): string | null => {
    if (typeof v !== "string" || !v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  };
  switch (a.type) {
    case "rappel": {
      const texte = str(a.texte, 300);
      if (!texte) return null;
      return { type: "rappel", dossier_id: idOk(a.dossier_id), texte, echeance: dateOk(a.echeance) };
    }
    case "rdv": {
      const titre = str(a.titre, 200);
      const date = dateOk(a.date);
      if (!titre || !date) return null;
      const cat = a.categorie === "rdv_client" || a.categorie === "rdv_expert" ? a.categorie : "autre";
      return { type: "rdv", dossier_id: idOk(a.dossier_id), titre, date, categorie: cat, avec_qui: str(a.avec_qui, 120) || null };
    }
    case "note": {
      const id = idOk(a.dossier_id);
      const texte = str(a.texte, 1000);
      return id && texte ? { type: "note", dossier_id: id, texte } : null;
    }
    case "au_garage": {
      const id = idOk(a.dossier_id);
      return id ? { type: "au_garage", dossier_id: id, valeur: Boolean(a.valeur) } : null;
    }
    case "statut": {
      const id = idOk(a.dossier_id);
      const st = str(a.statut, 30);
      return id && (STATUTS_ORDRE as readonly string[]).includes(st) ? { type: "statut", dossier_id: id, statut: st } : null;
    }
    default:
      return null;
  }
}

/** Phrase « J'ai compris : … » affichée avant confirmation. */
export function decrireAction(ctx: ContexteMyMy, a: ActionMyMy): string {
  const d = "dossier_id" in a && a.dossier_id ? ctx.dossiers.find((x) => x.id === a.dossier_id) : undefined;
  const pour = d ? ` sur le dossier ${libelleDossier(d)}` : "";
  switch (a.type) {
    case "rappel":
      return `Créer le rappel « ${a.texte} »${pour}${a.echeance ? `, pour le ${formatDateTime(a.echeance)}` : " (sans date, dans « À faire »)"}.`;
    case "rdv":
      return `Ajouter à l'agenda « ${a.titre} » le ${formatDateTime(a.date)}${a.avec_qui ? ` avec ${a.avec_qui}` : ""}${pour}.`;
    case "note":
      return `Ajouter à la note du dossier${pour} : « ${a.texte} ».`;
    case "au_garage":
      return `Marquer le véhicule${pour} comme ${a.valeur ? "PRÉSENT au garage" : "SORTI du garage"}.`;
    case "statut":
      return `Passer le dossier${pour} au statut « ${labelStatut(a.statut)} ».`;
  }
}

/** Exécute l'action confirmée. Renvoie un message de résultat + liens. */
export async function executerAction(ctx: ContexteMyMy, a: ActionMyMy): Promise<MessageMyMy> {
  const d = "dossier_id" in a && a.dossier_id ? ctx.dossiers.find((x) => x.id === a.dossier_id) : undefined;
  const liens: LienMyMy[] = d ? [lienDossier(d)] : [];
  switch (a.type) {
    case "rappel": {
      await ajouterRappel({ texte: a.texte, dossierId: a.dossier_id, echeance: a.echeance });
      return { role: "assistant", texte: `✅ Rappel créé${a.echeance ? ` pour le ${formatDateTime(a.echeance)}` : ""}. Tu le retrouveras dans « À faire » sur le tableau de bord${a.echeance ? " et dans l'agenda" : ""}.`, liens: [...liens, { label: "Tableau de bord", href: "/" }] };
    }
    case "rdv": {
      const { error } = await supabase.from("evenements").insert({
        dossier_id: a.dossier_id,
        titre: a.titre,
        description: "Créé par MY-MY.",
        date_evenement: a.date,
        categorie: a.categorie,
        avec_qui: a.avec_qui,
      });
      if (error) throw error;
      return { role: "assistant", texte: `✅ Rendez-vous ajouté à l'agenda le ${formatDateTime(a.date)}.`, liens: [...liens, { label: "Agenda", href: "/agenda" }] };
    }
    case "note": {
      const actuelle = (d?.note || "").trim();
      const horodatage = new Date().toLocaleDateString("fr-FR");
      const note = `${actuelle ? actuelle + "\n" : ""}[${horodatage} · MY-MY] ${a.texte}`;
      const { error } = await supabase.from("dossiers").update({ note, note_maj: new Date().toISOString() }).eq("id", a.dossier_id);
      if (error) throw error;
      if (d) d.note = note;
      return { role: "assistant", texte: "✅ Note ajoutée au dossier.", liens };
    }
    case "au_garage": {
      const { error } = await supabase.from("dossiers").update({ au_garage: a.valeur }).eq("id", a.dossier_id);
      if (error) throw error;
      if (d) d.au_garage = a.valeur;
      return { role: "assistant", texte: `✅ Véhicule marqué ${a.valeur ? "présent au garage" : "sorti du garage"}.`, liens: [...liens, { label: "Véhicules", href: "/vehicules" }] };
    }
    case "statut": {
      const { error } = await supabase.from("dossiers").update({ statut: a.statut }).eq("id", a.dossier_id);
      if (error) throw error;
      if (d) d.statut = a.statut;
      return { role: "assistant", texte: `✅ Dossier passé en « ${labelStatut(a.statut)} ».`, liens };
    }
  }
}
