'use strict';

const {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, HeadingLevel, AlignmentType, WidthType, BorderStyle,
  ShadingType, VerticalAlign, PageOrientation, PageBreak,
  UnderlineType,
} = require('docx');
const fs = require('fs');
const path = require('path');

// ── Palette ────────────────────────────────────────────────────────────────────
const C = {
  client:   'D6E4F0', // bleu clair  — clients / IoT
  mw:       'FADBD8', // rouge clair — middlewares / sécurité
  ctrl:     'D5F5E3', // vert clair  — contrôleurs
  db:       'FCF3CF', // jaune clair — base de données / modèles
  util:     'E8DAEF', // violet clair — utilitaires
  admin:    'F5CBA7', // orange clair — ADMIN
  oper:     'D5F5E3', // vert       — OPERATEUR
  lect:     'D6EAF8', // bleu       — LECTEUR
  iot:      'E8DAEF', // violet     — DEVICE_IOT
  hdr:      '2C3E50', // sombre     — en-têtes
  subhdr:   '5D6D7E', // gris moyen — sous-en-têtes
  white:    'FFFFFF',
  ok:       '27AE60', // vert       — accès autorisé
  no:       'E74C3C', // rouge      — accès refusé
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };

function hdr(text, bg = C.hdr, colspan = 1, sz = 20) {
  return new TableCell({
    columnSpan: colspan,
    shading: { type: ShadingType.SOLID, color: bg },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, color: 'FFFFFF', bold: true, size: sz })],
    })],
  });
}

function cell(lines, bg = C.white, opts = {}) {
  const { bold = false, color = '000000', align = AlignmentType.CENTER, sz = 18 } = opts;
  const content = Array.isArray(lines) ? lines : [lines];
  return new TableCell({
    shading: { type: ShadingType.SOLID, color: bg },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
    children: content.map((line, i) => new Paragraph({
      alignment: align,
      children: [new TextRun({ text: String(line), bold: bold || i === 0, size: sz, color })],
    })),
  });
}

function okCell(text = '✓') {
  return cell(text, 'D5F5E3', { bold: true, color: '1E8449' });
}
function noCell(text = '—') {
  return cell(text, 'FADBD8', { color: 'C0392B' });
}

function h(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    children: [new TextRun({ text, bold: true })],
    spacing: { before: 320, after: 140 },
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, size: 18, ...opts })],
    spacing: { before: 60, after: 60 },
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLEAU 1 — Vue globale : flux de bout en bout
// ═══════════════════════════════════════════════════════════════════════════════
const globalFluxTable = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({ children: [hdr('CLIENTS', C.client), hdr('SÉCURITÉ', C.hdr), hdr('CONTRÔLEURS', C.hdr), hdr('UTILITAIRES', C.util), hdr('PERSISTANCE', C.hdr)] }),
    new TableRow({
      children: [
        cell(['Capteur IoT', '(DEVICE_IOT)', 'POST /sensor/:id/measurement'], C.client, { bold: false }),
        cell(['① attachRequestId', '(X-Request-ID)', '', '② authLoginRateLimiter', '8 échecs / 10 min', '', '③ JWT Middleware', 'Vérif. Bearer Token', 'Contrôle RBAC'], C.mw),
        cell(['measurement.controller', 'Idempotency check', 'Validation value', '→ 201 (normal)', '→ 202 (dégradé)', '→ 409 (doublon)'], C.ctrl, { bold: false }),
        cell(['idempotencyStore', 'TTL 24h, Map mémoire', '', 'measurementQueue', 'Flush 5s / 5 essais'], C.util),
        cell(['SQLite (Prisma)', 'better-sqlite3', 'dev.db', '', 'Measurement'], C.db),
      ],
    }),
    new TableRow({
      children: [
        cell(['Admin / Opérateur', '(navigateur ou API client)', 'CRUD complet'], C.client),
        cell(['criticalWriteRateLimiter', '60 req / 15 min / IP', '', 'authRefreshRateLimiter', 'limite refresh token'], C.mw),
        cell(['building, zone, sensor', 'actuator, alertThreshold', 'auth (register, me)', 'actuatorCommand'], C.ctrl),
        cell(['securityLogger', 'Logs JWT / IP / route', '', 'requestContext', 'X-Request-ID trace'], C.util),
        cell(['Building, Zone', 'Sensor, Actuator', 'ActuatorCommand', 'AlertThreshold', 'User'], C.db),
      ],
    }),
    new TableRow({
      children: [
        cell(['Lecteur', '(LECTEUR)', 'GET seulement'], C.client),
        cell(['Routes publiques :', '/docs (Swagger)', '/auth/login', '/auth/refresh'], C.mw, { color: '555555' }),
        cell(['auth.controller', 'POST /auth/login', 'POST /auth/refresh', 'scrypt + JWT signé'], C.ctrl),
        cell(['swagger.ts', 'Swagger UI /docs', 'OpenAPI 3.0'], C.util),
        cell(['User', 'passwordHash', 'salt:derivedKey (hex)', 'JWT secret (env)'], C.db),
      ],
    }),
  ],
});

