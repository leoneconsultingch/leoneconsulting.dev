import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getPortfolioItem, listPortfolio, serializeResult } from '../mcp/leone/catalog.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'leone-mcp-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'sample.json'), JSON.stringify({
    slug: 'sample',
    title: 'Portfolio demo',
    sector: 'Software',
    published: true,
    client: 'Do not expose this',
    constraints: { budget: 'Do not expose this' },
    problem: { description: 'A published challenge', painPoints: ['Manual process'] },
    solution: { architecture: 'Public architecture', approach: 'Iterative delivery' },
    results: { impact: 'Public outcome', metrics: [{ label: 'Coverage', value: '90%', isProxy: false }] },
    tech: { stack: ['Node.js'], tools: ['MCP'] },
    role: ['Architecture'],
    metadata: { language: 'it' },
  }));
  await writeFile(path.join(directory, 'sample.en.json'), JSON.stringify({
    slug: 'sample',
    title: 'Portfolio demo',
    sector: 'Software',
    published: true,
    problem: { description: 'A published challenge', painPoints: ['Manual process'] },
    solution: { architecture: 'Public architecture', approach: 'Iterative delivery' },
    results: { impact: 'Public outcome', metrics: [] },
    tech: { stack: ['Node.js'], tools: ['MCP'] },
    role: ['Architecture'],
    metadata: { language: 'en' },
  }));
  await writeFile(path.join(directory, 'draft.json'), JSON.stringify({ slug: 'draft', published: false }));
  await writeFile(path.join(directory, 'template.json'), JSON.stringify({ slug: 'template', published: true }));
  return directory;
}

test('portfolio list exposes only published entries in requested language', async (t) => {
  const directory = await fixture(t);
  assert.deepEqual(await listPortfolio(directory, { language: 'it' }), [{
    slug: 'sample',
    language: 'it',
    title: 'Portfolio demo',
    sector: 'Software',
    summary: 'A published challenge',
    impact: 'Public outcome',
    url: 'https://leoneconsulting.dev/portfolio/sample/',
  }]);
  assert.equal((await listPortfolio(directory, { language: 'en' }))[0].url,
    'https://leoneconsulting.dev/en/portfolio/sample/');
});

test('portfolio detail omits internal and commercial fields', async (t) => {
  const directory = await fixture(t);
  const item = await getPortfolioItem(directory, { language: 'it', slug: 'sample' });
  assert.equal(item.solution.architecture, 'Public architecture');
  assert.equal('client' in item, false);
  assert.equal('constraints' in item, false);
  assert.equal(JSON.stringify(item).includes('Do not expose'), false);
});

test('drafts and invalid slugs are not readable', async (t) => {
  const directory = await fixture(t);
  await assert.rejects(getPortfolioItem(directory, { language: 'it', slug: 'draft' }), { code: 'NOT_FOUND' });
  await assert.rejects(getPortfolioItem(directory, { language: 'it', slug: '../sample' }), { code: 'INVALID_ARGUMENT' });
});

test('result and list bounds reject oversized requests', async (t) => {
  const directory = await fixture(t);
  await assert.rejects(listPortfolio(directory, { language: 'it', limit: 51 }), { code: 'INVALID_ARGUMENT' });
  assert.throws(() => serializeResult({ large: 'x'.repeat(256 * 1024) }), { code: 'RESULT_LIMIT' });
});

test('case study source symlinks are rejected', async (t) => {
  const directory = await fixture(t);
  const target = path.join(directory, 'sample.json');
  await rm(target);
  const elsewhere = path.join(directory, 'outside.json');
  await writeFile(elsewhere, JSON.stringify({}));
  await symlink(elsewhere, target);
  await assert.rejects(getPortfolioItem(directory, { language: 'it', slug: 'sample' }), { code: 'SOURCE_UNAVAILABLE' });
});
