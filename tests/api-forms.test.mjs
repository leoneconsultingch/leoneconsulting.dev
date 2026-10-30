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

function payload(name = 'contact') {
  const base = { name: 'Alice', email: 'alice@example.com', website: '' };
  if (name === 'booking') return { ...base, service: 'ai', date: '2026-12-01', time: '15-16',
    type: 'online', phone: '+41000000000', company: '', notes: '', privacy: true };
  if (name === 'pre-call') return { ...base, objective: 'audit', situation: 'Planning',
    dataStatus: 'none', timeline: 'short', budget: '' };
  if (name === 'audit-request') return { ...base, project: 'Example', objective: 'Review',
    materials: 'https://example.com/repo', terms: 'on' };
  return { ...base, company: 'Example', service: 'ai', message: 'A project question', privacy: true };
}

function request(body = payload(), name = 'contact') {
  return { method: 'POST', url: `/api/${name}`, headers: {
    'content-type': 'application/json', origin: 'https://leoneconsulting.dev',
  }, body, socket: {} };
}

function smtpEnv() {
  Object.assign(process.env, {
    SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465', SMTP_USER: 'sender@example.com',
    SMTP_PASS: 'test-only-password', SMTP_TO: 'owner@example.com',
    UPSTASH_REDIS_REST_URL: 'https://redis.example.com', UPSTASH_REDIS_REST_TOKEN: 'test-only-token',
  });
}

