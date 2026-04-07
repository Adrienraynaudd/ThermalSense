const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API ThermalSense',
      version: '1.0.0',
      description:
        'Cette API décrit un réseau de capteurs imbriqués au sein de bâtiments et de zones',
    },
    tags: [
      { name: 'Bâtiment' },
      { name: 'Zone' },
      { name: 'Capteur' },
      { name: 'Mesures' },
      { name: 'Actionneur' },
      { name: "seuil d'alerte" },
    ],
    paths: {
      '/building': {
        get: {
          tags: ['Bâtiment'],
          summary: 'récupère tous les bâtiments',
          responses: {
            '200': { description: 'OK' },
            '500': { description: 'internal server error' },
          },
        },
        post: {
          tags: ['Bâtiment'],
          summary: 'crée un bâtiment',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Building',
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'created',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Building',
                  },
                },
              },
            },
            '400': {
              description: 'bad request',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
            '500': { description: 'internal server error' },
          },
        },
      },
      '/building/{id}': {
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
          },
        ],
        get: {
          tags: ['Bâtiment'],
          summary: 'récupère un bâtiment selon son ID',
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Building',
                  },
                },
              },
            },
            '404': { description: 'not found' },
            '500': { description: 'internal server error' },
          },
        },
        patch: {
          tags: ['Bâtiment'],
          summary: 'modifie un bâtiment',
          responses: {
            '200': { description: 'OK' },
            '400': { description: 'bad request' },
            '404': { description: 'not found' },
            '500': { description: 'internal server error' },
          },
        },
        delete: {
          tags: ['Bâtiment'],
          summary: 'supprime un bâtiment',
          responses: {
            '204': { description: 'no content' },
            '404': { description: 'not found' },
            '500': { description: 'internal server error' },
          },
        },
      },
      '/zone': {
        get: {
          tags: ['Zone'],
          summary: 'récupère toutes les zones, optionnellement filtrées selon leur bâtiment',
          parameters: [
            {
              in: 'query',
              name: 'building',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': { description: 'OK' },
            '400': { description: 'bad request' },
            '500': { description: 'internal server error' },
          },
        },
      },
      '/zone/{id}': {
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
          },
        ],
        get: {
          tags: ['Zone'],
          summary: 'récupère une zone selon son ID',
          responses: {
            '200': { description: 'OK' },
            '404': { description: 'not found' },
            '500': { description: 'internal server error' },
          },
        },
        patch: {
          tags: ['Zone'],
          summary: 'modifie une zone',
          responses: {
            '200': { description: 'OK' },
            '400': { description: 'bad request' },
            '404': { description: 'not found' },
            '500': { description: 'internal server error' },
          },
        },
        delete: {
          tags: ['Zone'],
          summary: 'supprime une zone',
          responses: {
            '204': { description: 'no content' },
            '404': { description: 'not found' },
            '500': { description: 'internal server error' },
          },
        },
      },
      '/building/{id}/zone': {
        post: {
          tags: ['Zone'],
          summary: 'crée une zone',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '201': { description: 'created' },
            '400': { description: 'bad request' },
            '404': { description: 'not found' },
            '500': { description: 'internal server error' },
          },
        },
      },
      '/sensor': {
        get: {
          tags: ['Capteur'],
          summary:
            'récupère tous les capteurs, optionnellement filtrés selon le bâtiment ou la zone',
          parameters: [
            {
              in: 'query',
              name: 'building',
              schema: { type: 'string' },
            },
            {
              in: 'query',
              name: 'zone',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': { description: 'OK' },
            '400': { description: 'bad request' },
            '500': { description: 'internal server error' },
          },
        },
      },
      '/sensor/{id}': {
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
          },
        ],
        get: {
          tags: ['Capteur'],
          summary: 'récupère un capteur selon son ID',
          responses: {
            '200': { description: 'OK' },
            '404': { description: 'not found' },
            '500': { description: 'internal server error' },
          },
        },
        patch: {
          tags: ['Capteur'],
          summary: 'modifie un capteur',
          responses: {
            '200': { description: 'OK' },
            '400': { description: 'bad request' },
            '404': { description: 'not found' },
            '500': { description: 'internal server error' },
          },
        },
        delete: {
          tags: ['Capteur'],
          summary: 'supprime un capteur',
          responses: {
            '204': { description: 'no content' },
            '404': { description: 'not found' },
            '500': { description: 'internal server error' },
          },
        },
      },
      '/zone/{id}/sensor': {
        post: {
          tags: ['Capteur'],
          summary: 'crée un capteur',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '201': { description: 'created' },
            '400': { description: 'bad request' },
            '404': { description: 'not found' },
            '500': { description: 'internal server error' },
          },
        },
      },
      '/measurement': {
        get: {
          tags: ['Mesures'],
          summary: 'récupère toutes les mesures issues d’un capteur, optionnellement filtrées',
          parameters: [
            {
              in: 'query',
              name: 'zoneId',
              schema: { type: 'string' },
            },
            {
              in: 'query',
              name: 'sensorId',
              schema: { type: 'string' },
            },
            {
              in: 'query',
              name: 'type',
              schema: { type: 'string' },
            },
            {
              in: 'query',
              name: 'startDate',
              schema: { type: 'string', format: 'date-time' },
            },
            {
              in: 'query',
              name: 'endDate',
              schema: { type: 'string', format: 'date-time' },
            },
            {
              in: 'query',
              name: 'limit',
              schema: { type: 'integer', default: 20 },
            },
            {
              in: 'query',
              name: 'offset',
              schema: { type: 'integer', default: 0 },
            },
          ],
          responses: {
            '200': { description: 'OK' },
            '400': { description: 'bad request' },
            '500': { description: 'internal server error' },
          },
        },
      },
      '/sensor/{id}/measurement': {
        post: {
          tags: ['Mesures'],
          summary: 'crée une mesure pour un capteur',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '201': { description: 'created' },
            '400': { description: 'bad request' },
            '404': { description: 'not found' },
            '500': { description: 'internal server error' },
          },
        },
      },
      '/actuator': {
        get: {
          tags: ['Actionneur'],
          summary:
            'récupère tous les actionneurs, optionnellement filtrés selon le bâtiment ou la zone',
          parameters: [
            {
              in: 'query',
              name: 'building',
              schema: { type: 'string' },
            },
            {
              in: 'query',
              name: 'zone',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': { description: 'OK' },
            '400': { description: 'bad request' },
            '500': { description: 'internal server error' },
          },
        },
      },
      '/actuator/{id}': {
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
          },
        ],
        get: {
          tags: ['Actionneur'],
          summary: 'récupère un actionneur selon son ID',
          responses: {
            '200': { description: 'OK' },
            '404': { description: 'not found' },
            '500': { description: 'internal server error' },
          },
        },
        patch: {
          tags: ['Actionneur'],
          summary: 'modifie un actionneur',
          responses: {
            '200': { description: 'OK' },
            '400': { description: 'bad request' },
            '404': { description: 'not found' },
            '500': { description: 'internal server error' },
          },
        },
        delete: {
          tags: ['Actionneur'],
          summary: 'supprime un actionneur',
          responses: {
            '204': { description: 'no content' },
            '404': { description: 'not found' },
            '500': { description: 'internal server error' },
          },
        },
      },
      '/zone/{id}/actuator': {
        post: {
          tags: ['Actionneur'],
          summary: 'crée un actionneur',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '201': { description: 'created' },
            '400': { description: 'bad request' },
            '404': { description: 'not found' },
            '500': { description: 'internal server error' },
          },
        },
      },
      '/alert-threshold': {
        get: {
          tags: ["seuil d'alerte"],
          summary: "récupère les seuils d'alerte filtrés",
          parameters: [
            {
              in: 'query',
              name: 'zone',
              schema: { type: 'string' },
            },
            {
              in: 'query',
              name: 'type',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': { description: 'OK' },
            '400': { description: 'bad request' },
            '500': { description: 'internal server error' },
          },
        },
      },
      '/alert-threshold/{id}': {
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
          },
        ],
        patch: {
          tags: ["seuil d'alerte"],
          summary: "modifie un seuil d'alerte",
          responses: {
            '200': { description: 'OK' },
            '400': { description: 'bad request' },
            '404': { description: 'not found' },
            '500': { description: 'internal server error' },
          },
        },
        delete: {
          tags: ["seuil d'alerte"],
          summary: "supprime un seuil d'alerte",
          responses: {
            '204': { description: 'no content' },
            '404': { description: 'not found' },
            '500': { description: 'internal server error' },
          },
        },
      },
      '/zone/{id}/alert-threshold': {
        post: {
          tags: ["seuil d'alerte"],
          summary: "crée un seuil d'alerte",
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '201': { description: 'created' },
            '400': { description: 'bad request' },
            '404': { description: 'not found' },
            '500': { description: 'internal server error' },
          },
        },
      },
    },
    components: {
      schemas: {
        Building: {
          type: 'object',
          properties: {
            id: { type: 'string', readOnly: true },
            name: { type: 'string' },
            address: { type: 'string' },
          },
        },
        Zone: {
          type: 'object',
          properties: {
            id: { type: 'string', readOnly: true },
            buildingId: { type: 'string' },
            name: { type: 'string' },
          },
        },
        Sensor: {
          type: 'object',
          properties: {
            id: { type: 'string', readOnly: true },
            zoneId: { type: 'string' },
            type: { type: 'string' },
            status: { type: 'string' },
          },
        },
        Measurement: {
          type: 'object',
          properties: {
            id: { type: 'string', readOnly: true },
            sensorId: { type: 'string' },
            value: { type: 'number' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            details: { type: 'string' },
          },
        },
      },
    },
  },
  apis: [],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
