import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { validatePost, publishedPosts, contentDigest } from '../src/lib/blog.ts';
import { allowedUrl, fetchText, parseFeed, prepareDraft, decodeGatewayResponse, gatewayComplete, run } from '../scripts/editorial/run.mjs';
import { canUpgradeSetting, editorialService, selectEditorialModel } from '../scripts/editorial/activate.mjs';
import { CODEX_LAUNCHER, codexArguments, codexComplete, codexEnvironment } from '../scripts/editorial/codex.mjs';

const example = JSON.parse(await readFile(new URL('../company/blog/computer-use-pilot.json', import.meta.url)));
const copy = () => ({ ...structuredClone(example), published: false, publishedAt: null, approval: null, updatedAt: '2026-10-31' });
const date = new Date().toISOString().slice(0, 10);
const source = { publisher: 'OpenAI', origins: ['https://openai.com'] };
const feed = `<rss><channel><item><title>A &amp; B</title><link>https://openai.com/news/a</link><pubDate>${new Date().toUTCString()}</pubDate><description><![CDATA[<p>Public announcement</p>]]></description></item></channel></rss>`;

test('Codex uses its managed launcher and read-only execution without inheriting provider keys', () => {
  const args = codexArguments('gpt-6.1-terra', '/tmp/editorial');
  assert.equal(args[0], CODEX_LAUNCHER);
  assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
  assert.ok(args.includes('--ignore-user-config') && args.includes('--ephemeral'));
  for (const feature of ['shell_tool', 'plugins', 'computer_use', 'multi_agent']) {
    assert.ok(args.some((value, index) => value === '--disable' && args[index + 1] === feature));
  }
  assert.throws(() => codexArguments('gpt-model;command', '/tmp'), /Invalid Codex model/);
  assert.deepEqual(codexEnvironment({ HOME: '/test', OPENAI_API_KEY: 'private', EDITORIAL_SECRET: 'private' }), { HOME: '/test', NO_COLOR: '1' });
});

test('Codex service preserves launcher ownership checks and keeps NoNewPrivileges', () => {
  const template = '[Service]\nWorkingDirectory=%h/.local/share/leone-editorial/app\nNoNewPrivileges=yes\nPrivateTmp=yes\nProtectSystem=strict\nProtectHome=read-only\nReadWritePaths=%h/.local/state/leone-editorial\n';
  const service = editorialService(template, 'codex', 'bbbbbbbbbbbbbbbbbbbb');
  assert.ok(service.includes('NoNewPrivileges=yes'));
  assert.ok(!service.includes('ProtectHome=') && !service.includes('PrivateTmp='));
  const previous = editorialService(template, 'gateway', 'aaaaaaaaaaaaaaaaaaaa');
  assert.equal(canUpgradeSetting(previous, service, 'service'), true);
  assert.equal(canUpgradeSetting(previous.replace('NoNewPrivileges=yes', 'NoNewPrivileges=no'), service, 'service'), false);
});

test('Codex event reader accepts the final answer and blocks tool events', async () => {
  const launch = items => () => {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => true;
    child.stdin.once('finish', () => setImmediate(() => {
      for (const item of items) child.stdout.write(`${JSON.stringify({ type: 'item.completed', item })}\n`);
      child.emit('close', 0);
    }));
    return child;
  };
  const answer = await codexComplete('gpt-6.1-terra', [], '/tmp', launch([
    { type: 'error', message: 'Non-fatal local diagnostic' },
    { type: 'agent_message', text: '{"skip":true}' },
  ]));
  assert.equal(answer, '{"skip":true}');
  await assert.rejects(codexComplete('gpt-6.1-terra', [], '/tmp', launch([{ type: 'command_execution' }])), /unsupported item type command_execution/);
});

test('activation selects a usable cloud route instead of a local default and refuses ambiguous or unavailable credentials', () => {
  const config = { defaultModel: 'local-model', providers: {
    ollama: { enabled: true, models: ['local-model'], credentialAvailable: true },
    cloud: { enabled: true, models: ['glm-5.3'], credentialAvailable: true },
  } };
  assert.equal(selectEditorialModel(config), 'glm-5.3');
  assert.throws(() => selectEditorialModel(config, 'local-model'), /unique enabled cloud route/);
  const ambiguous = structuredClone(config);
  ambiguous.providers.other = { enabled: true, models: ['glm-5.3'], credentialAvailable: false };
  assert.throws(() => selectEditorialModel(ambiguous), /unique enabled cloud route/);
  const unavailable = structuredClone(config); unavailable.providers.cloud.credentialAvailable = false;
  assert.throws(() => selectEditorialModel(unavailable), /unique enabled cloud route/);
  config.providers.cloud.models.push('other-model');
  assert.equal(selectEditorialModel(config, 'other-model'), 'other-model');
});