for (const { name, handler } of handlers) {
  test(`${name}: valid request works without Redis or any network rate-limit lookup`, async () => {
    smtpEnv();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    mock.method(console, 'error', () => {});
    const sent = [];
    let transport;
    mock.method(nodemailer, 'createTransport', (config) => {
      transport = config;
      return { sendMail: async (mail) => { sent.push(mail); return { messageId: 'test-id' }; } };
    });
    const res = response();
    await handler(request(payload(name), name), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(transport.secure, true);
    assert.equal(sent[0].to, 'owner@example.com');
    assert.equal(sent.length, 1);
  });

  test(`${name}: honeypot submission is acknowledged without SMTP`, async () => {
    smtpEnv();
    mock.method(console, 'error', () => {});
    const sent = [];
    mock.method(nodemailer, 'createTransport', () => ({ sendMail: async (mail) => { sent.push(mail); return {}; } }));
    const res = response();
    await handler(request({ ...payload(name), website: 'https://spam.example' }, name), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(sent, []);
  });

  test(`${name}: malformed, unknown, overlength and empty fields cannot reach SMTP`, async () => {
    smtpEnv();
    mock.method(console, 'error', () => {});
    const sent = [];
    mock.method(nodemailer, 'createTransport', () => ({ sendMail: async (mail) => { sent.push(mail); return {}; } }));
    for (const body of [null, [], { ...payload(name), name: {} }, { ...payload(name), name: '   ' },
      { ...payload(name), name: '<>' }, { ...payload(name), name: 'a'.repeat(2001) },
      { ...payload(name), injected: 'unexpected' }, { ...payload(name), email: 'victim<@example.com' }]) {
      const res = response();
      await handler(request(body, name), res);
      assert.equal(res.statusCode, 400);
    }
    assert.deepEqual(sent, []);
  });

  test(`${name}: actual body limit cannot be bypassed with a small Content-Length`, async () => {
    const req = request({ ...payload(name), name: 'a'.repeat(70000) }, name);
    req.headers['content-length'] = '1';
    const res = response();
    mock.method(console, 'error', () => {});
    await handler(req, res);
    assert.equal(res.statusCode, 413);
  });

  test(`${name}: cross-site request is rejected before SMTP`, async () => {
    const req = request(payload(name), name);
    req.headers.origin = 'https://attacker.example';
    const res = response();
    mock.method(console, 'error', () => {});
    await handler(req, res);
    assert.equal(res.statusCode, 403);
  });

  test(`${name}: noncanonical API paths cannot bypass the firewall selector`, async () => {
    for (const path of [`/API/${name}`, `/api%2f${name}`, `/%61pi/${name}`, `/api//${name}`]) {
      const req = request(payload(name), name);
      req.url = path;
      const res = response();
      mock.method(console, 'error', () => {});
      await handler(req, res);
      assert.equal(res.statusCode, 404);
    }
  });
}

for (const { name, handler } of handlers.filter(({ name }) => ['pre-call', 'audit-request'].includes(name))) {
  test(`${name}: unverified requester addresses never receive an automated email`, async () => {
    smtpEnv();
    const sent = [];
    mock.method(nodemailer, 'createTransport', () => ({ sendMail: async (mail) => {
      sent.push(mail);
      return { messageId: 'test-id' };
    } }));
    for (const email of ['victim@example.net', 'victim+tag@example.net']) {
      const body = { ...payload(name), email, name: 'Untrusted request text' };
      if (name === 'audit-request') body.project = 'Attacker-chosen project text';
      const req = request(body, name);
      delete req.headers.origin;
      req.url = `/api/${name}/?source=regression`;
      const res = response();
      await handler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
    }
    assert.equal(sent.length, 2);
    for (const mail of sent) {
      assert.equal(mail.to, 'owner@example.com');
      assert.equal(mail.cc, undefined);
      assert.equal(mail.bcc, undefined);
      assert.equal(mail.envelope, undefined);
    }
  });

  test(`${name}: operator delivery failure stays an error with no secondary send`, async () => {
    smtpEnv();
    mock.method(console, 'error', () => {});
    const attempted = [];
    mock.method(nodemailer, 'createTransport', () => ({ sendMail: async (mail) => {
      attempted.push(mail.to);
      throw new Error('provider-private-error');
    } }));
    const res = response();
    await handler(request(payload(name), name), res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(attempted, ['owner@example.com']);
    assert.doesNotMatch(JSON.stringify(res.body), /provider-private-error/);
  });
}

test('audit requires explicit terms acceptance', async () => {
  const res = response();
  mock.method(console, 'error', () => {});
  await handlers[3].handler(request({ ...payload('audit-request'), terms: 'false' }, 'audit-request'), res);
  assert.equal(res.statusCode, 400);
});

test('audit material URL cannot create HTML attributes', async () => {
  smtpEnv();
  const sent = [];
  mock.method(nodemailer, 'createTransport', () => ({ sendMail: async (mail) => { sent.push(mail); return {}; } }));
  const body = { ...payload('audit-request'), materials: 'https://example.com/" style="color:red' };
  const res = response();
  await handlers[3].handler(request(body, 'audit-request'), res);
  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(sent[0].html, /href="https:\/\/example.com\/" style=/);
  assert.match(sent[0].html, /%22/);
});

test('audit accepts a multilingual request within every advertised field limit', async () => {
  smtpEnv();
  const sent = [];
  mock.method(nodemailer, 'createTransport', () => ({ sendMail: async (mail) => { sent.push(mail); return {}; } }));
  const body = { ...payload('audit-request'), name: '界'.repeat(150), project: '界'.repeat(2000),
    objective: '界'.repeat(500), materials: 'https://example.com/' + '界'.repeat(1980), notes: '界'.repeat(2000) };
  const res = response();
  await handlers[3].handler(request(body, 'audit-request'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(sent.length, 1);
});

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

test('SMTP failures return an error without disclosing provider details', async () => {
  smtpEnv();
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

for (const wafStatus of [429, 403]) {
test(`English audit form explains a non-JSON WAF ${wafStatus} without resetting fields`, async () => {
  const page = await readFile(new URL('../src/pages/en/async-audit.astro', import.meta.url), 'utf8');
  const script = page.match(/<script>([\s\S]*?)<\/script>/)[1];
  const elements = Object.fromEntries(['audit-form', 'submit-btn', 'success-msg', 'error-msg'].map((id) => [id, {
    action: '/api/audit-request', classList: { add() {}, remove() {} },
    addEventListener(_event, callback) { this.submit = callback; },
    reset() { this.wasReset = true; },
  }]));
  vm.runInNewContext(ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    document: { getElementById: (id) => elements[id] },
    FormData: class { entries() { return []; } },
    fetch: async () => ({ status: wafStatus, ok: false, json: async () => { throw new Error('WAF HTML'); } }),
  });
  await elements['audit-form'].submit({ preventDefault() {} });
  assert.match(elements['error-msg'].textContent, /10 minutes/);
  assert.equal(elements['audit-form'].wasReset, undefined);
  assert.equal(elements['submit-btn'].disabled, false);
});

}

test('JSON media type is exact and declared body size is checked', async () => {
  for (const contentType of ['text/plain; application/json', 'application/jsonp', 'multipart/form-data']) {
    const req = request();
    req.headers['content-type'] = contentType;
    const res = response();
    await handlers[0].handler(req, res);
    assert.equal(res.statusCode, 415);
  }
  const req = request();
  req.headers['content-length'] = '70000';
  const res = response();
  await handlers[0].handler(req, res);
  assert.equal(res.statusCode, 413);
});
