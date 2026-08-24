import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { envoyerEmailServeur } from "@/lib/mailer";
import { templateRelance, totalPaye, estSoldee } from "@/lib/paiements";
import { PALIERS, etatRecouvrement } from "@/lib/recouvrement";
import { envoyerPush } from "@/lib/pushServeur";
import { Document, Paiement, Relance } from "@/lib/types";

// RELANCES AUTOMATIQUES (cron quotidien planifié dans vercel.json).
// Pour chaque facture : échéance dépassée + reste à payer + dossier avec
// relance_auto activé + email assureur connu + pas de relance depuis 7 jours
// + moins de 2 relances déjà faites → envoi automatique de la relance n°1 ou
// n°2 à l'assureur. La MISE EN DEMEURE (n°3) reste toujours manuelle.

export const runtime = "nodejs";
export const maxDuration = 60;

// ESCALADE (v50) : les paliers sont définis dans lib/recouvrement.ts et
// comptés en JOURS DE RETARD (J+15 courtoise, J+30 ferme, J+45 mise en
// demeure). Seuls les paliers non manuels partent tout seuls — la mise en
// demeure est un acte juridique, elle reste à la main du garage.

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function executer(req: Request) {
  // Protection : FAIL-CLOSED. Cette route déclenche des envois d'emails en
  // masse (via la boîte SMTP du garage) : sans CRON_SECRET, elle serait un
  // relais ouvert sur internet. On EXIGE donc le secret. Vercel Cron l'envoie
  // automatiquement en "Authorization: Bearer <CRON_SECRET>".
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET non configuré : relances automatiques désactivées (sécurité). Définis CRON_SECRET dans les variables d'environnement Vercel." },
      { status: 503 }
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY manquante : relances auto indisponibles." },
      { status: 500 }
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString().slice(0, 10);
  // Borne d'ancienneté (18 mois) : évite de rescanner indéfiniment de très
  // vieilles factures et borne le volume chargé en mémoire.
  const borne = new Date(today);
  borne.setMonth(borne.getMonth() - 18);
  const borneIso = borne.toISOString().slice(0, 10);

  // Factures échues (toutes, service role : on filtre ensuite par dossier)
  const { data: docs, error: e1 } = await admin
    .from("documents")
    .select("*")
    .eq("type", "facture")
    .not("date_echeance", "is", null)
    .lt("date_echeance", todayIso)
    .gte("date_echeance", borneIso);
  if (e1) {
    console.error("relances-auto: lecture factures:", e1.message);
    return NextResponse.json({ error: "Lecture des factures impossible." }, { status: 500 });
  }

  const factures = docs || [];
  if (factures.length === 0) return NextResponse.json({ ok: true, examinees: 0, envoyees: 0 });

  const docIds = factures.map((f) => f.id);
  const dossierIds = Array.from(new Set(factures.map((f) => f.dossier_id).filter(Boolean)));

  const [dossiersRes, paiementsRes, relancesRes, cessionsRes, clientsRes] = await Promise.all([
    admin.from("dossiers").select("*").in("id", dossierIds),
    admin.from("paiements").select("*").in("document_id", docIds),
    admin.from("relances").select("*").in("document_id", docIds).order("date_relance", { ascending: false }),
    admin.from("cessions_creance").select("dossier_id,statut").in("dossier_id", dossierIds).eq("statut", "signe"),
    admin.from("clients").select("owner_id,nom,email").not("email", "is", null),
  ]);
  const dossiers = dossiersRes.data || [];
  const paiements = paiementsRes.data || [];
  const relances = relancesRes.data || [];
  const cessionsSignees = new Set((cessionsRes.data || []).map((c) => c.dossier_id));
  const clients = clientsRes.data || [];

  let envoyees = 0;
  const details: string[] = [];
  // Factures arrivées au palier « mise en demeure » : jamais envoyées
  // automatiquement, mais signalées au garage par notification.
  const aPreparer: { owner: string; libelle: string }[] = [];

  for (const f of factures) {
    const dossier = dossiers.find((d) => d.id === f.dossier_id);
    if (!dossier || !dossier.relance_auto) continue;

    // Destinataire selon le processus : cession OU prise en charge → ASSURANCE
    // (en PEC, l'assurance règle DIRECTEMENT le garage : c'est elle le
    // débiteur, jamais le client) ; cas normal → CLIENT.
    // Même logique que lib/dossierSync.destinataireRelance — garder alignés.
    const enCession =
      Boolean(dossier.mode_cession) || cessionsSignees.has(dossier.id) || Boolean(dossier.mode_pec);
    let destinataire: string | null = null;
    if (enCession) {
      destinataire = dossier.assureur_email || null;
    } else if (dossier.client_email) {
      destinataire = dossier.client_email;
    } else if (dossier.client_nom) {
      const c = clients.find(
        (x) =>
          x.owner_id === f.owner_id &&
          (x.nom || "").trim().toLowerCase() === String(dossier.client_nom).trim().toLowerCase()
      );
      destinataire = c?.email || null;
    }
    if (!destinataire) continue;

    const paye = totalPaye(paiements.filter((p) => p.document_id === f.id));
    // Tolérance d'1 centime (estSoldee) : une facture payée au centime près
    // ne doit pas déclencher de relance pour un reste d'arrondi de 0,004 €.
    if (estSoldee(f.total_ttc, paye)) continue;

    const etat = etatRecouvrement(
      f as Document,
      paiements as Paiement[],
      relances as Relance[]
    );
    // Rien à faire à ce stade du retard : le palier suivant n'est pas atteint.
    if (!etat.aFaire) continue;

    // Palier MANUEL (mise en demeure) : on ne l'envoie jamais tout seul,
    // on prévient le garage pour qu'il décide.
    if (etat.aFaire.manuel) {
      aPreparer.push({
        owner: f.owner_id,
        libelle: `${f.numero || "facture"} — ${dossier.client_nom || dossier.assureur || "client"} (${etat.retard} j)`,
      });
      details.push(`${f.numero || f.id} → mise en demeure à préparer (${etat.retard} j de retard)`);
      continue;
    }

    const niveau = etat.aFaire.niveau;
    const { subject, body } = templateRelance(niveau, f, dossier, enCession);
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.5">${escapeHtml(
      body
    ).replace(/\n/g, "<br>")}</div>`;

    // IDEMPOTENCE : la relance est enregistrée AVANT l'envoi, protégée par
    // l'index unique (document_id, date_relance) where auto (migration v33).
    // Deux exécutions simultanées (cron + déclenchement manuel) ne peuvent
    // plus envoyer le même email deux fois : la seconde échoue ici et saute
    // la facture. Si l'envoi échoue ensuite, on retire la ligne pour
    // permettre une nouvelle tentative au prochain run.
    const { data: relIns, error: eRel } = await admin
      .from("relances")
      .insert({
        dossier_id: dossier.id,
        document_id: f.id,
        date_relance: todayIso,
        canal: "email",
        notes: `Relance automatique n°${niveau} — ${PALIERS[niveau - 1]?.label || "relance"}`,
        owner_id: f.owner_id,
        auto: true,
      })
      .select("id")
      .single();
    if (eRel || !relIns) {
      // Doublon (déjà relancée aujourd'hui par un run concurrent) ou échec DB :
      // dans les deux cas on N'ENVOIE PAS (mieux vaut zéro relance qu'une double).
      details.push(`${f.numero || f.id} → sautée (${eRel?.code === "23505" ? "déjà relancée aujourd'hui" : "journalisation impossible"})`);
      continue;
    }

    // Config SMTP DU garage propriétaire de la facture (multi-garages)
    const res = await envoyerEmailServeur(
      { to: destinataire, subject, text: body, html },
      f.owner_id
    );

    // Journalisation (owner_id EXPLICITE : le service role n'a pas d'auth.uid())
    const { error: eMail } = await admin.from("emails").insert({
      dossier_id: dossier.id,
      destinataire,
      objet: subject,
      corps: body,
      statut: res.ok ? "envoye" : "echec",
      erreur: res.ok ? null : res.error || null,
      owner_id: f.owner_id,
    });
    if (eMail) console.error("relances-auto: journal emails en échec:", eMail.message);

    if (res.ok) {
      envoyees++;
      details.push(`${f.numero || f.id} → relance n°${niveau} (${destinataire})`);
    } else {
      // Envoi raté : on retire la relance pré-enregistrée pour réessayer plus tard.
      await admin.from("relances").delete().eq("id", relIns.id);
      details.push(`${f.numero || f.id} → ÉCHEC : ${res.error}`);
    }
  }

  // NOTIFICATION des mises en demeure à préparer (une par garage).
  const parGarage = new Map<string, string[]>();
  for (const x of aPreparer) {
    if (!parGarage.has(x.owner)) parGarage.set(x.owner, []);
    parGarage.get(x.owner)!.push(x.libelle);
  }
  for (const [owner, libelles] of Array.from(parGarage.entries())) {
    try {
      await envoyerPush(admin, owner, {
        titre:
          libelles.length === 1
            ? "Une mise en demeure à envoyer"
            : `${libelles.length} mises en demeure à envoyer`,
        corps: libelles.slice(0, 3).join(" · "),
        url: "/finance",
        tag: "mise-en-demeure",
        persistante: true,
      });
    } catch {
      /* la notification ne doit jamais bloquer le cron */
    }
  }

  return NextResponse.json({
    ok: true,
    examinees: factures.length,
    envoyees,
    misesEnDemeureAPreparer: aPreparer.length,
    details,
  });
}

export async function GET(req: Request) {
  return executer(req);
}
export async function POST(req: Request) {
  return executer(req);
}
