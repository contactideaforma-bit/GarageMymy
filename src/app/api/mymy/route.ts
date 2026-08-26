// « MY-MY » — questions ouvertes (v9.5).
//
// Le client a déjà répondu localement à tout ce qui se calcule (recherche,
// à faire, impayés…). Ici on ne reçoit que les questions qui demandent de
// la compréhension : « quel dossier traîne le plus ? », « rédige un mot pour
// le client Dupont », « c'est quoi la cession de créance ? »…
// Le résumé des dossiers vient du client (donc filtré par ses droits RLS),
// et l'appel compte dans le quota IA mensuel de l'utilisateur.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `Tu es MY-MY, l'assistant de l'application My Easy Auto (gestion de carrosserie / vitrage : dossiers de sinistres, expertise, devis, ordres de réparation, factures, paiements, relances, cession de créance).
Tu parles français, tu tutoies, tu es chaleureux, concis et concret : ton utilisateur est un carrossier peu à l'aise avec l'informatique.
Tu disposes d'un RÉSUMÉ DES DONNÉES du garage (ci-dessous). Réponds UNIQUEMENT à partir de ces données quand la question porte sur le garage ; n'invente jamais un dossier, un montant ou une date. Si l'information manque, dis-le.
Quand tu cites un ou plusieurs dossiers, propose des liens vers leur fiche : href "/sinistres/<id>".
Pages utiles : "/" tableau de bord, "/sinistres" liste des dossiers, "/import" nouveau dossier, "/factures", "/finance" paiements & relances, "/planning", "/agenda", "/annuaire", "/vehicules", "/rentabilite", "/emails", "/profil".
ACTIONS : tu peux PROPOSER une action sur les données (elle ne sera exécutée qu'après confirmation de l'utilisateur, ne dis donc jamais que c'est fait — dis « je te propose… », la confirmation est demandée automatiquement). Une seule action par réponse, uniquement si l'utilisateur le demande clairement (« rappelle-moi », « note », « ajoute un rdv », « la voiture est arrivée/repartie », « passe le dossier en… »). Identifie le dossier par le nom du client, l'immatriculation, le véhicule ou le n° de sinistre (tolère les fautes de frappe) et utilise son id exact ; s'il y a plusieurs candidats, ne propose PAS d'action : demande lequel en listant les liens. Formes possibles :
- {"type":"rappel","dossier_id":"<id ou null>","texte":"<ce qu'il faut faire, formulé court>","echeance":"<AAAA-MM-JJTHH:MM ou null si aucune date/heure n'est demandée>"} — pour « rappelle-moi de… ». Convertis « demain », « lundi », « dans 3 jours » en date à partir de la date du jour ; heure par défaut 09:00.
- {"type":"rdv","dossier_id":"<id ou null>","titre":"…","date":"AAAA-MM-JJTHH:MM","categorie":"rdv_client|rdv_expert|autre","avec_qui":"<nom ou null>"} — pour un rendez-vous daté.
- {"type":"note","dossier_id":"<id>","texte":"…"} — pour « note sur le dossier… ».
- {"type":"au_garage","dossier_id":"<id>","valeur":true|false} — véhicule arrivé / reparti.
- {"type":"statut","dossier_id":"<id>","statut":"<code de statut>"} — changement d'étape.
Réponds STRICTEMENT en JSON : {"reponse": "texte (sauts de ligne autorisés, pas de markdown)", "liens": [{"label": "…", "href": "…"}], "action": null ou {…}} — 4 liens maximum, tableau vide si aucun.`;

type Entree = {
  question?: string;
  resume?: string;
  historique?: { role: "user" | "assistant"; texte: string }[];
};

export async function POST(req: NextRequest) {
  const { utilisateurDepuisRequete, REPONSE_401 } = await import("@/lib/apiAuth");
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });

  const { etatQuota, enregistrerUsage, MESSAGE_QUOTA_DEPASSE } = await import("@/lib/quotaIA");
  const quota = await etatQuota(user.id);
  if (quota.depasse) return NextResponse.json({ error: MESSAGE_QUOTA_DEPASSE }, { status: 402 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Clé ANTHROPIC_API_KEY manquante côté serveur." }, { status: 500 });
  }

  let entree: Entree;
  try {
    entree = (await req.json()) as Entree;
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }
  const question = (entree.question || "").trim().slice(0, 2000);
  if (!question) return NextResponse.json({ error: "Question vide." }, { status: 400 });
  // Garde-fous de taille : le résumé est borné côté client mais on plafonne
  // quand même (coût du quota, durée de la fonction).
  const resume = (entree.resume || "").slice(0, 60_000);
  const historique = (entree.historique || []).slice(-8);

  try {
    const client = new Anthropic({ apiKey, maxRetries: 1 });
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

    const messages: Anthropic.MessageParam[] = [
      ...historique
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.texte)
        .map((m) => ({ role: m.role, content: String(m.texte).slice(0, 2000) })),
      { role: "user", content: question },
    ];
    // L'API exige que la conversation commence par un tour utilisateur.
    while (messages.length && messages[0].role !== "user") messages.shift();

    const message = await client.messages.create({
      model,
      max_tokens: 1100,
      system: `${SYSTEM}\n\n=== RÉSUMÉ DES DONNÉES DU GARAGE ===\n${resume || "(aucune donnée transmise)"}`,
      messages,
    });

    await enregistrerUsage(user.id, message.usage?.input_tokens || 0, message.usage?.output_tokens || 0);

    const textPart = message.content.find((c) => c.type === "text");
    const raw = textPart && "text" in textPart ? textPart.text : "";
    const match = raw.match(/\{[\s\S]*\}/);
    let reponse = raw.trim();
    let liens: { label: string; href: string }[] = [];
    let action: unknown = null;
    if (match) {
      try {
        const j = JSON.parse(match[0]) as { reponse?: string; liens?: { label?: string; href?: string }[]; action?: unknown };
        if (j.reponse) reponse = String(j.reponse);
        // Validée côté client (le dossier doit exister dans SES données).
        if (j.action && typeof j.action === "object") action = j.action;
        liens = (j.liens || [])
          .filter((l) => l && l.label && typeof l.href === "string" && l.href.startsWith("/"))
          .slice(0, 4)
          .map((l) => ({ label: String(l.label), href: String(l.href) }));
      } catch {
        /* réponse en texte brut : on la garde telle quelle */
      }
    }
    if (!reponse) reponse = "Je n'ai pas réussi à formuler une réponse, reformule ta question ?";
    return NextResponse.json({ reponse, liens, action });
  } catch (err: unknown) {
    const anyErr = err as { status?: number; message?: string };
    const surcharge =
      anyErr?.status === 529 ||
      anyErr?.status === 429 ||
      (typeof anyErr?.message === "string" && anyErr.message.toLowerCase().includes("overloaded"));
    if (surcharge) {
      return NextResponse.json(
        { error: "MY-MY est un peu débordé, réessaie dans quelques secondes." },
        { status: 503 }
      );
    }
    console.error("mymy:", anyErr?.message);
    return NextResponse.json({ error: "MY-MY n'a pas pu répondre : " + (anyErr?.message || "erreur inconnue") }, { status: 500 });
  }
}
