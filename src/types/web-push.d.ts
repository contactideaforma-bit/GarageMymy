/**
 * Déclaration minimale du paquet `web-push` (v42).
 *
 * Le paquet ne fournit pas ses propres types. Plutôt que d'ajouter
 * @types/web-push, on décrit ici les 3 fonctions réellement utilisées :
 * le code compile même avant `npm install`, et reste correctement typé.
 */
declare module "web-push" {
  export type AbonnementPush = {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  export type ResultatEnvoi = {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
  };

  export type OptionsEnvoi = {
    TTL?: number;
    urgency?: "very-low" | "low" | "normal" | "high";
    topic?: string;
    headers?: Record<string, string>;
  };

  export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;

  export function sendNotification(
    abonnement: AbonnementPush,
    payload?: string | Buffer | null,
    options?: OptionsEnvoi
  ): Promise<ResultatEnvoi>;

  export function generateVAPIDKeys(): { publicKey: string; privateKey: string };

  const webpush: {
    setVapidDetails: typeof setVapidDetails;
    sendNotification: typeof sendNotification;
    generateVAPIDKeys: typeof generateVAPIDKeys;
  };
  export default webpush;
}
