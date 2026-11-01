import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deliverDraft, deliveryPayload, retryPendingDeliveries } from '../scripts/editorial/delivery.mjs';
import { run } from '../scripts/editorial/run.mjs';

const example = JSON.parse(await readFile(new URL('../company/blog/computer-use-pilot.json', import.meta.url)));
const draft = () => ({...structuredClone(example), published: false, publishedAt: null, approval: null});
const id = '2026-11-01-6473a5be';
const ack = body => Response.json({id: 'item-1', delivery_id: body.delivery_id, version: 1, status: 'pending'});

test('direct delivery sends full bilingual draft with a stable ID and saves acknowledgement', async () => {
  const runDir = await mkdtemp(join(tmpdir(), 'editorial-delivery-'));
  const bodies = [];
  const fetcher = async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:18000/api/editorial/deliver');
    assert.equal(options.redirect, 'manual');
    const body = JSON.parse(options.body); bodies.push(body); return ack(body);
  };
  try {
    for (let n = 0; n < 2; n++) assert.equal((await deliverDraft({post: draft(), id, runDir, fetcher})).id, 'item-1');
    assert.deepEqual(bodies[0], bodies[1]);
    assert.ok(bodies[0].english && bodies[0].italian);
    assert.equal(bodies[0].post.approval, null);
    assert.equal(JSON.parse(await readFile(join(runDir, 'delivery.json'))).status, 'delivered');
  } finally { await rm(runDir, {recursive: true}); }
});

test('ambiguous outcome, HTTP errors, redirects and invalid acknowledgements remain visible and retryable', async () => {
  const runDir = await mkdtemp(join(tmpdir(), 'editorial-errors-'));
  try {
    for (const fetcher of [async () => { throw new Error('timeout'); },
      async () => new Response('', {status: 409}), async () => new Response('', {status: 302}),
      async () => Response.json({id: 'wrong', delivery_id: 'different'}),
      async () => new Response('x'.repeat(4097))]) {
      await assert.rejects(deliverDraft({post: draft(), id, runDir, fetcher}), /saved draft retained/);
      const saved = JSON.parse(await readFile(join(runDir, 'delivery.json')));
      assert.equal(saved.status, 'failed'); assert.equal(saved.delivery_id, id); assert.ok(saved.error);
    }
  } finally { await rm(runDir, {recursive: true}); }
});

test('failed delivery retries the original saved draft before any collection or inference', async () => {
  const state = await mkdtemp(join(tmpdir(), 'editorial-retry-'));
  const runDir = join(state, id); await mkdir(runDir);
  const post = draft(); await writeFile(join(runDir, `${post.slug}.json`), JSON.stringify(post));
  const originalFetch = globalThis.fetch;
  try {
    await assert.rejects(deliverDraft({post, id, runDir, fetcher: async () => {throw new Error('timeout');}}));
    let calls = 0;
    globalThis.fetch = async (_url, options) => {calls++; return ack(JSON.parse(options.body));};
    const result = await run({stateDir: state, fetcher: async () => {throw new Error('must not collect');},
      complete: async () => {throw new Error('must not infer');}});
    assert.equal(result.status, 'delivery-recovered'); assert.equal(calls, 1);
    assert.deepEqual(JSON.parse(await readFile(join(state, 'history.json'))), post.sources.map(source => source.url));
    assert.deepEqual(await retryPendingDeliveries(state), []);
  } finally {globalThis.fetch = originalFetch; await rm(state, {recursive: true});}
});

test('intake refuses incomplete, published or approved content and nonlocal endpoints', async () => {
  for (const mutate of [p => {delete p.title.en;}, p => {p.published = true;}, p => {p.approval = {by: 'agent'};}]) {
    const post = draft(); mutate(post); assert.throws(() => deliveryPayload(post, id));
  }
  await assert.rejects(deliverDraft({post: draft(), id, runDir: '/unused', endpoint: 'https://evil.example'}), /Local MissionControl/);
});

test('crash after acknowledgement but before history update reuses the same delivery', async () => {
  const state = await mkdtemp(join(tmpdir(), 'editorial-history-recovery-'));
  const runDir = join(state, id); await mkdir(runDir);
  const post = draft(); await writeFile(join(runDir, `${post.slug}.json`), JSON.stringify(post));
  const originalFetch = globalThis.fetch;
  try {
    await deliverDraft({post, id, runDir, fetcher: async (_url, options) => ack(JSON.parse(options.body))});
    let sent;
    globalThis.fetch = async (_url, options) => {sent = JSON.parse(options.body); return ack(sent);};
    const result = await run({stateDir: state, complete: async () => {throw new Error('must not infer');}});
    assert.equal(result.status, 'delivery-recovered'); assert.equal(sent.delivery_id, id);
    assert.equal(JSON.parse(await readFile(join(runDir, 'delivery.json'))).history_recorded, true);
    assert.deepEqual(await retryPendingDeliveries(state), []);
  } finally {globalThis.fetch = originalFetch; await rm(state, {recursive: true});}
});
