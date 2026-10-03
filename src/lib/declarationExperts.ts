// ============================================================
//  DÉCLARATION DU GARAGE AUPRÈS DES EXPERTS (v13.40) — logique PURE.
//
//  Un garage qui démarre (ou change de mains) doit se faire connaître des
//  cabinets d'expertise de son secteur : coordonnées, Kbis, taux horaires
//  de main-d'œuvre HT, ingrédients peinture, assurance RC, agréments.
//  Ce module construit l'email (HTML à la charte du garage + version
//  texte) — utilisé à l'identique pour l'APERÇU (client) et l'ENVOI
//  (serveur), pour que l'expert reçoive exactement ce que le garage a vu.
// ============================================================

export type InfosDeclaration = {
  nom: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  tel: string | null;
  email: string | null;
  siret: string | null;
  tva_intra: string | null;
  taux_t1: number | null;
  taux_t2: number | null;
  taux_t3: number | null;
  taux_peinture: number | null;
  ingr_opaque: number | null;
  ingr_metal_verni: number | null;
  ingr_nacre: number | null;
  rc_assureur: string | null;
  rc_police: string | null;
  agrements: string | null;
  horaires: string | null;
  services: string | null;
  signature_mail?: string | null;
  kbis_path?: string | null;
  kbis_date?: string | null;
};

export const CHAMPS_DECLARATION = [
  "nom", "adresse", "code_postal", "ville", "tel", "email", "siret", "tva_intra",
  "taux_t1", "taux_t2", "taux_t3", "taux_peinture", "ingr_opaque", "ingr_metal_verni", "ingr_nacre",
  "rc_assureur", "rc_police", "agrements", "horaires", "services", "kbis_path", "kbis_date",
] as const;

export const TAUX_MO: { cle: keyof InfosDeclaration; label: string; aide: string }[] = [
  { cle: "taux_t1", label: "T1", aide: "Tôlerie / mécanique simple" },
  { cle: "taux_t2", label: "T2", aide: "Tôlerie / mécanique moyenne" },
  { cle: "taux_t3", label: "T3", aide: "Tôlerie / mécanique complexe" },
  { cle: "taux_peinture", label: "Peinture", aide: "Main-d'œuvre peinture" },
];

export const INGREDIENTS: { cle: keyof InfosDeclaration; label: string }[] = [
  { cle: "ingr_opaque", label: "Opaque" },
  { cle: "ingr_metal_verni", label: "Métallisé / vernis" },
  { cle: "ingr_nacre", label: "Nacré" },
];

export const SUJET_DEFAUT = (i: Pick<InfosDeclaration, "nom" | "ville">) =>
  `Nouveau réparateur sur votre secteur — ${i.nom || "notre carrosserie"}${i.ville ? ` (${i.ville})` : ""}`;

export const INTRO_DEFAUT = (i: Pick<InfosDeclaration, "nom" | "ville">) =>
  `Nous avons le plaisir de vous informer de l'ouverture de notre carrosserie ${i.nom || ""}${i.ville ? ` à ${i.ville}` : ""}. ` +
  "Nous vous remercions de bien vouloir nous enregistrer dans votre fichier de réparateurs afin de pouvoir recevoir vos missions d'expertise. " +
  "Vous trouverez ci-dessous nos coordonnées, nos taux horaires et, en pièce jointe, notre extrait Kbis.";

/** Ce qui manque pour une déclaration complète (bloquant = sans quoi l'envoi n'a pas de sens). */
export function manquants(i: InfosDeclaration): { bloquants: string[]; conseilles: string[] } {
  const bloquants: string[] = [];
  const conseilles: string[] = [];
  if (!i.nom) bloquants.push("le nom du garage");
  if (!i.adresse || !i.code_postal || !i.ville) bloquants.push("l'adresse complète");
  if (!i.tel) bloquants.push("le téléphone");
  if (!i.email) bloquants.push("l'email");
  if (!i.siret) bloquants.push("le SIRET");
  if (i.taux_t1 == null && i.taux_t2 == null && i.taux_t3 == null) bloquants.push("au moins un taux horaire (T1, T2 ou T3)");
  if (i.taux_peinture == null) conseilles.push("le taux peinture");
  if (i.ingr_metal_verni == null && i.ingr_nacre == null && i.ingr_opaque == null) conseilles.push("les ingrédients peinture");
  if (!i.kbis_path) conseilles.push("l'extrait Kbis (PDF)");
  if (!i.rc_assureur) conseilles.push("l'assurance responsabilité civile");
  if (!i.tva_intra) conseilles.push("le n° de TVA");
  return { bloquants, conseilles };
}

