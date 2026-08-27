import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { envoyerEmailServeur } from "@/lib/mailer";
import { comptesAdmin, emailsAdminServeur } from "@/lib/supportServeur";
import { appliquerFinsDeContrat, comptesAPrevenir, comptesAPurger, purgerCompte } from "@/lib/admin/comptesServeur";

// ============================================================
//  CRON QUOTIDIEN — VIE DES COMPTES (v10.1). Vercel Cron, 5 h du matin.
//   1. Fins de contrat : abonnement résilié + date de fin passée →
//      compte en LECTURE SEULE, purge programmée à J+90 (CGV art. 2 / 9).
//   2. J-7 avant purge : email au garage ET à l'éditeur (dernier rappel
//      pour exporter / réactiver).
//   3. Purge à J+90 : fichiers + compte supprimés, trace dans comptes_purges,
//      email de compte rendu à l'éditeur. Pour CONSERVER un compte, vider
//      sa date de purge dans l'espace éditeur.
//  Protégé par CRON_SECRET (comme /api/relances-auto).
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET non configuré." }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "Service non configuré." }, { status: 500 });

  const rapport: string[] = [];
  const comptes = await comptesAdmin(admin);
  const expediteurId = comptes[0]?.id;
  const mail = async (to: string, subject: string, text: string) => {
    if (!expediteurId || !to) return;
    try {
      await envoyerEmailServeur({ to, subject, text }, expediteurId);
    } catch {
      /* best-effort */
    }
  };

  // 1. Fins de contrat
  try {
    const r = await appliquerFinsDeContrat(admin);
    rapport.push(`Fins de contrat : ${r.lectureSeule} compte(s) en lecture seule, ${r.reactives} réactivé(s).`);
  } catch (e) {
    rapport.push(`Fins de contrat : erreur ${e instanceof Error ? e.message : ""}`);
  }

  // 2. Préavis J-7
  try {
    const aPrevenir = await comptesAPrevenir(admin);
    for (const c of aPrevenir) {
      const { data: u } = await admin.auth.admin.getUserById(c.owner_id);
      const email = u?.user?.email || "";
      await mail(
        email,
        "My Easy Auto — vos données seront supprimées dans 7 jours",
        `Bonjour,\n\nVotre contrat My Easy Auto est terminé depuis le ${c.fin_le || "—"}. Conformément aux conditions générales (article 9), vos données seront définitivement supprimées le ${c.purge_le}.\n\nD'ici là, vous pouvez encore les exporter depuis l'application (Organisation → Sauvegarde) ou réactiver votre abonnement en nous écrivant à ${emailsAdminServeur()[0]}.\n\nIDEAFORMA`
      );
      await admin.from("comptes_etat").update({ prevenu_le: new Date().toISOString() }).eq("owner_id", c.owner_id);
      rapport.push(`Préavis J-7 envoyé : ${email || c.owner_id} (purge le ${c.purge_le}).`);
    }
  } catch (e) {
    rapport.push(`Préavis : erreur ${e instanceof Error ? e.message : ""}`);
  }

  // 3. Purges dues
  try {
    const dues = await comptesAPurger(admin);
    for (const c of dues) {
      try {
        const { data: u } = await admin.auth.admin.getUserById(c.owner_id);
        const email = u?.user?.email || c.owner_id;
        const r = await purgerCompte(admin, c.owner_id, `Purge automatique J+90 (fin de contrat le ${c.fin_le || "—"})`);
        rapport.push(`PURGÉ : ${email} — ${r.objets} fichier(s) supprimé(s).`);
      } catch (e) {
        rapport.push(`Purge ÉCHOUÉE pour ${c.owner_id} : ${e instanceof Error ? e.message : ""}`);
      }
    }
  } catch (e) {
    rapport.push(`Purges : erreur ${e instanceof Error ? e.message : ""}`);
  }

  if (rapport.some((l) => /PURGÉ|Préavis J-7|lecture seule, [1-9]|ÉCHOUÉE/.test(l))) {
    await mail(emailsAdminServeur().join(","), "[My Easy Auto] Vie des comptes — rapport du jour", rapport.join("\n"));
  }
  return NextResponse.json({ ok: true, rapport });
}
