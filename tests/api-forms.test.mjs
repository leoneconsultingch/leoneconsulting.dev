import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import nodemailer from 'nodemailer';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import './helpers/api-imports.mjs';

const handlers = await Promise.all(['contact', 'booking', 'pre-call', 'audit-request'].map(async (name) => {
  const { default: handler } = await import(`../api/${name}.ts`);
  return { name, handler };
}));

const originalEnv = { ...process.env };
beforeEach(() => {
  mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network access in test'); });
});
afterEach(() => {
  mock.restoreAll();
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

function response() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

function payload() {
  return {
    name: 'Alice', email: 'alice@example.com', company: 'Example', service: 'ai',
    message: 'A project question', date: '2026-12-01', time: '15-16', type: 'online',
    phone: '+41000000000', privacy: true, objective: 'Review architecture',
    situation: 'Planning', dataStatus: 'Available', timeline: 'Next month',
    project: 'Example', materials: 'https://example.com/repo', terms: 'on',
  };
}

function request(body = payload()) {
  return { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': '192.0.2.1' }, body, socket: {} };
}

function smtpEnv() {
  Object.assign(process.env, {
    SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465', SMTP_USER: 'sender@example.com',
    SMTP_PASS: 'test-only-password', SMTP_TO: 'owner@example.com',
    UPSTASH_REDIS_REST_URL: 'https://redis.example.com', UPSTASH_REDIS_REST_TOKEN: 'test-only-token',
  });
}

function redisReply(remaining = 2) {
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify([{ result: [remaining, 3] }]), {
    status: 200, headers: { 'content-type': 'application/json' },
  }));
}

for (const { name, handler } of handlers) {
  test(`${name}: absent rate-limit configuration returns 503 without sending email`, async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    mock.method(console, 'error', () => {});
    mock.method(console, 'warn', () => {});
    const sent = [];
    mock.method(nodemailer, 'createTransport', () => ({ sendMail: async (mail) => { sent.push(mail); return {}; } }));
    const res = response();
    await handler(request(), res);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(sent, []);
    assert.equal(res.headers['Retry-After'], '60');
  });

  test(`${name}: Redis DNS failure becomes a controlled 503`, async () => {
    smtpEnv();
    mock.method(console, 'error', () => {});
    mock.method(globalThis, 'fetch', async () => { throw new Error('getaddrinfo ENOTFOUND redis.example.com'); });
    const res = response();
    await handler(request(), res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'Service temporarily unavailable. Please try again later.');
  });

  test(`${name}: valid request sends mail with implicit TLS on 465`, async () => {
    smtpEnv();
    redisReply();
    const sent = [];
    let transport;
    mock.method(nodemailer, 'createTransport', (config) => {
      transport = config;
      return { sendMail: async (mail) => { sent.push(mail); return { messageId: 'test-id' }; } };
    });
    const res = response();
    await handler(request(), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(transport.port, 465);
    assert.equal(transport.secure, true);
    assert.equal(sent[0].to, 'owner@example.com');
    assert.equal(sent.length, name === 'pre-call' || name === 'audit-request' ? 2 : 1);
  });
}

for (const { name, handler } of handlers.filter(({ name }) => name !== 'booking')) {
  test(`${name}: required fields cannot become empty after sanitization`, async () => {
    smtpEnv();
    redisReply();
    const sent = [];
    mock.method(nodemailer, 'createTransport', () => ({ sendMail: async (mail) => { sent.push(mail); return {}; } }));
    for (const invalidName of [{}, '   ', '<>']) {
      const res = response();
      await handler(request({ ...payload(), name: invalidName }), res);
      assert.equal(res.statusCode, 400);
    }
    assert.deepEqual(sent, []);
  });
}

test('audit requires explicit acceptance rather than a truthy terms value', async () => {
  smtpEnv();
  redisReply();
  const res = response();
  const sent = [];
  mock.method(nodemailer, 'createTransport', () => ({ sendMail: async (mail) => { sent.push(mail); return {}; } }));
  await handlers.find(({ name }) => name === 'audit-request').handler(request({ ...payload(), terms: 'false' }), res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(sent, []);
});

for (const { name, handler } of handlers.filter(({ name }) => name === 'pre-call' || name === 'audit-request')) {
  test(`${name}: a failed confirmation does not report an already accepted request as failed`, async () => {
    smtpEnv();
    redisReply();
    mock.method(console, 'warn', () => {});
    mock.method(console, 'error', () => {});
    const accepted = [];
    mock.method(nodemailer, 'createTransport', () => ({ sendMail: async (mail) => {
      if (mail.to === 'alice@example.com') throw new Error('Confirmation rejected');
      accepted.push(mail);
      return {};
    } }));
    const res = response();
    await handler(request(), res);
    assert.equal(accepted.length, 1);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
  });
}

test('audit email encodes quotes in material links rather than creating attributes', async () => {
  smtpEnv();
  redisReply();
  const sent = [];
  mock.method(nodemailer, 'createTransport', () => ({ sendMail: async (mail) => { sent.push(mail); return {}; } }));
  const body = payload();
  body.materials = 'https://example.com/" style="color:red';
  const res = response();
  await handlers.find(({ name }) => name === 'audit-request').handler(request(body), res);
  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(sent[0].html, /href="https:\/\/example.com\/" style=/);
  assert.match(sent[0].html, /%22/);
});

for (const { name, handler } of handlers) {
  test(`${name}: quota exhaustion returns 429 without SMTP`, async () => {
    smtpEnv();
    redisReply(-1);
    const sent = [];
    mock.method(nodemailer, 'createTransport', () => ({ sendMail: async (mail) => { sent.push(mail); return {}; } }));
    const res = response();
    await handler(request(), res);
    assert.equal(res.statusCode, 429);
    assert.deepEqual(sent, []);
  });
}

test('SMTP 587 and the default port require STARTTLS', async () => {
  const { createMailTransport } = await import('../api/lib/mail.ts');
  smtpEnv();
  const configs = [];
  mock.method(nodemailer, 'createTransport', (config) => { configs.push(config); return {}; });
  process.env.SMTP_PORT = '587';
  createMailTransport();
  delete process.env.SMTP_PORT;
  createMailTransport();
  for (const config of configs) {
    assert.equal(config.port, 587);
    assert.equal(config.secure, false);
    assert.equal(config.requireTLS, true);
  }
});

test('a rate-limit timeout never authorizes an email', async () => {
  smtpEnv();
  mock.method(console, 'error', () => {});
  mock.method(globalThis, 'fetch', async () => new Promise(() => {}));
  const sent = [];
  mock.method(nodemailer, 'createTransport', () => ({ sendMail: async (mail) => { sent.push(mail); return {}; } }));
  const res = response();
  await handlers[0].handler(request(), res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(sent, []);
});

test('SMTP failures return an error without disclosing provider details', async () => {
  smtpEnv();
  redisReply();
  const logged = [];
  mock.method(console, 'error', (...args) => logged.push(args));
  mock.method(nodemailer, 'createTransport', () => ({ sendMail: async () => { throw new Error('private-provider-detail'); } }));
  const res = response();
  await handlers[0].handler(request(), res);
  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(JSON.stringify([res.body, logged]), /private-provider-detail/);
});

test('SMTP invalid configuration is rejected before creating a connection', async () => {
  const { createMailTransport } = await import('../api/lib/mail.ts');
  smtpEnv();
  let connected = false;
  mock.method(nodemailer, 'createTransport', () => { connected = true; return {}; });
  for (const port of ['0', '465junk', '65536', '1.5']) {
    process.env.SMTP_PORT = port;
    assert.throws(() => createMailTransport(), /Invalid SMTP configuration/);
  }
  process.env.SMTP_PORT = '465';
  delete process.env.SMTP_PASS;
  assert.throws(() => createMailTransport(), /Invalid SMTP configuration/);
  assert.equal(connected, false);
});

test('English audit form sends a compatible JSON request and displays success', async () => {
  const page = await readFile(new URL('../src/pages/en/async-audit.astro', import.meta.url), 'utf8');
  const script = page.match(/<script>([\s\S]*?)<\/script>/)[1];
  const elements = Object.fromEntries(['audit-form', 'submit-btn', 'success-msg', 'error-msg'].map((id) => [id, {
    action: '/api/audit-request', classList: { add() {}, remove() {} },
    addEventListener(_event, callback) { this.submit = callback; },
    reset() { this.wasReset = true; },
  }]));
  const values = { name: 'Alice', email: 'alice@example.com', project: 'Example',
    objective: 'Review', materials: 'https://example.com/repo', terms: 'on' };
  let submitted;
  vm.runInNewContext(ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    document: { getElementById: (id) => elements[id] },
    FormData: class { entries() { return Object.entries(values); } get(key) { return values[key] ?? null; } },
    fetch: async (url, options) => { submitted = { url, ...options }; return { ok: true, json: async () => ({ success: true }) }; },
  });
  await elements['audit-form'].submit({ preventDefault() {} });
  assert.equal(submitted.headers?.['Content-Type'], 'application/json');
  assert.equal(submitted.url, '/api/audit-request');
  assert.equal(JSON.parse(submitted.body).objective, 'Review');
  assert.equal(JSON.parse(submitted.body).terms, 'on');
  assert.equal(elements['audit-form'].wasReset, true);
  assert.equal(elements['submit-btn'].disabled, false);
});
