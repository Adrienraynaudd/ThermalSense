#!/usr/bin/env node
require('dotenv/config');

const { randomUUID } = require('crypto');

const BASE_URL =
  process.env.AUTHN_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'root';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'rootroot';

const REPEAT_COUNT = 3;

const prettyJson = (value) => JSON.stringify(value, null, 2);

const statusLabel = (ok) => (ok ? '[OK]' : '[KO]');

const requestApi = async ({ method, path, token, body }) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(
      `Impossible de joindre l'API (${BASE_URL}${path}). Lance d'abord l'API avec "npm run dev". Detail: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch (_e) {
    json = undefined;
  }

  return {
    method,
    path,
    status: response.status,
    ok: response.status >= 200 && response.status < 300,
    body: json,
    bodyText: text,
  };
};

const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const main = async () => {
  console.log('# Preuves Sprint Idempotence (script)');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('\n## Decisions techniques');
  console.log('- Verbe HTTP retenu: PUT (semantique remplacement total de la ressource)');
  console.log('- Mecanisme: upsert (prisma.building.upsert) — cree si absent, remplace si present');
  console.log('- Propriete testee: N appels identiques => etat final identique (HTTP 200 + body stable)');
  console.log(`- Nombre de repetitions par scenario: ${REPEAT_COUNT}`);

  // ── Login ────────────────────────────────────────────────────────────────
  const loginResult = await requestApi({
    method: 'POST',
    path: '/auth/login',
    body: { username: AUTH_USERNAME, password: AUTH_PASSWORD },
  });

  const token = loginResult.body?.accessToken;
  const loginOk = loginResult.status === 200 && typeof token === 'string';

  console.log('\n## Setup - Authentification');
  console.log(`POST /auth/login -> HTTP ${loginResult.status}`);
  console.log(`${statusLabel(loginOk)} Token obtenu`);

  if (!loginOk) {
    console.log('\nArret: impossible de poursuivre sans token valide.');
    process.exit(1);
  }

  // ── T1 : PUT idempotent — N appels => même etat ──────────────────────────
  console.log('\n## T1 - Idempotence de PUT /building/:id');
  console.log(`Scenario: appel du meme PUT ${REPEAT_COUNT} fois (simulation de retries reseau)`);

  const buildingId = 'd2d19492-7639-4b21-b994-8456854d2ca8';
  const buildingBody = { name: 'Batiment-Idempotent', address: '42 rue du Test' };

  const putResults = [];
  for (let i = 1; i <= REPEAT_COUNT; i++) {
    const r = await requestApi({
      method: 'PUT',
      path: `/building/${buildingId}`,
      token,
      body: buildingBody,
    });
    putResults.push(r);
    console.log(`  Appel #${i}: PUT /building/${buildingId} -> HTTP ${r.status}`);
    if (r.body) {
      console.log(`           body: ${prettyJson(r.body)}`);
    }
  }

  const allPut200 = putResults.every((r) => r.status === 200);
  const allPutSameBody = putResults.every((r) => deepEqual(r.body, putResults[0].body));

  console.log('\n### Analyse T1');
  console.log(`Attendu: HTTP 200 x${REPEAT_COUNT} avec body identique`);
  console.log(`${statusLabel(allPut200)} Tous les appels retournent 200: ${allPut200}`);
  console.log(`${statusLabel(allPutSameBody)} Body identique a chaque appel: ${allPutSameBody}`);

  // ── T2 : GET confirme etat stable apres N PUT ────────────────────────────
  console.log('\n## T2 - GET confirme l\'etat stable apres les N PUT');

  const getResult = await requestApi({
    method: 'GET',
    path: `/building/${buildingId}`,
    token,
  });

  const getMatchesPut = deepEqual(getResult.body, putResults[0].body);

  console.log(`GET /building/${buildingId} -> HTTP ${getResult.status}`);
  if (getResult.body) {
    console.log(`body: ${prettyJson(getResult.body)}`);
  }
  console.log('\n### Analyse T2');
  console.log(`Attendu: GET retourne le meme objet que les PUT`);
  console.log(`${statusLabel(getResult.status === 200)} GET retourne 200`);
  console.log(`${statusLabel(getMatchesPut)} Etat en base identique au resultat des PUT: ${getMatchesPut}`);

  // ── T3 : Scenario incident — double retry sur ressource existante ─────────
  console.log('\n## T3 - Scenario d\'incident: client qui retente apres timeout');
  console.log('Contexte: le client a envoye un PUT, n\'a pas recu de reponse (timeout reseau),');
  console.log('          il renvoie la meme requete sans savoir si la premiere a abouti.');

  const retryBody = { name: 'Batiment-Retry', address: '99 avenue du Retry' };
  const retryId = randomUUID();

  const retry1 = await requestApi({ method: 'PUT', path: `/building/${retryId}`, token, body: retryBody });
  console.log(`\n  Tentative 1 (originale): PUT /building/${retryId} -> HTTP ${retry1.status}`);

  const retry2 = await requestApi({ method: 'PUT', path: `/building/${retryId}`, token, body: retryBody });
  console.log(`  Tentative 2 (retry #1) : PUT /building/${retryId} -> HTTP ${retry2.status}`);

  const retry3 = await requestApi({ method: 'PUT', path: `/building/${retryId}`, token, body: retryBody });
  console.log(`  Tentative 3 (retry #2) : PUT /building/${retryId} -> HTTP ${retry3.status}`);

  const getAfterRetry = await requestApi({ method: 'GET', path: `/building/${retryId}`, token });

  const retryAllOk = [retry1, retry2, retry3].every((r) => r.status === 200);
  const retryBodyStable = [retry1, retry2, retry3].every((r) => deepEqual(r.body, retry1.body));
  const getAfterRetryMatch = deepEqual(getAfterRetry.body, retry1.body);

  console.log('\n### Analyse T3');
  console.log(`Attendu: 3 retries HTTP 200, etat final = etat apres 1er appel`);
  console.log(`${statusLabel(retryAllOk)} Tous les retries retournent 200: ${retryAllOk}`);
  console.log(`${statusLabel(retryBodyStable)} Body stable a travers les retries: ${retryBodyStable}`);
  console.log(`${statusLabel(getAfterRetryMatch)} GET confirme: 1 seule ressource creee (pas de doublon): ${getAfterRetryMatch}`);
  if (getAfterRetry.body) {
    console.log(`Etat final: ${prettyJson(getAfterRetry.body)}`);
  }

  // ── T4 : Contraste — PATCH non-idempotent sur ressource inexistante ──────
  console.log('\n## T4 - Contraste: PATCH non-idempotent vs PUT idempotent');
  console.log('Contexte: appel sur un ID qui n\'existe pas encore en base.');

  const ghostId = randomUUID();

  const patchOnGhost = await requestApi({
    method: 'PATCH',
    path: `/building/${ghostId}`,
    token,
    body: { name: 'Ghost', address: 'inexistant' },
  });

  const putOnGhost = await requestApi({
    method: 'PUT',
    path: `/building/${ghostId}`,
    token,
    body: { name: 'Ghost', address: 'inexistant' },
  });

  console.log(`\n  PATCH /building/${ghostId} (ressource absente) -> HTTP ${patchOnGhost.status}`);
  console.log(`  PUT   /building/${ghostId} (ressource absente) -> HTTP ${putOnGhost.status}`);

  const patchFailed = patchOnGhost.status >= 400;
  const putSucceeded = putOnGhost.status === 200;

  console.log('\n### Analyse T4');
  console.log(`${statusLabel(patchFailed)} PATCH echoue (${patchOnGhost.status}) car la ressource n'existait pas`);
  console.log(`${statusLabel(putSucceeded)} PUT reussit (${putOnGhost.status}) et cree la ressource: idempotent`);
  console.log('Conclusion: PATCH depend de l\'existence prealable de la ressource => non-idempotent.');
  console.log('            PUT (upsert) converge toujours vers le meme etat => idempotent.');

  // ── Resume final ─────────────────────────────────────────────────────────
  const allPassed = allPut200 && allPutSameBody && getMatchesPut && retryAllOk && retryBodyStable && getAfterRetryMatch && patchFailed && putSucceeded;

  console.log('\n## Resume final');
  console.log(`- T1 PUT x${REPEAT_COUNT} => HTTP 200 stable:     ${statusLabel(allPut200 && allPutSameBody)}`);
  console.log(`- T2 GET confirme etat stable:      ${statusLabel(getMatchesPut)}`);
  console.log(`- T3 Retries reseau sans effet:     ${statusLabel(retryAllOk && retryBodyStable && getAfterRetryMatch)}`);
  console.log(`- T4 PATCH vs PUT (contraste):      ${statusLabel(patchFailed && putSucceeded)}`);
  console.log(`\n${statusLabel(allPassed)} ${allPassed ? 'Toutes les preuves d\'idempotence sont validees.' : 'Des tests ont echoue — voir details ci-dessus.'}`);

  if (!allPassed) {
    process.exit(1);
  }
};

main().catch((error) => {
  console.error('Erreur execution script idempotence:', error instanceof Error ? error.message : error);
  process.exit(1);
});
