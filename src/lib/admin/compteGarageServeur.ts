// ============================================================
//  CRÉATION D'UN COMPTE GARAGE — côté SERVEUR (service role), v13.31.
//
//  Trois chemins mènent ici :
//   • /api/admin/donnees  action "creer_compte_garage"  → depuis une vente
//   • /api/admin/donnees  action "creer_compte_manuel"  → de A à Z (éditeur)
//   • /api/commercial     action "creer_compte_garage"  → le commercial,
//     une fois le contrat signé, crée lui-même le compte de son garage.
//
//  Le cœur est commun : utilisateur Auth (mot de passe provisoire, métier
//  « carrosserie »), profil entreprise pré-rempli, rattachements, email de
//  bienvenue aux couleurs de l'appli. Le mot de passe n'est renvoyé que si
//  l'email n'est pas parti (pour le transmettre à la main).
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { envoyerEmailServeur } from "@/lib/mailer";
import { comptesAdmin, tousLesComptes } from "@/lib/supportServeur";
import { emailBienvenueHtml, emailBienvenueTexte, sujetBienvenue } from "@/lib/admin/emailBienvenue";
import { FORMULES, Formule, Parametres, fusionnerParametres, prixVente } from "@/lib/admin/economie";

export type ResultatCompte = {
  ok: true;
  ownerId: string;
  dejaExistant: boolean;
  emailEnvoye: boolean;
  erreurEmail: string | null;
  /** Renvoyé UNIQUEMENT si le compte vient d'être créé et que l'email n'est pas parti. */
  motDePasse?: string;
  abonnementId?: string | null;
};

export class ErreurCompte extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
export const emailValide = (e: string) => EMAIL_RE.test(e);

export const premierDuMois = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Mot de passe provisoire : 12 caractères lisibles (sans caractères ambigus). */
export function motDePasseProvisoire(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(12), (b) => alphabet[b % alphabet.length]).join("");
}

export async function lireParametresGrille(admin: SupabaseClient): Promise<Parametres> {
  const { data } = await admin.from("admin_parametres").select("valeur").eq("cle", "grille").maybeSingle();
  return fusionnerParametres((data?.valeur as Partial<Parametres>) || null);
}

/** Identité du garage telle qu'on la pousse dans le profil entreprise. */
export type IdentiteGarage = {
  nom: string;
  email: string;
  siret?: string | null;
  adresse?: string | null;
  cp?: string | null;
  ville?: string | null;
  tel?: string | null;
  contactNom?: string | null;
};

/**
 * Utilisateur Auth du garage : réutilise un compte existant (même email)
 * sans toucher à son mot de passe, sinon le crée avec un mot de passe
 * provisoire et le métier « carrosserie ».
 */
export async function utilisateurGarage(admin: SupabaseClient, g: IdentiteGarage): Promise<{ ownerId: string; motDePasse: string | null; existant: boolean }> {
  const email = g.email.trim().toLowerCase();
  if (!emailValide(email)) throw new ErreurCompte("Email du garage manquant ou invalide.");
  const existant = (await tousLesComptes(admin)).find((c) => c.email.toLowerCase() === email);
  if (existant) return { ownerId: existant.id, motDePasse: null, existant: true };
  const motDePasse = motDePasseProvisoire();
  const { data: cree, error } = await admin.auth.admin.createUser({
    email,
    password: motDePasse,
    email_confirm: true,
    user_metadata: { garage: g.nom },
    app_metadata: { metier: "carrosserie" },
  });
  if (error || !cree?.user) throw new ErreurCompte(`Création du compte impossible : ${error?.message || "erreur Auth"}`, 500);
  return { ownerId: cree.user.id, motDePasse, existant: false };
}

/**
 * Profil entreprise pré-rempli (nom, SIRET, adresse, contact) pour que le
 * garage n'ait plus qu'à compléter logo / IBAN. Ne touche pas à un profil
 * déjà saisi par le garage. Best-effort.
 */