// ═══════════════════════════════════════════════════════════════════════════════
// TABLEAU 2 — Modèle de données (entités + relations)
// ═══════════════════════════════════════════════════════════════════════════════
const dataModelTable = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({ children: [hdr('Entité', C.hdr), hdr('Champs principaux', C.hdr), hdr('Relations', C.hdr), hdr('Notes', C.hdr)] }),
    new TableRow({
      children: [
        cell('Building', C.db, { bold: true }),
        cell(['id (UUID)', 'name', 'address'], C.db),
        cell('→ Zone[] (Cascade delete)', C.white),
        cell('Racine de la hiérarchie', C.white, { color: '555555' }),
      ],
    }),
    new TableRow({
      children: [
        cell('Zone', C.db, { bold: true }),
        cell(['id (UUID)', 'name', 'buildingId'], C.db),
        cell(['→ Building (parent)', '→ Sensor[]', '→ Actuator[]', '→ AlertThreshold[]', '→ User[] (opérateurs)'], C.white),
        cell('Pivot de la gestion des droits OPERATEUR', C.white, { color: '555555' }),
      ],
    }),
    new TableRow({
      children: [
        cell('Sensor', C.db, { bold: true }),
        cell(['id (UUID)', 'type (ex: température)', 'status', 'zoneId'], C.db),
        cell(['→ Zone (parent)', '→ Measurement[]'], C.white),
        cell(['Peut avoir une config (PATCH /sensors/:id/config)', 'Soft-link à une zone'], C.white, { color: '555555' }),
      ],
    }),
    new TableRow({
      children: [
        cell('Measurement', C.db, { bold: true }),
        cell(['id (UUID)', 'value (Float)', 'timestamp (auto)', 'sensorId'], C.db),
        cell('→ Sensor (parent, Cascade)', C.white),
        cell(['Idempotency key → 24h', 'Mode dégradé → queue mémoire'], C.util, { color: '555555' }),
      ],
    }),
    new TableRow({
      children: [
        cell('Actuator', C.db, { bold: true }),
        cell(['id (UUID)', 'type', 'status', 'zoneId'], C.db),
        cell(['→ Zone (parent)', '→ ActuatorCommand[]'], C.white),
        cell('Commandes envoyées via /actuators/:id/commands', C.white, { color: '555555' }),
      ],
    }),
    new TableRow({
      children: [
        cell('ActuatorCommand', C.db, { bold: true }),
        cell(['id (UUID)', 'command', 'status (PENDING…)', 'sentAt', 'actuatorId'], C.db),
        cell('→ Actuator (parent, Cascade)', C.white),
        cell('Statut traçable (PENDING / SENT / DONE)', C.white, { color: '555555' }),
      ],
    }),
    new TableRow({
      children: [
        cell('AlertThreshold', C.db, { bold: true }),
        cell(['id (UUID)', 'type', 'min (Float?)', 'max (Float?)', 'zoneId'], C.db),
        cell('→ Zone (parent)', C.white),
        cell('Seuils d\'alerte par zone (min et/ou max)', C.white, { color: '555555' }),
      ],
    }),
    new TableRow({
      children: [
        cell('User', C.db, { bold: true }),
        cell(['id (UUID)', 'username (unique)', 'passwordHash', 'role (enum)', 'zoneId?', 'createdAt / updatedAt'], C.db),
        cell('→ Zone? (opérateur lié à une zone)', C.white),
        cell(['Rôles : ADMIN | OPERATEUR | LECTEUR | DEVICE_IOT', 'Hash : scrypt salt:derivedKey (64 bytes)'], C.white, { color: '555555' }),
      ],
    }),
  ],
});

