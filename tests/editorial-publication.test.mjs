import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare, submit, inspect, preflight, branchRules, github, runtimeAuthority, digest} from '../scripts/editorial/publish.mjs';
import {contentDigest} from '../src/lib/blog.ts';

const example = JSON.parse(await readFile(new URL('../company/blog/computer-use-pilot.json', import.meta.url)));
const SHA = 'a'.repeat(40);
const withProject = handler => async (path, options) => {
  if (path.endsWith('/status')) return {statuses: [{context: 'Vercel', state: 'success', target_url: 'https://vercel.com/marios-projects-b9ce4d5f/leoneconsulting-dev/deployment'}]};
  return handler(path, options);
};
const withRules = handler => async (path, options) => {
  if (path.endsWith('/commits/main/status')) return {statuses: [{context: 'Vercel', state: 'success', target_url: 'https://vercel.com/marios-projects-b9ce4d5f/leoneconsulting-dev/deployment'}]};
  if (path.endsWith('/rules/branches/main')) return [];
  if (path.endsWith('/branches/main')) return {protected: false};
  return handler(path, options);
};
function job() {
  const post = {...structuredClone(example), published: false, publishedAt: null, approval: null};
  const item_id = '11111111-1111-1111-1111-111111111111';
  const content_digest = digest(post); const version = 2;
  return {post, item_id, content_digest, version, authorization: 'approve-publish',
    approval: {by: 'Mario Leone', version, digest: content_digest, at: '2026-11-01T12:00:00+00:00'},
    id: createHash('sha256').update(`${item_id}:${version}:${content_digest}`).digest('hex')};
}
const missing = () => {const e = new Error('404'); e.notFound = true; throw e;};
const remote = post => ({type: 'file', encoding: 'base64', sha: 'b'.repeat(40), size: 1000,
  content: Buffer.from(JSON.stringify(post)).toString('base64')});

test('publication preserves approved bilingual content and binds website review to final metadata', () => {
  const value = job(); const result = prepare(value);
  assert.deepEqual(result.post.sections, value.post.sections);
  assert.deepEqual(result.post.title, value.post.title);
  assert.equal(result.post.published, true); assert.equal(result.post.publishedAt, '2026-11-01');
  assert.equal(result.post.approval.digest, contentDigest(result.post));
  assert.equal(result.path, `company/blog/${value.post.slug}.json`);
  assert.equal(result.urls.en, `https://leoneconsulting.dev/en/blog/${value.post.slug}/`);
});

test('missing authority, changed digest and changed version cannot reach publication', () => {
  for (const mutate of [j => {j.authorization = 'approve';}, j => {j.post.title.en += 'tampered';},
    j => {j.version++;}, j => {j.id = 'f'.repeat(64);}, j => {j.approval.by = 'Other';},
    j => {j.post.slug = '../outside';}]) {
    const value = job(); mutate(value); assert.throws(() => prepare(value));
  }
});

test('submit commits exactly one approved article on the pinned repository and branch', async () => {
  const value = job(); const writes = [];
  const api = async (path, options) => {
    assert.ok(path.startsWith('repos/leoneconsultingch/leoneconsulting.dev/'));
    if (!options) return missing();
    writes.push({path, ...options}); return {commit: {sha: SHA}};
  };
  const result = await submit(value, withRules(api));
  assert.equal(result.commit_sha, SHA); assert.equal(writes.length, 1);
  assert.equal(writes[0].method, 'PUT'); assert.equal(writes[0].body.branch, 'main');
  assert.ok(writes[0].path.endsWith(prepare(value).path));
  assert.deepEqual(JSON.parse(Buffer.from(writes[0].body.content, 'base64')), prepare(value).post);
  assert.ok(writes[0].body.message.includes(value.id));
});

test('an unrelated article with the same slug is never overwritten', async () => {
  let writes = 0;
  const result = await submit(job(), async (_path, options) => {
    if (options) {writes++; throw new Error('must not write');}
    return remote({...prepare(job()).post, title: {it: 'Different', en: 'Different'}});
  });
  assert.equal(result.status, 'conflict'); assert.equal(writes, 0);
});

test('an approved update uses the known previous content and GitHub SHA compare-and-swap', async () => {
  const value = job(); const previous = {...prepare(value).post, title: {it: 'Previous', en: 'Previous'}};
  value.previous_document_digest = digest(previous);
  let put;
  const result = await submit(value, withRules(async (_path, options) => {
    if (!options) return remote(previous);
    put = options.body; return {commit: {sha: SHA}};
  }));
  assert.equal(result.status, 'submitted'); assert.equal(put.sha, 'b'.repeat(40));
});

test('replayed publication reuses the existing article commit without another write', async () => {
  const value = job(); let writes = 0;
  const result = await submit(value, async (path, options) => {
    if (options) {writes++; throw new Error('must not write');}
    return path.includes('/commits?') ? [{sha: SHA}] : remote(prepare(value).post);
  });
  assert.equal(result.reused, true); assert.equal(result.commit_sha, SHA); assert.equal(writes, 0);
});

