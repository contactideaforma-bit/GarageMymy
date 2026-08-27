// ============================================================
//  EMAIL DE BIENVENUE (v10.5) — envoyé au garage à la création de son
//  compte (action « creer_compte_garage » de /api/admin/donnees).
//  CHARTE : FOND CLAIR par défaut (comme les PDF et la vitrine —
//  violet #7c3aed → fuchsia #db2777 sur blanc). Le mode sombre n'existe
//  que si le client l'active DANS l'appli : un email, lui, reste clair.
//  HTML « email-safe » : tableaux, styles en ligne, pas de classes CSS.
// ============================================================

import { SOCIETE, ADRESSE_COMPLETE } from "@/components/vitrine/societe";

const VIOLET = "#7c3aed";
const FUCHSIA = "#db2777";
const TEAL = "#0d9488"; // turquoise du thème clair
const FOND_PAGE = "#f6f4fb"; // gris-violet très pâle autour de la carte
const CARTE = "#ffffff";
const ENCADRE = "#f5f0ff"; // violet pâle (comme les encadrés des PDF)
const TEXTE = "#241f3d";
const TEXTE_DOUX = "#6b6685";
const BORDURE = "#e2e2eb";

export type BienvenueInput = {
  garageNom: string;
  contactNom?: string | null;
  email: string;
  motDePasse: string;
  formule?: string | null; // libellé (« Confort — application + 20 h… »)
  heures?: number | null;
  secretaireNom?: string | null;
  commercialNom?: string | null;
  url?: string;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function sujetBienvenue(garageNom: string): string {
  return `Bienvenue sur ${SOCIETE.produit} — votre compte ${garageNom} est prêt`;
}

export function emailBienvenueHtml(b: BienvenueInput): string {
  const url = b.url || SOCIETE.site;
  const bonjour = b.contactNom ? `Bonjour ${esc(b.contactNom)},` : "Bonjour,";
  const ligne = (label: string, valeur: string, mono = false) => `
    <tr>
      <td style="padding:6px 14px 6px 0;color:${TEXTE_DOUX};font-size:13px;white-space:nowrap;vertical-align:top">${label}</td>
      <td style="padding:6px 0;color:${TEXTE};font-size:${mono ? "15px" : "13px"};${mono ? `font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:0.5px;color:${VIOLET};font-weight:bold;` : ""}">${valeur}</td>
    </tr>`;
  const etape = (n: number, t: string) => `
    <tr>
      <td style="vertical-align:top;padding:5px 10px 5px 0">
        <span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:${VIOLET};color:#ffffff;font-size:12px;font-weight:bold">${n}</span>
      </td>
      <td style="padding:5px 0;color:${TEXTE};font-size:13px;line-height:1.5">${t}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:${FOND_PAGE}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FOND_PAGE};padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

  <!-- filet de charte violet → fuchsia -->
  <tr><td style="height:5px;border-radius:14px 14px 0 0;background:${VIOLET};background:linear-gradient(90deg,${VIOLET},${FUCHSIA})"></td></tr>

  <!-- en-tête -->
  <tr><td style="background:${CARTE};padding:28px 32px 8px 32px;border-left:1px solid ${BORDURE};border-right:1px solid ${BORDURE}">
    <div style="font-family:Segoe UI,system-ui,-apple-system,sans-serif">
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${FUCHSIA};font-weight:bold">${esc(SOCIETE.produit)} by ${esc(SOCIETE.editeur)}</div>
      <div style="font-size:26px;font-weight:800;color:${VIOLET};margin-top:6px">Bienvenue à bord 🚗</div>
    </div>
  </td></tr>

  <!-- corps -->
  <tr><td style="background:${CARTE};padding:12px 32px 28px 32px;font-family:Segoe UI,system-ui,-apple-system,sans-serif;border-left:1px solid ${BORDURE};border-right:1px solid ${BORDURE}">
    <p style="color:${TEXTE};font-size:14px;line-height:1.6;margin:0 0 12px">${bonjour}</p>
    <p style="color:${TEXTE};font-size:14px;line-height:1.6;margin:0 0 18px">
      Le compte de <b>${esc(b.garageNom)}</b> vient d'être créé sur ${esc(SOCIETE.produit)},
      votre plateforme de gestion des dossiers de sinistres${b.formule ? ` (formule <b>${esc(b.formule)}</b>${b.heures ? `, ${b.heures} h de secrétariat par mois` : ""})` : ""}.
    </p>

    <!-- identifiants : encadré violet pâle, barre de couleur à gauche (charte PDF) -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${ENCADRE};border-left:4px solid ${VIOLET};border-radius:10px">
      <tr><td style="padding:16px 20px">
        <div style="color:${VIOLET};font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Vos identifiants</div>
        <table role="presentation" cellpadding="0" cellspacing="0">
          ${ligne("Adresse de connexion", `<a href="${esc(url)}" style="color:${TEAL};text-decoration:none;font-weight:bold">${esc(url.replace(/^https?:\/\//, ""))}</a>`)}
          ${ligne("Email", esc(b.email))}
          ${ligne("Mot de passe provisoire", esc(b.motDePasse), true)}
        </table>
        <div style="color:${TEXTE_DOUX};font-size:12px;margin-top:8px">⚠️ Changez ce mot de passe dès votre première connexion (Profil → Mot de passe).</div>
      </td></tr>
    </table>

    <!-- bouton -->
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px auto"><tr><td style="border-radius:10px;background:${VIOLET};background:linear-gradient(90deg,${VIOLET},${FUCHSIA})">
      <a href="${esc(url)}" style="display:inline-block;padding:12px 30px;color:#ffffff;font-family:Segoe UI,system-ui,sans-serif;font-size:15px;font-weight:bold;text-decoration:none">Ouvrir ${esc(SOCIETE.produit)}</a>
    </td></tr></table>

    <!-- premiers pas -->
    <div style="color:${FUCHSIA};font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin:4px 0 8px">Vos premiers pas</div>
    <table role="presentation" cellpadding="0" cellspacing="0">
      ${etape(1, "Connectez-vous et <b>changez votre mot de passe</b> dans Profil.")}
      ${etape(2, "Complétez votre fiche entreprise (logo, RIB, SIRET) : elle alimente vos devis et factures.")}
      ${etape(3, "Créez votre premier dossier de sinistre — ou déposez le rapport d'expertise, l'analyse remplit le chiffrage.")}
      ${etape(4, "Sur mobile, ajoutez l'application à l'écran d'accueil pour recevoir les notifications.")}
      ${b.secretaireNom ? etape(5, `Votre secrétaire dédiée, <b>${esc(b.secretaireNom)}</b>, vous contacte pour la mise en service.`) : ""}
    </table>

    <p style="color:${TEXTE_DOUX};font-size:13px;line-height:1.6;margin:18px 0 0">
      Une question ? Répondez simplement à cet email ou écrivez-nous à
      <a href="mailto:${esc(SOCIETE.email)}" style="color:${TEAL};text-decoration:none">${esc(SOCIETE.email)}</a>.${b.commercialNom ? ` Votre interlocuteur commercial : ${esc(b.commercialNom)}.` : ""}
    </p>
  </td></tr>

  <!-- pied -->
  <tr><td style="background:${ENCADRE};border-radius:0 0 14px 14px;padding:16px 32px;border:1px solid ${BORDURE};border-top:1px solid ${BORDURE}">
    <div style="font-family:Segoe UI,system-ui,sans-serif;font-size:11px;color:${TEXTE_DOUX};line-height:1.6">
      ${esc(SOCIETE.editeur)} — ${esc(ADRESSE_COMPLETE)}<br>
      SIRET ${esc(SOCIETE.siret)} · <a href="${esc(SOCIETE.site)}" style="color:${VIOLET};text-decoration:none">${esc(SOCIETE.site.replace(/^https?:\/\//, ""))}</a>
    </div>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

export function emailBienvenueTexte(b: BienvenueInput): string {
  const url = b.url || SOCIETE.site;
  return [
    `${b.contactNom ? `Bonjour ${b.contactNom},` : "Bonjour,"}`,
    "",
    `Le compte de ${b.garageNom} vient d'être créé sur ${SOCIETE.produit}${b.formule ? ` (formule ${b.formule})` : ""}.`,
    "",
    `Adresse : ${url}`,
    `Email : ${b.email}`,
    `Mot de passe provisoire : ${b.motDePasse}`,
    "Changez ce mot de passe dès votre première connexion (Profil).",
    "",
    "Premiers pas : 1) changer le mot de passe, 2) compléter la fiche entreprise (logo, RIB), 3) créer un premier dossier ou déposer un rapport d'expertise, 4) sur mobile, ajouter l'application à l'écran d'accueil.",
    ...(b.secretaireNom ? [`Votre secrétaire dédiée, ${b.secretaireNom}, vous contacte pour la mise en service.`] : []),
    "",
    `Une question ? ${SOCIETE.email}${b.commercialNom ? ` — votre interlocuteur commercial : ${b.commercialNom}` : ""}`,
    `${SOCIETE.editeur} — ${ADRESSE_COMPLETE}`,
  ].join("\n");
}