// ═══════════════════════════════════════════════════════════════════════════════
// TABLEAU 3 — RBAC : matrice rôles × ressources
// ═══════════════════════════════════════════════════════════════════════════════
const rbacTable = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({ children: [hdr('Ressource / Action', C.hdr), hdr('ADMIN', C.admin), hdr('OPERATEUR', C.oper), hdr('LECTEUR', C.lect), hdr('DEVICE_IOT', C.iot)] }),

    new TableRow({ children: [hdr('── Authentification ──', C.subhdr, 5, 18)] }),
    new TableRow({ children: [cell('POST /auth/login', C.white, { align: AlignmentType.LEFT }), okCell('Public'), okCell('Public'), okCell('Public'), okCell('Public')] }),
    new TableRow({ children: [cell('POST /auth/refresh', C.white, { align: AlignmentType.LEFT }), okCell('Public'), okCell('Public'), okCell('Public'), okCell('Public')] }),
    new TableRow({ children: [cell('POST /auth/register', C.white, { align: AlignmentType.LEFT }), okCell('✓'), okCell('✓ (zone propre)'), noCell(), noCell()] }),
    new TableRow({ children: [cell('GET /auth/me', C.white, { align: AlignmentType.LEFT }), okCell('✓'), okCell('✓'), okCell('✓'), okCell('✓')] }),

    new TableRow({ children: [hdr('── Bâtiments & Zones ──', C.subhdr, 5, 18)] }),
    new TableRow({ children: [cell('GET /building, GET /zone', C.white, { align: AlignmentType.LEFT }), okCell('✓'), okCell('✓'), okCell('✓'), noCell()] }),
    new TableRow({ children: [cell('POST/PATCH/DELETE /building', C.white, { align: AlignmentType.LEFT }), okCell('✓'), noCell(), noCell(), noCell()] }),
    new TableRow({ children: [cell('POST /building/:id/zone', C.white, { align: AlignmentType.LEFT }), okCell('✓'), noCell(), noCell(), noCell()] }),

    new TableRow({ children: [hdr('── Capteurs ──', C.subhdr, 5, 18)] }),
    new TableRow({ children: [cell('GET /sensor, GET /sensors/:id', C.white, { align: AlignmentType.LEFT }), okCell('✓'), okCell('✓'), okCell('✓'), okCell('✓')] }),
    new TableRow({ children: [cell('POST /zone/:id/sensor', C.white, { align: AlignmentType.LEFT }), okCell('✓'), okCell('✓ (zone propre)'), noCell(), noCell()] }),
    new TableRow({ children: [cell('PATCH /sensors/:id/config', C.white, { align: AlignmentType.LEFT }), okCell('✓'), okCell('✓ (zone propre)'), noCell(), noCell()] }),
    new TableRow({ children: [cell('DELETE /sensors/:id', C.white, { align: AlignmentType.LEFT }), okCell('✓'), okCell('✓ (zone propre)'), noCell(), noCell()] }),

    new TableRow({ children: [hdr('── Mesures ──', C.subhdr, 5, 18)] }),
    new TableRow({ children: [cell('GET /measurement', C.white, { align: AlignmentType.LEFT }), okCell('✓'), okCell('✓'), okCell('✓'), noCell()] }),
    new TableRow({ children: [cell('POST /sensor/:id/measurement', C.white, { align: AlignmentType.LEFT }), okCell('✓'), okCell('✓ (zone propre)'), noCell(), okCell('✓')] }),

    new TableRow({ children: [hdr('── Actionneurs & Commandes ──', C.subhdr, 5, 18)] }),
    new TableRow({ children: [cell('GET /actuator, GET /actuators/:id/commands', C.white, { align: AlignmentType.LEFT }), okCell('✓'), okCell('✓'), okCell('✓'), noCell()] }),
    new TableRow({ children: [cell('POST /actuators/:id/commands', C.white, { align: AlignmentType.LEFT }), okCell('✓'), okCell('✓'), noCell(), noCell()] }),
    new TableRow({ children: [cell('DELETE /actuator/:id', C.white, { align: AlignmentType.LEFT }), okCell('✓'), noCell(), noCell(), noCell()] }),

    new TableRow({ children: [hdr('── Seuils d\'alerte ──', C.subhdr, 5, 18)] }),
    new TableRow({ children: [cell('GET /alert-threshold', C.white, { align: AlignmentType.LEFT }), okCell('✓'), okCell('✓'), okCell('✓'), okCell('✓')] }),
    new TableRow({ children: [cell('POST/PATCH/DELETE /alert-threshold', C.white, { align: AlignmentType.LEFT }), okCell('✓'), okCell('✓ (zone propre)'), noCell(), noCell()] }),
  ],
});

