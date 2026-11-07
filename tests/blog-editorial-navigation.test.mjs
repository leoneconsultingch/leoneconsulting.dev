import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { contentDigest, publishedPosts } from '../src/lib/blog.ts';
import { validateCatalog, metadataFor, sectionUrl, relatedPosts, readingMinutes, catalog } from '../src/lib/blog-editorial.ts';

const posts = await Promise.all((await readdir(new URL('../company/blog/', import.meta.url))).filter(name => name.endsWith('.json')).map(async name => JSON.parse(await readFile(new URL(`../company/blog/${name}`, import.meta.url)))));

test('catalog is validated and unknown entries stay neutral', () => {
  assert.deepEqual(validateCatalog(catalog), catalog);
  assert.equal(metadataFor('unknown-new-article'), null);
  assert.throws(() => validateCatalog({ version: 1, posts: { example: { section: 'unknown', topics: [], format: 'guide', level: 'introductory' } } }));
  assert.throws(() => validateCatalog({ version: 1, posts: { example: { section: 'methods', topics: ['ai'], format: 'unknown', level: 'introductory' } } }));
  assert.equal(metadataFor('ai-pmi-calcolare-roi').section, 'applications');
  assert.equal(metadataFor('frontiere-transformer-ricerca-nuovi-modelli').section, 'research');
});

test('classification and related lookup preserve signed input and exclude drafts', () => {
  const before = structuredClone(posts);
  const hashes = posts.map(contentDigest);
  const published = publishedPosts(posts, '9999-12-31');
  const target = published.find(post => metadataFor(post.slug)?.section === 'methods');
  assert.ok(target);
  const related = relatedPosts(target, posts, '9999-12-31');
  assert.ok(related.every(post => post.published && metadataFor(post.slug)?.section === 'methods'));
  assert.ok(!related.some(post => post.slug === 'computer-use-pilot'));
  assert.deepEqual(posts, before);
  assert.deepEqual(posts.map(contentDigest), hashes);
  assert.ok(readingMinutes(target, 'it') >= 1);
  const unknown = { ...target, slug: 'unknown-new-article' };
  assert.deepEqual(relatedPosts(unknown, posts, '9999-12-31'), []);
});

test('bilingual section routes use matching stable IDs', () => {
  for (const id of ['research', 'methods', 'applications', 'archive']) {
    assert.equal(sectionUrl(id, 'en'), `/en${sectionUrl(id, 'it')}`);
  }
});

test('filters compose and unknown articles remain visible with no filters', async () => {
  const { matchesEditorialFilters } = await import('../src/lib/blog-filter.ts');
  const meta = { topics: ['data', 'ai'], level: 'intermediate' };
  assert.equal(matchesEditorialFilters(meta, 'data', 'intermediate'), true);
  assert.equal(matchesEditorialFilters(meta, 'data', 'advanced'), false);
  assert.equal(matchesEditorialFilters(meta, 'physics', 'intermediate'), false);
  assert.equal(matchesEditorialFilters(null, '', ''), true);
  assert.equal(matchesEditorialFilters(null, 'ai', ''), false);
  assert.equal(matchesEditorialFilters(null, '', 'intermediate'), false);
});

test('catalog rejects coercion, unknown fields and unlabelled topics', () => {
  const entry = { section: 'methods', topics: ['data'], format: 'analysis', level: 'intermediate' };
  for (const invalid of [
    { ...entry, format: ['analysis'] }, { ...entry, level: ['intermediate'] },
    { ...entry, topics: ['unknown-topic'] }, { ...entry, typo: true },
  ]) assert.throws(() => validateCatalog({ version: 1, posts: { example: invalid } }));
  assert.throws(() => validateCatalog({ version: 1, posts: {}, extra: true }));
});

test('every catalog topic has nonempty IT and EN labels', async () => {
  const { topicLabels } = await import('../src/lib/blog-editorial.ts');
  for (const meta of Object.values(catalog.posts)) for (const topic of meta.topics) {
    assert.ok(topicLabels[topic]?.it && topicLabels[topic]?.en);
  }
});
