# Déployer sur Render avec PostgreSQL (Neon)

## Pourquoi ?

Le disque de Render est **éphémère** : à chaque redéploiement, les fichiers
locaux (dont `hotel-belinga.sqlite`) sont effacés → les données disparaissaient.
Avec PostgreSQL hébergé chez Neon (gratuit), les données vivent chez Neon et
**survivent à chaque redéploiement et redémarrage**.

## 1. Créer la base PostgreSQL gratuite (Neon)

1. Créer un compte sur https://neon.tech (gratuit, sans carte bancaire).
2. Créer un projet (ex : « hotel-belinga »).
3. Copier la **Connection string** :
   `postgresql://user:motdepasse@ep-xxxx.aws.neon.tech/neondb?sslmode=require`

## 2. Créer le Web Service sur Render

1. https://render.com → **New → Web Service** → connecter ce repo GitHub.
2. **Build command** : `npm install`
3. **Start command** : `npm start`
4. Onglet **Environment** → ajouter la variable :
   - Clé : `DATABASE_URL`
   - Valeur : la connection string Neon copiée à l'étape 1.
5. **Deploy**.

## 3. Premier lancement (automatique)

- Les tables `rooms`, `room_history`, `payments` sont créées automatiquement.
- Les **52 chambres « Libre »** sont créées automatiquement.
- À chaque redéploiement : les données sont conservées.

## 4. Fonctionnement local (inchangé)

- Sans `DATABASE_URL`, `npm start` utilise la base SQLite locale
  (`hotel-belinga.sqlite`) exactement comme avant.
- `npm run reset` :
  - avec `DATABASE_URL` défini → vide la base PostgreSQL distante ;
  - sinon → supprime les fichiers SQLite locaux.

## 5. Important

- Le `DATABASE_URL` est un secret : il ne vit **que** dans les variables
  d'environnement Render (jamais dans le code ni dans le repo).
- Les données locales SQLite ne sont pas copiées automatiquement vers Neon :
  au premier déploiement, la base distante démarre vierge (52 chambres).

## 6. Accès personnel — `/login` (authentification)

Le site a deux parties :

| URL | Accès | Contenu |
|---|---|---|
| `/` | **public** | Vitrine : présentation, tarifs, **disponibilités** (`/api/public/rooms` — aucun nom de client) |
| `/login` | public | Formulaire du personnel |
| `/admin` | **session requise** | Tableau de bord (Chambres, Planning, Clients, Réservations, Paiements, Statistiques, Historique) |
| `/api/history`, `/api/payments`, `/api/rooms`, exports, reçus, écritures | **session requise** | Renvoient `401` sans connexion |

### Paramétrage du mot de passe

Le dépôt GitHub étant **public**, le mot de passe n'est écrit **nulle part en
clair** : le serveur compare l'entrée à une **empreinte scrypt** (salée)
intégrée à `server.js`.

- **Utilisateur** : `hoteladmin` (variable `ADMIN_USERNAME`, valeur par défaut)
- **Mot de passe** : `adminhotelbelinga27`
- Variable optionnelle `ADMIN_PASSWORD` : si vous la définissez dans Render,
  elle **remplace** l'empreinte intégrée (utile pour changer de mot de passe
  sans toucher au code).

Pour changer de mot de passe plus tard :

1. https://render.com → service **hotel-belinga** → onglet **Environment**
2. **Add Variable** : `ADMIN_PASSWORD` = le nouveau mot de passe
3. **Save** (Render redéploie automatiquement)

### Comportement des sessions

- Cookie `hb_session` (HttpOnly, SameSite=Lax, Secure sur HTTPS), durée **8 h**.
- Un redémarrage/redéploiement Render déconnecte tout le monde (sessions en mémoire).
- Bouton **Déconnexion** dans l'en-tête du tableau de bord.
- Si la session expire pendant l'utilisation : retour automatique sur `/login`.