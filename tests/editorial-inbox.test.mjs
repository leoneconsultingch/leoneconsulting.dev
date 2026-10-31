import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePost, publishedPosts } from '../src/lib/blog.ts';
import { renderReview } from '../scripts/editorial/run.mjs';
import { validateReport, importReport, readInboxEntry } from '../scripts/editorial/inbox.mjs';

const today = new Date().toISOString().slice(0, 10);
const report = () => ({ schemaVersion: 1, reportId: 'test-report-1', mode: 'pilot',
  producer: 'chatgpt-report-via-missioncontrol2', date: today,
  title: 'Report title', summary: 'Report summary', editorialAngle: 'Practical implications',
  publicationAuthorized: false, sources: [{ id: 's1', title: 'Primary source',
    publisher: 'OpenAI', url: 'https://openai.com/news/test', publishedAt: null,
    checkedAt: null, facts: ['An unverified claim from the report.'] }] });
const entry = () => ({ id: 'entry-1', project: 'leoneconsulting.dev',
  tags: ['editorial-inbox-pilot', 'review-required'], content: JSON.stringify(report()) });
const example = JSON.parse(await readFile(new URL('../company/blog/computer-use-pilot.json', import.meta.url)));
const modelOutput = () => {
  const result = structuredClone(example);
  result.sources = [{ id: 's1', url: 'https://openai.com/news/test' }];
  result.sections.forEach(section => { section.sourceIds = ['s1']; });
  result.published = true;
  return JSON.stringify(result);
};

test('inbox requires explicit scope, safe sources and pilot opt-in', () => {
  assert.throws(() => validateReport(entry()), /pilot/i);
  assert.equal(validateReport(entry(), { allowPilot: true }).reportId, 'test-report-1');
  const changes = [
    e => { e.project = 'another-repo'; },
    e => { e.tags = ['editorial']; },
    e => { const r = report(); r.sources[0].url = 'http://127.0.0.1/private'; e.content = JSON.stringify(r); },
    e => { const r = report(); r.sources[0].url = 'https://openai.com.evil.example/a'; e.content = JSON.stringify(r); },
    e => { const r = report(); r.publicationAuthorized = true; e.content = JSON.stringify(r); },
    e => { const r = report(); r.sources.push({ ...r.sources[0] }); e.content = JSON.stringify(r); },
    e => { const r = report(); r.date = '2099-01-01'; e.content = JSON.stringify(r); },
    e => { const r = report(); r.reportId = 123; e.content = JSON.stringify(r); },
  ];
  for (const change of changes) { const e = entry(); change(e); assert.throws(() => validateReport(e, { allowPilot: true })); }
});

test('standalone reader stays on local MissionControl, refuses redirects and requires the requested entry', async () => {
  let calls = 0;
  const fetcher = async url => { calls++; assert.equal(new URL(url).hostname, '127.0.0.1'); return Response.json({ entries: [entry()] }); };
  assert.equal((await readInboxEntry('entry-1', { fetcher })).id, 'entry-1');
  await assert.rejects(readInboxEntry('entry-1', { endpoint: 'https://example.com', fetcher }), /local/i);
  await assert.rejects(readInboxEntry('missing', { fetcher }), /not found/i);
  await assert.rejects(readInboxEntry('entry-1', { fetcher: async () => new Response(null, { status: 302 }) }), /HTTP 302/);
  assert.equal(calls, 2);
});

test('import retrieves actual evidence, forces a private draft, and reuses it without another model request', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'editorial-inbox-'));
  let calls = 0;
  try {
    const options = { stateDir, entry: entry(), allowPilot: true,
      fetcher: async () => new Response('<article>A fact from the primary page. Additional primary evidence.</article>'),
      complete: async (_model, messages) => {
        calls++;
        const payload = JSON.parse(messages[1].content);
        assert.ok(payload.evidence[0].excerpt.includes('A fact from the primary page.'));
        assert.ok(!JSON.stringify(payload.evidence).includes('unverified claim'));
        return modelOutput();
      } };
    const first = await importReport(options);
    const post = validatePost(JSON.parse(await readFile(first.draftFile, 'utf8')));
    assert.equal(post.published, false); assert.equal(post.approval, null);
    assert.equal(post.sources[0].publishedAt, null);
    assert.equal(post.sources[0].checkedAt, today);
    assert.deepEqual(publishedPosts([post]), []);
    assert.ok(renderReview(post).includes('Data non indicata'));
    assert.equal((await importReport(options)).reused, true);
    assert.equal(calls, 1);
    const duplicate = entry(); const r2 = report(); r2.reportId = 'another-report'; duplicate.content = JSON.stringify(r2);
    assert.equal((await importReport({ ...options, entry: duplicate })).status, 'duplicate-sources');
    assert.equal(calls, 1);
    const changed = entry(); const r = report(); r.summary = 'Changed'; changed.content = JSON.stringify(r);
    await assert.rejects(importReport({ ...options, entry: changed }), /changed/i);
    await writeFile(first.draftFile, '{}');
    await assert.rejects(importReport(options), /integrity/i);
  } finally { await rm(stateDir, { recursive: true }); }
});

test('unretrievable sources and lock collisions stop before inference', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'editorial-inbox-fail-'));
  try {
    const options = { stateDir, entry: entry(), allowPilot: true,
      fetcher: async () => new Response('Denied', { status: 403 }),
      complete: () => { throw new Error('must not call model'); } };
    await assert.rejects(importReport(options), /No source could be retrieved/);
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(stateDir, 'run.lock'));
    await assert.rejects(importReport(options), /locked/);
  } finally { await rm(stateDir, { recursive: true }); }
});

test('unknown source publication dates stay distinct from missing or invalid dates', () => {
  const post = structuredClone(example);
  post.sources[0].publishedAt = null;
  assert.equal(validatePost(post).sources[0].publishedAt, null);
  delete post.sources[0].publishedAt;
  assert.throws(() => validatePost(post), /source dates/);
  post.sources[0].publishedAt = '2026-02-30';
  assert.throws(() => validatePost(post), /source dates/);
});
