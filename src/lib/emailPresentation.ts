// ============================================================
//  EMAILS PROSPECT (v12.8) — envoyés par le commercial ou l'éditeur depuis
//  /prospects, APRÈS un échange téléphonique :
//    1. PRÉSENTATION — l'essentiel en grandes lignes, la vidéo, le numéro
//       de la personne qui écrit pour fixer un rendez-vous.
//    2. CONFIRMATION DE RENDEZ-VOUS — date, heure, lieu, ce qu'on verra,
//       quoi préparer, qui appeler en cas d'empêchement.
//  CHARTE : fond clair, violet #7c3aed → fuchsia #db2777. Logo et vignette
//  vidéo HÉBERGÉS sur la vitrine (https://myeasyauto.fr/logo.png,
//  /presentation-poster.jpg) : jamais en pièce jointe ni en base64 (Gmail
//  et Outlook bloquent les images intégrées ; une image hébergée s'affiche
//  dès que le destinataire autorise les images, comme n'importe quel
//  email professionnel). HTML « email-safe » : tableaux, styles en ligne.
//  Fichier SANS import serveur : utilisable côté client pour l'aperçu.
// ============================================================

import { SOCIETE, ADRESSE_COMPLETE } from "@/components/vitrine/societe";
import type { TarifFormule } from "@/lib/admin/economie";

const VIOLET = "#7c3aed";
const FUCHSIA = "#db2777";
const TEAL = "#0d9488";
const FOND_PAGE = "#f6f4fb";
const CARTE = "#ffffff";
const ENCADRE = "#f5f0ff";
const ROSE_PALE = "#fdf2f8";
const TEXTE = "#241f3d";
const TEXTE_DOUX = "#6b6685";
const BORDURE = "#e2e2eb";
const POLICE = "Segoe UI,system-ui,-apple-system,Helvetica,Arial,sans-serif";

/** Ce que l'expéditeur a en commun dans les deux emails. */
export type ExpediteurEmail = {
  nom: string;
  tel?: string | null; // affiché en grand : c'est LUI qu'on appelle
  email?: string | null;
  codeApporteur?: string | null;
};

export type PresentationInput = {
  garageNom: string;
  contactNom?: string | null;
  messagePerso?: string | null;
  formuleSuggeree?: TarifFormule["formule"] | null;
  tarifs: TarifFormule[];
  expediteur: ExpediteurEmail;
};

export type LieuRdv = "atelier" | "visio" | "telephone";

export type ConfirmationRdvInput = {
  garageNom: string;
  contactNom?: string | null;
  /** ISO « 2026-09-22 » */
  date: string;
  /** « 14:30 » */
  heure: string;
  dureeMin?: number | null; // 20 par défaut
  lieu: LieuRdv;
  adresse?: string | null; // atelier
  lienVisio?: string | null; // visio
  messagePerso?: string | null;
  expediteur: ExpediteurEmail;
};

const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
const nl2br = (s: string) => esc(s).replace(/\r?\n/g, "<br>");
const telHref = (t: string) => `tel:${t.replace(/[^\d+]/g, "")}`;

export function dateRdvLisible(date: string, heure: string): string {
  const d = new Date(`${date}T${heure || "09:00"}:00`);
  if (Number.isNaN(d.getTime())) return `${date} à ${heure}`;
  const j = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `${j.charAt(0).toUpperCase()}${j.slice(1)} à ${heure.replace(":", " h ")}`;
}

export const LIEUX_RDV: Record<LieuRdv, string> = {
  atelier: "À votre atelier",
  visio: "En visio",
  telephone: "Par téléphone",
};

// ---------- sujets et textes par défaut ----------

export function sujetPresentation(garageNom: string): string {
  return `${SOCIETE.produit} pour ${garageNom} — l'essentiel en 2 minutes`;
}
export function messagePresentationDefaut(contactNom?: string | null): string {
  return `Merci pour notre échange téléphonique${contactNom ? `, ${contactNom}` : ""}. Comme promis, voici l'essentiel de ce que ${SOCIETE.produit} peut faire pour vous, en quelques lignes. Le plus simple pour la suite : un rendez-vous de 20 minutes pour vous montrer l'application sur un vrai dossier.`;
}
export function sujetConfirmationRdv(garageNom: string, date: string, heure: string): string {
  return `Rendez-vous confirmé — ${garageNom} × ${SOCIETE.produit}, ${dateRdvLisible(date, heure)}`;
}
export function messageConfirmationDefaut(): string {
  return `Merci pour votre disponibilité. Je vous confirme notre rendez-vous : je vous montrerai l'application sur un vrai dossier, du rapport d'expertise à la facture, et nous verrons ensemble la formule qui correspond à votre atelier.`;
}

