// ============================================================
//  EMAILS COLLABORATEURS (v10.6) — même charte claire que l'email de
//  bienvenue garage (violet #7c3aed → fuchsia #db2777 sur blanc) :
//    · bienvenue du COMMERCIAL : compte créé depuis la fiche
//      collaborateur (identifiants + premiers pas) ;
//    · envoi de la DOCUMENTATION (contrat signé + documents
//      d'information) — utilisé surtout pour la secrétaire, qui n'a
//      pas de compte dédié.
// ============================================================

import { SOCIETE, ADRESSE_COMPLETE } from "@/components/vitrine/societe";

const VIOLET = "#7c3aed";
const FUCHSIA = "#db2777";
const TEAL = "#0d9488";
const FOND_PAGE = "#f6f4fb";
const CARTE = "#ffffff";
const ENCADRE = "#f5f0ff";
const TEXTE = "#241f3d";
const TEXTE_DOUX = "#6b6685";
const BORDURE = "#e2e2eb";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function page(titre: string, corps: string): string {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:${FOND_PAGE}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FOND_PAGE};padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="height:5px;border-radius:14px 14px 0 0;background:${VIOLET};background:linear-gradient(90deg,${VIOLET},${FUCHSIA})"></td></tr>
  <tr><td style="background:${CARTE};padding:28px 32px 8px 32px;border-left:1px solid ${BORDURE};border-right:1px solid ${BORDURE}">
    <div style="font-family:Segoe UI,system-ui,-apple-system,sans-serif">
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${FUCHSIA};font-weight:bold">${esc(SOCIETE.produit)} by ${esc(SOCIETE.editeur)}</div>
      <div style="font-size:26px;font-weight:800;color:${VIOLET};margin-top:6px">${titre}</div>
    </div>
  </td></tr>
  <tr><td style="background:${CARTE};padding:12px 32px 28px 32px;font-family:Segoe UI,system-ui,-apple-system,sans-serif;border-left:1px solid ${BORDURE};border-right:1px solid ${BORDURE}">
    ${corps}
    <p style="color:${TEXTE_DOUX};font-size:13px;line-height:1.6;margin:18px 0 0">
      Une question ? Répondez simplement à cet email ou écrivez-nous à
      <a href="mailto:${esc(SOCIETE.email)}" style="color:${TEAL};text-decoration:none">${esc(SOCIETE.email)}</a>.
    </p>
  </td></tr>
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

/* ---------------- Bienvenue du commercial ---------------- */
export type BienvenueCommercialInput = {
  nom: string;            // prénom + nom
  email: string;
  motDePasse: string;
  codeApporteur?: string | null;
  zone?: string | null;
  url?: string;
};

export function sujetBienvenueCommercial(): string {
  return `Bienvenue dans l'équipe — votre espace commercial ${SOCIETE.produit} est prêt`;
}

