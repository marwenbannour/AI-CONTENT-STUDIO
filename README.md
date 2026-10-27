# API de création de contenu

Application web et API NestJS pour gérer des comptes vérifiés, des profils de
marque, des projets, des brouillons, un calendrier éditorial, des quotas et des
abonnements.

## Prérequis et démarrage

Node.js 24 ou supérieur est requis (la persistance utilise `node:sqlite`).

```powershell
npm install
$env:DATABASE_PATH = ".\data\app.sqlite"
npm run start:dev
```

L’application web et l’API sont servies sur le même port (`3000` par défaut) ;
ouvrir `http://localhost:3000`. La base SQLite est créée au premier démarrage.
En production, utiliser un volume persistant et sauvegardé, HTTPS, un
gestionnaire de secrets et une stratégie de sauvegarde/restauration adaptée.

## Configuration

| Variable | Requis pour | Valeur par défaut / remarque |
| --- | --- | --- |
| `PORT` | démarrage | `3000` |
| `DATABASE_PATH` | démarrage | `./data/app.sqlite` |
| `CORS_ORIGINS` | API appelée depuis une autre origine | Origines séparées par des virgules ; par défaut `http://localhost:8081,http://127.0.0.1:8081` pour Expo Web en développement |
| `RESEND_API_KEY` | inscription et récupération | Clé API Resend |
| `EMAIL_FROM` | inscription et récupération | Adresse d’expédition validée chez Resend |
| `OPENAI_API_KEY` | génération | Clé du fournisseur compatible OpenAI |
| `OPENAI_BASE_URL` | génération | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | génération | `gpt-4o-mini` |
| `MONTHLY_GENERATION_LIMIT` | quota gratuit | `20` générations par mois UTC |
| `PAID_MONTHLY_GENERATION_LIMIT` | quota payant | `200` générations par mois UTC |
| `STRIPE_SECRET_KEY` | checkout et portail | Clé secrète Stripe |
| `STRIPE_PRICE_ID` | checkout | Identifiant du prix récurrent Stripe |
| `STRIPE_WEBHOOK_SECRET` | webhook | Secret de signature du webhook Stripe |
| `APP_BASE_URL` | checkout et portail | URL HTTPS publique de l’application cliente |

Les appels externes non configurés échouent explicitement avec une réponse
d’indisponibilité ; l’API ne simule ni livraison d’e-mail, ni génération, ni
paiement. Les idées et le profil de marque sont envoyés au fournisseur IA
configuré. Configurez les fournisseurs et informez vos utilisateurs avant la
mise en production.

## Déploiement de staging sur Render

Le fichier `render.yaml` configure un service Web Node.js 24 en région
Frankfurt, avec déploiement automatique de `main` et un disque persistant
monté sur `/var/data` pour la base SQLite. Le disque nécessite une instance
Render payante ; ne remplacez pas ce stockage par le système de fichiers
éphémère d’une instance gratuite.

Pour créer le staging, connectez le dépôt GitHub à Render avec **New +
Blueprint**, puis sélectionnez le dépôt. Après la création, renseignez dans
les variables d’environnement Render :

- `APP_BASE_URL` : URL HTTPS attribuée au service, par exemple
  `https://ai-content-studio-staging.onrender.com`.
- `CORS_ORIGINS` : origines Web/Expo Web autorisées, séparées par des virgules ;
  ne renseignez que les origines réellement utilisées.
- `RESEND_API_KEY` et `EMAIL_FROM` : projet et expéditeur de test Resend.
- `OPENAI_API_KEY` : clé de génération dédiée au staging.
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` et `STRIPE_WEBHOOK_SECRET` :
  identifiants Stripe en mode test. Configurez l’URL du webhook Stripe sur
  `https://<URL-DU-SERVICE>/billing/webhook` et abonnez-le aux événements
  `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated` et `customer.subscription.deleted`.