/** Kbis de plus de 3 mois : les cabinets demandent souvent un extrait récent. */
export function kbisAncien(date: string | null | undefined): boolean {
  if (!date) return false;
  const d = new Date(date + "T00:00:00");
  const limite = new Date();
  limite.setMonth(limite.getMonth() - 3);
  return d < limite;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const eur = (n: number | null | undefined) =>
  n == null ? null : `${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, " ")} € HT / h`;

export type Destinataire = { cabinet: string | null; expert_nom: string | null };

/** Email complet (HTML + texte) pour UN cabinet. */
export function construireEmail(
  i: InfosDeclaration,
  d: Destinataire,
  opts: { intro: string; logoUrl: string | null; avecKbis: boolean }
): { html: string; text: string } {
  const salutation = d.expert_nom ? `Bonjour ${d.expert_nom},` : "Madame, Monsieur,";
  const adresse = [i.adresse, [i.code_postal, i.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const identite: [string, string | null][] = [
    ["Raison sociale", i.nom],
    ["Adresse", adresse || null],
    ["Téléphone", i.tel],
    ["Email", i.email],
    ["SIRET", i.siret],
    ["N° TVA", i.tva_intra],
    ["Assurance RC pro", [i.rc_assureur, i.rc_police ? `police n° ${i.rc_police}` : null].filter(Boolean).join(" — ") || null],
  ];
  const taux: [string, string | null][] = TAUX_MO.map((t) => [t.label, eur(i[t.cle] as number | null)]);
  const ingr: [string, string | null][] = INGREDIENTS.map((t) => [`Ingrédients ${t.label.toLowerCase()}`, eur(i[t.cle] as number | null)]);
  const autres: [string, string | null][] = [
    ["Agréments", i.agrements],
    ["Horaires", i.horaires],
    ["Services", i.services],
  ];

  const lignesHtml = (rows: [string, string | null][]) =>
    rows
      .filter(([, v]) => v)
      .map(
        ([k, v]) =>
          `<tr><td style="padding:7px 12px;border-bottom:1px solid #eceef5;color:#5b6077;font-size:13px;width:42%;vertical-align:top">${esc(k)}</td><td style="padding:7px 12px;border-bottom:1px solid #eceef5;color:#161a2b;font-size:14px;font-weight:600">${esc(String(v)).replace(/\n/g, "<br>")}</td></tr>`
      )
      .join("");
  const bloc = (titre: string, rows: [string, string | null][]) => {
    const contenu = lignesHtml(rows);
    if (!contenu) return "";
    return `<h3 style="margin:22px 0 8px;font-size:14px;letter-spacing:.06em;text-transform:uppercase;color:#7c3aed">${esc(titre)}</h3><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e1e4ef;border-radius:10px;border-collapse:separate;overflow:hidden">${contenu}</table>`;
  };

  const signature = i.signature_mail?.trim()
    ? esc(i.signature_mail.trim()).replace(/\n/g, "<br>")
    : [i.nom, adresse, i.tel, i.email].filter(Boolean).map((x) => esc(String(x))).join("<br>");

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f2f3f8;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f3f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border:1px solid #e1e4ef;border-radius:14px">
<tr><td style="padding:22px 26px;border-bottom:3px solid #7c3aed">
${opts.logoUrl ? `<img src="${esc(opts.logoUrl)}" alt="${esc(i.nom || "Logo")}" style="max-height:64px;max-width:220px;display:block;margin-bottom:10px">` : ""}
<div style="font-size:20px;font-weight:700;color:#161a2b">${esc(i.nom || "")}</div>
<div style="font-size:13px;color:#5b6077">${esc(adresse)}</div>
</td></tr>
<tr><td style="padding:24px 26px;color:#161a2b;font-size:14px;line-height:1.6">
<p style="margin:0 0 12px">${esc(salutation)}</p>
<p style="margin:0 0 12px;text-align:justify">${esc(opts.intro).replace(/\n/g, "<br>")}</p>
${bloc("Coordonnées du réparateur", identite)}
${bloc("Taux horaires de main-d'œuvre", taux)}
${bloc("Ingrédients peinture", ingr)}
${bloc("Informations complémentaires", autres)}
${opts.avecKbis ? `<p style="margin:18px 0 0;font-size:13px;color:#5b6077">📎 Pièce jointe : extrait Kbis${i.kbis_date ? ` du ${new Date(i.kbis_date + "T00:00:00").toLocaleDateString("fr-FR")}` : ""}.</p>` : ""}
<p style="margin:18px 0 0;text-align:justify">Nous restons à votre disposition pour tout complément (RIB, attestation d'assurance, visite de l'atelier). Pour nous missionner : ${esc([i.email, i.tel].filter(Boolean).join(" · "))}.</p>
<p style="margin:18px 0 0">Bien cordialement,</p>
<p style="margin:6px 0 0;font-weight:600">${signature}</p>
</td></tr>
<tr><td style="padding:14px 26px;border-top:1px solid #eceef5;font-size:11px;color:#8a8fa6">${esc([i.nom, i.siret ? `SIRET ${i.siret}` : null, i.tva_intra ? `TVA ${i.tva_intra}` : null].filter(Boolean).join(" · "))}</td></tr>
</table></td></tr></table></body></html>`;

  const lignesTexte = (titre: string, rows: [string, string | null][]) => {
    const r = rows.filter(([, v]) => v);
    return r.length ? [``, `— ${titre.toUpperCase()} —`, ...r.map(([k, v]) => `${k} : ${v}`)] : [];
  };
  const text = [
    salutation,
    "",
    opts.intro,
    ...lignesTexte("Coordonnées du réparateur", identite),
    ...lignesTexte("Taux horaires de main-d'œuvre", taux),
    ...lignesTexte("Ingrédients peinture", ingr),
    ...lignesTexte("Informations complémentaires", autres),
    "",
    opts.avecKbis ? "Pièce jointe : extrait Kbis." : "",
    "Nous restons à votre disposition pour tout complément (RIB, attestation d'assurance, visite de l'atelier).",
    "",
    "Bien cordialement,",
    i.signature_mail?.trim() || [i.nom, adresse, i.tel, i.email].filter(Boolean).join("\n"),
  ].join("\n");

  return { html, text };
}

/** Email d'un cabinet : celui du cabinet, sinon celui de l'expert. */
export function emailExpert(e: { email: string | null; expert_email: string | null }): string | null {
  const v = (e.email || e.expert_email || "").trim().toLowerCase();
  return /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(v) ? v : null;
}
