#!/usr/bin/env node
require('dotenv/config');

const jwt = require('jsonwebtoken');

const BASE_URL =
  process.env.AUTHN_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'thermalsense-api';
const JWT_SCOPE = process.env.JWT_SCOPE || 'api:read api:write';
const JWT_ALGORITHM = 'HS256';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '5m';

const PRIMARY_PROTECTED_ENDPOINT = '/building';
const SECONDARY_PROTECTED_ENDPOINT = '/zone';

const prettyJson = (value) => JSON.stringify(value, null, 2);

const pickResponseHeaders = (headers) => {
  return {
    'content-type': headers.get('content-type') || undefined,
    'www-authenticate': headers.get('www-authenticate') || undefined,
    date: headers.get('date') || undefined,
  };
};

const normalizeHeaderName = (name) => name.toLowerCase();

const buildHeaders = (headers, body) => {
  const requestHeaders = { ...headers };
  const hasBody = body !== undefined;
  const hasContentTypeHeader = Object.keys(requestHeaders).some(
    (headerName) => normalizeHeaderName(headerName) === 'content-type',
  );

  if (hasBody && !hasContentTypeHeader) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  return requestHeaders;
};

const parseResponseBody = (bodyText) => {
  if (!bodyText) {
    return undefined;
  }

  try {
    return JSON.parse(bodyText);
  } catch (_error) {
    return undefined;
  }
};

const requestApi = async ({ method, path, headers = {}, body }) => {
  const url = `${BASE_URL}${path}`;
  const requestHeaders = buildHeaders(headers, body);

  const requestInit = {
    method,
    headers: requestHeaders,
  };

  if (body !== undefined) {
    requestInit.body = JSON.stringify(body);
  }

  let response;

  try {
    response = await fetch(url, requestInit);
  } catch (error) {
    throw new Error(
      `Impossible de joindre l'API (${url}). Lance d'abord l'API avec \"npm run dev\". Detail: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }

  const bodyText = await response.text();
  const bodyJson = parseResponseBody(bodyText);

  return {
    request: {
      method,
      url,
      headers: requestHeaders,
      body,
    },
    response: {
      status: response.status,
      statusText: response.statusText,
      headers: pickResponseHeaders(response.headers),
      bodyText,
      bodyJson,
    },
  };
};

const printRequest = (request) => {
  console.log('### Requete');
  console.log(`${request.method} ${request.url}`);

  Object.entries(request.headers).forEach(([headerName, headerValue]) => {
    console.log(`${headerName}: ${headerValue}`);
  });

  if (request.body !== undefined) {
    console.log(prettyJson(request.body));
  }
};

const printResponse = (response) => {
  console.log('### Reponse');
  console.log(`HTTP ${response.status} ${response.statusText}`);

  Object.entries(response.headers).forEach(([headerName, headerValue]) => {
    if (headerValue) {
      console.log(`${headerName}: ${headerValue}`);
    }
  });

  if (response.bodyJson !== undefined) {
    console.log(prettyJson(response.bodyJson));
  } else if (response.bodyText) {
    console.log(response.bodyText);
  }
};

const statusLabel = (ok) => (ok ? '[OK]' : '[KO]');

const printTestBlock = ({
  title,
  expected,
  result,
  passed,
  analysis,
  request,
  response,
}) => {
  console.log(`\n## ${title}`);
  printRequest(request);
  printResponse(response);
  console.log('### Analyse');
  console.log(`Attendu: ${expected}`);
  console.log(`Resultat: ${result}`);
  console.log(`${statusLabel(passed)} ${analysis}`);
};

const createTamperedToken = (token) => {
  const parts = token.split('.');

  if (parts.length !== 3) {
    return `${token}x`;
  }

  const signature = parts[2];

  if (!signature) {
    return `${token}x`;
  }

  const lastChar = signature.slice(-1);
  const replacement = lastChar === 'a' ? 'b' : 'a';
  parts[2] = `${signature.slice(0, -1)}${replacement}`;

  return parts.join('.');
};

const formatExp = (exp) => {
  if (typeof exp !== 'number') {
    return 'absent';
  }

  return new Date(exp * 1000).toISOString();
};

const assertClaims = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      ok: false,
      missing: ['sub', 'role', 'scope', 'exp', 'aud'],
    };
  }

  const missingClaims = [];
  const requiredClaims = ['sub', 'role', 'scope', 'exp', 'aud'];

  requiredClaims.forEach((claim) => {
    if (!(claim in payload)) {
      missingClaims.push(claim);
    }
  });

  return {
    ok: missingClaims.length === 0,
    missing: missingClaims,
  };
};

