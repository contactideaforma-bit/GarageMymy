import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { identifiantsMaileva, envoyerCourrier, ErreurMaileva } from "@/lib/maileva";
import { lignesAdresse, verifierAdresse } from "@/lib/envoisPostaux";
import { tropDeDemandes } from "@/lib/limiteur";

export const runtime = "nodejs";
export const maxDuration = 60;

// ENVOI D'UN COURRIER PAPIER VIA MAILEVA (La Poste).
// Le navigateur fournit le PDF (base64) et l'adresse ; l'expéditeur est lu
// dans le PROFIL du garage côté serveur (jamais dans le body). L'envoi est
// journalisé AVANT l'appel à Maileva : même en cas de coupure, il reste
// une trace (statut « erreur » ou « brouillon »).

export async function POST(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });
  if (tropDeDemandes("courrier-postal", user.id, 20, 60_000)) {
    return NextResponse.json({ error: "Trop d'envois d'affilée : patiente une minute." }, { status: 429 });
  }
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante côté serveur." }, { status: 500 });

  let b: {
    pdfBase64?: string;
    nomFichier?: string;
    type?: string;
    objet?: string;
    destinataireNom?: string;
    lignes?: string[];
    pays?: string;
    couleur?: boolean;
    rectoVerso?: boolean;
    arScanne?: boolean;
    dossierId?: string | null;
    courrierId?: string | null;
  };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 }); }

  const type = b.type === "lrar" ? "lrar" : "simple";
  const pdf = Buffer.from((b.pdfBase64 || "").replace(/^data:[^,]+,/, ""), "base64");
  if (pdf.length < 100 || pdf.subarray(0, 4).toString() !== "%PDF") {
    return NextResponse.json({ error: "Le fichier à envoyer doit être un PDF." }, { status: 400 });
  }
  if (pdf.length > 10_000_000) return NextResponse.json({ error: "PDF trop lourd (10 Mo maximum)." }, { status: 413 });

  const lignes = Array.from({ length: 6 }, (_, i) => String(b.lignes?.[i] || "").trim());
  const pb = verifierAdresse(lignes);
  if (pb) return NextResponse.json({ error: pb }, { status: 400 });

  const id = await identifiantsMaileva(user.id);
  if (!id) {
    return NextResponse.json({ error: "Maileva n'est pas configuré : Courriers La Poste → Réglages Maileva." }, { status: 400 });
  }

  // Le dossier / le courrier doivent appartenir au garage connecté.
  if (b.dossierId) {
    const { data } = await admin.from("dossiers").select("id").eq("id", b.dossierId).eq("owner_id", user.id).maybeSingle();
    if (!data) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  }

  // Expéditeur = profil du garage.
  const { data: ent } = await admin.from("entreprise").select("nom,adresse,code_postal,ville").eq("owner_id", user.id).limit(1).maybeSingle();
  const expediteur = lignesAdresse(ent?.nom || "", [ent?.adresse || "", `${ent?.code_postal || ""} ${ent?.ville || ""}`.trim()].join("\n"));
  if (type === "lrar" && verifierAdresse(expediteur)) {
    return NextResponse.json({ error: "Adresse du garage incomplète (Profil) : obligatoire pour l'expéditeur d'un recommandé." }, { status: 400 });
  }

  const maintenant = new Date().toISOString();
  const { data: ligne, error: eIns } = await admin
    .from("envois_postaux")
    .insert({
      owner_id: user.id,
      dossier_id: b.dossierId || null,
      courrier_id: b.courrierId || null,
      type,
      objet: (b.objet || "").slice(0, 300) || null,
      destinataire_nom: lignes[0],
      adresse_lignes: lignes,
      pays: (b.pays || "FR").toUpperCase().slice(0, 2),
      couleur: Boolean(b.couleur),
      recto_verso: b.rectoVerso !== false,
      ar_scanne: type === "lrar" && Boolean(b.arScanne),
      environnement: id.environnement,
      statut: "brouillon",
      historique: [{ date: maintenant, statut: "brouillon", detail: "Préparé dans l'appli" }],
    })
    .select("*")
    .single();
  if (eIns || !ligne) {
    return NextResponse.json({ error: "Journal des envois indisponible : exécute supabase/migration_v89.sql." }, { status: 500 });
  }

  // Copie du PDF envoyé (preuve de ce qui est parti) — best-effort.
  const chemin = `${user.id}/envois-postaux/${ligne.id}.pdf`;
  const { error: eUp } = await admin.storage.from("pieces").upload(chemin, pdf, { contentType: "application/pdf", upsert: true });

  try {
    const r = await envoyerCourrier(id, {
      type,
      nom: `${type === "lrar" ? "LRAR" : "Lettre"} — ${(b.objet || lignes[0]).slice(0, 80)}`,
      customId: ligne.id,
      pdf,
      nomFichier: (b.nomFichier || "courrier.pdf").replace(/[^\w.\- ]+/g, "_").slice(0, 100),
      destinataire: { lignes, pays: ligne.pays },
      expediteur: { lignes: expediteur, pays: "FR" },
      couleur: ligne.couleur,
      rectoVerso: ligne.recto_verso,
      arScanne: ligne.ar_scanne,
    });
    const { data: maj } = await admin
      .from("envois_postaux")
      .update({
        maileva_sending_id: r.sendingId,
        maileva_recipient_id: r.recipientId,
        statut: "soumis",
        statut_maileva: r.statut,
        soumis_le: new Date().toISOString(),
        pdf_path: eUp ? null : chemin,
        historique: [...(ligne.historique || []), { date: new Date().toISOString(), statut: "soumis", detail: `Transmis à Maileva${id.environnement === "sandbox" ? " (environnement de TEST : rien n'est imprimé)" : ""}` }],
        updated_at: new Date().toISOString(),
      })
      .eq("id", ligne.id)
      .select("*")
      .single();
    return NextResponse.json({ ok: true, envoi: maj || ligne });
  } catch (e) {
    const err = e as ErreurMaileva;
    const message = err.message || "Envoi impossible.";
    await admin
      .from("envois_postaux")
      .update({
        statut: "erreur",
        erreur: message.slice(0, 1000),
        pdf_path: eUp ? null : chemin,
        historique: [...(ligne.historique || []), { date: new Date().toISOString(), statut: "erreur", detail: message.slice(0, 300) }],
        updated_at: new Date().toISOString(),
      })
      .eq("id", ligne.id);
    return NextResponse.json({ error: message }, { status: err.status || 502 });
  }
}