test('provider HTTP status and protocol failures remain distinct without exposing upstream bodies', () => {
  const secret = 'private-upstream-value';
  assert.throws(() => decodeGatewayResponse(JSON.stringify({ ok: false, status: 429, body: secret })), error => error.message.includes('HTTP 429') && !error.message.includes(secret));
  assert.throws(() => decodeGatewayResponse(JSON.stringify({ ok: false, error: 'PEER_REJECTED' })), /account not authorized/);
  assert.throws(() => decodeGatewayResponse(JSON.stringify({ ok: false, error: secret })), error => !error.message.includes(secret));
  assert.throws(() => decodeGatewayResponse('invalid-json'), /malformed response envelope/);
  assert.throws(() => decodeGatewayResponse(JSON.stringify({ ok: true, body: secret })), /provider returned malformed JSON/);
  assert.throws(() => decodeGatewayResponse(JSON.stringify({ ok: true, body: '{"choices":[]}' })), /contains no text/);
});

test('explicit upgrade recognizes only generated revision and model changes, preserving customized settings', () => {
  const previous = '[Service]\nWorkingDirectory=%h/.local/share/leone-editorial/releases/aaaaaaaaaaaaaaaaaaaa\nNoNewPrivileges=yes\n';
  const next = previous.replace('aaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbb');
  assert.equal(canUpgradeSetting(previous, next, 'service'), true);
  assert.equal(canUpgradeSetting(previous.replace('NoNewPrivileges=yes', 'NoNewPrivileges=no'), next, 'service'), false);
  const runtime = '[Service]\nEnvironment=MISSIONCONTROL_GATEWAY_SOCKET=/run/test/gateway.sock\nEnvironment=EDITORIAL_MODEL=glm-5.3\n';
  assert.equal(canUpgradeSetting(runtime, runtime.replace('glm-5.3', 'qwen3.7-plus'), 'runtime'), true);
  assert.equal(canUpgradeSetting(runtime, runtime.replace('/run/test/', '/run/other/'), 'runtime'), false);
  assert.equal(canUpgradeSetting(runtime + 'Environment=OTHER=value\n', runtime, 'runtime'), false);
  assert.equal(canUpgradeSetting('modified timer', 'expected timer', 'timer'), false);
});

test('draft and future article never enter public routes; review binds actual content', () => {
  const post = copy();
  assert.deepEqual(publishedPosts([post]), []);
  post.published = true; post.publishedAt = '2026-10-31';
  assert.throws(() => publishedPosts([post]), /needs review/);
  post.approval = { by: 'Reviewer', at: '2026-10-31', digest: contentDigest(post) };
  assert.equal(publishedPosts([post], '2026-10-31').length, 1);
  assert.equal(publishedPosts([post], '2026-10-30').length, 0);
  post.sections[0].paragraphs.en[0] += ' Changed after approval.';
  assert.throws(() => publishedPosts([post]), /changed after review/);
});

test('missing English, invalid dates, unknown citations and unsafe links fail validation', () => {
  const mutations = [p => { delete p.title.en; }, p => { p.updatedAt = '2026-02-30'; },
    p => { p.sections[0].sourceIds = ['missing']; }, p => { p.sources[0].url = 'javascript:alert(1)'; },
    p => { p.sources[0].url = 'https://user:password@openai.com/'; }];
  for (const change of mutations) { const post = copy(); change(post); assert.throws(() => validatePost(post)); }
  assert.throws(() => publishedPosts([copy(), copy()]), /duplicate slug/);
});

test('RSS/Atom dates and links are bounded to the configured source and last seven days', () => {
  const posts = parseFeed(feed, source);
  assert.equal(posts[0].title, 'A & B');
  assert.equal(posts[0].excerpt, 'Public announcement');
  assert.equal(parseFeed(feed.replace('https://openai.com/news/a', 'https://evil.example/a'), source).length, 0);
  assert.equal(parseFeed(feed, source, Date.now() + 8 * 86400000).length, 0);
  const atom = `<feed><entry><title>Atom</title><link href="https://openai.com/news/atom"/><published>${date}T00:00:00Z</published></entry></feed>`;
  assert.equal(parseFeed(atom, source)[0].title, 'Atom');
  assert.equal(allowedUrl('https://openai.com.evil.example', source.origins), false);
  assert.throws(() => parseFeed('<html>Error page</html>', source), /RSS/);
});

test('cross-origin redirects and oversized responses stop before consuming further sources', async () => {
  let calls = 0;
  await assert.rejects(fetchText('https://openai.com/feed', source.origins, async () => {
    calls++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } });
  }), /origin refused/);
  assert.equal(calls, 1);
  await assert.rejects(fetchText('https://openai.com/feed', source.origins, async () => new Response('x'.repeat(1000001))), /size limit/);
});

test('model output cannot approve publication, forge source metadata or cite an uncollected URL', () => {
  const post = copy(); post.published = true; post.approval = { by: 'Fake', at: date, digest: '0'.repeat(64) };
  post.sources[0].title = 'Invented';
  const draft = prepareDraft(post, example.sources, date);
  assert.equal(draft.published, false); assert.equal(draft.approval, null); assert.equal(draft.eventDate, null);
  assert.equal(draft.sources[0].title, example.sources[0].title);
  post.sources[0].url = 'https://evil.example/fake';
  assert.throws(() => prepareDraft(post, example.sources), /outside/);
});