const main = async () => {
  console.log('# Preuves Sprint AuthN (script)');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('\n## Decisions techniques');
  console.log(`- Algorithme de signature: ${JWT_ALGORITHM}`);
  console.log(`- Duree de vie access token: ${JWT_EXPIRES_IN}`);
  console.log('- Claims retenus: sub, role, scope, exp, aud');
  console.log('- Secret JWT stocke cote serveur via variable d environnement (`JWT_SECRET`).');

  const loginCall = await requestApi({
    method: 'POST',
    path: '/auth/login',
    body: {
      username: AUTH_USERNAME,
      password: AUTH_PASSWORD,
    },
  });

  const loginToken = loginCall.response.bodyJson?.accessToken;
  const loginSuccess = loginCall.response.status === 200 && typeof loginToken === 'string';

  console.log('\n## T1 - Endpoint de generation JWT');
  printRequest(loginCall.request);
  printResponse(loginCall.response);
  console.log('### Analyse');
  console.log(
    `${statusLabel(loginSuccess)} POST /auth/login ${
      loginSuccess ? 'retourne un token' : 'ne retourne pas de token exploitable'
    }`,
  );

  if (!loginSuccess) {
    console.log('\nArret: impossible de poursuivre sans token valide.');
    process.exit(1);
  }

  const decodedPayload = jwt.decode(loginToken);
  const claimsCheck = assertClaims(decodedPayload);

  console.log('\n## T2 - Claims du token');
  console.log('### Token decode');
  console.log(prettyJson(decodedPayload));
  console.log('### Analyse');

  if (claimsCheck.ok) {
    const audValue =
      decodedPayload && typeof decodedPayload === 'object' && !Array.isArray(decodedPayload)
        ? decodedPayload.aud
        : undefined;
    console.log(
      `[OK] Claims presents: sub, role, scope, exp (${formatExp(decodedPayload.exp)}), aud (${Array.isArray(audValue) ? audValue.join(', ') : audValue})`,
    );
  } else {
    console.log(`[KO] Claims manquants: ${claimsCheck.missing.join(', ')}`);
  }

  console.log('\n## T3 - Middleware JWT sur 2 endpoints');
  const protectedChecks = [
    { method: 'GET', path: PRIMARY_PROTECTED_ENDPOINT },
    { method: 'GET', path: SECONDARY_PROTECTED_ENDPOINT },
  ];

  for (const endpoint of protectedChecks) {
    const withoutToken = await requestApi({
      method: endpoint.method,
      path: endpoint.path,
    });
    const withToken = await requestApi({
      method: endpoint.method,
      path: endpoint.path,
      headers: {
        Authorization: `Bearer ${loginToken}`,
      },
    });

    const endpointProtected =
      withoutToken.response.status === 401 &&
      (withToken.response.status === 200 || withToken.response.status === 201);

    console.log(
      `${statusLabel(endpointProtected)} ${endpoint.method} ${endpoint.path} -> sans token: ${withoutToken.response.status}, avec token: ${withToken.response.status}`,
    );
  }

  const expiredToken = jwt.sign(
    { sub: AUTH_USERNAME, role: 'admin', scope: JWT_SCOPE },
    JWT_SECRET,
    {
      expiresIn: -10,
      audience: JWT_AUDIENCE,
    },
  );

  const invalidSignatureToken = createTamperedToken(loginToken);
  const wrongAudienceToken = jwt.sign(
    { sub: AUTH_USERNAME, role: 'admin', scope: JWT_SCOPE },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES_IN,
      audience: 'wrong-audience',
    },
  );

  const testCases = [
    {
      name: 'Test nominal - Requete avec token valide sur endpoint protege',
      expected: '200 OK ou 201 Created',
      request: {
        method: 'GET',
        path: PRIMARY_PROTECTED_ENDPOINT,
        headers: {
          Authorization: `Bearer ${loginToken}`,
        },
      },
      evaluate: (status) => status === 200 || status === 201,
      analysis:
        'Le middleware accepte le JWT valide et la requete atteint bien le controleur metier.',
    },
    {
      name: 'Test adverse 1 - Requete sans header Authorization',
      expected: '401 Unauthorized',
      request: {
        method: 'GET',
        path: PRIMARY_PROTECTED_ENDPOINT,
      },
      evaluate: (status) => status === 401,
      analysis:
        'Le middleware rejette correctement une requete non authentifiee avant le controleur.',
    },
    {
      name: 'Test adverse 2 - Requete avec token expire',
      expected: '401 Unauthorized',
      request: {
        method: 'GET',
        path: PRIMARY_PROTECTED_ENDPOINT,
        headers: {
          Authorization: `Bearer ${expiredToken}`,
        },
      },
      evaluate: (status) => status === 401,
      analysis:
        'Le middleware rejette le token expire (claim exp depasse).',
    },
    {
      name: 'Test adverse 3 - Token a signature invalide',
      expected: '401 Unauthorized',
      request: {
        method: 'GET',
        path: PRIMARY_PROTECTED_ENDPOINT,
        headers: {
          Authorization: `Bearer ${invalidSignatureToken}`,
        },
      },
      evaluate: (status) => status === 401,
      analysis:
        'Un token modifie est refuse car la signature n est plus valide.',
    },
  ];

  console.log('\n# Tableau des preuves de tests (T4)');

  let failingTests = 0;

  for (const testCase of testCases) {
    const result = await requestApi(testCase.request);
    const testOk = testCase.evaluate(result.response.status);

    if (!testOk) {
      failingTests += 1;
    }

    printTestBlock({
      title: testCase.name,
      expected: testCase.expected,
      result: `${result.response.status} ${result.response.statusText}`,
      passed: testOk,
      analysis: testCase.analysis,
      request: result.request,
      response: result.response,
    });
  }

  const wrongAudienceResult = await requestApi({
    method: 'GET',
    path: PRIMARY_PROTECTED_ENDPOINT,
    headers: {
      Authorization: `Bearer ${wrongAudienceToken}`,
    },
  });
  const wrongAudiencePass = wrongAudienceResult.response.status === 401;

  console.log('\n# Test avance (audience invalide)');
  printTestBlock({
    title: 'Test avance - Token avec claim aud incorrect',
    expected: '401 Unauthorized',
    result: `${wrongAudienceResult.response.status} ${wrongAudienceResult.response.statusText}`,
    passed: wrongAudiencePass,
    analysis:
      'Le middleware rejette le token car le claim aud ne correspond pas a l audience attendue de l API.',
    request: wrongAudienceResult.request,
    response: wrongAudienceResult.response,
  });

  console.log('\n# Resume final');
  console.log(`- T1 login: ${statusLabel(loginSuccess)}`);
  console.log(`- T2 claims: ${statusLabel(claimsCheck.ok)}`);
  console.log(`- T4 tests: ${statusLabel(failingTests === 0)} (${testCases.length - failingTests}/${testCases.length})`);
  console.log(`- Test avance aud incorrect: ${statusLabel(wrongAudiencePass)}`);

  if (!claimsCheck.ok || failingTests > 0 || !wrongAudiencePass) {
    process.exit(1);
  }
};

main().catch((error) => {
  console.error('Erreur execution script authN:', error instanceof Error ? error.message : error);
  process.exit(1);
});