export function emailBienvenueCommercialHtml(b: BienvenueCommercialInput): string {
  const url = b.url || SOCIETE.site;
  const corps = `
    <p style="color:${TEXTE};font-size:14px;line-height:1.6;margin:0 0 12px">Bonjour ${esc(b.nom)},</p>
    <p style="color:${TEXTE};font-size:14px;line-height:1.6;margin:0 0 18px">
      Votre compte <b>commercial</b> vient d'être créé sur ${esc(SOCIETE.produit)} : vous y retrouverez vos clients,
      vos ventes, vos documents et votre contrat de collaboration.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${ENCADRE};border-left:4px solid ${VIOLET};border-radius:10px">
      <tr><td style="padding:16px 20px">
        <div style="color:${VIOLET};font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Vos identifiants</div>
        <table role="presentation" cellpadding="0" cellspacing="0">
          ${ligne("Adresse de connexion", `<a href="${esc(url)}" style="color:${TEAL};text-decoration:none;font-weight:bold">${esc(url.replace(/^https?:\/\//, ""))}</a>`)}
          ${ligne("Email", esc(b.email))}
          ${ligne("Mot de passe provisoire", esc(b.motDePasse), true)}
          ${b.codeApporteur ? ligne("Code apporteur", esc(b.codeApporteur), true) : ""}
          ${b.zone ? ligne("Zone attribuée", esc(b.zone)) : ""}
        </table>
        <div style="color:${TEXTE_DOUX};font-size:12px;margin-top:8px">⚠️ Changez ce mot de passe dès votre première connexion (Profil → Mot de passe).</div>
      </td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px auto"><tr><td style="border-radius:10px;background:${VIOLET};background:linear-gradient(90deg,${VIOLET},${FUCHSIA})">
      <a href="${esc(url)}" style="display:inline-block;padding:12px 30px;color:#ffffff;font-family:Segoe UI,system-ui,sans-serif;font-size:15px;font-weight:bold;text-decoration:none">Ouvrir mon espace commercial</a>
    </td></tr></table>
    <div style="color:${FUCHSIA};font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin:4px 0 8px">Vos premiers pas</div>
    <table role="presentation" cellpadding="0" cellspacing="0">
      ${etape(1, "Connectez-vous et <b>changez votre mot de passe</b> dans Profil.")}
      ${etape(2, "Ouvrez <b>Mes clients</b> : créez vos fiches garages (le SIREN pré-remplit l'identité) et déclarez vos ventes.")}
      ${etape(3, "Ouvrez <b>Mes documents</b> : votre contrat de collaboration et toute la documentation commerciale y sont téléchargeables.")}
      ${etape(4, "Enregistrez votre signature (Profil) : elle s'appose sur les documents remis aux garages.")}
    </table>`;
  return page("Bienvenue dans l'équipe 💼", corps);
}

export function emailBienvenueCommercialTexte(b: BienvenueCommercialInput): string {
  const url = b.url || SOCIETE.site;
  return [
    `Bonjour ${b.nom},`,
    "",
    `Votre compte commercial vient d'être créé sur ${SOCIETE.produit}.`,
    "",
    `Adresse : ${url}`,
    `Email : ${b.email}`,
    `Mot de passe provisoire : ${b.motDePasse}`,
    ...(b.codeApporteur ? [`Code apporteur : ${b.codeApporteur}`] : []),
    ...(b.zone ? [`Zone attribuée : ${b.zone}`] : []),
    "Changez ce mot de passe dès votre première connexion (Profil).",
    "",
    "Premiers pas : 1) changer le mot de passe, 2) Mes clients (fiches garages, ventes), 3) Mes documents (contrat + documentation), 4) enregistrer votre signature dans Profil.",
    "",
    `Une question ? ${SOCIETE.email}`,
    `${SOCIETE.editeur} — ${ADRESSE_COMPLETE}`,
  ].join("\n");
}

/* ---------------- Envoi de la documentation ---------------- */
export type DocsCollaborateurInput = {
  nom: string;
  type: "commercial" | "secretaire";
  titres: string[];        // titres des documents joints
  contratJoint?: boolean;  // le contrat de collaboration (signé) est joint
};

export function sujetDocsCollaborateur(i: DocsCollaborateurInput): string {
  return i.contratJoint
    ? `Votre contrat de collaboration et vos documents — ${SOCIETE.produit}`
    : `Vos documents d'information — ${SOCIETE.produit}`;
}

export function emailDocsCollaborateurHtml(i: DocsCollaborateurInput): string {
  const role = i.type === "commercial" ? "apporteur d'affaires" : "secrétariat externalisé";
  const items = [
    ...(i.contratJoint ? ["<b>Contrat de collaboration</b> (exemplaire PDF)"] : []),
    ...i.titres.map(esc),
  ]
    .map(
      (t) => `
    <tr>
      <td style="vertical-align:top;padding:4px 8px 4px 0;color:${VIOLET};font-weight:bold">📄</td>
      <td style="padding:4px 0;color:${TEXTE};font-size:13px;line-height:1.5">${t}</td>
    </tr>`
    )
    .join("");
  const corps = `
    <p style="color:${TEXTE};font-size:14px;line-height:1.6;margin:0 0 12px">Bonjour ${esc(i.nom)},</p>
    <p style="color:${TEXTE};font-size:14px;line-height:1.6;margin:0 0 18px">
      Vous trouverez en pièces jointes les documents de notre collaboration (${role}) :
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${ENCADRE};border-left:4px solid ${VIOLET};border-radius:10px">
      <tr><td style="padding:14px 20px">
        <table role="presentation" cellpadding="0" cellspacing="0">${items}</table>
      </td></tr>
    </table>
    <p style="color:${TEXTE};font-size:14px;line-height:1.6;margin:18px 0 0">
      Conservez-les précieusement. ${i.contratJoint ? "Le contrat joint reprend les conditions signées ensemble." : ""}
    </p>`;
  return page("Vos documents 📁", corps);
}

export function emailDocsCollaborateurTexte(i: DocsCollaborateurInput): string {
  return [
    `Bonjour ${i.nom},`,
    "",
    "Vous trouverez en pièces jointes les documents de notre collaboration :",
    ...(i.contratJoint ? ["- Contrat de collaboration (PDF)"] : []),
    ...i.titres.map((t) => `- ${t}`),
    "",
    `Une question ? ${SOCIETE.email}`,
    `${SOCIETE.editeur} — ${ADRESSE_COMPLETE}`,
  ].join("\n");
}
