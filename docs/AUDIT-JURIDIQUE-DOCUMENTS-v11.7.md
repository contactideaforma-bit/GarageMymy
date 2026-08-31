# Audit juridique du pack documentaire — My Easy Auto / IDEA FORMA
**Date : 31 août 2026 · 24 documents examinés · version de l'appli : v11.7**

> ⚠️ **Ce que cet audit est, et ce qu'il n'est pas.**
> J'ai lu l'intégralité des 24 documents `.docx` du pack et les textes
> contractuels intégrés à l'application. Je signale ce qui me paraît
> non conforme, incohérent ou risqué, avec la correction proposée.
> **Je ne suis pas avocat et cet audit ne vaut pas conseil juridique.**
> Il ne permet pas d'affirmer que le pack est « conforme » : il permet de
> présenter à un avocat un dossier déjà dégrossi, ce qui coûtera moins
> cher et ira plus vite. Les points marqués 🔴 méritent une validation
> professionnelle avant les premières signatures.

---

## 1. Synthèse — les six chantiers, par ordre d'urgence

| # | Sujet | Gravité | Effort |
|---|---|---|---|
| 1 | **La chaîne RGPD est rompue** : la sous-traitance vers les secrétaires n'est autorisée par personne | 🔴 Critique | Créer un DPA |
| 2 | **Le contrat de prestation PAPIER est obsolète et dangereux** (période d'essai, pas de « à distance ») | 🔴 Critique | Régénérer |
| 3 | **Le régime de TVA d'IDEA FORMA n'est toujours pas tranché** — tous les devis en dépendent | 🔴 Critique | Décision + correction |
| 4 | **Vous promettez un « accord de traitement des données » qui n'existe pas** | 🔴 Critique | Créer le document |
| 5 | Clauses de résiliation et de responsabilité perfectibles (risque de réduction judiciaire) | 🟠 Important | Réécriture ciblée |
| 6 | Incohérences entre documents (versions, emails, délais, prix) | 🟡 Moyen | Passe de cohérence |

---

## 2. 🔴 CRITIQUE — La chaîne de sous-traitance RGPD est rompue

**Le constat.** Le montage est le suivant :

- le **garage** est responsable de traitement (données de ses clients : identité, adresse, véhicule, sinistre, parfois données d'assurance) ;
- **IDEA FORMA** est sous-traitant — c'est écrit à l'article 9 des CGV ;
- la **secrétaire indépendante** est *sous-traitant ultérieur* : elle accède aux données du garage depuis son propre poste.

Le contrat de prestation (article 13) affirme qu'elle intervient
« **avec l'autorisation écrite des garages concernés** ». **Cette
autorisation n'existe nulle part.** Les CGV du garage ne mentionnent à
aucun moment que le traitement sera confié à des prestataires
indépendants externes.

**Pourquoi c'est grave.** L'article 28.2 du RGPD interdit à un
sous-traitant de recruter un autre sous-traitant **sans autorisation
écrite préalable, spécifique ou générale, du responsable de
traitement**. En l'état, chaque dossier traité par une secrétaire
constitue une sous-traitance non autorisée. En cas de contrôle CNIL ou
de plainte d'un client de garage, c'est IDEA FORMA qui répond.

**S'ajoute** que l'article 9 des CGV ne contient que 3 des **8 mentions
obligatoires** de l'article 28.3 du RGPD. Il manque : l'objet, la durée,
la nature et la finalité du traitement ; les catégories de données et de
personnes concernées ; l'engagement de confidentialité des personnes
autorisées ; le régime de la sous-traitance ultérieure ; l'obligation
d'assistance (droits des personnes, analyses d'impact, notification de
violation) ; le droit d'audit ; le choix restitution/suppression en fin
de contrat.

**Correction proposée.** Créer une **annexe RGPD au contrat d'abonnement
(« Accord de traitement des données »)**, qui :

1. reprend les 8 mentions de l'article 28.3 ;
2. donne au garage l'information et l'**autorisation générale** de
   sous-traitance ultérieure vers « des collaborateurs indépendants
   sélectionnés par IDEA FORMA, soumis aux mêmes obligations », avec la
   liste tenue à jour et un **droit d'opposition motivé** du garage ;
3. précise l'hébergement dans l'UE, la durée de conservation (90 jours
   après la fin), les mesures de sécurité, et le délai de notification
   de violation ;
4. est **signée en même temps que le contrat d'abonnement**.

C'est le document qui manque le plus, et c'est aussi celui que vous
promettez déjà par écrit (voir §5).

---

## 3. 🔴 CRITIQUE — Le contrat de prestation papier contredit celui de l'appli

`CONTRAT-PRESTATION_collaborateur.docx` est resté à la version d'origine
alors que le modèle intégré à l'application est passé en **v2.1**. Un
collaborateur pourrait signer le papier au lieu de l'écran.

Ce que le papier contient encore, et qui est un **problème** :

| Clause du papier | Pourquoi c'est un risque |
|---|---|
| « Une **période d'essai de 2 mois** est convenue » (art. 10) | Notion propre au **contrat de travail**. Sa présence dans un contrat d'entreprise est un **indice de requalification** retenu par les juges. C'est précisément ce qu'on avait retiré. |
| « durée **indéterminée** » | Contredit la durée d'1 mois reconductible retenue en v2.0. |
| Aucune mention « **à distance** » | Le caractère distanciel est un élément d'indépendance ; il figure dans le contrat d'apporteur mais pas ici. |
| Vigilance URSSAF « **chaque année** » | Insuffisant : l'article L8222-1 du code du travail impose une vérification **tous les six mois**. En cas de défaut du prestataire, votre responsabilité solidaire est engagée. |
| « 17 € HT » sans précision | Ne dit pas qu'il s'agit d'un revenu **BRUT**. C'est l'ambiguïté que vous aviez vous-même relevée. |
| Pas de procédure heures supplémentaires, ni manquements, ni changement de secrétaire, ni non-contournement | Toutes les protections ajoutées en v2.1 sont absentes. |
| Art. 11 Responsabilité | Ne contient pas la mise en cause pour manquement à l'**obligation de moyens**. |

**Correction proposée.** Ne pas corriger ce fichier : le **régénérer**
depuis le modèle v2.1 de l'application (`contratPrestationDefaut`), pour
que papier et écran soient le même texte. Idem pour
`commerciaux/CONTRAT-APPORTEUR-AFFAIRES.docx`, resté en **v1.4** alors
que l'appli est en **v1.5** (il manque l'article 3.1 bis sur le retrait
du portefeuille faute d'activité).

---

## 4. 🔴 CRITIQUE — Le régime de TVA n'est pas tranché

Le `DEVIS-TYPE` porte « **TVA 20 % (à adapter au régime fiscal en
vigueur)** » et un total TTC de 1 032 €. Les CGV disent « prix hors
taxes, TVA en sus au taux en vigueur ».

**Deux cas, et un seul est correct :**

- si IDEA FORMA est **assujettie**, le devis est bon, mais il lui manque
  son **numéro de TVA intracommunautaire** — mention obligatoire ;
- si IDEA FORMA est en **franchise en base**, alors facturer 20 % de TVA
  est une **facturation indue de TVA** : la TVA facturée est due au
  Trésor (art. 283-3 du CGI) alors qu'elle n'était pas exigible, et le
  client ne peut pas la déduire. La mention obligatoire serait
  « **TVA non applicable, article 293 B du CGI** ».

Ce point est signalé depuis la note stratégique d'août et **n'est
toujours pas résolu**. Tant qu'il ne l'est pas, aucun devis ne devrait
partir.

**Point connexe** : le devis porte **NAF 8559A (formation)**. Le code
NAF n'a qu'une valeur statistique et n'interdit rien, mais il faut
vérifier que l'**objet social** dans les statuts couvre bien l'édition
de logiciel et le secrétariat externalisé. Si ce n'est pas le cas, une
modification de l'objet social s'impose.

---

## 5. 🔴 CRITIQUE — Vous promettez un document qui n'existe pas

Deux documents commerciaux promettent au garage un accord RGPD :

- `ARGUMENTAIRE-DEMARCHAGE`, réponse à l'objection « Mes données ? » :
  « **On vous fournit l'accord de traitement des données.** »
- `DEVIS-TYPE`, conditions : « **accord de traitement des données sur
  demande** ».

Ce document n'existe pas dans le pack. Promettre par écrit un document
contractuel qu'on ne peut pas produire est doublement fâcheux : c'est
une **inexécution** si le garage le demande, et cela peut être qualifié
de **pratique commerciale trompeuse** si la promesse a déterminé
l'achat. La création du DPA (§2) règle les deux problèmes d'un coup.

---

## 6. 🟠 IMPORTANT — Clauses à rééquilibrer

### 6.1 Les frais de résiliation anticipée (CGV art. 2)

Le texte cumule, en cas de rupture pendant l'engagement :
la **totalité** des mensualités HT restant à courir **+** la mise en
service offerte qui redevient due.

C'est une **clause pénale** au sens de l'article 1231-5 du code civil :
le juge peut la **réduire d'office** si elle est manifestement
excessive. Entre professionnels, elle peut aussi être attaquée sur le
fondement de l'article **L442-1, I, 2° du code de commerce**
(déséquilibre significatif) — d'autant que, la prestation n'étant plus
fournie, vous encaissez une marge sans contrepartie.

**Ce qui la fragilise particulièrement** : elle s'applique à
l'identique, que le garage parte au 2ᵉ ou au 11ᵉ mois.

**Correction proposée** : conserver le principe, mais le calibrer —
par exemple **la totalité des mensualités restantes plafonnée à 50 %**,
ou 100 % des trois premiers mois puis 50 % au-delà. Une clause qu'un
juge applique vaut mieux qu'une clause qu'il annule. Et supprimer le
cumul avec la mise en service : garder l'un **ou** l'autre.

À harmoniser aussi avec l'article 4 (« le paiement annuel n'est pas
remboursable ») : le cumul des deux ferait payer deux fois.