export async function preremplirProfil(admin: SupabaseClient, ownerId: string, g: IdentiteGarage): Promise<void> {
  try {
    const { data: existant } = await admin.from("entreprise").select("id").eq("owner_id", ownerId).maybeSingle();
    if (existant) return;
    await admin.from("entreprise").insert({
      owner_id: ownerId,
      nom: g.nom,
      email: g.email.trim().toLowerCase(),
      siret: g.siret || null,
      adresse: g.adresse || null,
      code_postal: g.cp || null,
      ville: g.ville || null,
      tel: g.tel || null,
    });
  } catch {
    /* profil optionnel */
  }
}

/** Noms du commercial et du chargé de mission pour l'email de bienvenue. */
async function nomsCollaborateurs(admin: SupabaseClient, commercialId?: string | null, secretaireId?: string | null): Promise<{ commercialNom: string | null; secretaireNom: string | null }> {
  const ids = [commercialId, secretaireId].filter((x): x is string => Boolean(x));
  let commercialNom: string | null = null;
  let secretaireNom: string | null = null;
  if (ids.length) {
    const { data: cs } = await admin.from("collaborateurs").select("id,prenom,nom,type").in("id", ids);
    for (const c of cs || []) {
      const n = [c.prenom, c.nom].filter(Boolean).join(" ");
      if (c.id === secretaireId && c.type === "secretaire") secretaireNom = n;
      else if (c.id === commercialId) commercialNom = n;
    }
  }
  return { commercialNom, secretaireNom };
}

export async function envoyerBienvenue(
  admin: SupabaseClient,
  args: { g: IdentiteGarage; motDePasse: string; formule: Formule | null; commercialId?: string | null; secretaireId?: string | null; ownerId: string }
): Promise<{ ok: boolean; error: string | null }> {
  const p = await lireParametresGrille(admin);
  const f = args.formule ? p.formules[args.formule] : null;
  const noms = await nomsCollaborateurs(admin, args.commercialId, args.secretaireId);
  const b = {
    garageNom: args.g.nom,
    contactNom: args.g.contactNom || null,
    email: args.g.email.trim().toLowerCase(),
    motDePasse: args.motDePasse,
    formule: f ? f.libelle : null,
    heures: f?.heures || null,
    ...noms,
    url: process.env.NEXT_PUBLIC_SITE_URL || "https://myeasyauto.fr",
  };
  const expediteur = (await comptesAdmin(admin))[0];
  const res = await envoyerEmailServeur(
    { to: b.email, subject: sujetBienvenue(b.garageNom), html: emailBienvenueHtml(b), text: emailBienvenueTexte(b) },
    expediteur?.id || args.ownerId
  );
  return { ok: res.ok, error: res.ok ? null : res.error || "Envoi impossible." };
}

/** Lignes de mensualités d'un abonnement (même logique que generer_mensualites / valider_vente). */
export function lignesMensualites(abonnementId: string, periodicite: "mensuel" | "annuel", dateDebut: string, prixMensuel: number, montantAnnuel: number | null) {
  const d = new Date(dateDebut);
  const m0 = new Date(d.getFullYear(), d.getMonth(), 1);
  const lignes: { abonnement_id: string; periode: string; montant_ht: number; notes?: string }[] = [];
  if (periodicite === "annuel") {
    const total = Number(montantAnnuel) || prixMensuel * 12;
    const part = Math.floor((total / 12) * 100) / 100;
    for (let i = 0; i < 12; i++) {
      lignes.push({ abonnement_id: abonnementId, periode: premierDuMois(m0), montant_ht: i === 11 ? r2(total - part * 11) : part, notes: "Forfait annuel" });
      m0.setMonth(m0.getMonth() + 1);
    }
  } else {
    const fin = new Date();
    if (m0 > fin) lignes.push({ abonnement_id: abonnementId, periode: premierDuMois(m0), montant_ht: prixMensuel });
    while (m0 <= fin) {
      lignes.push({ abonnement_id: abonnementId, periode: premierDuMois(m0), montant_ht: prixMensuel });
      m0.setMonth(m0.getMonth() + 1);
    }
  }
  return lignes;
}