test('uncertain PUT is reconciled with reads only, even when the file remains absent', async () => {
  const value = job(); let writes = 0;
  const api = async (_path, options) => {
    if (!options) return missing();
    writes++; throw new Error('timeout after acceptance unknown');
  };
  assert.equal((await submit(value, withRules(api))).status, 'unknown');
  assert.equal((await submit(value, api, true)).status, 'unknown');
  assert.equal(writes, 1);
});

test('a commit accepted during timeout is discovered without resubmitting', async () => {
  const value = job(); let writes = 0;
  const result = await submit(value, async (path, options) => {
    if (options) {writes++; throw new Error('must not write');}
    return path.includes('/commits?') ? [{sha: SHA}] : remote(prepare(value).post);
  }, true);
  assert.equal(result.commit_sha, SHA); assert.equal(writes, 0);
});

test('deployment confirmation requires the exact commit and Production environment', async () => {
  const value = {...job(), commit_sha: SHA};
  const api = async path => path.endsWith('/statuses') ? [{state: 'success', environment_url: 'https://leoneconsulting-abc.vercel.app'}]
    : [{id: 3, sha: SHA, environment: 'Preview'}, {id: 2, sha: 'b'.repeat(40), environment: 'Production', creator: {login: 'vercel[bot]'}}, {id: 1, sha: SHA, environment: 'Production', creator: {login: 'vercel[bot]'}}];
  assert.equal((await inspect(value, withProject(api))).status, 'deployment-ready');
  assert.equal((await inspect(value, withProject(async () => [{id: 2, sha: SHA, environment: 'Preview'}]))).status, 'verifying');
});

test('build failure is visible and an unsafe deployment URL is refused', async () => {
  const value = {...job(), commit_sha: SHA};
  const api = state => async path => path.endsWith('/statuses') ? [state] : [{id: 1, sha: SHA, environment: 'Production', creator: {login: 'vercel[bot]'}}];
  assert.equal((await inspect(value, withProject(api({state: 'failure'})))).status, 'failed');
  await assert.rejects(inspect(value, withProject(api({state: 'success', environment_url: 'https://evil.example'}))));
});

test('a successfully built commit superseded by a newer deploy still requires public page verification', async () => {
  const value = {...job(), commit_sha: SHA};
  const result = await inspect(value, withProject(async path => path.endsWith('/statuses')
    ? [{state: 'inactive'}, {state: 'success', environment_url: 'https://leoneconsulting-abc.vercel.app'}]
    : [{id: 1, sha: SHA, environment: 'Production', creator: {login: 'vercel[bot]'}}]));
  assert.equal(result.status, 'deployment-ready');
  // The Python worker still verifies the approved IT/EN text at the public domain.
});

test('a success receipt for another Vercel project never confirms this publication', async () => {
  const value = {...job(), commit_sha: SHA};
  const result = await inspect(value, async () => ({statuses: [{context: 'Vercel', state: 'success',
    target_url: 'https://vercel.com/marios-projects-b9ce4d5f/another-project/deployment'}]}));
  assert.equal(result.status, 'verifying');
});

test('worker preflight fails closed without push permission', async () => {
  await assert.rejects(preflight(async () => ({default_branch: 'main', permissions: {push: false}})));
  assert.equal((await preflight(withRules(async () => ({default_branch: 'main', permissions: {push: true}})))).ready, true);
});

test('standalone agent JSON cannot authorize the production publisher write path', () => {
  assert.throws(() => runtimeAuthority()); // No trusted root-owned owner file in the development copy.
  assert.throws(() => github('repos/leoneconsultingch/leoneconsulting.dev/contents/company/blog/sample.json',
    {method: 'PUT', body: {branch: 'main'}}));
  assert.throws(() => github('repos/leoneconsultingch/leoneconsulting.dev/contents/package.json',
    {method: 'PUT', body: {branch: 'main'}}), /outside approved article/);
});

test('protected main allows only ordinary linear commits and never bypasses required checks or reviews', async () => {
  const api = protection => async path => {
    if (path.endsWith('/protection')) return protection;
    if (path.endsWith('/rules/branches/main')) return [];
    return {protected: true};
  };
  await branchRules(api({required_linear_history: {enabled: true}}));
  for (const rules of [{required_pull_request_reviews: {}}, {required_status_checks: {}},
    {required_signatures: {enabled: true}}, {lock_branch: {enabled: true}}, {restrictions: {}}]) {
    await assert.rejects(branchRules(api(rules)), /no bypass/);
  }
  await assert.rejects(branchRules(async path => path.includes('/rules/') ? [{type: 'pull_request'}] : {protected: false}), /no bypass/);
});
