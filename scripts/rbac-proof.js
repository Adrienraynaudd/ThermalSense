#!/usr/bin/env node
require('dotenv/config');

const BASE_URL =
  process.env.AUTHN_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'admin123';

const columns = [
  { id: 'admin', label: 'Admin' },
  { id: 'operatorOwn', label: 'Operateur (sa zone)' },
  { id: 'operatorOther', label: 'Operateur (autre zone)' },
  { id: 'reader', label: 'Lecteur' },
  { id: 'device', label: 'Device IOT' },
];

const pretty = (value) => JSON.stringify(value, null, 2);

const requestApi = async ({ method, path, token, body }) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let json;

  try {
    json = text ? JSON.parse(text) : undefined;
  } catch (_error) {
    json = undefined;
  }

  return {
    status: response.status,
    ok: response.status >= 200 && response.status < 300,
    body: json,
    bodyText: text,
  };
};

const ensureOk = async (label, call) => {
  const result = await call;

  if (!result.ok) {
    throw new Error(`${label} failed with ${result.status}: ${result.bodyText}`);
  }

  return result.body;
};

const randomName = (prefix) => {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
};

const expectedMatrix = {
  'GET /sensors': {
    admin: true,
    operatorOwn: true,
    operatorOther: true,
    reader: true,
    device: false,
  },
  'POST /sensors': {
    admin: true,
    operatorOwn: true,
    operatorOther: false,
    reader: false,
    device: false,
  },
  'GET /sensors/:id': {
    admin: true,
    operatorOwn: true,
    operatorOther: true,
    reader: true,
    device: true,
  },
  'DELETE /sensors/:id': {
    admin: true,
    operatorOwn: true,
    operatorOther: false,
    reader: false,
    device: false,
  },
  'GET /sensors/:id/config': {
    admin: true,
    operatorOwn: true,
    operatorOther: true,
    reader: false,
    device: false,
  },
  'PATCH /sensors/:id/config': {
    admin: true,
    operatorOwn: true,
    operatorOther: false,
    reader: false,
    device: false,
  },
  'GET /measurement': {
    admin: true,
    operatorOwn: true,
    operatorOther: false,
    reader: true,
    device: false,
  },
  'POST /sensors/:id/measurement': {
    admin: true,
    operatorOwn: true,
    operatorOther: false,
    reader: false,
    device: true,
  },
  'GET /actuators': {
    admin: true,
    operatorOwn: true,
    operatorOther: true,
    reader: true,
    device: false,
  },
  'GET /actuators/:id/commands': {
    admin: true,
    operatorOwn: true,
    operatorOther: true,
    reader: true,
    device: false,
  },
  'POST /actuators/:id/commands': {
    admin: true,
    operatorOwn: true,
    operatorOther: false,
    reader: false,
    device: false,
  },
  'GET /alert-threshold': {
    admin: true,
    operatorOwn: true,
    operatorOther: true,
    reader: true,
    device: true,
  },
  'PATCH /alert-threshold/:id': {
    admin: true,
    operatorOwn: true,
    operatorOther: false,
    reader: false,
    device: false,
  },
  'DELETE /alert-threshold/:id': {
    admin: true,
    operatorOwn: true,
    operatorOther: false,
    reader: false,
    device: false,
  },
  'POST /zone/:id/alert-threshold': {
    admin: true,
    operatorOwn: true,
    operatorOther: false,
    reader: false,
    device: false,
  },
  'POST /auth/login': {
    admin: true,
    operatorOwn: true,
    operatorOther: true,
    reader: true,
    device: true,
  },
  'POST /auth/register': {
    admin: true,
    operatorOwn: true,
    operatorOther: false,
    reader: false,
    device: false,
  },
  'POST /auth/refresh': {
    admin: true,
    operatorOwn: true,
    operatorOther: true,
    reader: true,
    device: true,
  },
  'GET /auth/me': {
    admin: true,
    operatorOwn: true,
    operatorOther: true,
    reader: true,
    device: true,
  },
};