// ------------------------------------------------------------
//  1) DEPUIS UNE VENTE (éditeur ou commercial)
// ------------------------------------------------------------
export async function creerCompteDepuisVente(
  admin: SupabaseClient,
  venteId: string,
  opts: { par: "editeur" | "commercial"; ownerIdAppelant?: string | null; restreindreAuProprietaire?: boolean }
): Promise<ResultatCompte> {
  let q = admin.from("ventes").select("*").eq("id", venteId);
  if (opts.restreindreAuProprietaire && opts.ownerIdAppelant) q = q.eq("owner_id", opts.ownerIdAppelant);
  const { data: v } = await q.maybeSingle();
  if (!v) throw new ErreurCompte("Vente introuvable.", 404);
  if (v.statut === "refusee" || v.statut === "perdue") throw new ErreurCompte("Cette vente est refusée ou perdue : pas de compte à créer.", 409);
  // Côté commercial : le contrat doit être signé par le garage.
  if (opts.par === "commercial" && !(v.signature && v.signe_le)) throw new ErreurCompte("Le contrat doit être signé par le garage avant de créer son compte.", 409);

  const g: IdentiteGarage = {
    nom: v.garage_nom,
    email: String(v.contact_email || "").trim().toLowerCase(),
    siret: v.garage_siret,
    adresse: v.garage_adresse,
    cp: v.garage_cp,
    ville: v.garage_ville,
    tel: v.contact_tel,
    contactNom: v.contact_nom,
  };
  if (!emailValide(g.email)) throw new ErreurCompte("Email du garage manquant ou invalide sur la vente.");

  const u = await utilisateurGarage(admin, g);
  await preremplirProfil(admin, u.ownerId, g);

  // Rattachements : abonnement → owner, vente → compte créé (+ trace v92, best-effort).
  let secretaireId: string | null = null;
  if (v.abonnement_id) {
    await admin.from("abonnements").update({ garage_owner_id: u.ownerId, garage_email: g.email }).eq("id", v.abonnement_id);
    const { data: abo } = await admin.from("abonnements").select("secretaire_id").eq("id", v.abonnement_id).maybeSingle();
    secretaireId = abo?.secretaire_id || null;
  }
  const trace = { statut: "compte_cree", compte_cree_le: new Date().toISOString(), compte_cree_par: opts.par };
  const { error: eTrace } = await admin.from("ventes").update(trace).eq("id", v.id);
  if (eTrace) await admin.from("ventes").update({ statut: "compte_cree" }).eq("id", v.id);

  let emailEnvoye = false;
  let erreurEmail: string | null = null;
  if (u.motDePasse) {
    const r = await envoyerBienvenue(admin, { g, motDePasse: u.motDePasse, formule: FORMULES.includes(v.formule) ? (v.formule as Formule) : null, commercialId: v.collaborateur_id, secretaireId, ownerId: u.ownerId });
    emailEnvoye = r.ok;
    erreurEmail = r.error;
  }
  return {
    ok: true,
    ownerId: u.ownerId,
    dejaExistant: u.existant,
    emailEnvoye,
    erreurEmail,
    motDePasse: u.motDePasse && !emailEnvoye ? u.motDePasse : undefined,
    abonnementId: v.abonnement_id || null,
  };
}

// ------------------------------------------------------------
//  2) DE A À Z (éditeur) : garage + offre → abonnement + compte + email
// ------------------------------------------------------------
export type SaisieCompteManuel = {
  garage: IdentiteGarage & { contactFonction?: string | null };
  offre: {
    formule: Formule;
    engagement_12: boolean;
    periodicite: "mensuel" | "annuel";
    remise_supp_pct?: number;
    date_debut?: string | null;
    commercial_id?: string | null;
    secretaire_id?: string | null;
    notes?: string | null;
  };
  /** false = compte seul, sans abonnement (ex. compte de démo / test). */
  avecAbonnement: boolean;
  envoyerEmail: boolean;
};