test('gateway client speaks line protocol and accepts no provider credentials', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'editorial-socket-'));
  const path = join(temp, 'test.sock');
  const server = createServer(socket => socket.once('data', chunk => {
    const request = JSON.parse(chunk.toString());
    assert.equal(request.model, 'test-model'); assert.equal(request.stream, false);
    assert.equal('apiKey' in request, false);
    socket.end(`${JSON.stringify({ ok: true, body: JSON.stringify({ choices: [{ message: { content: '{"skip":true}' } }] }) })}\n`);
  }));
  try {
    await new Promise(resolve => server.listen(path, resolve));
    assert.equal(await gatewayComplete(path, 'test-model', [{ role: 'user', content: 'public' }]), '{"skip":true}');
  } finally { await new Promise(resolve => server.close(resolve)); await rm(temp, { recursive: true }); }
});

test('collection-only run saves a private digest and never invokes the LLM; existing lock prevents overlap', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'editorial-run-'));
  try {
    const result = await run({ stateDir: temp, collectOnly: true,
      fetcher: async () => new Response(feed), complete: () => { throw new Error('LLM must not run'); } });
    assert.equal(result.status, 'collected'); assert.equal(result.count, 1);
    assert.deepEqual(await readdir(result.runDir), ['digest.json']);
    await mkdir(join(temp, 'run.lock'));
    await assert.rejects(run({ stateDir: temp, collectOnly: true }), /already locked/);
  } finally { await rm(temp, { recursive: true }); }
});

test('explicit approval imports an identical draft, refuses overwrite, and preview escapes HTML', async () => {
  const { approve, renderReview } = await import('../scripts/editorial/run.mjs');
  const temp = await mkdtemp(join(tmpdir(), 'editorial-approval-'));
  try {
    await mkdir(join(temp, 'company/blog'), { recursive: true });
    const candidate = join(temp, 'company/blog/computer-use-pilot.json');
    await (await import('node:fs/promises')).writeFile(candidate, JSON.stringify(copy()));
    await assert.rejects(approve(candidate, temp, ''), /reviewer/);
    await approve(candidate, temp, 'Test reviewer');
    const post = validatePost(JSON.parse(await readFile(candidate, 'utf8')));
    assert.equal(post.published, true);
    assert.equal(publishedPosts([post]).length, 1);
    await assert.rejects(approve(candidate, temp, 'Test reviewer'), /unpublished/);
    const unsafe = copy(); unsafe.title.it = '<script>alert(1)</script>';
    const html = renderReview(unsafe);
    assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>'));
  } finally { await rm(temp, { recursive: true }); }
});

test('complete run records a private candidate and diary entry; untrusted output cannot publish', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'editorial-complete-'));
  const originalFetch = globalThis.fetch;
  const socket = process.env.MISSIONCONTROL_GATEWAY_SOCKET;
  const model = process.env.EDITORIAL_MODEL;
  let logged = 0;
  try {
    process.env.MISSIONCONTROL_GATEWAY_SOCKET = '/test/socket'; process.env.EDITORIAL_MODEL = 'test';
    globalThis.fetch = async (url, options) => {
      logged++;
      const body = JSON.parse(options.body);
      if (url.endsWith('/api/editorial/deliver')) return Response.json({id: 'queued-item', delivery_id: body.delivery_id, version: 1, status: 'pending'});
      assert.equal(body.project, 'leoneconsulting.dev'); return new Response('{}');
    };
    const draft = copy();
    draft.sources = [{ ...draft.sources[0], id: 's1', url: 'https://openai.com/news/a' }];
    draft.sections.forEach(section => { section.sourceIds = ['s1']; });
    const result = await run({ stateDir: temp,
      fetcher: async url => new Response(url.endsWith('/news/a') ? '<article>Primary public evidence.</article>' : feed),
      complete: async () => JSON.stringify(draft) });
    assert.equal(result.status, 'draft-ready');
    const candidate = JSON.parse(await readFile(result.draftFile, 'utf8'));
    assert.equal(candidate.published, false); assert.equal(candidate.approval, null);
    assert.equal(logged, 2);
    assert.equal(result.itemId, 'queued-item');
    assert.deepEqual(JSON.parse(await readFile(join(temp, 'history.json'), 'utf8')), ['https://openai.com/news/a']);
    assert.equal((await run({ stateDir: temp, fetcher: async () => new Response(feed) })).status, 'no-news');
  } finally {
    globalThis.fetch = originalFetch;
    if (socket === undefined) delete process.env.MISSIONCONTROL_GATEWAY_SOCKET; else process.env.MISSIONCONTROL_GATEWAY_SOCKET = socket;
    if (model === undefined) delete process.env.EDITORIAL_MODEL; else process.env.EDITORIAL_MODEL = model;
    await rm(temp, { recursive: true });
  }
});
