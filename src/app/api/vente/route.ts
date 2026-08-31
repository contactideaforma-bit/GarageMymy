import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { envoyerEmailServeur } from "@/lib/mailer";
import { comptesAdmin, emailsAdminServeur } from "@/lib/supportServeur";
import { FORMULES, Formule, Parametres, fusionnerParametres, prixVente, primeVente } from "@/lib/admin/economie";
import type { ParametresPublics } from "@/lib/admin/ventePublic";

// ============================================================
//  DÉCLARATION DE VENTE (v10.0) — route PUBLIQUE, sans compte.
//
//  Le commercial n'a pas de compte : il s'identifie par son CODE APPORTEUR
//  (collaborateurs.code_apporteur). Les prix sont RECALCULÉS ici depuis les
//  paramètres de l'éditeur (le navigateur ne fait pas foi), la vente est
//  enregistrée (table `ventes`, invisible du navigateur) puis l'éditeur et
//  le commercial sont prévenus par email (best-effort).
//
//  GET  ?code=XXXX      → identité du commercial + grille tarifaire publique
//  POST { ... }         → enregistre la vente déclarée, renvoie son numéro
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 20;

const MAX_PAR_HEURE = 20;
const compteurs = new Map<string, { n: number; depuis: number }>();
function tropDeDemandes(ip: string): boolean {
  const maintenant = Date.now();
  const c = compteurs.get(ip);
  if (!c || maintenant - c.depuis > 3_600_000) {
    compteurs.set(ip, { n: 1, depuis: maintenant });
    return false;
  }
  c.n += 1;
  return c.n > MAX_PAR_HEURE;
}
// Audit v10.6 : les caractères de contrôle (\r, \n, \t…) sont neutralisés —
// certains champs finissent dans un SUJET d'email (anti header-injection).
const texte = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "";
const echapper = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);

function parametresPublics(p: Parametres): ParametresPublics {
  const formules = {} as Parametres["formules"];
  for (const f of FORMULES) formules[f] = { ...p.formules[f] };
  return {
    formules,
    remiseEngagement: p.remiseEngagement,
    bonusAnnuelMensualites: p.bonusAnnuelMensualites,
    bonusAnnuelEuros: p.bonusAnnuelEuros,
    miseEnService: p.miseEnService,
    heureHorsForfait: p.heureHorsForfait,
    iban: p.iban,
    bic: p.bic,
    lienPaiementCb: p.lienPaiementCb,
    primeMensualiteAvecEngagement: p.primeMensualiteAvecEngagement,
    primeMensualiteSansEngagement: p.primeMensualiteSansEngagement,
    mensualitesReprise: p.mensualitesReprise,
  };
}

type Commercial = { id: string; nom: string; prenom: string | null; email: string | null; statut: string; type: string };

async function commercialParCode(admin: NonNullable<ReturnType<typeof getAdminClient>>, code: string): Promise<Commercial | null> {
  // Audit v10.6 : `ilike` traite % et _ comme des JOKERS SQL — un code "%"
  // aurait fait correspondre n'importe quel commercial (énumération +
  // déclaration de ventes sans connaître de code). On ne garde que les
  // caractères d'un vrai code apporteur avant la requête.
  const propre = code.replace(/[^A-Z0-9-]/g, "");
  if (!propre || propre.length < 3) return null;
  const { data } = await admin
    .from("collaborateurs")
    .select("id,nom,prenom,email,statut,type,code_apporteur")
    .ilike("code_apporteur", propre)
    .limit(1)
    .maybeSingle();
  if (!data || data.type !== "commercial" || data.statut !== "actif") return null;
  return data as Commercial;
}

async function lireParametres(admin: NonNullable<ReturnType<typeof getAdminClient>>): Promise<Parametres> {
  const { data } = await admin.from("admin_parametres").select("valeur").eq("cle", "grille").maybeSingle();
  return fusionnerParametres((data?.valeur as Partial<Parametres>) || null);
}

export async function GET(req: Request) {
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "Service non configuré." }, { status: 500 });
  const code = texte(new URL(req.url).searchParams.get("code"), 20).toUpperCase();
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "inconnue";
  if (tropDeDemandes(ip)) return NextResponse.json({ error: "Trop de tentatives, réessayez dans une heure." }, { status: 429 });
  const c = await commercialParCode(admin, code);
  if (!c) return NextResponse.json({ error: "Code apporteur inconnu ou inactif." }, { status: 404 });
  const p = await lireParametres(admin);
  return NextResponse.json({ commercial: { prenom: c.prenom, nom: c.nom }, parametres: parametresPublics(p) });
}