### 6.2 La limitation de responsabilité (CGV art. 8)

Elle plafonne la responsabilité aux sommes payées sur 12 mois et exclut
les dommages indirects. C'est classique et acceptable en B2B, **mais
il manque la réserve d'usage** : une clause limitative est écartée en
cas de **faute lourde ou de dol** (jurisprudence constante), et elle ne
peut pas vider de sa substance l'obligation essentielle.

**Correction proposée** : ajouter « *sauf faute lourde, dol, atteinte à
la confidentialité ou manquement aux obligations de protection des
données* ». Sans cette réserve, un juge peut écarter **toute** la
clause ; avec elle, elle tient.

### 6.3 La révision annuelle des prix (CGV art. 4)

« Les prix peuvent être révisés annuellement avec un préavis de deux
mois. » Le client engagé est protégé, mais le client **sans engagement**
subit la hausse sans recours.

**Correction proposée** : ajouter le droit, pour le client qui refuse la
nouvelle grille, de **résilier sans frais ni préavis** dans le mois
suivant la notification. C'est la contrepartie qui rend une clause de
révision unilatérale opposable.

### 6.4 Les heures supplémentaires (CGV art. 6)

Les CGV disent simplement « les heures supplémentaires sont facturées au
tarif hors forfait ». Le contrat de prestation v2.1 (article 7) impose
désormais un **accord écrit préalable** des trois parties.