Les valeurs déclarées avec `sync: false` sont saisies directement dans Render ;
ne les ajoutez jamais au dépôt. Une fois les variables configurées, déclenchez
un déploiement, vérifiez l’URL de santé `/`, puis testez l’inscription par
email, la génération IA et le checkout Stripe en mode test. Configurez aussi
une sauvegarde hors instance du fichier SQLite avant d’utiliser des données
importantes : le disque persistant protège des redémarrages, mais ne remplace
pas une stratégie de sauvegarde.

## Interface web

L’interface légère est servie par NestJS et ne nécessite aucune étape de build
frontend. Elle comprend l’inscription, la vérification d’adresse et la
récupération du mot de passe, un tableau de bord, le studio de génération avec
états de chargement/erreur/réessai, l’édition des résultats avant sauvegarde, la
bibliothèque filtrable, le calendrier, le profil de marque, les projets, les
quotas, les liens d’abonnement Stripe et la suppression confirmée du compte.
Les sessions sont transmises par cookie sécurisé au même hôte. Les actions
dépendant d’un fournisseur nécessitent les clés de configuration du tableau
ci-dessus ; sans celles-ci, l’interface affiche l’erreur renvoyée par l’API.

## Application mobile Expo

L’application React Native/Expo se trouve dans `mobile/`, utilise Expo Router
pour ses routes d’authentification et ses onglets, et partage les mêmes routes
métier que l’interface Web. Lancer l’API dans un premier terminal, puis dans un
second :

```powershell
Set-Location mobile
npm install
npm run start
```

Le simulateur Android utilise `http://10.0.2.2:3000` par défaut et le
simulateur iOS `http://localhost:3000`. Pour un téléphone physique, copier
`mobile/.env.example` vers `mobile/.env` et définir `EXPO_PUBLIC_API_URL` sur
l’adresse IP du poste développeur accessible depuis le téléphone, ou sur
l’adresse HTTPS de l’API déployée. Ne jamais placer de clé fournisseur dans
une variable `EXPO_PUBLIC_*`. L’aperçu Expo Web utilise les origines CORS
autorisées par `CORS_ORIGINS` ; son jeton de session reste en mémoire et n’est
pas persisté dans le navigateur.

La connexion mobile reçoit un jeton Bearer dédié, conservé par
`expo-secure-store`. Les parcours comprennent la vérification par jeton,
génération et édition, sauvegarde, projets, bibliothèque, calendrier, profil de
marque, quota, abonnement et suppression confirmée. L’application dépend d’une
connexion pour synchroniser ses données ; le mode hors ligne complet n’est pas
inclus au MVP.

Vérifier le typage mobile avec `Set-Location mobile; npm run typecheck`. Pour
lancer l’application sur l’émulateur Android ou le simulateur iOS, utiliser
`npm run android` ou `npm run ios` dans `mobile/`. La qualité et le typage
peuvent être contrôlés depuis ce répertoire avec `npx expo lint` et
`npm run typecheck`.

## Authentification

Les routes privées utilisent un cookie de session `__Host-session` avec les
attributs `Secure`, `HttpOnly`, `SameSite=Strict` et `Path=/`. Le cookie exige
HTTPS, y compris côté client. Les mots de passe font 12 à 128 caractères et
doivent inclure une minuscule, une majuscule et un chiffre. Ils sont dérivés
avec scrypt ; seuls les condensats des jetons de session et d’e-mail sont
stockés.

| Méthode et route | Description |
| --- | --- |
| `POST /auth/signup` | Crée un compte et envoie un jeton de vérification à usage unique. |
| `POST /auth/verify-email` | Vérifie `{ "token": "..." }` et ouvre une session. |
| `POST /auth/login` | Ouvre une session pour un compte vérifié. |
| `POST /auth/logout` | Révoque la session courante. |
| `GET /auth/me` | Renvoie le compte courant. |
| `POST /auth/forgot-password` | Envoie une réponse identique qu’un compte existe ou non. |
| `POST /auth/reset-password` | Réinitialise le mot de passe avec un jeton à usage unique. |
| `DELETE /account` | Supprime le compte après `{ "confirmation": "DELETE", "password": "..." }`. |

