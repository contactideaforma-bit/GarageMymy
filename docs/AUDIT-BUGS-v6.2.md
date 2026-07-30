# Audit bugs & incohérences — My Easy Auto v6.2

*Audit du 30/07/2026 — code sur disque (v6.2). 4 passes d'analyse (logique métier lib/, routes API, pages, composants + SQL), chaque finding majeur contre-vérifié dans le code réel.*

**Bonne nouvelle d'abord** : les règles métier sensibles sont respectées partout — « Acquittée » n'influence jamais le statut de paiement, l'exclusivité prise en charge / cession fonctionne, le filtre expert utilise bien `cabinet_expert`, la RLS par `owner_id` couvre toutes les tables métier, le coffre AES-256-GCM est correct, `relances-auto` est bien fail-closed, et le GET `mail-config` ne renvoie jamais le mot de passe SMTP.

---

## 🔴 CRITIQUES (4)

### C1. Les montants ne sont jamais arrondis → un dossier peut ne JAMAIS passer en « Payé »
- `src/lib/documents.ts` l.18-19 : `computeTotaux` renvoie `ht + montantTva` **sans arrondi**. Ex. HT 599,97 € × TVA 20 % → TTC stocké `719.9640000000001`.
- Les 4 endroits qui décident « payé » n'utilisent pas la même tolérance :
  - `paiements.ts` l.42 : tolérance 1 centime ✔
  - `banque/page.tsx` l.378 : tolérance 1 centime ✔
  - `dossierSync.ts` l.30-36 (`majDossierSiSolde`) : **strict `<= 0`** ✘
  - `PaiementsPanel.tsx` l.344-345 : **strict `<= 0`** ✘
- **Scénario** : le client paie les 719,96 € affichés sur le PDF → le badge dit « Payé », mais `majDossierSiSolde` calcule un reste de 0,004 € et **le dossier ne passe jamais automatiquement en « Payé »** ; la facture reste « envoyée » en saisie manuelle. États contradictoires à l'écran.
- **Fix** : arrondir au centime dans `computeTotaux` + une fonction unique `estSoldee(ttc, paye)` (tolérance 0,01) utilisée par les 4 points.

### C2. Fichiers SQL hérités : un simple copier-coller rouvre TOUTES les données en accès anonyme
- `supabase/schema.sql` (l.68-204), `migration_documents.sql`, `migration_profil_clients.sql` contiennent encore des policies `for all using (true) with check (true)` (**anon inclus**) sur dossiers, documents, clients, emails, entreprise… + la policy storage `rapports_all_anon`.
- Ton workflow = coller des fichiers SQL à la main dans Supabase. **Un collage du mauvais fichier (nouvel environnement, « re-run » de rattrapage) annule le cloisonnement v8+ et la privatisation des buckets v17** : accès anonyme et inter-garages à tout.
- **Fix** : vider ces 3 fichiers et les remplacer par un commentaire « OBSOLÈTE — remplacé par migration_v8+ », ou y réécrire les policies owner.

### C3. Archivage : les pièces sont purgées du serveur même si le ZIP est incomplet
- `src/lib/archive.ts` l.133-145 : erreurs de génération PDF avalées (`catch {}`), échecs de download ignorés, `URL.revokeObjectURL(url)` appelé **immédiatement** après `click()` (peut faire avorter le téléchargement sur Firefox/Safari), puis **suppression définitive** des rapports et pièces du Storage.
- **Scénario** : une pièce ne se télécharge pas (réseau) → ZIP incomplet ou téléchargement avorté → fichiers perdus pour toujours.
- **Fix** : `setTimeout(() => revokeObjectURL, 1000)` (comme excel.ts) ; ne purger que les chemins réellement ajoutés au ZIP ; idéalement confirmation utilisateur après téléchargement avant purge.

### C4. Édition d'un devis/facture : les lignes sont supprimées AVANT d'insérer les nouvelles
- `src/components/DocumentEditor.tsx` l.92 : `delete` des `document_lignes` puis `insert`, sans transaction, et le retour du delete n'est pas vérifié.
- **Scénario** : coupure réseau / erreur RLS entre les deux → **la facture est vidée de toutes ses lignes** (totaux incohérents avec 0 ligne). L'inverse (delete échoue) crée des doublons.
- **Fix** : insérer d'abord les nouvelles lignes puis supprimer les anciennes (`.delete().neq(...)`), ou RPC transactionnelle.