// ═══════════════════════════════════════════════════════════════════════════════
// TABLEAU 4 — Mécanismes spéciaux
// ═══════════════════════════════════════════════════════════════════════════════
const specialTable = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({ children: [hdr('Mécanisme', C.hdr), hdr('Déclencheur', C.hdr), hdr('Comportement', C.hdr), hdr('Limites', C.hdr)] }),
    new TableRow({
      children: [
        cell('Idempotency Key', C.util, { bold: true }),
        cell(['Header : Idempotency-Key', 'ou body : { idempotencyKey }'], C.white),
        cell(['1. Clé trouvée en cache → replay (Idempotent-Replayed: true)', '2. Clé absente → traitement normal puis sauvegarde en cache', 'TTL cache : 24h | Cleanup auto : 1h'], C.util),
        cell('Stockage mémoire uniquement → reset au redémarrage', C.white, { color: '888888' }),
      ],
    }),
    new TableRow({
      children: [
        cell('Mode dégradé', C.mw, { bold: true }),
        cell(['DB inaccessible', 'ou SIMULATE_DB_DOWN=true'], C.white),
        cell(['enqueueMeasurement() → file mémoire', '→ 202 Accepted { queued: true, queueId }', 'Flush automatique toutes les 5s', 'Max 5 tentatives par entrée puis drop'], C.mw),
        cell('File en mémoire → perte si crash serveur pendant la panne', C.white, { color: '888888' }),
      ],
    }),
    new TableRow({
      children: [
        cell('Rate Limiting', C.mw, { bold: true }),
        cell(['authLoginRateLimiter', 'authRefreshRateLimiter', 'criticalWriteRateLimiter'], C.white),
        cell(['Login : 8 échecs / 10 min / IP → 429', 'Refresh : limiteur dédié', 'Écritures critiques : 60 req / 15 min / IP → 429'], C.mw),
        cell('Compteurs en mémoire → reset au redémarrage', C.white, { color: '888888' }),
      ],
    }),
    new TableRow({
      children: [
        cell(['RBAC (rôle + zone)', 'auth.middleware.ts'], C.client, { bold: true }),
        cell('Chaque requête JWT vérifiée', C.white),
        cell(['Matrice rôle × route (17 règles)', 'OPERATEUR : limité à sa propre zone (zoneId dans JWT)', 'ADMIN : accès total toutes zones', 'DEVICE_IOT : POST measurement + GET seulement'], C.client),
        cell('Pas de gestion multi-zones pour un OPERATEUR', C.white, { color: '888888' }),
      ],
    }),
    new TableRow({
      children: [
        cell('Security Logger', C.util, { bold: true }),
        cell('Tout événement JWT', C.white),
        cell(['Logs : AUTH_VERIFY_SUCCESS / FAILED / FORBIDDEN', 'Champs : IP, route, userId, role, audience', 'Désactivable via JWT_LOGS=false'], C.util),
        cell('Logs console uniquement (pas de fichier)', C.white, { color: '888888' }),
      ],
    }),
  ],
});

