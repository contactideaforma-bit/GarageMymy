// ============================================================
//  NOTIFICATIONS PUSH — côté SERVEUR (v42)
//
//  Envoi chiffré vers les services de push d'Apple / Google / Mozilla via
//  le protocole standard Web Push (RFC 8291) et l'authentification VAPID.
//
//  Variables d'environnement nécessaires (Vercel) :
//    NEXT_PUBLIC_VAPID_PUBLIC_KEY  clé publique (aussi lue par le navigateur)
//    VAPID_PRIVATE_KEY             clé privée — NE JAMAIS préfixer NEXT_PUBLIC
//    VAPID_SUBJECT                 « mailto:… » ou l'URL du site
//  Générer la paire une seule fois :  npx web-push generate-vapid-keys
//
//  ⚠️ Ne JAMAIS importer ce fichier dans un composant client.
// ============================================================

import webpush from "web-push";
import { SupabaseClient } from "@supabase/supabase-js";

export type PayloadPush = {
  titre: string;
  corps: string;
  /** Page ouverte au clic sur la notification. */
  url?: string;
  /** Même tag = la notification remplace la précédente au lieu de s'empiler. */
  tag?: string;
  persistante?: boolean;
};

type Abonnement = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

let configure = false;

/** Renseigne les clés VAPID une seule fois par instance serveur. */
export function pushConfigure(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!configure) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:contact.ideaforma@gmail.com",
      pub,
      priv
    );
    configure = true;
  }
  return true;
}

export type ResultatPush = {
  envoyes: number;
  /** Appareils désinscrits parce que le service de push les a rejetés. */
  retires: number;
  erreur?: string;
};

/**
 * Envoie une notification à TOUS les appareils actifs d'un garage.
 *
 * Un endpoint peut expirer (téléphone réinitialisé, appli désinstallée) :
 * les services de push répondent alors 404 ou 410. Dans ce cas on
 * DÉSACTIVE la ligne — sinon on réessaierait indéfiniment tous les matins.
 */
export async function envoyerPush(
  admin: SupabaseClient,
  ownerId: string,
  payload: PayloadPush
): Promise<ResultatPush> {
  if (!pushConfigure()) {
    return { envoyes: 0, retires: 0, erreur: "Clés VAPID non configurées sur le serveur." };
  }

  const { data, error } = await admin
    .from("push_abonnements")
    .select("id,endpoint,p256dh,auth")
    .eq("owner_id", ownerId)
    .eq("actif", true);
  if (error) return { envoyes: 0, retires: 0, erreur: error.message };

  const abos = (data as Abonnement[]) || [];
  if (abos.length === 0) return { envoyes: 0, retires: 0 };

  const corps = JSON.stringify(payload);
  let envoyes = 0;
  const aRetirer: string[] = [];
  const echecs: { id: string; message: string }[] = [];

  await Promise.all(
    abos.map(async (a) => {
      try {
        await webpush.sendNotification(
          { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
          corps,
          // TTL 12 h : un résumé du matin n'a plus d'intérêt le lendemain.
          { TTL: 43200, urgency: "normal" }
        );
        envoyes++;
      } catch (e) {
        const err = e as { statusCode?: number; body?: string; message?: string };
        if (err.statusCode === 404 || err.statusCode === 410) aRetirer.push(a.id);
        else echecs.push({ id: a.id, message: err.body || err.message || "échec" });
      }
    })
  );

  if (aRetirer.length > 0) {
    await admin
      .from("push_abonnements")
      .update({ actif: false, derniere_erreur: "Appareil désinscrit (endpoint expiré)." })
      .in("id", aRetirer);
  }
  for (const e of echecs) {
    await admin
      .from("push_abonnements")
      .update({ derniere_erreur: e.message.slice(0, 300) })
      .eq("id", e.id);
  }
  if (envoyes > 0) {
    const ok = abos.filter((a) => !aRetirer.includes(a.id) && !echecs.some((e) => e.id === a.id));
    await admin
      .from("push_abonnements")
      .update({ dernier_envoi: new Date().toISOString(), derniere_erreur: null })
      .in("id", ok.map((a) => a.id));
  }

  return { envoyes, retires: aRetirer.length };
}
