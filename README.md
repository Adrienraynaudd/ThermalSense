# ThermalSense

API REST en TypeScript pour piloter un reseau de capteurs thermiques organise par batiment et par zone.

## Apercu

ThermalSense expose une API qui permet de :

- gerer des batiments ;
- rattacher des zones a chaque batiment ;
- rattacher des capteurs, actionneurs et seuils d'alerte a chaque zone ;
- enregistrer des mesures sur les capteurs ;
- filtrer certaines ressources via des query params ;
- consulter une documentation OpenAPI via Swagger.

## Stack technique

- Node.js + Express
- TypeScript
- Prisma ORM
- SQLite (`dev.db`)
- Swagger (`swagger-ui-express`, `swagger-jsdoc`)

## Modele de donnees

Relations principales :

- `Building` -> `Zone`
- `Zone` -> `Sensor`
- `Zone` -> `Actuator`
- `Zone` -> `AlertThreshold`
- `Sensor` -> `Measurement`

Les suppressions sont en cascade sur les relations (configurees dans Prisma).

## Installation

Prerequis :

- Node.js 18+ (recommande)
- npm

Installer les dependances :

```bash
npm install
```

## Demarrage rapide (important)

Avant de lancer l'API, execute les commandes Prisma pour initialiser/synchroniser la base et le client :

```bash
npm install
npx prisma migrate deploy
npx prisma generate
npm run dev
```

Ordre recommande :

1. `npx prisma migrate deploy` applique les migrations existantes sur la base SQLite.
2. `npx prisma generate` regenere le client Prisma utilise par l'API.
3. `npm run dev` demarre le serveur Express.

## Configuration

Vous pouvez creer un fichier `.env` (optionnel) :

```env
PORT=3000
DATABASE_URL="file:./dev.db"
JWT_SECRET="change-me"
JWT_EXPIRES_IN="5m"
JWT_AUDIENCE="thermalsense-api"
JWT_SCOPE="api:read api:write"
AUTH_USERNAME="admin"
AUTH_PASSWORD="admin123"
JWT_LOGS="true"
```

## Lancer le projet

```bash
npx prisma migrate deploy
npx prisma generate
npm run dev
```

Si tu modifies `prisma/schema.prisma`, utilise plutot :

```bash
npx prisma migrate dev --name <nom_migration>
npx prisma generate
```

Par defaut :

- API: `http://localhost:3000`
- Documentation Swagger: `http://localhost:3000/docs`

## Authentification JWT

Toutes les routes metier sont protegees par JWT. Les routes publiques sont :

- `POST /auth/login`
- `GET /docs`

Par defaut, les tokens expirent au bout de 5 minutes.
Le JWT contient les claims `sub`, `role`, `scope`, `exp` et `aud`.

### Creer un compte

Il n'y a pas encore de route d'inscription (`/auth/register`).
Pour le moment, le compte est configure via les variables d'environnement :

1. Definir `AUTH_USERNAME` et `AUTH_PASSWORD` dans `.env`.
2. Redemarrer l'API (`npm run dev`).
3. Appeler `POST /auth/login` avec ces identifiants.

Exemple :

```env
AUTH_USERNAME="alice"
AUTH_PASSWORD="alice123!"
```

Note: dans la version actuelle, un seul compte applicatif est gere via `.env`.

### Logs JWT

- Les logs JWT sont actives par defaut.
- Pour les desactiver: `JWT_LOGS="false"`.

### Script de preuves sprint authN

Le script ci-dessous execute les preuves demandees (T1, T2, T3, T4) avec sorties structurees :

```bash
npm run proof:authn
```

Important: lance d'abord l'API dans un autre terminal (`npm run dev`).

1. Recuperer un token :

```bash
curl -X POST "http://localhost:3000/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

2. Utiliser le token dans les appels API :

```bash
curl "http://localhost:3000/building" \
  -H "Authorization: Bearer <accessToken>"
```

## Endpoints

### Authentification

- `POST /auth/login`

### Batiment

- `GET /building`
- `POST /building`
- `GET /building/:id`
- `PATCH /building/:id`
- `DELETE /building/:id`

### Zone

- `GET /zone` (filtre possible: `?building=<buildingId>`)
- `POST /building/:id/zone`
- `GET /zone/:id`
- `PATCH /zone/:id`
- `DELETE /zone/:id`

### Capteur

- `GET /sensor` (filtres possibles: `?building=<buildingId>&zone=<zoneId>`)
- `POST /zone/:id/sensor`
- `GET /sensor/:id`
- `PATCH /sensor/:id`
- `DELETE /sensor/:id`

### Mesure

- `GET /measurement`
  - filtres possibles: `zoneId`, `sensorId`, `type`, `startDate`, `endDate`, `limit`, `offset`
- `POST /sensor/:id/measurement`

### Actionneur

- `GET /actuator` (filtres possibles: `?building=<buildingId>&zone=<zoneId>`)
- `POST /zone/:id/actuator`
- `GET /actuator/:id`
- `PATCH /actuator/:id`
- `DELETE /actuator/:id`

### Seuil d'alerte

- `GET /alert-threshold` (filtres possibles: `?zone=<zoneId>&type=<type>`)
- `POST /zone/:id/alert-threshold`
- `PATCH /alert-threshold/:id`
- `DELETE /alert-threshold/:id`

## Exemple rapide

Creer un batiment :

```bash
curl -X POST "http://localhost:3000/building" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Site principal",
    "address": "10 rue de la Paix, Paris"
  }'
```

## Scripts npm

- `npm run dev` : lance le serveur avec `ts-node`
- `npm test` : script placeholder (pas de tests implementes pour l'instant)