// ═══════════════════════════════════════════════════════════════════════════════
// TABLEAU 5 — Liste complète des endpoints
// ═══════════════════════════════════════════════════════════════════════════════
function ep(method, route, bg) {
  const colors = { GET: '1A5276', POST: '1E8449', PATCH: '7D6608', DELETE: 'C0392B' };
  return new TableRow({
    children: [
      new TableCell({
        shading: { type: ShadingType.SOLID, color: colors[method] ? colors[method] : '555555' },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: method, color: 'FFFFFF', bold: true, size: 16 })] })],
      }),
      cell(route, bg || C.white, { align: AlignmentType.LEFT, sz: 16 }),
    ],
  });
}

const endpointsTable = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({ children: [hdr('Méthode', C.hdr), hdr('Route', C.hdr)] }),
    new TableRow({ children: [hdr('Authentification', C.subhdr, 2, 18)] }),
    ep('POST', '/auth/login'),
    ep('POST', '/auth/refresh'),
    ep('POST', '/auth/register'),
    ep('GET',  '/auth/me'),
    new TableRow({ children: [hdr('Bâtiments', C.subhdr, 2, 18)] }),
    ep('GET',   '/building'),
    ep('POST',  '/building'),
    ep('GET',   '/building/:id'),
    ep('PATCH', '/building/:id'),
    ep('DELETE','/building/:id'),
    new TableRow({ children: [hdr('Zones', C.subhdr, 2, 18)] }),
    ep('GET',   '/zone'),
    ep('POST',  '/building/:id/zone'),
    ep('GET',   '/zone/:id'),
    ep('PATCH', '/zone/:id'),
    ep('DELETE','/zone/:id'),
    new TableRow({ children: [hdr('Capteurs', C.subhdr, 2, 18)] }),
    ep('GET',   '/sensor  /sensors'),
    ep('POST',  '/sensors  (body: { zoneId })'),
    ep('POST',  '/zone/:id/sensor'),
    ep('GET',   '/sensor/:id  /sensors/:id'),
    ep('PATCH', '/sensor/:id'),
    ep('DELETE','/sensor/:id  /sensors/:id'),
    ep('GET',   '/sensors/:id/config'),
    ep('PATCH', '/sensors/:id/config'),
    new TableRow({ children: [hdr('Mesures', C.subhdr, 2, 18)] }),
    ep('GET',   '/measurement'),
    ep('POST',  '/sensor/:id/measurement  /sensors/:id/measurement'),
    new TableRow({ children: [hdr('Actionneurs', C.subhdr, 2, 18)] }),
    ep('GET',   '/actuator  /actuators'),
    ep('POST',  '/zone/:id/actuator'),
    ep('GET',   '/actuator/:id'),
    ep('PATCH', '/actuator/:id'),
    ep('DELETE','/actuator/:id'),
    ep('GET',   '/actuators/:id/commands'),
    ep('POST',  '/actuators/:id/commands'),
    new TableRow({ children: [hdr('Commandes actionneur (détail)', C.subhdr, 2, 18)] }),
    ep('GET',   '/actuator/:id/commands'),
    ep('POST',  '/actuator/:id/command  /actuator/:id/commands'),
    ep('GET',   '/actuator-command/:id'),
    ep('PATCH', '/actuator-command/:id'),
    ep('DELETE','/actuator-command/:id'),
    new TableRow({ children: [hdr('Seuils d\'alerte', C.subhdr, 2, 18)] }),
    ep('GET',   '/alert-threshold'),
    ep('POST',  '/zone/:id/alert-threshold'),
    ep('PATCH', '/alert-threshold/:id'),
    ep('DELETE','/alert-threshold/:id'),
    new TableRow({ children: [hdr('Documentation', C.subhdr, 2, 18)] }),
    ep('GET',   '/docs  (Swagger UI — public)'),
  ],
});

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT FINAL
// ═══════════════════════════════════════════════════════════════════════════════
const doc = new Document({
  sections: [{
    properties: {
      page: {
        size: { orientation: PageOrientation.LANDSCAPE },
        margin: { top: 700, bottom: 700, left: 800, right: 800 },
      },
    },
    children: [
      // ── Titre ──────────────────────────────────────────────────────────────
      new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'ThermalSense — Architecture complète', bold: true, size: 40 })],
        spacing: { after: 160 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'API IoT · Express.js + TypeScript · SQLite (Prisma) · JWT + RBAC · Mode dégradé · Idempotence', size: 20, color: '555555', italics: true })],
        spacing: { after: 400 },
      }),

      // ── 1. Vue globale ─────────────────────────────────────────────────────
      h('1. Vue globale — Flux de bout en bout'),
      p('Chaque requête traverse successivement : l\'injection du X-Request-ID, le rate limiter, la vérification JWT et le contrôle RBAC, avant d\'atteindre le contrôleur métier.'),
      globalFluxTable,

      pageBreak(),

      // ── 2. Modèle de données ───────────────────────────────────────────────
      h('2. Modèle de données'),
      p('Hiérarchie principale : Building → Zone → Sensor / Actuator / AlertThreshold. Les mesures sont attachées au capteur. Les utilisateurs peuvent être liés à une zone (OPERATEUR).'),
      dataModelTable,

      pageBreak(),

      // ── 3. RBAC ────────────────────────────────────────────────────────────
      h('3. Contrôle d\'accès (RBAC)'),
      p('Le middleware auth.middleware.ts vérifie le rôle extrait du JWT, puis pour OPERATEUR, compare le zoneId du token avec la zone ciblée par la requête.'),
      rbacTable,

      pageBreak(),

      // ── 4. Mécanismes spéciaux ─────────────────────────────────────────────
      h('4. Mécanismes spéciaux'),
      specialTable,

      pageBreak(),

      // ── 5. Endpoints complets ──────────────────────────────────────────────
      h('5. Liste complète des endpoints'),
      p('Toutes les routes sauf /docs, /auth/login et /auth/refresh requièrent un Bearer Token JWT valide.'),
      endpointsTable,

      new Paragraph({ spacing: { before: 400 } }),
      p('Variables d\'environnement clés :', { bold: true }),
      p('• JWT_SECRET — clé de signature JWT (défaut : "change-me" — à changer en production)'),
      p('• JWT_AUDIENCE — audience JWT (défaut : "thermalsense-api")'),
      p('• SIMULATE_DB_DOWN=true — force le mode dégradé (file d\'attente + 202)'),
      p('• JWT_LOGS=false — désactive les logs d\'événements JWT'),
      p('• PORT — port HTTP (défaut : 3000)'),
    ],
  }],
});

const outPath = path.join(__dirname, '..', 'docs', 'architecture-thermalsense.docx');
const docsDir = path.dirname(outPath);
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outPath, buf);
  console.log('Généré :', outPath);
});
