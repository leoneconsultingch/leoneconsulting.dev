import { readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { validatePost } from '../../src/lib/blog.ts';

export function deliveryPayload(post, id) {
  validatePost(post);
  if (post.published !== false || post.approval !== null || post.publishedAt !== null) throw new Error('Only unpublished, unapproved drafts may be delivered');
  if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(id)) throw new Error('Invalid delivery ID');
  return {delivery_id: id, origin: 'local-runner', title: post.title.it,
    italian: post.sections.flatMap(section => section.paragraphs.it).join('\n\n'),
    english: post.sections.flatMap(section => section.paragraphs.en).join('\n\n'),
    sources: post.sources.map(source => source.url), post};
}

async function receipt(runDir, value) {
  const file = join(runDir, 'delivery.json');
  await writeFile(`${file}.tmp`, JSON.stringify(value, null, 2) + '\n', {mode: 0o600});
  await rename(`${file}.tmp`, file);
}

export async function deliverDraft({post, id, runDir, fetcher = fetch,
  endpoint = process.env.EDITORIAL_MC_URL || 'http://127.0.0.1:18000'}) {
  const payload = deliveryPayload(post, id);
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Local MissionControl endpoint required');
  const pending = {delivery_id: id, draftFile: `${post.slug}.json`, status: 'pending', published: false};
  await receipt(runDir, pending);
  try {
    const response = await fetcher(`${url.origin}/api/editorial/deliver`, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: {'Content-Type': 'application/json', MISSIONCONTROL_AGENT: 'codex'},
      body: JSON.stringify(payload)});
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Editorial delivery HTTP ${response.status}`); }
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    try {
      for (;;) {
        const {done, value} = await reader.read(); if (done) break;
        size += value.length;
        if (size > 4096) throw new Error('Editorial delivery receipt exceeds limit');
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); }
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (typeof result.id !== 'string' || !result.id || result.delivery_id !== id
        || !Number.isInteger(result.version) || result.version < 1
        || !['pending', 'changes-requested', 'approved', 'rejected', 'superseded'].includes(result.status)) throw new Error('Invalid editorial delivery receipt');
    await receipt(runDir, {...pending, status: 'delivered', item_id: result.id, item_status: result.status});
    return result;
  } catch (error) {
    await receipt(runDir, {...pending, status: 'failed', error: 'Delivery not confirmed; retry the same saved draft and delivery ID.'});
    throw new Error(`Editorial queue delivery failed (${error instanceof Error && /^Editorial delivery HTTP \d+$/.test(error.message) ? error.message : 'transport or receipt unavailable'}); saved draft retained for retry`);
  }
}

export async function retryPendingDeliveries(stateDir, options = {}) {
  const recovered = [];
  for (const name of (await readdir(stateDir)).sort()) {
    if (!/^\d{4}-\d{2}-\d{2}-[a-f0-9]{8}$/.test(name)) continue;
    const runDir = join(stateDir, name);
    let saved;
    try { saved = JSON.parse(await readFile(join(runDir, 'delivery.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!['pending', 'failed'].includes(saved.status)
        && !(saved.status === 'delivered' && saved.history_recorded !== true)) continue;
    if (saved.delivery_id !== name || typeof saved.draftFile !== 'string'
        || basename(saved.draftFile) !== saved.draftFile || !/^[a-z0-9-]+\.json$/.test(saved.draftFile)) throw new Error('Invalid saved editorial delivery');
    const post = JSON.parse(await readFile(join(runDir, saved.draftFile), 'utf8'));
    const item = await deliverDraft({...options, post, id: name, runDir});
    recovered.push({item, post, runDir});
  }
  return recovered;
}

export async function markHistoryRecorded(runDir) {
  const saved = JSON.parse(await readFile(join(runDir, 'delivery.json'), 'utf8'));
  if (saved.status !== 'delivered') throw new Error('Delivery is not confirmed');
  await receipt(runDir, {...saved, history_recorded: true});
}