Les courriels indiquent la route API et le jeton à transmettre. Les jetons
expirent après une heure. Une interface cliente doit fournir les formulaires de
vérification et de récupération et transmettre les jetons aux routes ci-dessus.
L’application mobile utilise `POST /auth/mobile/login` et
`POST /auth/mobile/verify-email`, qui renvoient le jeton de session pour le
stocker dans le coffre sécurisé de l’appareil. Les routes privées acceptent ce
jeton en `Authorization: Bearer …` ; la version Web continue à utiliser son
cookie HttpOnly.

## Profils, projets et contenus

Toutes les routes ci-dessous nécessitent une session.

| Méthode et route | Description |
| --- | --- |
| `GET`, `PUT /profile` | Lire ou enregistrer nom de marque, niche, audience, ton, langue et consignes. |
| `GET`, `POST /projects` | Lister ou créer des projets. |
| `DELETE /projects/:id` | Supprimer un projet ; ses contenus restent dans la bibliothèque sans projet associé. |
| `POST /content/generate` | Générer à partir de `{ "subject": "...", "format": "..." }`. |
| `POST /content` | Enregistrer un brouillon généré ou rédigé. |
| `GET /content` | Filtrer avec `projectId`, `status`, `platform`, `from`, `to`. Les dates filtrent `createdAt`. |
| `PATCH /content/:id` | Modifier un brouillon ou planifier un contenu. |
| `DELETE /content/:id` | Supprimer un contenu. |
| `GET /calendar?from=...&to=...` | Lister les contenus planifiés dans l’intervalle UTC fourni. |
| `GET /quota` | Lire consommation, plafond et date de renouvellement. |

Une génération réussie renvoie `hook`, `script`, `cta`, `captions` et le quota
restant. Le contenu n’est pas enregistré automatiquement : utilisez `POST
/content` pour créer un brouillon modifiable. Les échecs du fournisseur ne
consomment pas de quota ; les réponses HTTP `429` incluent la consommation et
signalent qu’une mise à niveau est possible. Le quota se renouvelle au début du
mois UTC. Les limites gratuites et payantes sont configurables dans
l’environnement.

Planifier un contenu exige `status: "scheduled"`, `scheduledAt` (date ISO-8601
UTC) et `targetPlatform`. Modifier une date ne publie rien. Cette API ne possède
aucune intégration de publication externe.

Les lectures, modifications et suppressions sont filtrées par le compte
authentifié ; les identifiants de projets d’un autre compte sont traités comme
introuvables.

## Abonnements et webhooks

| Méthode et route | Description |
| --- | --- |
| `POST /billing/checkout` | Crée une session Stripe Checkout pour le prix configuré. |
| `POST /billing/portal` | Crée un lien vers le portail client Stripe. |
| `GET /billing/subscription` | Lit l’état d’abonnement synchronisé côté serveur. |
| `POST /billing/webhook` | Reçoit les événements Stripe signés. |

Configurer Stripe pour envoyer les événements `checkout.session.completed`,
`customer.subscription.created`, `customer.subscription.updated` et
`customer.subscription.deleted` à `/billing/webhook`. La requête est vérifiée
sur son corps brut, avec une tolérance temporelle de cinq minutes. Les
identifiants d’événements sont enregistrés pour rendre le traitement
idempotent ; les corps de webhook et les données de carte ne sont pas stockés.
Les paiements et cartes sont traités par Stripe.

## Suppression et conservation

La suppression confirmée efface le compte, les sessions, les profils, les
projets, les contenus, l’usage et l’abonnement local par contraintes de cascade.
Les identifiants Stripe d’événements reçus restent conservés afin d’empêcher
leur retraitement ; aucun corps de webhook n’est gardé. Les dossiers de
paiement conservés par Stripe relèvent des règles et obligations de Stripe.
Le délai de conservation des identifiants d’événement et toute autre exception
légale doivent être validés selon la juridiction et la politique de
confidentialité de l’exploitant avant le lancement.

## Vérification

```powershell
npm run build
npm test
npm run test:e2e
npm run lint
```
# AI-CONTENT-STUDIO