export async function POST(req: Request) {
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "Service non configuré." }, { status: 500 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (texte(body.site, 10)) return NextResponse.json({ ok: true }); // piège à robots

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "inconnue";
  if (tropDeDemandes(ip)) return NextResponse.json({ error: "Trop d'envois, réessayez dans une heure." }, { status: 429 });

  const code = texte(body.code_apporteur, 20).toUpperCase();
  const c = await commercialParCode(admin, code);
  if (!c) return NextResponse.json({ error: "Code apporteur inconnu ou inactif." }, { status: 403 });

  const garage_nom = texte(body.garage_nom, 160);
  const contact_email = texte(body.contact_email, 160).toLowerCase();
  const formule = texte(body.formule, 20) as Formule;
  if (!garage_nom || !contact_email || !FORMULES.includes(formule)) {
    return NextResponse.json({ error: "Nom du garage, email et formule sont obligatoires." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact_email)) {
    return NextResponse.json({ error: "L'adresse email semble incorrecte." }, { status: 400 });
  }
  if (!body.cgv_acceptees) return NextResponse.json({ error: "Le garage doit accepter les conditions de vente." }, { status: 400 });
  // v11.7 — les CGU sont désormais un contrat à part entière, accepté à la
  // vente au même titre que les CGV (audit juridique du 31/08/2026, §6.5).
  if (!body.cgu_acceptees) return NextResponse.json({ error: "Le garage doit accepter les conditions d'utilisation." }, { status: 400 });
  // Sans cette autorisation, faire intervenir une secrétaire indépendante sur
  // le compte constitue une sous-traitance non autorisée (art. 28.2 RGPD).
  if (!body.autorisation_sous_traitance) return NextResponse.json({ error: "Le garage doit autoriser l'intervention d'un collaborateur externe (RGPD)." }, { status: 400 });
  const signature = typeof body.signature === "string" && body.signature.startsWith("data:image/png;base64,") ? body.signature.slice(0, 400_000) : null;
  if (!signature) return NextResponse.json({ error: "La signature du garage est obligatoire." }, { status: 400 });

  // PRIX RECALCULÉS côté serveur — seule la grille de l'éditeur fait foi.
  const p = await lireParametres(admin);
  const periodicite = body.periodicite === "annuel" ? "annuel" : "mensuel";
  const engagement_12 = periodicite === "annuel" || Boolean(body.engagement_12);
  const remise_supp_pct = Math.min(30, Math.max(0, Number(body.remise_supp_pct) || 0));
  const prix = prixVente(formule, { engagement12: engagement_12, periodicite, remiseSupp: remise_supp_pct }, p);

  const mode = texte(body.mode_paiement, 20);
  const mode_paiement = ["virement", "prelevement", "cheque", "especes", "cb"].includes(mode) ? mode : "virement";
  const d = new Date();
  const numero = `V-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}-${String(Date.now()).slice(-5)}`;

  // Audit v10.6 : la fiche de besoins est bornée — route publique, on ne
  // stocke pas des blobs arbitraires dans le jsonb.
  const besoins = body.besoins && typeof body.besoins === "object" ? body.besoins : null;
  if (besoins && JSON.stringify(besoins).length > 100_000) {
    return NextResponse.json({ error: "Fiche de besoins trop volumineuse." }, { status: 413 });
  }

  const ligne = {
    numero,
    code_apporteur: code,
    collaborateur_id: c.id,
    garage_nom,
    garage_siret: texte(body.garage_siret, 20) || null,
    garage_adresse: texte(body.garage_adresse, 200) || null,
    garage_cp: texte(body.garage_cp, 10) || null,
    garage_ville: texte(body.garage_ville, 100) || null,
    contact_nom: texte(body.contact_nom, 120) || null,
    contact_fonction: texte(body.contact_fonction, 80) || null,
    contact_tel: texte(body.contact_tel, 40) || null,
    contact_email,
    formule,
    engagement_12,
    periodicite,
    remise_supp_pct,
    prix_mensuel_ht: prix.mensualite,
    montant_annuel_ht: prix.montantAnnuel,
    mise_en_service_ht: prix.miseEnService,
    date_debut_souhaitee: texte(body.date_debut_souhaitee, 10) || null,
    mode_paiement,
    paiement_sur_place: Boolean(body.paiement_sur_place),
    paiement_montant: body.paiement_sur_place ? Number(body.paiement_montant) || null : null,
    paiement_reference: texte(body.paiement_reference, 120) || null,
    besoins,
    cgv_acceptees: true,
    cgu_acceptees: true,
    version_cgu: texte(body.version_cgu, 40) || null,
    autorisation_sous_traitance: true,
    version_dpa: texte(body.version_dpa, 40) || null,
    signataire_nom: texte(body.signataire_nom, 120) || null,
    signataire_qualite: texte(body.signataire_qualite, 80) || null,
    signature,
    signe_le: new Date().toISOString(),
    statut: "declaree",
    ip,
    user_agent: (req.headers.get("user-agent") || "").slice(0, 300),
  };
  const { data, error } = await admin.from("ventes").insert(ligne).select("id,numero").single();
  if (error) {
    console.error("[vente] enregistrement impossible :", error.message);
    return NextResponse.json({ error: "Enregistrement impossible (migration v55 exécutée ?)." }, { status: 500 });
  }

  // Emails best-effort : éditeur (à valider) + commercial (accusé).
  try {
    const comptes = await comptesAdmin(admin);
    const expediteurId = comptes[0]?.id;
    if (expediteurId) {
      const prime = primeVente(formule, { engagement12: engagement_12, periodicite, mensualiteFacturee: prix.montantAnnuel != null ? prix.montantAnnuel / 12 : prix.mensualite }, p);
      const resume = [
        `Vente ${numero} déclarée par ${[c.prenom, c.nom].filter(Boolean).join(" ")} (code ${code})`,
        `Garage : ${garage_nom}${ligne.garage_ville ? ` — ${ligne.garage_ville}` : ""} · ${ligne.contact_nom || ""} ${ligne.contact_tel || ""} ${contact_email}`,
        `Formule : ${p.formules[formule].libelle} · ${engagement_12 ? "engagement 12 mois" : "sans engagement"} · ${periodicite === "annuel" ? `année payée en une fois ${prix.montantAnnuel} € HT` : `${prix.mensualite} € HT / mois`}${remise_supp_pct ? ` · remise supp. ${remise_supp_pct} % À VALIDER` : ""}`,
        `Paiement : ${mode_paiement}${ligne.paiement_sur_place ? ` — reçu sur place ${ligne.paiement_montant ?? ""} € réf. ${ligne.paiement_reference || "—"}` : ""}`,
        `Prime prévue : ${prime.total} € (acquise à la ${prime.mensualiteEcheance}e mensualité encaissée, reprise si arrêt avant la ${prime.mensualitesReprise}e)`,
      ];
      const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6;color:#1e2233"><h2>Nouvelle vente à valider — ${echapper(numero)}</h2>${resume
        .map((l) => `<p style="margin:4px 0">${echapper(l)}</p>`)
        .join("")}<p><a href="${process.env.NEXT_PUBLIC_SITE_URL || "https://myeasyauto.fr"}/admin/ventes">Ouvrir l'espace éditeur → Ventes</a></p></div>`;
      await envoyerEmailServeur(
        { to: emailsAdminServeur().join(","), subject: `[Vente] ${garage_nom} — ${p.formules[formule].libelle} (${numero})`, html, text: resume.join("\n"), replyTo: contact_email },
        expediteurId
      );
      if (c.email) {
        await envoyerEmailServeur(
          {
            to: c.email,
            subject: `Vente ${numero} bien reçue — ${garage_nom}`,
            text: `Bonjour ${c.prenom || ""},\n\nTa vente ${numero} (${garage_nom}, ${p.formules[formule].libelle}) est enregistrée. IDEAFORMA la valide sous 5 jours ouvrés et crée le compte du garage.\n\nPrime prévue : ${prime.total} € — acquise à la ${prime.mensualiteEcheance}e mensualité encaissée par IDEAFORMA${engagement_12 ? " (immédiate grâce à l'engagement 12 mois)" : " (différé de deux mois sans engagement)"}, reprise si le garage arrête avant la ${prime.mensualitesReprise}e mensualité.\n\nMerci !`,
          },
          expediteurId
        );
      }
    }
  } catch (e) {
    console.error("[vente] email non envoyé :", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true, id: data.id, numero: data.numero });
}