---

## 🟠 MAJEURS (12)

### M1. Mode « prise en charge » ignoré par les relances d'impayé
`src/lib/dossierSync.ts` l.61-90 (`destinataireRelance`) + `api/relances-auto/route.ts` l.87-100 : seul le mode cession est testé. En mode PEC, **le débiteur est l'assurance** (règlement direct au garage, cf. actions.ts), mais la relance part au **client** avec le ton « particulier ». Conflit client garanti, et l'assurance n'est jamais relancée.
→ `if (cession || dossier.mode_pec) return { to: assureur_email, pro: true }` aux deux endroits.

### M2. Relances automatiques inopérantes sur les factures auto-générées
`DossierForm.creerDocument` crée les factures **sans `date_echeance`**, et `relances-auto` filtre `.not("date_echeance","is",null)`. Le flux nominal (import rapport IA → facture auto) ne déclenchera **jamais** une relance auto, silencieusement.
→ Échéance par défaut (date + 30 j) à la création auto.

### M3. Le RIB est stocké dans le bucket PUBLIC `entreprise`
v26 ajoute `rib_path`, uploadé dans `entreprise` (public depuis l'origine, v17 ne privatise que rapports/pieces « le bucket entreprise (logo) reste public »). **Le RIB PDF est servi par URL publique sans authentification.**
→ Bucket privé + URL signée, comme `rapports`.

### M4. Rapprochement bancaire non atomique : un retry duplique le paiement
`banque/page.tsx` l.356-400 : insert `paiements` → update facture → update `bank_transactions`. Si la dernière étape échoue, la transaction reste « À rapprocher » ; re-cliquer « Valider » **insère un second paiement** (encaissé doublé, dossier « Payé » à tort).
→ Marquer la transaction d'abord, ou vérifier avant insert, ou RPC transactionnelle.

### M5. Suppression d'un paiement : le dossier reste « Payé »
`PaiementsPanel.tsx` l.103-115 : la facture est bien rétrogradée « envoyé », mais `majDossierSiSolde` ne recule jamais → un paiement saisi par erreur puis supprimé laisse le dossier en « Payé » : relances auto et Prochaine action ne remonteront plus l'impayé.
→ Rétrograder le statut dossier après suppression si plus soldé.

### M6. Import bancaire : deux opérations identiques le même jour → la 2ᵉ disparaît
`banque.ts` l.135-140 : hash = `date|libellé|montant` + upsert `ignoreDuplicates`. Deux virements identiques le même jour (deux franchises de 150 € même libellé) → **2ᵉ transaction silencieusement écartée**, jamais rapprochée.
→ Inclure un compteur d'occurrence dans la clé de hash.

### M7. Quota IA contournable (course + doublon qui casse le compteur)
`quotaIA.ts` : read-modify-write non atomique, pas de contrainte UNIQUE `(owner_id, mois)`. Deux analyses simultanées → 2 lignes → `maybeSingle()` en erreur → `utilise = 0` → **le plafond de 15 € n'est plus jamais appliqué**. Lecture en échec = fail-open aussi.
→ Contrainte UNIQUE + RPC d'incrément atomique ; traiter l'erreur de lecture comme quota dépassé.

### M8. Signature à distance : token éternel + double soumission écrase la signature
`migration_v20` + `api/signature/route.ts` : token UUID jamais expiré ni invalidé après signature (le lien continue d'exposer nom, véhicule, immat, n° sinistre à vie) ; le POST n'est pas atomique — deux soumissions quasi simultanées passent le contrôle `dejaSigne` et la 2ᵉ **écrase** la 1ʳᵉ signature.
→ `update(...).is("signe_le", null)` + 409 si 0 ligne ; expiration (30 j) ; `sign_token = null` après signature.

### M9. Relances auto : doubles relances possibles + journalisation non vérifiée
`relances-auto/route.ts` l.125+134 : les inserts `emails` et `relances` ne vérifient pas `error`. Si l'insert échoue, l'email est **parti** mais non compté → même relance renvoyée au prochain run, niveaux faussés (le client peut recevoir « Relance n°1 » plusieurs fois). Course possible cron + déclenchement manuel.
→ Vérifier les erreurs, insérer la relance AVANT l'envoi, contrainte unique `(document_id, date_relance)`.

### M10. send-email : email envoyé mais potentiellement jamais tracé
La journalisation (`emails`, statut devis « envoyé », événement) est faite **côté navigateur** après l'appel API (`EmailComposer` l.247-267), sans contrôle d'erreur. Onglet fermé au mauvais moment → email parti, aucune trace. Aussi : validation d'entrée quasi absente (to, tailles, PJ) et `fromFallback` accepté du client si Resend partagé.
→ Journaliser côté serveur dans la route (comme relances-auto).

### M11. Création de dossier : les documents auto peuvent échouer en silence
`DossierForm.creerDocument` l.159-190 (+ inserts OR/cession/événements l.420-441) : aucune erreur propagée. L'UI promet « devis, facture, OR et cession générés automatiquement », message de succès affiché… même si rien n'a été créé (ou des documents à 0 ligne).
→ Vérifier chaque `error` et remonter dans le catch du submit.

### M12. Suppression de dossier : erreurs avalées + Storage purgé avant le delete
`sinistres/[id]/page.tsx` l.217-226 : ni le delete ni les `storage.remove` ne sont vérifiés, navigation immédiate. Delete en échec → l'utilisateur croit le dossier supprimé ; pire, les fichiers Storage peuvent être supprimés alors que le dossier reste.
→ Vérifier les erreurs, ne purger le Storage qu'après succès du delete.

---

## 🟡 MINEURS (sélection, regroupés)

1. **Statuts hérités v0 jamais promus** — `dossierSync` l.41 : `en_cours`/`termine` → `indexOf = -1` → traités « déjà payé », jamais passés en Payé auto.
2. **« Échue » divergente** — `actions.ts` (parse UTC, échue le jour J dès 2 h) vs `paiements.enRetard` (échue le lendemain) : « URGENT » d'un côté, « pas en retard » de l'autre le même jour.
3. **Numéros de facture non garantis uniques** — `genNumero`/`genNumeroOR` : suffixe `Date.now().slice(-5)` cyclique (100 s) ; pas de contrainte UNIQUE. Risque comptable faible mais réel. → séquence par mois en base.
4. **Dates `toISOString().slice(0,10)`** = la veille entre minuit et 2 h (Paris) — finance/page.tsx:248 (date de relance), flotte:496, PaiementsPanel:320/413, AtelierPanel, DossierForm… → helper `ymd()` local partout (planning/agenda l'ont déjà).
5. **Page sinistres** : tri lexicographique des numéros (`FAC-10` avant `FAC-9` → `localeCompare(..., {numeric:true})`) ; comparateur `NaN` quand deux montants null ; le select « Trier par » ment après un tri par en-tête.
6. **Fiche dossier blanchie à chaque mutation** — `load()` remet `loading=true` → cocher « Acquittée » remplace toute la page par « Chargement… », scroll perdu. → `if (!dossier) setLoading(true)`.
7. **Doubles soumissions** sans garde `saving` : événements (fiche dossier), véhicules « au garage », AssureursView/ExpertsView (ClientsView a le bon pattern).
8. **Erreurs Supabase avalées** (pattern récurrent) : agenda insert RDV, finance insert relance (→ la relance suivante repart au niveau 1 !), AtelierPanel/DemandesPanel/PiecesPanel/TransfertGarantie deletes, CommandesPanel update optimiste sans rollback. → helper commun `const { error } = …; if (error) alert(...)`.
9. **mailer.ts `ownerId` optionnel** : sans lui, `limit(1)` prend la config SMTP d'un garage arbitraire. Latent (les appelants le passent) mais dangereux. → rendre obligatoire.
10. **mail-config POST** : si la clé de chiffrement manque, le mot de passe est stocké **en clair silencieusement** (`chiffrer(x) || x`) — incohérent avec extranets qui renvoie 500 ; et tout POST partiel écrase les champs absents à null.
11. **Messages d'erreur internes renvoyés au client** (noms de colonnes, détails Anthropic) dans mail-config, extranets, signature, extract-*. → message générique + log serveur.
12. **DemandesPanel « Répondre par email »** : le corps dit « veuillez trouver ci-joint » mais aucune PJ n'est jointe/joignable, et la demande est marquée envoyée dès l'envoi.
13. **EmailLibre (listes de diffusion)** : tout part en CCI mais le bouton Envoyer exige un champ « À » non vide, jamais pré-rempli → bouton grisé inexpliqué. → pré-remplir avec l'adresse du garage.
14. **TransfertGarantiePanel** : le véhicule de flotte passe `loue:true` à la création mais n'est **jamais libéré** (ni suppression ni statut accordé/refusé).
15. **SQL/types** : `entreprise` sans contrainte unique par owner (2 onglets Profil = 2 lignes → PDF/emails piochent au hasard) ; annuaire (clients/experts/assureurs) sans unicité `(owner_id, nom)` ; `emails.client_id` orpheline (jamais renseignée) ; nullabilités types.ts ≠ SQL.
16. **Divers UI** : CameraModal course dans `reprendre()` (aperçu noir), SignaturePad non redimensionné à la rotation (tracé décalé sur tablette), PiecesPanel input file non réinitialisé sur échec (bouton « mort »), EmailComposer `pjCochees` figé au premier rendu.
17. **excel.ts** : `esc(sheetName).slice(0,31)` peut couper une entité XML → fichier corrompu (latent). → `esc(name.slice(0,31))`.
18. **pdf.ts lignesDepuisTravaux** : garde `startsWith("-")` incohérente avec la regex (puces `•` ignorées) ; montant `1.234,56` → `NaN` imprimé sur l'OR.
19. **banque.ts** : relevés avec colonne « Crédit » seule (sans « Débit ») → toutes lignes ignorées sans explication.
20. **Perf relances-auto** : full scan de toutes les factures échues et de tous les clients de tous les garages, sans borne. OK aujourd'hui, à borner avant montée en charge.
21. **CSP absente** dans next.config.mjs (les autres en-têtes sont bons) — surtout utile pour la page publique `/signer/[token]`.

---

## 💡 Améliorations proposées (au-delà des fixes)

1. **Un module `money.ts`** : `round2`, `estSoldee(ttc, paye)`, parse FR (`1 234,56`) — utilisé par documents, paiements, dossierSync, banque, pdf. Élimine toute la famille C1 d'un coup.
2. **Un helper `dbCall()`** qui wrappe les appels Supabase et alerte sur erreur — élimine le pattern « erreur avalée » (M11, M12, mineurs 8) partout.
3. **Helper `ymd()` partagé** dans format.ts (dates locales Paris) — élimine le mineur 4.
4. **Rate limiting** simple sur les routes IA/email (déjà identifié dans l'audit sécurité précédent, toujours absent).
5. **Cloisonnement Storage par `owner_id/`** (risque connu documenté, à faire avant d'ouvrir à d'autres garages) — et bucket privé pour le RIB (M3).
6. **Échéance par défaut paramétrable** dans le Profil (30 j) appliquée à toutes les factures.
7. **Contraintes d'unicité en base** (entreprise, usage_ia, annuaire, numéros de documents) — la base devient la garantie, plus le code client.

---

## 🎯 Priorisation suggérée (lots à coder)

- **Lot A — Argent & données (urgent, ~1 migration + 5 fichiers)** : C1 (arrondis unifiés), C4 (ordre delete/insert), M4 (rapprochement idempotent), M5 (rétrogradation), M6 (hash banque), C3 (archive sans perte).
- **Lot B — SQL & sécurité (rapide)** : C2 (neutraliser SQL hérités), M3 (RIB privé), M7 (quota atomique), M8 (signature : expiration + garde atomique), migration unicités.
- **Lot C — Relances & emails** : M1 (PEC), M2 (échéance défaut), M9, M10, mineurs 2/13.
- **Lot D — Robustesse UI** : M11, M12, mineurs 6/7/8 (helper d'erreurs), 4 (ymd), 5 (tris).

Dis-moi quel(s) lot(s) tu veux que je code, je te prépare les fichiers + la migration + le bloc git push.
