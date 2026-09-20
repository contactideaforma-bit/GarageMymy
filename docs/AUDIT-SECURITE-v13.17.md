# Audit de sécurité — My Easy Auto v13.17 (20 septembre 2026)

Périmètre : code de l'application (Next.js 14.2.35, Supabase JS 2.108), routes API,
migrations SQL v2 → v83, Storage, envoi d'emails, endpoints publics. Audit statique
(lecture du code), sans test d'intrusion sur l'environnement de production.

## Synthèse

Posture globale saine : toutes les tables applicatives sont sous RLS par compte
(`owner_id = auth.uid()`), les fichiers Storage sont cloisonnés par dossier de compte
(v44), les routes API sensibles exigent un jeton Supabase (`utilisateurDepuisRequete`),
les crons exigent `CRON_SECRET`, les routes éditeur vérifient `ADMIN_EMAILS` côté
serveur, les mots de passe SMTP sont chiffrés au repos (AES-256-GCM), les en-têtes
HTTP de durcissement sont posés (HSTS, CSP, X-Frame-Options DENY, nosniff,
Referrer-Policy, Permissions-Policy). Aucune version vulnérable connue : Next 14.2.35
intègre le correctif de CVE-2025-29927 (et l'appli n'a pas de middleware).

Deux points corrigés dans cette version, quatre recommandations.

## Corrigé (v13.17)

1. **`/api/photo-vehicule` ouverte sans authentification** (ajoutée en v13.10) : relais
   Wikipédia utilisable par n'importe qui, cache mémoire non borné (déni de service par
   remplissage). → Jeton Supabase exigé, cache plafonné à 2 000 entrées.
2. **`/api/signature` (POST public) sans limite de débit** : le jeton est un UUID v4
   (imprévisible), mais rien ne freinait un robot. → 30 tentatives / heure / IP
   (`lib/limiteur.ts`, réutilisable).

## Vérifié conforme

- **RLS** : 68 tables créées par les migrations, toutes avec `enable row level security`
  et une policy `owner_id = auth.uid()` (les tables `expertise_*` via la boucle de la
  v75). Seule exception voulue : `service_incidents` en lecture anonyme (page /etat),
  sans policy d'écriture. Les fichiers `schema.sql` et `migration_profil_clients.sql`
  restent neutralisés (v6.3).
- **Storage** : buckets `rapports`, `pieces`, `prive` privés ; `entreprise` public en
  lecture seulement ; dépôt uniquement dans `<owner_id>/…` (v44) ; le mode expert
  dépose dans `pieces` sous le même préfixe. Migration v79 recrée les buckets
  manquants.
- **Routes API** : 33 routes ; les 4 routes IA expert passent par `preparerAppelIA`
  (auth + liste d'accès expert + quota IA) ; extraction / tri / carte grise : auth +
  quota + taille max 15 Mo ; envoi d'email : auth, expéditeur pris dans le profil du
  compte connecté (jamais du corps de requête), config SMTP filtrée par `owner_id`
  (fail-closed sans ownerId).
- **Endpoints publics** : `/api/contact` et `/api/vente` — piège à robots, 5 envois /
  heure / IP, validation stricte, prix recalculés serveur ; `/api/suivi/[token]` — jeton
  UUID, `actif` et `expire_le` vérifiés ; `/api/signature` — réponse minimale une fois
  signé, update atomique (`is("signe_le", null)`), consentement gage exigé serveur.
- **Secrets** : aucun fichier `.env*` versionné ; seules `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
  `NEXT_PUBLIC_ADMIN_EMAILS` sont exposées au navigateur (rien de secret ; la liste
  admin n'est qu'un affichage, le contrôle est serveur).
- **Injection HTML** : un seul `dangerouslySetInnerHTML` (script de thème, constant) ;
  le corps des emails est échappé (`escapeHtml`) ; Supabase JS paramètre les requêtes
  (pas de SQL brut côté client).
- **Emails** : From = compte SMTP (v13.13), texte brut systématique, Message-ID
  cohérent.

## Recommandations (non bloquantes)

1. **CSP** : `script-src 'unsafe-inline' 'unsafe-eval'` reste nécessaire à Next.js et
   jsPDF. Piste : nonces CSP via middleware quand Next 15 sera adopté.
2. **Limiteur de débit** en mémoire (par instance Vercel) : suffisant contre un robot
   simple ; pour une protection réelle, Upstash Ratelimit ou Vercel WAF sur
   `/api/contact`, `/api/vente`, `/api/signature`, `/api/send-email`.
3. **Journal d'accès aux données sensibles** (RIB, signatures, cartes grises) : pas de
   trace de qui a ouvert quoi. Une table `acces_sensibles` alimentée côté serveur
   aiderait en cas de litige RGPD.
4. **`npm audit`** à exécuter localement à chaque montée de version (réseau bloqué
   dans l'environnement d'audit) ; surveiller `jspdf` et `nodemailer`.

## Rappel des audits précédents
- v10.6 — cloisonnement multi-garages, privatisation des buckets (`AUDIT-SECURITE.md`).
- v6.2 — neutralisation des migrations historiques à policies ouvertes.