export async function creerCompteManuel(admin: SupabaseClient, s: SaisieCompteManuel): Promise<ResultatCompte> {
  const g: IdentiteGarage = { ...s.garage, nom: String(s.garage.nom || "").trim(), email: String(s.garage.email || "").trim().toLowerCase() };
  if (!g.nom) throw new ErreurCompte("Le nom du garage est obligatoire.");
  if (!emailValide(g.email)) throw new ErreurCompte("Email du garage manquant ou invalide (c'est son identifiant de connexion).");
  if (!FORMULES.includes(s.offre.formule)) throw new ErreurCompte("Formule inconnue.");

  const u = await utilisateurGarage(admin, g);
  await preremplirProfil(admin, u.ownerId, g);

  let abonnementId: string | null = null;
  if (s.avecAbonnement) {
    const p = await lireParametresGrille(admin);
    const formule = s.offre.formule;
    const periodicite = s.offre.periodicite === "annuel" ? "annuel" : "mensuel";
    const engagement = periodicite === "annuel" || Boolean(s.offre.engagement_12);
    const remiseSupp = Math.min(30, Math.max(0, Number(s.offre.remise_supp_pct) || 0));
    const prix = prixVente(formule, { engagement12: engagement, periodicite, remiseSupp }, p);
    const dateDebut = s.offre.date_debut || premierDuMois(new Date());
    const prixMensuel = prix.montantAnnuel != null ? r2(prix.montantAnnuel / 12) : prix.mensualite;
    const remisePct = r2(100 - (prixMensuel / p.formules[formule].prix) * 100);
    const { data: abo, error } = await admin
      .from("abonnements")
      .insert({
        garage_nom: g.nom,
        garage_email: g.email,
        garage_owner_id: u.ownerId,
        formule,
        prix_ht: prixMensuel,
        remise_pct: remisePct,
        periodicite,
        montant_annuel: prix.montantAnnuel,
        heures: p.formules[formule].heures,
        date_signature: new Date().toISOString().slice(0, 10),
        date_debut: dateDebut,
        engagement_12: engagement,
        statut: "actif",
        commercial_id: s.offre.commercial_id || null,
        secretaire_id: s.offre.secretaire_id || null,
        notes: [`Compte créé de A à Z depuis l'espace éditeur.`, s.offre.notes || ""].filter(Boolean).join(" "),
      })
      .select("id")
      .single();
    if (error || !abo) throw new ErreurCompte(error?.message || "Création de l'abonnement impossible.", 500);
    abonnementId = abo.id;
    const lignes = lignesMensualites(abo.id, periodicite, dateDebut, prixMensuel, prix.montantAnnuel);
    if (lignes.length) await admin.from("abonnement_mensualites").upsert(lignes, { onConflict: "abonnement_id,periode", ignoreDuplicates: true });
  }

  let emailEnvoye = false;
  let erreurEmail: string | null = null;
  if (u.motDePasse && s.envoyerEmail) {
    const r = await envoyerBienvenue(admin, { g, motDePasse: u.motDePasse, formule: s.avecAbonnement ? s.offre.formule : null, commercialId: s.offre.commercial_id, secretaireId: s.offre.secretaire_id, ownerId: u.ownerId });
    emailEnvoye = r.ok;
    erreurEmail = r.error;
  }
  return {
    ok: true,
    ownerId: u.ownerId,
    dejaExistant: u.existant,
    emailEnvoye,
    erreurEmail,
    motDePasse: u.motDePasse && !emailEnvoye ? u.motDePasse : undefined,
    abonnementId,
  };
}

