const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API ThermalSense',
      version: '1.0.0',
      description: `
Cette API décrit un réseau de capteurs imbriqués au sein de bâtiments et de zones.

## Authentification

Toutes les routes (sauf \`/auth/login\` et \`/auth/refresh\`) nécessitent un Bearer token JWT dans le header \`Authorization: Bearer <token>\`.

## Rôles et accès

| Rôle | Scopes | Description |
|------|--------|-------------|
| \`ADMIN\` | api:read api:write users:manage | Accès complet à toutes les ressources |
| \`OPERATEUR\` | api:read api:write:zone | Lecture/écriture restreintes à sa zone assignée |
| \`LECTEUR\` | api:read | Lecture seule sur toutes les ressources |
| \`DEVICE_IOT\` | api:read device:write | Lecture globale + création de mesures |

Les réponses \`403 Forbidden\` indiquent que le rôle de l'utilisateur ne permet pas l'accès à cette opération.

## Idempotence — X-Request-ID

Le header \`X-Request-ID\` (UUID v4) peut être fourni sur toute requête. S'il est absent, un UUID est généré automatiquement côté serveur. La valeur est systématiquement renvoyée dans le header \`X-Request-ID\` de la réponse, ce qui permet la traçabilité et la déduplication côté client pour les opérations d'écriture.

## Rate Limiting

Les headers \`RateLimit-*\` (RFC 6585) sont inclus dans les réponses des routes limitées.

| Limiteur | Fenêtre | Max requêtes | Comportement | Routes concernées |
|----------|---------|--------------|--------------|-------------------|
| \`auth_login\` | 10 min | 8 (échecs seulement) | skipSuccessfulRequests | POST /auth/login |
| \`auth_refresh\` | 10 min | 30 | — | POST /auth/refresh |
| \`critical_write\` | 15 min | 60 | — | Créations/modifications/suppressions de ressources critiques |

Un dépassement renvoie \`429 Too Many Requests\`.
      `.trim(),
    },
    tags: [
      { name: 'Bâtiment' },
      { name: 'Zone' },
      { name: 'Capteur' },
      { name: 'Mesures' },
      { name: 'Actionneur' },
      { name: "Commande d'actionneur" },
      { name: "Seuil d'alerte" },
      { name: 'Authentification' },
    ],
    security: [{ bearerAuth: [] }],
    paths: {
      // ─── AUTH ────────────────────────────────────────────────────────────
      '/auth/register': {
        post: {
          tags: ['Authentification'],
          summary: 'Crée un compte utilisateur avec rôle',
          description:
            '**Rôles requis** : ADMIN, OPERATEUR (OPERATEUR limité à sa propre zone).\n\n**Rate limit** : `critical_write` — 60 req/15 min par IP.',
          'x-required-roles': ['ADMIN', 'OPERATEUR'],
          'x-rate-limiter': 'critical_write',
          parameters: [{ $ref: '#/components/parameters/RequestIdHeader' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RegisterRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Utilisateur créé',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/UserProfile' },
                },
              },
            },
            '400': { description: 'Données invalides ou rôle/zone incohérents' },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '404': { description: 'Zone introuvable (pour OPERATEUR)' },
            '409': { description: "Nom d'utilisateur déjà pris" },
            '429': {
              description: 'Rate limit dépassé',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/RateLimitError' } } },
            },
            '500': { description: 'Erreur interne' },
          },
        },
      },
      '/auth/login': {
        post: {
          tags: ['Authentification'],
          summary: 'Génère un couple access token / refresh token',
          description:
            'Endpoint public (pas de Bearer token requis).\n\n**Rate limit** : `auth_login` — 8 échecs/10 min par IP (`skipSuccessfulRequests` actif : les connexions réussies ne sont pas comptabilisées).',
          'x-rate-limiter': 'auth_login',
          security: [],
          parameters: [{ $ref: '#/components/parameters/RequestIdHeader' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LoginRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Tokens générés',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/LoginResponse' },
                },
              },
            },
            '400': { description: 'Identifiants manquants' },
            '401': { description: 'Identifiants invalides' },
            '429': {
              description: 'Trop de tentatives échouées',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/RateLimitError' } } },
            },
            '500': { description: 'Erreur interne' },
          },
        },
      },
      '/auth/refresh': {
        post: {
          tags: ['Authentification'],
          summary: 'Rafraîchit le couple de tokens via un refresh token valide',
          description:
            'Endpoint public. Le refresh token est invalidé (rotation) dès utilisation.\n\n**Rate limit** : `auth_refresh` — 30 req/10 min par IP.',
          'x-rate-limiter': 'auth_refresh',
          security: [],
          parameters: [{ $ref: '#/components/parameters/RequestIdHeader' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RefreshRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Nouveau couple de tokens',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/LoginResponse' },
                },
              },
            },
            '400': { description: 'Refresh token manquant' },
            '401': { description: 'Refresh token invalide, expiré ou inconnu' },
            '429': {
              description: 'Rate limit dépassé',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/RateLimitError' } } },
            },
          },
        },
      },
      '/auth/me': {
        get: {
          tags: ['Authentification'],
          summary: 'Retourne le profil du compte authentifié',
          description: '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          parameters: [{ $ref: '#/components/parameters/RequestIdHeader' }],
          responses: {
            '200': {
              description: 'Profil utilisateur',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/UserProfile' },
                },
              },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '500': { description: 'Erreur interne' },
          },
        },
      },

      // ─── BUILDING ────────────────────────────────────────────────────────
      '/building': {
        get: {
          tags: ['Bâtiment'],
          summary: 'Récupère tous les bâtiments',
          description: '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          parameters: [{ $ref: '#/components/parameters/RequestIdHeader' }],
          responses: {
            '200': {
              description: 'Liste des bâtiments',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/Building' } },
                },
              },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '500': { description: 'Erreur interne' },
          },
        },
        post: {
          tags: ['Bâtiment'],
          summary: 'Crée un bâtiment',
          description: '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          parameters: [{ $ref: '#/components/parameters/RequestIdHeader' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BuildingRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Bâtiment créé',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Building' },
                },
              },
            },
            '400': {
              description: 'Données invalides',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '500': { description: 'Erreur interne' },
          },
        },
      },
      '/building/{id}': {
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
          { $ref: '#/components/parameters/RequestIdHeader' },
        ],
        get: {
          tags: ['Bâtiment'],
          summary: 'Récupère un bâtiment par son ID',
          description: '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          responses: {
            '200': {
              description: 'Bâtiment trouvé',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Building' },
                },
              },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '404': { description: 'Bâtiment introuvable' },
            '500': { description: 'Erreur interne' },
          },
        },
        patch: {
          tags: ['Bâtiment'],
          summary: 'Modifie un bâtiment',
          description: '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BuildingRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Bâtiment modifié',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Building' },
                },
              },
            },
            '400': { description: 'Données invalides' },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '404': { description: 'Bâtiment introuvable' },
            '500': { description: 'Erreur interne' },
          },
        },
        delete: {
          tags: ['Bâtiment'],
          summary: 'Supprime un bâtiment',
          description:
            '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.\n\nLa suppression est en cascade : toutes les zones, capteurs, mesures, actionneurs et seuils d\'alerte associés sont supprimés.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          responses: {
            '204': {
              description: 'Bâtiment supprimé',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '404': { description: 'Bâtiment introuvable' },
            '500': { description: 'Erreur interne' },
          },
        },
      },

      // ─── ZONE ─────────────────────────────────────────────────────────────
      '/zone': {
        get: {
          tags: ['Zone'],
          summary: 'Récupère toutes les zones, optionnellement filtrées par bâtiment',
          description: '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          parameters: [
            { in: 'query', name: 'building', description: 'Filtre par buildingId', schema: { type: 'string', format: 'uuid' } },
            { $ref: '#/components/parameters/RequestIdHeader' },
          ],
          responses: {
            '200': {
              description: 'Liste des zones',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/Zone' } },
                },
              },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '500': { description: 'Erreur interne' },
          },
        },
      },
      '/building/{id}/zone': {
        post: {
          tags: ['Zone'],
          summary: 'Crée une zone dans un bâtiment',
          description: '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          parameters: [
            { in: 'path', name: 'id', required: true, description: 'ID du bâtiment', schema: { type: 'string', format: 'uuid' } },
            { $ref: '#/components/parameters/RequestIdHeader' },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ZoneRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Zone créée',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Zone' },
                },
              },
            },
            '400': { description: 'Données invalides' },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '404': { description: 'Bâtiment introuvable' },
            '500': { description: 'Erreur interne' },
          },
        },
      },
      '/zone/{id}': {
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
          { $ref: '#/components/parameters/RequestIdHeader' },
        ],
        get: {
          tags: ['Zone'],
          summary: 'Récupère une zone par son ID',
          description: '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          responses: {
            '200': {
              description: 'Zone trouvée',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Zone' },
                },
              },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '404': { description: 'Zone introuvable' },
            '500': { description: 'Erreur interne' },
          },
        },
        patch: {
          tags: ['Zone'],
          summary: 'Modifie une zone',
          description: '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ZoneRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Zone modifiée',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Zone' },
                },
              },
            },
            '400': { description: 'Données invalides' },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '404': { description: 'Zone introuvable' },
            '500': { description: 'Erreur interne' },
          },
        },
        delete: {
          tags: ['Zone'],
          summary: 'Supprime une zone',
          description:
            '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.\n\nLa suppression est en cascade : capteurs, mesures, actionneurs et seuils d\'alerte de la zone sont supprimés.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          responses: {
            '204': {
              description: 'Zone supprimée',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '404': { description: 'Zone introuvable' },
            '500': { description: 'Erreur interne' },
          },
        },
      },

      // ─── SENSOR ───────────────────────────────────────────────────────────
      '/sensor': {
        get: {
          tags: ['Capteur'],
          summary: 'Récupère tous les capteurs',
          description:
            'Filtres optionnels par bâtiment ou zone.\n\n**Rôles requis** : ADMIN, OPERATEUR, LECTEUR.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR'],
          parameters: [
            { in: 'query', name: 'building', description: 'Filtre par buildingId', schema: { type: 'string', format: 'uuid' } },
            { in: 'query', name: 'zone', description: 'Filtre par zoneId', schema: { type: 'string', format: 'uuid' } },
            { $ref: '#/components/parameters/RequestIdHeader' },
          ],
          responses: {
            '200': {
              description: 'Liste des capteurs',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/Sensor' } },
                },
              },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant (DEVICE_IOT non autorisé)' },
            '500': { description: 'Erreur interne' },
          },
        },
      },
      '/sensors': {
        post: {
          tags: ['Capteur'],
          summary: 'Crée un capteur (zoneId fourni dans le corps)',
          description:
            '**Rôles requis** : ADMIN, OPERATEUR (limité à sa zone).\n\n**Rate limit** : `critical_write` — 60 req/15 min par IP.',
          'x-required-roles': ['ADMIN', 'OPERATEUR'],
          'x-rate-limiter': 'critical_write',
          parameters: [{ $ref: '#/components/parameters/RequestIdHeader' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SensorRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Capteur créé',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Sensor' },
                },
              },
            },
            '400': { description: 'Données invalides' },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant ou zone non autorisée' },
            '404': { description: 'Zone introuvable' },
            '429': {
              description: 'Rate limit dépassé',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/RateLimitError' } } },
            },
            '500': { description: 'Erreur interne' },
          },
        },
      },
      '/zone/{id}/sensor': {
        post: {
          tags: ['Capteur'],
          summary: 'Crée un capteur dans une zone',
          description:
            '**Rôles requis** : ADMIN, OPERATEUR (limité à sa zone).\n\n**Rate limit** : `critical_write` — 60 req/15 min par IP.',
          'x-required-roles': ['ADMIN', 'OPERATEUR'],
          'x-rate-limiter': 'critical_write',
          parameters: [
            { in: 'path', name: 'id', required: true, description: 'ID de la zone', schema: { type: 'string', format: 'uuid' } },
            { $ref: '#/components/parameters/RequestIdHeader' },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SensorBodyRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Capteur créé',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Sensor' },
                },
              },
            },
            '400': { description: 'Données invalides' },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant ou zone non autorisée' },
            '404': { description: 'Zone introuvable' },
            '429': {
              description: 'Rate limit dépassé',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/RateLimitError' } } },
            },
            '500': { description: 'Erreur interne' },
          },
        },
      },
      '/sensor/{id}': {
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
          { $ref: '#/components/parameters/RequestIdHeader' },
        ],
        get: {
          tags: ['Capteur'],
          summary: 'Récupère un capteur par son ID',
          description: '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          responses: {
            '200': {
              description: 'Capteur trouvé',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Sensor' },
                },
              },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '404': { description: 'Capteur introuvable' },
            '500': { description: 'Erreur interne' },
          },
        },
        patch: {
          tags: ['Capteur'],
          summary: 'Modifie un capteur',
          description: '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SensorBodyRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Capteur modifié',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Sensor' },
                },
              },
            },
            '400': { description: 'Données invalides' },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '404': { description: 'Capteur introuvable' },
            '500': { description: 'Erreur interne' },
          },
        },
        delete: {
          tags: ['Capteur'],
          summary: 'Supprime un capteur',
          description:
            '**Rôles requis** : ADMIN, OPERATEUR (limité à sa zone).\n\nLa suppression est en cascade : toutes les mesures du capteur sont supprimées.',
          'x-required-roles': ['ADMIN', 'OPERATEUR'],
          responses: {
            '204': {
              description: 'Capteur supprimé',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant ou zone non autorisée' },
            '404': { description: 'Capteur introuvable' },
            '500': { description: 'Erreur interne' },
          },
        },
      },
      '/sensors/{id}': {
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
          { $ref: '#/components/parameters/RequestIdHeader' },
        ],
        delete: {
          tags: ['Capteur'],
          summary: 'Alias de DELETE /sensor/{id}',
          description:
            '**Rôles requis** : ADMIN, OPERATEUR (limité à sa zone).\n\n**Rate limit** : `critical_write` — 60 req/15 min par IP.',
          'x-required-roles': ['ADMIN', 'OPERATEUR'],
          'x-rate-limiter': 'critical_write',
          responses: {
            '204': {
              description: 'Capteur supprimé',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant ou zone non autorisée' },
            '404': { description: 'Capteur introuvable' },
            '429': {
              description: 'Rate limit dépassé',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/RateLimitError' } } },
            },
            '500': { description: 'Erreur interne' },
          },
        },
      },
      '/sensors/{id}/config': {
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
          { $ref: '#/components/parameters/RequestIdHeader' },
        ],
        get: {
          tags: ['Capteur'],
          summary: 'Récupère la configuration (données complètes) d\'un capteur',
          description:
            'Retourne les mêmes données que GET /sensor/{id}.\n\n**Rôles requis** : ADMIN, OPERATEUR.',
          'x-required-roles': ['ADMIN', 'OPERATEUR'],
          responses: {
            '200': {
              description: 'Configuration du capteur',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Sensor' },
                },
              },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant (LECTEUR et DEVICE_IOT non autorisés)' },
            '404': { description: 'Capteur introuvable' },
            '500': { description: 'Erreur interne' },
          },
        },
        patch: {
          tags: ['Capteur'],
          summary: 'Modifie la configuration d\'un capteur',
          description:
            '**Rôles requis** : ADMIN, OPERATEUR (limité à sa zone).\n\n**Rate limit** : `critical_write` — 60 req/15 min par IP.',
          'x-required-roles': ['ADMIN', 'OPERATEUR'],
          'x-rate-limiter': 'critical_write',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SensorBodyRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Capteur mis à jour',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Sensor' },
                },
              },
            },
            '400': { description: 'Données invalides' },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant ou zone non autorisée' },
            '404': { description: 'Capteur introuvable' },
            '429': {
              description: 'Rate limit dépassé',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/RateLimitError' } } },
            },
            '500': { description: 'Erreur interne' },
          },
        },
      },

      // ─── MEASUREMENT ──────────────────────────────────────────────────────
      '/measurement': {
        get: {
          tags: ['Mesures'],
          summary: 'Récupère les mesures, optionnellement filtrées',
          description:
            'Résultats triés par `timestamp` décroissant. Par défaut : 20 résultats à partir de l\'offset 0.\n\n**Rôles requis** : ADMIN, OPERATEUR, LECTEUR.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR'],
          parameters: [
            { in: 'query', name: 'zoneId', description: 'Filtre par zone', schema: { type: 'string', format: 'uuid' } },
            { in: 'query', name: 'sensorId', description: 'Filtre par capteur', schema: { type: 'string', format: 'uuid' } },
            { in: 'query', name: 'type', description: 'Filtre par type de capteur', schema: { type: 'string' } },
            { in: 'query', name: 'startDate', description: 'Timestamp minimum (inclusif)', schema: { type: 'string', format: 'date-time' } },
            { in: 'query', name: 'endDate', description: 'Timestamp maximum (inclusif)', schema: { type: 'string', format: 'date-time' } },
            { in: 'query', name: 'limit', description: 'Nombre max de résultats', schema: { type: 'integer', default: 20, minimum: 1 } },
            { in: 'query', name: 'offset', description: "Décalage pour la pagination", schema: { type: 'integer', default: 0, minimum: 0 } },
            { $ref: '#/components/parameters/RequestIdHeader' },
          ],
          responses: {
            '200': {
              description: 'Liste des mesures',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/Measurement' } },
                },
              },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant (DEVICE_IOT non autorisé sur la liste globale)' },
            '500': { description: 'Erreur interne' },
          },
        },
      },
      '/sensor/{id}/measurement': {
        post: {
          tags: ['Mesures'],
          summary: 'Crée une mesure pour un capteur',
          description:
            '**Rôles requis** : ADMIN, OPERATEUR (limité à sa zone), DEVICE_IOT.\n\n**Rate limit** : `critical_write` — 60 req/15 min par IP.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'DEVICE_IOT'],
          'x-rate-limiter': 'critical_write',
          parameters: [
            { in: 'path', name: 'id', required: true, description: 'ID du capteur', schema: { type: 'string', format: 'uuid' } },
            { $ref: '#/components/parameters/RequestIdHeader' },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MeasurementRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Mesure créée',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Measurement' },
                },
              },
            },
            '400': { description: 'Données invalides' },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant ou zone non autorisée' },
            '404': { description: 'Capteur introuvable' },
            '429': {
              description: 'Rate limit dépassé',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/RateLimitError' } } },
            },
            '500': { description: 'Erreur interne' },
          },
        },
      },
      // ─── ACTUATOR ─────────────────────────────────────────────────────────
      '/actuator': {
        get: {
          tags: ['Actionneur'],
          summary: 'Récupère tous les actionneurs',
          description:
            'Filtres optionnels par bâtiment ou zone.\n\n**Rôles requis** : ADMIN, OPERATEUR, LECTEUR.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR'],
          parameters: [
            { in: 'query', name: 'building', schema: { type: 'string', format: 'uuid' } },
            { in: 'query', name: 'zone', schema: { type: 'string', format: 'uuid' } },
            { $ref: '#/components/parameters/RequestIdHeader' },
          ],
          responses: {
            '200': {
              description: 'Liste des actionneurs',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/Actuator' } },
                },
              },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '500': { description: 'Erreur interne' },
          },
        },
      },
      '/zone/{id}/actuator': {
        post: {
          tags: ['Actionneur'],
          summary: 'Crée un actionneur dans une zone',
          description:
            '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.\n\n**Rate limit** : `critical_write` — 60 req/15 min par IP.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          'x-rate-limiter': 'critical_write',
          parameters: [
            { in: 'path', name: 'id', required: true, description: 'ID de la zone', schema: { type: 'string', format: 'uuid' } },
            { $ref: '#/components/parameters/RequestIdHeader' },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ActuatorRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Actionneur créé',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Actuator' },
                },
              },
            },
            '400': { description: 'Données invalides' },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '404': { description: 'Zone introuvable' },
            '429': {
              description: 'Rate limit dépassé',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/RateLimitError' } } },
            },
            '500': { description: 'Erreur interne' },
          },
        },
      },
      '/actuator/{id}': {
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
          { $ref: '#/components/parameters/RequestIdHeader' },
        ],
        get: {
          tags: ['Actionneur'],
          summary: 'Récupère un actionneur par son ID',
          description: '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          responses: {
            '200': {
              description: 'Actionneur trouvé',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Actuator' },
                },
              },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '404': { description: 'Actionneur introuvable' },
            '500': { description: 'Erreur interne' },
          },
        },
        patch: {
          tags: ['Actionneur'],
          summary: 'Modifie un actionneur',
          description: '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ActuatorRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Actionneur modifié',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Actuator' },
                },
              },
            },
            '400': { description: 'Données invalides' },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '404': { description: 'Actionneur introuvable' },
            '500': { description: 'Erreur interne' },
          },
        },
        delete: {
          tags: ['Actionneur'],
          summary: 'Supprime un actionneur',
          description:
            '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.\n\nLa suppression est en cascade : toutes les commandes de l\'actionneur sont supprimées.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          responses: {
            '204': {
              description: 'Actionneur supprimé',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '404': { description: 'Actionneur introuvable' },
            '500': { description: 'Erreur interne' },
          },
        },
      },

      // ─── ACTUATOR COMMANDS ────────────────────────────────────────────────
      '/actuator/{id}/commands': {
        parameters: [
          { in: 'path', name: 'id', required: true, description: "ID de l'actionneur", schema: { type: 'string', format: 'uuid' } },
          { $ref: '#/components/parameters/RequestIdHeader' },
        ],
        get: {
          tags: ["Commande d'actionneur"],
          summary: 'Récupère toutes les commandes d\'un actionneur',
          description: '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          responses: {
            '200': {
              description: 'Liste des commandes',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/ActuatorCommand' } },
                },
              },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '404': { description: 'Actionneur introuvable' },
            '500': { description: 'Erreur interne' },
          },
        },
        post: {
          tags: ["Commande d'actionneur"],
          summary: 'Envoie une commande sur un actionneur (status SENT)',
          description: '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ActuatorCommandRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Commande envoyée',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ActuatorCommand' },
                },
              },
            },
            '400': { description: 'Données invalides' },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '404': { description: 'Actionneur introuvable' },
            '500': { description: 'Erreur interne' },
          },
        },
      },
      '/actuator/{id}/command': {
        post: {
          tags: ["Commande d'actionneur"],
          summary: 'Crée une commande en attente (status PENDING)',
          description: '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          parameters: [
            { in: 'path', name: 'id', required: true, description: "ID de l'actionneur", schema: { type: 'string', format: 'uuid' } },
            { $ref: '#/components/parameters/RequestIdHeader' },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ActuatorCommandRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Commande créée en attente',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ActuatorCommand' },
                },
              },
            },
            '400': { description: 'Données invalides' },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '404': { description: 'Actionneur introuvable' },
            '500': { description: 'Erreur interne' },
          },
        },
      },
      '/actuators/{id}/commands': {
        parameters: [
          { in: 'path', name: 'id', required: true, description: "ID de l'actionneur", schema: { type: 'string', format: 'uuid' } },
          { $ref: '#/components/parameters/RequestIdHeader' },
        ],
        get: {
          tags: ["Commande d'actionneur"],
          summary: 'Récupère l\'actionneur par son ID (via la route /actuators)',
          description:
            'Retourne l\'objet `Actuator` correspondant à l\'ID fourni (même comportement que GET /actuator/{id}).\n\n**Rôles requis** : ADMIN, OPERATEUR, LECTEUR.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR'],
          responses: {
            '200': {
              description: 'Actionneur trouvé',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Actuator' },
                },
              },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '404': { description: 'Actionneur introuvable' },
            '500': { description: 'Erreur interne' },
          },
        },
        post: {
          tags: ["Commande d'actionneur"],
          summary: 'Met à jour un actionneur (via la route /actuators)',
          description:
            'Appelle `actuator.update()` — modifie les champs de l\'actionneur. Diffère de POST /actuator/{id}/commands qui crée une commande avec status SENT.\n\n**Rôles requis** : ADMIN, OPERATEUR (limité à sa zone).\n\n**Rate limit** : `critical_write` — 60 req/15 min par IP.',
          'x-required-roles': ['ADMIN', 'OPERATEUR'],
          'x-rate-limiter': 'critical_write',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ActuatorRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Actionneur mis à jour',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Actuator' },
                },
              },
            },
            '400': { description: 'Données invalides' },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant ou zone non autorisée' },
            '404': { description: 'Actionneur introuvable' },
            '429': {
              description: 'Rate limit dépassé',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/RateLimitError' } } },
            },
            '500': { description: 'Erreur interne' },
          },
        },
      },
      '/actuator-command/{id}': {
        parameters: [
          { in: 'path', name: 'id', required: true, description: 'ID de la commande', schema: { type: 'string', format: 'uuid' } },
          { $ref: '#/components/parameters/RequestIdHeader' },
        ],
        get: {
          tags: ["Commande d'actionneur"],
          summary: 'Récupère une commande par son ID',
          description: '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          responses: {
            '200': {
              description: 'Commande trouvée',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ActuatorCommand' },
                },
              },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '404': { description: 'Commande introuvable' },
            '500': { description: 'Erreur interne' },
          },
        },
        patch: {
          tags: ["Commande d'actionneur"],
          summary: 'Modifie une commande (ex : mise à jour du statut)',
          description: '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ActuatorCommandPatchRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Commande modifiée',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ActuatorCommand' },
                },
              },
            },
            '400': { description: 'Données invalides' },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '404': { description: 'Commande introuvable' },
            '500': { description: 'Erreur interne' },
          },
        },
        delete: {
          tags: ["Commande d'actionneur"],
          summary: 'Supprime une commande',
          description: '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          responses: {
            '204': {
              description: 'Commande supprimée',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '404': { description: 'Commande introuvable' },
            '500': { description: 'Erreur interne' },
          },
        },
      },

      // ─── ALERT THRESHOLD ──────────────────────────────────────────────────
      '/alert-threshold': {
        get: {
          tags: ["Seuil d'alerte"],
          summary: 'Récupère les seuils d\'alerte, optionnellement filtrés',
          description: '**Rôles requis** : ADMIN, OPERATEUR, LECTEUR, DEVICE_IOT.',
          'x-required-roles': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
          parameters: [
            { in: 'query', name: 'zone', description: 'Filtre par zoneId', schema: { type: 'string', format: 'uuid' } },
            { in: 'query', name: 'type', description: 'Filtre par type de seuil', schema: { type: 'string' } },
            { $ref: '#/components/parameters/RequestIdHeader' },
          ],
          responses: {
            '200': {
              description: 'Liste des seuils',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/AlertThreshold' } },
                },
              },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant' },
            '500': { description: 'Erreur interne' },
          },
        },
      },
      '/zone/{id}/alert-threshold': {
        post: {
          tags: ["Seuil d'alerte"],
          summary: 'Crée un seuil d\'alerte dans une zone',
          description:
            '**Rôles requis** : ADMIN, OPERATEUR (limité à sa zone).\n\n**Rate limit** : `critical_write` — 60 req/15 min par IP.',
          'x-required-roles': ['ADMIN', 'OPERATEUR'],
          'x-rate-limiter': 'critical_write',
          parameters: [
            { in: 'path', name: 'id', required: true, description: 'ID de la zone', schema: { type: 'string', format: 'uuid' } },
            { $ref: '#/components/parameters/RequestIdHeader' },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AlertThresholdRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Seuil créé',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AlertThreshold' },
                },
              },
            },
            '400': { description: 'Données invalides' },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant ou zone non autorisée' },
            '404': { description: 'Zone introuvable' },
            '429': {
              description: 'Rate limit dépassé',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/RateLimitError' } } },
            },
            '500': { description: 'Erreur interne' },
          },
        },
      },
      '/alert-threshold/{id}': {
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
          { $ref: '#/components/parameters/RequestIdHeader' },
        ],
        patch: {
          tags: ["Seuil d'alerte"],
          summary: 'Modifie un seuil d\'alerte',
          description:
            '**Rôles requis** : ADMIN, OPERATEUR (limité à sa zone).\n\n**Rate limit** : `critical_write` — 60 req/15 min par IP.',
          'x-required-roles': ['ADMIN', 'OPERATEUR'],
          'x-rate-limiter': 'critical_write',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AlertThresholdRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Seuil modifié',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AlertThreshold' },
                },
              },
            },
            '400': { description: 'Données invalides' },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant ou zone non autorisée' },
            '404': { description: 'Seuil introuvable' },
            '429': {
              description: 'Rate limit dépassé',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/RateLimitError' } } },
            },
            '500': { description: 'Erreur interne' },
          },
        },
        delete: {
          tags: ["Seuil d'alerte"],
          summary: 'Supprime un seuil d\'alerte',
          description:
            '**Rôles requis** : ADMIN, OPERATEUR (limité à sa zone).\n\n**Rate limit** : `critical_write` — 60 req/15 min par IP.',
          'x-required-roles': ['ADMIN', 'OPERATEUR'],
          'x-rate-limiter': 'critical_write',
          responses: {
            '204': {
              description: 'Seuil supprimé',
              headers: { 'X-Request-ID': { $ref: '#/components/headers/X-Request-ID' } },
            },
            '401': { description: 'Token manquant ou invalide' },
            '403': { description: 'Rôle insuffisant ou zone non autorisée' },
            '404': { description: 'Seuil introuvable' },
            '429': {
              description: 'Rate limit dépassé',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/RateLimitError' } } },
            },
            '500': { description: 'Erreur interne' },
          },
        },
      },
    },

    // ─── COMPONENTS ─────────────────────────────────────────────────────────
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Token JWT obtenu via POST /auth/login. Claims : `sub` (username), `role`, `scope`, `zoneId` (OPERATEUR uniquement), `tokenUse: "access"`.',
        },
      },
      headers: {
        'X-Request-ID': {
          description:
            'Identifiant unique de la requête (UUID v4). Généré automatiquement si absent. Toujours renvoyé dans la réponse pour traçabilité et déduplication côté client.',
          schema: { type: 'string', format: 'uuid' },
        },
      },
      parameters: {
        RequestIdHeader: {
          in: 'header',
          name: 'X-Request-ID',
          description:
            'UUID v4 optionnel fourni par le client. Renvoyé tel quel dans `X-Request-ID` de la réponse, permettant la déduplication des opérations d\'écriture.',
          required: false,
          schema: { type: 'string', format: 'uuid' },
        },
      },
      schemas: {
        // ── Auth ──
        LoginRequest: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string', example: 'admin' },
            password: { type: 'string', format: 'password', example: 'admin123' },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            accessToken: { type: 'string', description: 'JWT access token (audience: thermalsense-api)' },
            refreshToken: { type: 'string', description: 'JWT refresh token (audience: thermalsense-api:refresh)' },
            tokenType: { type: 'string', example: 'Bearer' },
            expiresIn: { type: 'string', example: '5m', description: 'Durée de validité de l\'access token' },
            refreshExpiresIn: { type: 'string', example: '7d', description: 'Durée de validité du refresh token' },
          },
        },
        RefreshRequest: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string' },
          },
        },
        RegisterRequest: {
          type: 'object',
          required: ['username', 'password', 'role'],
          properties: {
            username: { type: 'string', example: 'operateur1' },
            password: { type: 'string', format: 'password' },
            role: {
              type: 'string',
              enum: ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
              description: 'Rôle assigné au compte',
            },
            zoneId: {
              type: 'string',
              format: 'uuid',
              description: 'Requis si et seulement si le rôle est OPERATEUR',
            },
          },
        },
        UserProfile: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            username: { type: 'string' },
            role: {
              type: 'string',
              enum: ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
            },
            zoneId: { type: 'string', format: 'uuid', nullable: true },
            zone: {
              type: 'object',
              nullable: true,
              description: 'Zone associée (OPERATEUR uniquement, disponible via GET /auth/me)',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
              },
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },

        // ── Building ──
        Building: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            name: { type: 'string', example: 'Bâtiment A' },
            address: { type: 'string', example: '12 rue de la Paix, Paris' },
          },
        },
        BuildingRequest: {
          type: 'object',
          required: ['name', 'address'],
          properties: {
            name: { type: 'string', example: 'Bâtiment A' },
            address: { type: 'string', example: '12 rue de la Paix, Paris' },
          },
        },

        // ── Zone ──
        Zone: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            name: { type: 'string', example: 'Salle des serveurs' },
            buildingId: { type: 'string', format: 'uuid' },
          },
        },
        ZoneRequest: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', example: 'Salle des serveurs' },
          },
        },

        // ── Sensor ──
        Sensor: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            type: { type: 'string', example: 'TEMPERATURE', description: 'Type de mesure effectuée' },
            status: { type: 'string', example: 'ACTIVE', description: 'État opérationnel du capteur' },
            zoneId: { type: 'string', format: 'uuid' },
          },
        },
        SensorRequest: {
          type: 'object',
          required: ['zoneId', 'type', 'status'],
          description: 'Utilisé pour POST /sensors (zoneId dans le corps)',
          properties: {
            zoneId: { type: 'string', format: 'uuid' },
            type: { type: 'string', example: 'TEMPERATURE' },
            status: { type: 'string', example: 'ACTIVE' },
          },
        },
        SensorBodyRequest: {
          type: 'object',
          description: 'Utilisé pour POST /zone/{id}/sensor et PATCH /sensor/{id}',
          properties: {
            type: { type: 'string', example: 'HUMIDITY' },
            status: { type: 'string', example: 'ACTIVE' },
          },
        },

        // ── Measurement ──
        Measurement: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            value: { type: 'number', format: 'float', example: 21.5 },
            timestamp: { type: 'string', format: 'date-time', readOnly: true, description: 'Généré automatiquement à la création' },
            sensorId: { type: 'string', format: 'uuid' },
          },
        },
        MeasurementRequest: {
          type: 'object',
          required: ['value'],
          properties: {
            value: { type: 'number', format: 'float', example: 21.5 },
          },
        },

        // ── Actuator ──
        Actuator: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            type: { type: 'string', nullable: true, example: 'HVAC', description: 'Type d\'actionneur (facultatif)' },
            status: { type: 'string', nullable: true, example: 'IDLE', description: 'État opérationnel (facultatif)' },
            zoneId: { type: 'string', format: 'uuid' },
          },
        },
        ActuatorRequest: {
          type: 'object',
          properties: {
            type: { type: 'string', example: 'HVAC' },
            status: { type: 'string', example: 'IDLE' },
          },
        },

        // ── ActuatorCommand ──
        ActuatorCommand: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            command: { type: 'string', example: 'TURN_ON' },
            status: {
              type: 'string',
              enum: ['PENDING', 'SENT'],
              default: 'PENDING',
              description: 'PENDING = créée via /command, SENT = envoyée via /commands',
            },
            sentAt: { type: 'string', format: 'date-time', readOnly: true, description: 'Horodatage de création (default now())' },
            actuatorId: { type: 'string', format: 'uuid' },
          },
        },
        ActuatorCommandRequest: {
          type: 'object',
          required: ['command'],
          description: 'Corps pour créer ou envoyer une commande',
          properties: {
            command: { type: 'string', example: 'TURN_ON' },
          },
        },
        ActuatorCommandPatchRequest: {
          type: 'object',
          description: 'Corps pour modifier une commande existante',
          properties: {
            command: { type: 'string', example: 'TURN_OFF' },
            status: { type: 'string', enum: ['PENDING', 'SENT'] },
          },
        },

        // ── AlertThreshold ──
        AlertThreshold: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            type: { type: 'string', example: 'TEMPERATURE', description: 'Type de mesure surveillée' },
            min: { type: 'number', format: 'float', nullable: true, example: 15, description: 'Valeur minimale déclenchant une alerte (facultatif)' },
            max: { type: 'number', format: 'float', nullable: true, example: 30, description: 'Valeur maximale déclenchant une alerte (facultatif)' },
            zoneId: { type: 'string', format: 'uuid' },
          },
        },
        AlertThresholdRequest: {
          type: 'object',
          required: ['type'],
          properties: {
            type: { type: 'string', example: 'TEMPERATURE' },
            min: { type: 'number', format: 'float', nullable: true, example: 15 },
            max: { type: 'number', format: 'float', nullable: true, example: 30 },
          },
        },

        // ── Erreurs ──
        Error: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            details: { type: 'string' },
          },
        },
        RateLimitError: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Too many requests, please try again later.' },
          },
        },
      },
    },
  },
  apis: [],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