const main = async () => {
  console.log('# RBAC Proof');
  console.log(`Base URL: ${BASE_URL}`);

  const adminLogin = await ensureOk(
    'Admin login',
    requestApi({
      method: 'POST',
      path: '/auth/login',
      body: { username: AUTH_USERNAME, password: AUTH_PASSWORD },
    }),
  );

  const adminToken = adminLogin.accessToken;
  if (!adminToken) {
    throw new Error('Admin access token missing');
  }

  const building = await ensureOk(
    'Create building',
    requestApi({
      method: 'POST',
      path: '/building',
      token: adminToken,
      body: { name: randomName('building'), address: 'rbac' },
    }),
  );

  const zoneA = await ensureOk(
    'Create zone A',
    requestApi({
      method: 'POST',
      path: `/building/${building.id}/zone`,
      token: adminToken,
      body: { name: randomName('zone-a') },
    }),
  );

  const zoneB = await ensureOk(
    'Create zone B',
    requestApi({
      method: 'POST',
      path: `/building/${building.id}/zone`,
      token: adminToken,
      body: { name: randomName('zone-b') },
    }),
  );

  const sensorA = await ensureOk(
    'Create sensor A',
    requestApi({
      method: 'POST',
      path: '/sensors',
      token: adminToken,
      body: { zoneId: zoneA.id, type: 'TEMP', status: 'ON' },
    }),
  );

  const sensorB = await ensureOk(
    'Create sensor B',
    requestApi({
      method: 'POST',
      path: '/sensors',
      token: adminToken,
      body: { zoneId: zoneB.id, type: 'TEMP', status: 'ON' },
    }),
  );

  const actuatorA = await ensureOk(
    'Create actuator A',
    requestApi({
      method: 'POST',
      path: `/zone/${zoneA.id}/actuator`,
      token: adminToken,
      body: { type: 'HEATER', status: 'OFF' },
    }),
  );

  const actuatorB = await ensureOk(
    'Create actuator B',
    requestApi({
      method: 'POST',
      path: `/zone/${zoneB.id}/actuator`,
      token: adminToken,
      body: { type: 'HEATER', status: 'OFF' },
    }),
  );

  const thresholdA = await ensureOk(
    'Create threshold A',
    requestApi({
      method: 'POST',
      path: `/zone/${zoneA.id}/alert-threshold`,
      token: adminToken,
      body: { type: 'TEMP', min: 18, max: 26 },
    }),
  );

  const thresholdB = await ensureOk(
    'Create threshold B',
    requestApi({
      method: 'POST',
      path: `/zone/${zoneB.id}/alert-threshold`,
      token: adminToken,
      body: { type: 'TEMP', min: 18, max: 26 },
    }),
  );

  const operatorUsername = randomName('operator');
  const readerUsername = randomName('reader');
  const deviceUsername = randomName('device');
  const defaultPassword = 'Passw0rd!';

  await ensureOk(
    'Register operator',
    requestApi({
      method: 'POST',
      path: '/auth/register',
      token: adminToken,
      body: {
        username: operatorUsername,
        password: defaultPassword,
        role: 'OPERATEUR',
        zoneId: zoneA.id,
      },
    }),
  );

  await ensureOk(
    'Register reader',
    requestApi({
      method: 'POST',
      path: '/auth/register',
      token: adminToken,
      body: {
        username: readerUsername,
        password: defaultPassword,
        role: 'LECTEUR',
      },
    }),
  );

  await ensureOk(
    'Register device',
    requestApi({
      method: 'POST',
      path: '/auth/register',
      token: adminToken,
      body: {
        username: deviceUsername,
        password: defaultPassword,
        role: 'DEVICE_IOT',
      },
    }),
  );

  const adminSession = {
    username: AUTH_USERNAME,
    password: AUTH_PASSWORD,
    accessToken: adminLogin.accessToken,
    refreshToken: adminLogin.refreshToken,
  };

  const operatorLogin = await ensureOk(
    'Operator login',
    requestApi({
      method: 'POST',
      path: '/auth/login',
      body: { username: operatorUsername, password: defaultPassword },
    }),
  );

  const operatorOtherLogin = await ensureOk(
    'Operator login (other column)',
    requestApi({
      method: 'POST',
      path: '/auth/login',
      body: { username: operatorUsername, password: defaultPassword },
    }),
  );

  const readerLogin = await ensureOk(
    'Reader login',
    requestApi({
      method: 'POST',
      path: '/auth/login',
      body: { username: readerUsername, password: defaultPassword },
    }),
  );

  const deviceLogin = await ensureOk(
    'Device login',
    requestApi({
      method: 'POST',
      path: '/auth/login',
      body: { username: deviceUsername, password: defaultPassword },
    }),
  );

  const sessions = {
    admin: adminSession,
    operatorOwn: {
      username: operatorUsername,
      password: defaultPassword,
      accessToken: operatorLogin.accessToken,
      refreshToken: operatorLogin.refreshToken,
    },
    operatorOther: {
      username: operatorUsername,
      password: defaultPassword,
      accessToken: operatorOtherLogin.accessToken,
      refreshToken: operatorOtherLogin.refreshToken,
    },
    reader: {
      username: readerUsername,
      password: defaultPassword,
      accessToken: readerLogin.accessToken,
      refreshToken: readerLogin.refreshToken,
    },
    device: {
      username: deviceUsername,
      password: defaultPassword,
      accessToken: deviceLogin.accessToken,
      refreshToken: deviceLogin.refreshToken,
    },
  };

  const byColumnResources = {
    admin: { zoneId: zoneA.id, sensorId: sensorA.id, actuatorId: actuatorA.id, thresholdId: thresholdA.id },
    operatorOwn: { zoneId: zoneA.id, sensorId: sensorA.id, actuatorId: actuatorA.id, thresholdId: thresholdA.id },
    operatorOther: { zoneId: zoneB.id, sensorId: sensorB.id, actuatorId: actuatorB.id, thresholdId: thresholdB.id },
    reader: { zoneId: zoneA.id, sensorId: sensorA.id, actuatorId: actuatorA.id, thresholdId: thresholdA.id },
    device: { zoneId: zoneA.id, sensorId: sensorA.id, actuatorId: actuatorA.id, thresholdId: thresholdA.id },
  };

  const makeSensorForDelete = async (zoneId) => {
    const created = await ensureOk(
      'Prepare sensor for delete',
      requestApi({
        method: 'POST',
        path: '/sensors',
        token: adminToken,
        body: { zoneId, type: 'TEMP', status: 'ON' },
      }),
    );
    return created.id;
  };

  const makeThresholdForDelete = async (zoneId) => {
    const created = await ensureOk(
      'Prepare threshold for delete',
      requestApi({
        method: 'POST',
        path: `/zone/${zoneId}/alert-threshold`,
        token: adminToken,
        body: { type: 'TEMP', min: 10, max: 20 },
      }),
    );
    return created.id;
  };

  const tests = [
    {
      name: 'GET /sensors',
      run: async (columnId) =>
        requestApi({
          method: 'GET',
          path: '/sensors',
          token: sessions[columnId].accessToken,
        }),
    },
    {
      name: 'POST /sensors',
      run: async (columnId) => {
        const r = byColumnResources[columnId];
        return requestApi({
          method: 'POST',
          path: '/sensors',
          token: sessions[columnId].accessToken,
          body: { zoneId: r.zoneId, type: 'TEMP', status: 'ON' },
        });
      },
    },
    {
      name: 'GET /sensors/:id',
      run: async (columnId) => {
        const r = byColumnResources[columnId];
        return requestApi({
          method: 'GET',
          path: `/sensors/${r.sensorId}`,
          token: sessions[columnId].accessToken,
        });
      },
    },
    {
      name: 'DELETE /sensors/:id',
      run: async (columnId) => {
        const r = byColumnResources[columnId];
        const deleteSensorId = await makeSensorForDelete(r.zoneId);
        return requestApi({
          method: 'DELETE',
          path: `/sensors/${deleteSensorId}`,
          token: sessions[columnId].accessToken,
        });
      },
    },
    {
      name: 'GET /sensors/:id/config',
      run: async (columnId) => {
        const r = byColumnResources[columnId];
        return requestApi({
          method: 'GET',
          path: `/sensors/${r.sensorId}/config`,
          token: sessions[columnId].accessToken,
        });
      },
    },
    {
      name: 'PATCH /sensors/:id/config',
      run: async (columnId) => {
        const r = byColumnResources[columnId];
        return requestApi({
          method: 'PATCH',
          path: `/sensors/${r.sensorId}/config`,
          token: sessions[columnId].accessToken,
          body: { status: 'OFF' },
        });
      },
    },
    {
      name: 'GET /measurement',
      run: async (columnId) => {
        const r = byColumnResources[columnId];
        return requestApi({
          method: 'GET',
          path: `/measurement?zoneId=${encodeURIComponent(r.zoneId)}`,
          token: sessions[columnId].accessToken,
        });
      },
    },
    {
      name: 'POST /sensors/:id/measurement',
      run: async (columnId) => {
        const r = byColumnResources[columnId];
        return requestApi({
          method: 'POST',
          path: `/sensors/${r.sensorId}/measurement`,
          token: sessions[columnId].accessToken,
          body: { value: 21.3 },
        });
      },
    },
    {
      name: 'GET /actuators',
      run: async (columnId) =>
        requestApi({
          method: 'GET',
          path: '/actuators',
          token: sessions[columnId].accessToken,
        }),
    },
    {
      name: 'GET /actuators/:id/commands',
      run: async (columnId) => {
        const r = byColumnResources[columnId];
        return requestApi({
          method: 'GET',
          path: `/actuators/${r.actuatorId}/commands`,
          token: sessions[columnId].accessToken,
        });
      },
    },
    {
      name: 'POST /actuators/:id/commands',
      run: async (columnId) => {
        const r = byColumnResources[columnId];
        return requestApi({
          method: 'POST',
          path: `/actuators/${r.actuatorId}/commands`,
          token: sessions[columnId].accessToken,
          body: { status: 'ON' },
        });
      },
    },
    {
      name: 'GET /alert-threshold',
      run: async (columnId) => {
        const r = byColumnResources[columnId];
        return requestApi({
          method: 'GET',
          path: `/alert-threshold?zone=${encodeURIComponent(r.zoneId)}`,
          token: sessions[columnId].accessToken,
        });
      },
    },
    {
      name: 'PATCH /alert-threshold/:id',
      run: async (columnId) => {
        const r = byColumnResources[columnId];
        return requestApi({
          method: 'PATCH',
          path: `/alert-threshold/${r.thresholdId}`,
          token: sessions[columnId].accessToken,
          body: { max: 29 },
        });
      },
    },
    {
      name: 'DELETE /alert-threshold/:id',
      run: async (columnId) => {
        const r = byColumnResources[columnId];
        const deleteThresholdId = await makeThresholdForDelete(r.zoneId);
        return requestApi({
          method: 'DELETE',
          path: `/alert-threshold/${deleteThresholdId}`,
          token: sessions[columnId].accessToken,
        });
      },
    },
    {
      name: 'POST /zone/:id/alert-threshold',
      run: async (columnId) => {
        const r = byColumnResources[columnId];
        return requestApi({
          method: 'POST',
          path: `/zone/${r.zoneId}/alert-threshold`,
          token: sessions[columnId].accessToken,
          body: { type: 'TEMP', min: 15, max: 25 },
        });
      },
    },
    {
      name: 'POST /auth/login',
      run: async (columnId) => {
        const s = sessions[columnId];
        return requestApi({
          method: 'POST',
          path: '/auth/login',
          body: { username: s.username, password: s.password },
        });
      },
    },
    {
      name: 'POST /auth/register',
      run: async (columnId) => {
        const r = byColumnResources[columnId];
        return requestApi({
          method: 'POST',
          path: '/auth/register',
          token: sessions[columnId].accessToken,
          body: {
            username: randomName('new-user'),
            password: defaultPassword,
            role: 'OPERATEUR',
            zoneId: r.zoneId,
          },
        });
      },
    },
    {
      name: 'POST /auth/refresh',
      run: async (columnId) => {
        const s = sessions[columnId];
        const freshLogin = await requestApi({
          method: 'POST',
          path: '/auth/login',
          body: { username: s.username, password: s.password },
        });

        if (!freshLogin.ok || !freshLogin.body || !freshLogin.body.refreshToken) {
          return freshLogin;
        }

        const refreshResult = await requestApi({
          method: 'POST',
          path: '/auth/refresh',
          body: { refreshToken: freshLogin.body.refreshToken },
        });

        if (refreshResult.ok && refreshResult.body && refreshResult.body.refreshToken) {
          s.refreshToken = refreshResult.body.refreshToken;
          s.accessToken = refreshResult.body.accessToken;
        }

        return refreshResult;
      },
    },
    {
      name: 'GET /auth/me',
      run: async (columnId) =>
        requestApi({
          method: 'GET',
          path: '/auth/me',
          token: sessions[columnId].accessToken,
        }),
    },
  ];

  const failures = [];

  for (const test of tests) {
    for (const column of columns) {
      const expectedAllowed = expectedMatrix[test.name][column.id];
      const result = await test.run(column.id);
      const actualAllowed = result.ok;

      if (expectedAllowed !== actualAllowed) {
        failures.push({
          test: test.name,
          column: column.label,
          expected: expectedAllowed ? 'ALLOW' : 'DENY',
          actual: `${result.status}`,
          details: result.body || result.bodyText,
        });
      }
    }
  }

  console.log('\n## Resultat');
  if (failures.length === 0) {
    console.log('[OK] Matrice RBAC conforme.');
    return;
  }

  console.log(`[KO] ${failures.length} ecart(s) detecte(s).`);
  console.log(pretty(failures));
  process.exit(1);
};

main().catch((error) => {
  console.error('[KO] Echec execution RBAC proof:', error instanceof Error ? error.message : error);
  process.exit(1);
});