**Les deux textes doivent dire la même chose**, sinon un garage peut
faire exécuter des heures que la secrétaire n'a pas acceptées, ou
contester des heures qu'il n'a pas commandées.

**Correction proposée** : aligner les CGV sur l'article 7 — heures hors
forfait sur **demande écrite** du garage et **confirmation écrite**
d'IDEA FORMA avant exécution ; le relevé de l'application fait foi.

### 6.5 Les CGU ne sont pas contractualisées

Les CGU existent (page `/cgu`, 12 articles : compte et identifiants,
signature électronique, IA, propriété, assistance…) mais **ne sont pas
signées à la vente** : seules les CGV le sont. Or ce sont les CGU qui
encadrent l'usage de l'application, la sécurité des identifiants, la
valeur de la signature électronique et le rôle de l'IA.

**Correction proposée** : les faire accepter à la vente, au même titre
que les CGV. *(Développement en cours — voir §9.)*

---

## 7. 🟡 Incohérences entre documents

| Point | Ce qui est écrit | Où |
|---|---|---|
| **Version des CGV** | « v1.0 — août 2026 » dans le docx, **v1.2** dans l'application | `CONTRAT-ABONNEMENT_garage-CGV` |
| **Email de contact** | `contact.ideaforma@gmail.com` (ancien) au lieu de `contact@myeasyauto.fr` | `DEVIS-TYPE`, `GUIDE-COLLABORATEUR` |
| **Délai de paiement** | Devis : « règlement à **15 jours** » · CGV art. 4 : « payables **d'avance, à réception** » | Contradiction directe |
| **Résiliation** | Devis : « résiliation par e-mail avec préavis d'un mois » — sans dire que l'engagement 12 mois rend les mensualités restantes exigibles | Le devis paraît plus doux que les CGV : risque de contestation |
| **Pénalités de retard** | CGV et devis : « 3 × l'intérêt légal » · contrat collaborateur : « BCE + 10 points » | Les deux sont légales, mais autant harmoniser |
| **Report d'heures** | Cohérent partout (50 %) ✅ | — |
| **Grille tarifaire et primes** | **Tous les calculs vérifiés, exacts** ✅ | Plaquette, contrat apporteur, avenant |

---

## 8. 🟡 Points de détail à corriger

