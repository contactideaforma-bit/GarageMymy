/* ============================================================
   My Easy Auto — Service Worker (v42)

   Rôle UNIQUE : recevoir les notifications push et les afficher, même
   quand l'appli est fermée. Volontairement PAS de cache hors-ligne :
   un cache mal réglé sur une appli de gestion afficherait des données
   périmées (montants, statuts) — bien pire qu'une page qui ne charge pas.
   ============================================================ */

// Le nouveau worker prend la main immédiatement (pas d'attente de
// fermeture de tous les onglets), sinon une correction de ce fichier
// mettrait des jours à s'appliquer.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { titre: "My Easy Auto", corps: event.data ? event.data.text() : "" };
  }

  const titre = data.titre || "My Easy Auto";
  const options = {
    body: data.corps || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // tag : une nouvelle notification du même type REMPLACE la précédente
    // (pas 5 « résumé du matin » empilés si le cron est rejoué).
    tag: data.tag || "myeasyauto",
    renotify: true,
    data: { url: data.url || "/" },
    // Sur Android, garde la notification affichée jusqu'au clic.
    requireInteraction: Boolean(data.persistante),
  };

  event.waitUntil(self.registration.showNotification(titre, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const cible = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((liste) => {
      // Appli déjà ouverte : on la ramène au premier plan et on navigue.
      for (const client of liste) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(cible);
          return;
        }
      }
      // Sinon on ouvre une fenêtre.
      if (self.clients.openWindow) return self.clients.openWindow(cible);
    })
  );
});