// ------------------------------------------------------------
//  3) RENVOI DE L'EMAIL DE BIENVENUE (éditeur ou commercial)
//  On ne peut pas relire un mot de passe : le renvoi pose un NOUVEAU mot
//  de passe provisoire sur le compte, puis renvoie l'email de bienvenue.
//  L'ancien mot de passe ne fonctionne plus (à dire clairement dans l'UI).
// ------------------------------------------------------------
export type ResultatRenvoi = { ok: true; email: string; emailEnvoye: boolean; erreurEmail: string | null; motDePasse?: string };

async function renvoyerBienvenuePour(
  admin: SupabaseClient,
  g: IdentiteGarage,
  ctx: { formule: Formule | null; commercialId?: string | null; secretaireId?: string | null }
): Promise<ResultatRenvoi> {
  const email = g.email.trim().toLowerCase();
  const compte = (await tousLesComptes(admin)).find((c) => c.email.toLowerCase() === email);
  if (!compte) throw new ErreurCompte("Aucun compte My Easy Auto avec cet email : crée d'abord le compte.", 404);
  const motDePasse = motDePasseProvisoire();
  const { error } = await admin.auth.admin.updateUserById(compte.id, { password: motDePasse });
  if (error) throw new ErreurCompte(`Nouveau mot de passe impossible : ${error.message}`, 500);
  const r = await envoyerBienvenue(admin, { g: { ...g, email }, motDePasse, formule: ctx.formule, commercialId: ctx.commercialId, secretaireId: ctx.secretaireId, ownerId: compte.id });
  return { ok: true, email, emailEnvoye: r.ok, erreurEmail: r.error, motDePasse: r.ok ? undefined : motDePasse };
}

/** Renvoi depuis une vente (éditeur, ou commercial restreint à SES ventes). */
export async function renvoyerBienvenueDepuisVente(
  admin: SupabaseClient,
  venteId: string,
  opts: { ownerIdAppelant?: string | null; restreindreAuProprietaire?: boolean }
): Promise<ResultatRenvoi> {
  let q = admin.from("ventes").select("*").eq("id", venteId);
  if (opts.restreindreAuProprietaire && opts.ownerIdAppelant) q = q.eq("owner_id", opts.ownerIdAppelant);
  const { data: v } = await q.maybeSingle();
  if (!v) throw new ErreurCompte("Vente introuvable.", 404);
  let secretaireId: string | null = null;
  if (v.abonnement_id) {
    const { data: abo } = await admin.from("abonnements").select("secretaire_id").eq("id", v.abonnement_id).maybeSingle();
    secretaireId = abo?.secretaire_id || null;
  }
  return renvoyerBienvenuePour(
    admin,
    { nom: v.garage_nom, email: String(v.contact_email || ""), contactNom: v.contact_nom },
    { formule: FORMULES.includes(v.formule) ? (v.formule as Formule) : null, commercialId: v.collaborateur_id, secretaireId }
  );
}

/** Renvoi depuis un abonnement (éditeur). */
export async function renvoyerBienvenueDepuisAbonnement(admin: SupabaseClient, abonnementId: string): Promise<ResultatRenvoi> {
  const { data: a } = await admin.from("abonnements").select("*").eq("id", abonnementId).maybeSingle();
  if (!a) throw new ErreurCompte("Abonnement introuvable.", 404);
  let email = String(a.garage_email || "");
  if (!emailValide(email) && a.garage_owner_id) {
    const { data: u } = await admin.auth.admin.getUserById(a.garage_owner_id);
    email = u?.user?.email || "";
  }
  if (!emailValide(email)) throw new ErreurCompte("Aucun email de garage sur cet abonnement.");
  return renvoyerBienvenuePour(admin, { nom: a.garage_nom, email }, { formule: FORMULES.includes(a.formule) ? (a.formule as Formule) : null, commercialId: a.commercial_id, secretaireId: a.secretaire_id });
}