- **`FICHE-BESOINS_garage`** collecte des données personnelles (nom,
  fonction, téléphone, email du dirigeant) **sans aucune mention
  d'information RGPD**. L'article 13 du RGPD l'impose. Ajouter deux
  lignes en pied de page : finalité, base légale (intérêt légitime),
  durée de conservation, droits et contact.
- **`ARGUMENTAIRE-DEMARCHAGE`** propose une démonstration « avec un de
  **VOS** rapports d'expertise ». Outre que c'est ce que vous voulez
  changer, c'est **juridiquement préférable de ne pas le faire** : un
  vrai rapport contient les données personnelles d'un client du garage,
  traitées dans un compte de démonstration sans base légale ni contrat.
  Les **rapports factices** règlent le problème commercial *et* le
  problème RGPD. *(Modification demandée, à intégrer.)*
- **`ARGUMENTAIRE-DEMARCHAGE`** contient des affirmations chiffrées —
  « ce qui prenait 45 minutes prend 2 minutes », « nos garages courent
  moins après l'argent » . Toute allégation chiffrée doit pouvoir être
  **justifiée** en cas de contestation. Soit vous documentez la mesure,
  soit vous passez au conditionnel.
- **`ARGUMENTAIRE-DEMARCHAGE`**, argument « Sans embauche » : « une
  secrétaire **dédiée** », « vous l'avez au téléphone », « sans contrat
  de travail ». Ce vocabulaire est efficace commercialement mais
  **alimente exactement le récit de la requalification** si l'URSSAF
  lit vos supports. Préférer « une secrétaire indépendante, spécialisée
  sinistres, qui suit vos dossiers ».
- **`GUIDE-COLLABORATEUR`** indique que l'appli propose des relances
  graduées « **jusqu'à la mise en demeure** », alors que la charte de
  périmètre exclut tout « engagement juridique au nom du garage ».
  Préciser qu'une mise en demeure part **sur validation expresse du
  garage**.
- **`GUIDE-COLLABORATEUR`** doit être mis à jour du périmètre v2.1 :
  droit de refus, heures supplémentaires, non-contournement (ne jamais
  accepter une proposition directe d'un garage), et la distinction
  BRUT/NET sur les 17 €.
- **Documents internes** (`FORMATION_*`, `ENTRETIEN-COLLABORATION_*`,
  `PROCEDURE-*`, `KIT-DU-COMMERCIAL`, `GUIDE-COMMERCIAL`,
  `NOTE-STRATEGIE-TARIFAIRE`, `FICHE-RENTABILITE`) : pas de risque
  juridique propre — ils ne sont pas remis aux clients. À reprendre
  seulement pour la cohérence (email, versions, mention « à distance »).

---

## 9. Ce qui est déjà corrigé dans l'application

| Sujet | État |
|---|---|
| Contrat de prestation v2.1 (à distance, heures supp, manquements, changement de secrétaire, vigilance 6 mois, non-contournement, obligation de moyens) | ✅ Fait |
| Contrat d'apporteur v1.5 (portefeuille retirable faute d'activité) | ✅ Fait |
| Distinction BRUT / NET avec les taux 2026 | ✅ Fait (`remuneration.ts`) |
| Guide de déclaration de revenus du collaborateur | ✅ Fait |
| Charte du périmètre des missions | ✅ Fait |
| Acceptation des CGU à la vente | 🔧 En cours |
| Mise à disposition de tous les documents dans l'espace éditeur | 🔧 En cours |

---

## 10. Plan de correction proposé

**Étape 1 — décisions qui n'appartiennent qu'à vous** (rien ne peut être
rédigé avant) :

1. Régime de TVA d'IDEA FORMA : assujettie ou franchise en base ?
2. Objet social : couvre-t-il l'édition de logiciel et le secrétariat ?
3. Frais de résiliation anticipée : maintien à 100 % ou calibrage à 50 % ?

**Étape 2 — création du document manquant** : l'Accord de traitement des
données (DPA), annexé au contrat d'abonnement et signé avec lui.

**Étape 3 — régénération des documents** depuis les modèles de
l'application, pour que papier et écran soient identiques : contrat de
prestation v2.1, contrat d'apporteur v1.5, contrat d'abonnement + CGV
corrigées (art. 2, 4, 6, 8, 9), devis type, guide du collaborateur.

**Étape 4 — passe de cohérence** sur les 24 documents : email
`contact@myeasyauto.fr`, numéros de version, mention « à distance »,
mention RGPD sur la fiche de besoins, argumentaire avec rapports
factices.

**Étape 5 — relecture par un avocat** du bloc contractuel (abonnement +
CGV + CGU + DPA + les deux contrats collaborateurs). C'est un budget
modeste rapporté au risque, et l'audit ci-dessus lui mâche le travail.