// ---------- briques communes ----------

function entete(sousTitre: string): string {
  return `
  <tr><td style="height:6px;border-radius:14px 14px 0 0;background:${VIOLET};background:linear-gradient(90deg,${VIOLET},${FUCHSIA})"></td></tr>
  <tr><td style="background:${CARTE};padding:22px 32px 4px;border-left:1px solid ${BORDURE};border-right:1px solid ${BORDURE}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;width:84px"><img src="${SOCIETE.site}/logo.png" width="76" height="66" alt="${esc(SOCIETE.produit)}" style="display:block;width:76px;height:auto;border:0;border-radius:10px"></td>
      <td align="right" style="vertical-align:middle;font-family:${POLICE}">
        <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${FUCHSIA};font-weight:bold">${esc(SOCIETE.produit)} by ${esc(SOCIETE.editeur)}</div>
        <div style="font-size:12px;color:${TEXTE_DOUX};margin-top:4px">${esc(sousTitre)}</div>
      </td>
    </tr></table>
  </td></tr>`;
}

function corps(html: string): string {
  return `<tr><td style="background:${CARTE};padding:12px 32px 4px;border-left:1px solid ${BORDURE};border-right:1px solid ${BORDURE};font-family:${POLICE}">${html}</td></tr>`;
}

/** Bloc « pour un rendez-vous, appelez-moi » : le numéro de CELUI QUI ÉCRIT, en grand. */
function blocAppel(e: ExpediteurEmail, titre: string, texte: string): string {
  const tel = (e.tel || "").trim();
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 4px;background:${ROSE_PALE};border-radius:12px;border-left:4px solid ${FUCHSIA}">
      <tr><td style="padding:16px 20px;font-family:${POLICE}">
        <div style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:${FUCHSIA}">${esc(titre)}</div>
        <div style="font-size:14px;line-height:1.5;color:${TEXTE};margin-top:4px">${esc(texte)}</div>
        ${tel ? `<div style="margin-top:10px"><a href="${telHref(tel)}" style="display:inline-block;font-size:24px;font-weight:800;color:${VIOLET};text-decoration:none;letter-spacing:1px">📞 ${esc(tel)}</a></div>
        <div style="font-size:12px;color:${TEXTE_DOUX};margin-top:2px">${esc(e.nom)} · ${esc(SOCIETE.produit)}</div>` : `<div style="font-size:13px;color:${TEXTE_DOUX};margin-top:8px">Répondez simplement à cet email pour convenir d'un créneau.</div>`}
      </td></tr>
    </table>`;
}

function signature(e: ExpediteurEmail): string {
  const lignes = [
    `<b>${esc(e.nom)}</b>${e.codeApporteur ? ` — apporteur d'affaires ${esc(SOCIETE.produit)} (code ${esc(e.codeApporteur)})` : ` — ${esc(SOCIETE.produit)}`}`,
    e.tel ? `<a href="${telHref(e.tel)}" style="color:${TEXTE};text-decoration:none">${esc(e.tel)}</a>` : "",
    `<a href="mailto:${esc(e.email || SOCIETE.email)}" style="color:${TEAL};text-decoration:none">${esc(e.email || SOCIETE.email)}</a>`,
  ].filter(Boolean).join("<br>");
  return `
  <tr><td style="background:${CARTE};padding:8px 32px 24px;border-left:1px solid ${BORDURE};border-right:1px solid ${BORDURE};font-family:${POLICE}">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-left:3px solid ${VIOLET};padding-left:12px;font-family:${POLICE};font-size:13px;line-height:1.7;color:${TEXTE}">${lignes}</td></tr></table>
  </td></tr>`;
}

function pied(): string {
  return `
  <tr><td style="background:${ENCADRE};border-radius:0 0 14px 14px;padding:14px 32px;border:1px solid ${BORDURE}">
    <div style="font-family:${POLICE};font-size:11px;color:${TEXTE_DOUX};line-height:1.6">
      ${esc(SOCIETE.signature)} — ${esc(ADRESSE_COMPLETE)} · SIRET ${esc(SOCIETE.siret)}<br>
      <a href="${esc(SOCIETE.site)}" style="color:${VIOLET};text-decoration:none">${esc(SOCIETE.site.replace(/^https?:\/\//, ""))}</a> · <a href="mailto:${esc(SOCIETE.email)}" style="color:${VIOLET};text-decoration:none">${esc(SOCIETE.email)}</a> · Vous recevez cet email à la suite d'un échange avec l'un de nos commerciaux.
    </div>
  </td></tr>`;
}

function page(titre: string, preheader: string, contenu: string): string {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(titre)}</title></head>
<body style="margin:0;padding:0;background:${FOND_PAGE}">
<div style="display:none;max-height:0;overflow:hidden;color:${FOND_PAGE};font-size:1px">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FOND_PAGE};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">${contenu}</table>
</td></tr></table>
</body></html>`;
}

/** Vignette vidéo cliquable → page d'accueil, section #video. Une messagerie
 *  ne lit jamais une vidéo dans l'email : le lien ouvre la vitrine dans le
 *  navigateur, à l'endroit de la vidéo. */
function vignetteVideo(): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 4px">
      <tr><td style="border-radius:12px;overflow:hidden;border:1px solid ${BORDURE}">
        <a href="${esc(SOCIETE.site)}/#video" style="display:block;text-decoration:none">
          <img src="${esc(SOCIETE.site)}/presentation-poster.jpg" width="536" alt="Voir la vidéo de présentation (1 min 30)" style="display:block;width:100%;height:auto;border:0">
          <div style="background:${ENCADRE};padding:10px 14px;font-family:${POLICE};font-size:13px;color:${TEXTE}">
            <span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:${FUCHSIA};color:#ffffff;font-size:11px;margin-right:8px">&#9654;</span>
            <b>Voir l'application en 1 min 30</b> — du rapport d'expertise à la facture.
          </div>
        </a>
      </td></tr>
    </table>`;
}

// ---------- 1. PRÉSENTATION ----------

/** Les grandes lignes — 4 points, une phrase chacun. */
const POINTS: { icone: string; texte: string }[] = [
  { icone: "📄", texte: "<b>Le rapport d'expertise est lu pour vous</b> : déposez le PDF, le chiffrage se remplit." },
  { icone: "🧾", texte: "<b>Devis, facture et cession en un clic</b>, conformes au rapport et à la facturation électronique." },
  { icone: "📊", texte: "<b>Tous vos dossiers au même endroit</b>, avec les relances assurances et experts qui partent seules." },
  { icone: "🎧", texte: "<b>Les dossiers compliqués débloqués pour vous, si vous le souhaitez</b> : litiges, impayés, dossiers qui traînent — des chargés de mission spécialisés appellent assurances, experts et clients. 10, 20 ou 40 h par mois." },
];

export function emailPresentationHtml(b: PresentationInput): string {
  const bonjour = b.contactNom ? `Bonjour ${esc(b.contactNom)},` : "Bonjour,";
  const perso = (b.messagePerso || messagePresentationDefaut(b.contactNom)).trim();
  const points = POINTS.map((p) => `
    <tr>
      <td style="vertical-align:top;padding:5px 10px 5px 0;font-size:18px;line-height:1.3">${p.icone}</td>
      <td style="padding:5px 0;font-family:${POLICE};font-size:14px;line-height:1.5;color:${TEXTE}">${p.texte}</td>
    </tr>`).join("");
  const ligneTarif = (t: TarifFormule) => {
    const star = t.formule === b.formuleSuggeree;
    const fond = star ? ROSE_PALE : "transparent";
    return `<tr>
      <td style="padding:7px 10px;border-top:1px solid ${BORDURE};background:${fond};font-family:${POLICE};font-size:13px;color:${TEXTE}"><b>${esc(t.libelle)}</b> <span style="color:${TEXTE_DOUX}">— ${t.heures > 0 ? `appli + ${t.heures} h de déblocage de dossiers / mois` : "application seule"}</span>${star ? ` <span style="display:inline-block;background:${FUCHSIA};color:#fff;font-size:10px;font-weight:bold;letter-spacing:1px;border-radius:999px;padding:1px 7px;margin-left:4px;vertical-align:middle">CONSEILLÉE</span>` : ""}</td>
      <td align="right" style="padding:7px 10px;border-top:1px solid ${BORDURE};background:${fond};font-family:${POLICE};font-size:13px;color:${VIOLET};font-weight:bold;white-space:nowrap">dès ${eur(t.mensuelEngage)} HT / mois</td>
    </tr>`;
  };

  const contenu = `
  ${entete("La plateforme de gestion des carrosseries")}
  ${corps(`
    <div style="font-size:24px;line-height:1.2;font-weight:800;color:${VIOLET};margin:8px 0 12px">Vos dossiers sinistres, enfin simples.</div>
    <p style="font-size:14px;line-height:1.6;color:${TEXTE};margin:0 0 8px">${bonjour}</p>
    <p style="font-size:14px;line-height:1.6;color:${TEXTE};margin:0 0 6px">${nl2br(perso)}</p>
    <div style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:${FUCHSIA};margin:14px 0 2px">En grandes lignes</div>
    <table role="presentation" cellpadding="0" cellspacing="0">${points}</table>
    ${vignetteVideo()}
    <div style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:${FUCHSIA};margin:14px 0 4px">Les formules</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDURE};border-radius:10px;border-collapse:separate;overflow:hidden">
      ${b.tarifs.map(ligneTarif).join("")}
    </table>
    <div style="font-size:12px;color:${TEXTE_DOUX};line-height:1.5;margin-top:6px">Prix engagé 12 mois, mise en service offerte. Sans engagement : tarif plein, résiliable avec un mois de préavis. Tout est inclus, sans supplément à l'usage.</div>
    ${blocAppel(b.expediteur, "Pour fixer un rendez-vous", "Appelez-moi, on cale 20 minutes à l'atelier ou en visio, quand ça vous arrange.")}
  `)}
  ${signature(b.expediteur)}
  ${pied()}`;
  return page(sujetPresentation(b.garageNom), "Le rapport d'expertise lu pour vous, devis et factures en un clic, vos dossiers bloqués débloqués si vous le souhaitez.", contenu);
}

export function emailPresentationTexte(b: PresentationInput): string {
  const e = b.expediteur;
  const strip = (s: string) => s.replace(/<[^>]+>/g, "");
  return [
    b.contactNom ? `Bonjour ${b.contactNom},` : "Bonjour,",
    "",
    (b.messagePerso || messagePresentationDefaut(b.contactNom)).trim(),
    "",
    "EN GRANDES LIGNES",
    ...POINTS.map((p) => `- ${strip(p.texte)}`),
    "",
    `Vidéo de présentation (1 min 30) : ${SOCIETE.site}/#video`,
    "",
    "LES FORMULES (engagé 12 mois, € HT / mois)",
    ...b.tarifs.map((t) => `- ${t.libelle}${t.heures ? ` (appli + ${t.heures} h de déblocage de dossiers)` : " (application seule)"} : dès ${eur(t.mensuelEngage)}${t.formule === b.formuleSuggeree ? "  ← conseillée" : ""}`),
    "",
    `POUR FIXER UN RENDEZ-VOUS : appelez-moi${e.tel ? ` au ${e.tel}` : " (répondez à cet email)"}.`,
    "",
    `${e.nom}${e.codeApporteur ? ` — apporteur d'affaires ${SOCIETE.produit} (code ${e.codeApporteur})` : ` — ${SOCIETE.produit}`}`,
    e.email || SOCIETE.email,
    "",
    `${SOCIETE.signature} — ${ADRESSE_COMPLETE} — ${SOCIETE.site}`,
  ].join("\n");
}

// ---------- 2. CONFIRMATION DE RENDEZ-VOUS ----------

export function emailConfirmationRdvHtml(b: ConfirmationRdvInput): string {
  const bonjour = b.contactNom ? `Bonjour ${esc(b.contactNom)},` : "Bonjour,";
  const perso = (b.messagePerso || messageConfirmationDefaut()).trim();
  const duree = b.dureeMin || 20;
  const ou =
    b.lieu === "atelier" ? `${LIEUX_RDV.atelier}${b.adresse ? ` — ${esc(b.adresse)}` : ""}` :
    b.lieu === "visio" ? `${LIEUX_RDV.visio}${b.lienVisio ? ` — <a href="${esc(b.lienVisio)}" style="color:${TEAL};text-decoration:none;font-weight:bold">lien de connexion</a>` : " (le lien vous sera envoyé avant)"}` :
    `${LIEUX_RDV.telephone}${b.expediteur.tel ? ` — je vous appelle` : ""}`;
  const ligne = (label: string, valeur: string) => `
    <tr>
      <td style="padding:5px 14px 5px 0;color:${TEXTE_DOUX};font-size:13px;white-space:nowrap;vertical-align:top;font-family:${POLICE}">${label}</td>
      <td style="padding:5px 0;color:${TEXTE};font-size:14px;font-weight:bold;font-family:${POLICE}">${valeur}</td>
    </tr>`;
  const etape = (n: number, t: string) => `
    <tr>
      <td style="vertical-align:top;padding:5px 10px 5px 0"><span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:${VIOLET};color:#ffffff;font-size:12px;font-weight:bold;font-family:${POLICE}">${n}</span></td>
      <td style="padding:5px 0;color:${TEXTE};font-size:13px;line-height:1.5;font-family:${POLICE}">${t}</td>
    </tr>`;

  const contenu = `
  ${entete("Confirmation de rendez-vous")}
  ${corps(`
    <div style="font-size:24px;line-height:1.2;font-weight:800;color:${VIOLET};margin:8px 0 12px">Rendez-vous confirmé ✔</div>
    <p style="font-size:14px;line-height:1.6;color:${TEXTE};margin:0 0 8px">${bonjour}</p>
    <p style="font-size:14px;line-height:1.6;color:${TEXTE};margin:0 0 14px">${nl2br(perso)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${ENCADRE};border-left:4px solid ${VIOLET};border-radius:10px">
      <tr><td style="padding:14px 20px">
        <table role="presentation" cellpadding="0" cellspacing="0">
          ${ligne("Quand", esc(dateRdvLisible(b.date, b.heure)))}
          ${ligne("Durée", `${duree} minutes`)}
          ${ligne("Où", ou)}
          ${ligne("Avec", `${esc(b.expediteur.nom)}${b.expediteur.tel ? ` · <a href="${telHref(b.expediteur.tel)}" style="color:${VIOLET};text-decoration:none">${esc(b.expediteur.tel)}</a>` : ""}`)}
        </table>
      </td></tr>
    </table>
    <div style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:${FUCHSIA};margin:16px 0 4px">Ce que nous verrons ensemble</div>
    <table role="presentation" cellpadding="0" cellspacing="0">
      ${etape(1, "L'application en direct sur un vrai dossier : dépôt du rapport d'expertise, chiffrage, devis, facture.")}
      ${etape(2, "Le suivi des dossiers, les relances et, si cela vous intéresse, l'Adhésion Service pour débloquer les dossiers compliqués.")}
      ${etape(3, "La formule adaptée à votre atelier et les prochaines étapes, sans engagement de votre part.")}
    </table>
    <div style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:${FUCHSIA};margin:14px 0 4px">Pour en profiter au maximum</div>
    <p style="font-size:13px;line-height:1.6;color:${TEXTE};margin:0">Si vous avez sous la main <b>un rapport d'expertise récent</b>, nous ferons la démonstration dessus : vous verrez le résultat sur votre propre dossier. Prévoyez aussi vos questions, même les plus terre-à-terre.</p>
    ${vignetteVideo()}
    ${blocAppel(b.expediteur, "Un empêchement ?", "Un simple appel ou une réponse à cet email et nous décalons, sans problème.")}
  `)}
  ${signature(b.expediteur)}
  ${pied()}`;
  return page(sujetConfirmationRdv(b.garageNom, b.date, b.heure), `${dateRdvLisible(b.date, b.heure)} — ${LIEUX_RDV[b.lieu]}, ${duree} minutes.`, contenu);
}

export function emailConfirmationRdvTexte(b: ConfirmationRdvInput): string {
  const e = b.expediteur;
  const ou = b.lieu === "atelier" ? `${LIEUX_RDV.atelier}${b.adresse ? ` — ${b.adresse}` : ""}` : b.lieu === "visio" ? `${LIEUX_RDV.visio}${b.lienVisio ? ` — ${b.lienVisio}` : ""}` : LIEUX_RDV.telephone;
  return [
    b.contactNom ? `Bonjour ${b.contactNom},` : "Bonjour,",
    "",
    (b.messagePerso || messageConfirmationDefaut()).trim(),
    "",
    "RENDEZ-VOUS CONFIRMÉ",
    `Quand : ${dateRdvLisible(b.date, b.heure)}`,
    `Durée : ${b.dureeMin || 20} minutes`,
    `Où : ${ou}`,
    `Avec : ${e.nom}${e.tel ? ` · ${e.tel}` : ""}`,
    "",
    "Ce que nous verrons : l'application sur un vrai dossier (rapport d'expertise → chiffrage → devis → facture), le suivi et les relances, l'Adhésion Service (déblocage des litiges et impayés) si cela vous intéresse, la formule adaptée à votre atelier.",
    "Si vous avez un rapport d'expertise récent sous la main, nous ferons la démonstration dessus.",
    "",
    `Vidéo de présentation (1 min 30) : ${SOCIETE.site}/#video`,
    `Un empêchement ? Appelez-moi${e.tel ? ` au ${e.tel}` : ""} ou répondez à cet email.`,
    "",
    `${e.nom}${e.codeApporteur ? ` — apporteur d'affaires ${SOCIETE.produit} (code ${e.codeApporteur})` : ` — ${SOCIETE.produit}`}`,
    e.email || SOCIETE.email,
    "",
    `${SOCIETE.signature} — ${ADRESSE_COMPLETE} — ${SOCIETE.site}`,
  ].join("\n");
}
