import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { validateGuide, publicGuides } from '../src/lib/guides.ts';
import { validatePlatformConfig } from '../src/lib/platform.ts';

const localized = text => ({ it: text, en: text });
const fixture = (overrides = {}) => ({
  schemaVersion: 1, brandId: 'leone-consulting', slug: 'test-guide',
  title: localized('Workflow'), summary: localized('A practical checklist.'),
  category: localized('Automation'), level: 'introductory', readingMinutes: 5,
  access: 'FREE', published: true, publishedAt: '2026-11-02', updatedAt: '2026-11-02',
  prerequisites: { it: ['Un processo'], en: ['A process'] },
  outcomes: { it: ['Una checklist'], en: ['A checklist'] },
  sections: [{ id: 'scope', heading: localized('Scope'), paragraphs: { it: ['Definisci input e output.'], en: ['Define inputs and outputs.'] }, steps: { it: [], en: [] } }],
  productIds: [], affiliateLinkIds: [], ...overrides,
});
const config = JSON.parse(await readFile(new URL('../company/platform.json', import.meta.url), 'utf8'));

test('only current, published FREE guides for the requested brand reach public routes', () => {
  const result = publicGuides([
    fixture(), fixture({ slug: 'draft', published: false, publishedAt: null }),
    fixture({ slug: 'future', publishedAt: '2026-12-01', updatedAt: '2026-12-01' }),
    fixture({ slug: 'premium', access: 'PRO', sections: [] }),
    fixture({ slug: 'business', access: 'BUSINESS', sections: [] }),
    fixture({ slug: 'other-brand', brandId: 'tutoring-on-video' }),
  ], 'leone-consulting', '2026-11-02');
  assert.deepEqual(result.map(guide => guide.slug), ['test-guide']);
  assert.deepEqual(publicGuides([fixture()], 'tutoring-on-video', '2026-11-02'), []);
});

test('premium bodies are refused in the public editorial repository', () => {
  for (const access of ['PRO', 'BUSINESS']) {
    assert.throws(() => validateGuide(fixture({ access })), /premium body/);
  }
});

test('invalid editorial metadata fails closed instead of silently publishing', () => {
  for (const overrides of [
    { slug: '../private' }, { access: 'ADMIN' }, { access: ['FREE'] }, { level: ['introductory'] }, { brandId: '' },
    { title: { it: 'Solo italiano' } }, { prerequisites: { it: [], en: null } },
    { published: 'false' }, { publishedAt: null }, { updatedAt: '2026-02-30' },
    { updatedAt: '2026-11-01' }, { readingMinutes: 0 }, { readingMinutes: 1.5 },
    { sections: [] }, { affiliateLinkIds: ['https://unapproved.example'] },
    { productIds: ['../secret.pdf'] }, { downloadUrl: '/private.zip' },
    { productIds: ['unapproved-product'] }, { affiliateLinkIds: ['unapproved-partnership'] },
  ]) assert.throws(() => validateGuide(fixture(overrides)), /Guide:/);
  const duplicate = fixture(); duplicate.sections.push(structuredClone(duplicate.sections[0]));
  assert.throws(() => validateGuide(duplicate), /section/);
  const malformed = fixture(); malformed.sections[0].paragraphs.en = [];
  assert.throws(() => validateGuide(malformed), /paragraph/);
});

test('duplicate slugs within a brand fail and ordering is stable', () => {
  assert.throws(() => publicGuides([fixture(), fixture()], 'leone-consulting'), /duplicate/);
  const other = fixture({ brandId: 'other-brand' });
  assert.equal(publicGuides([fixture(), other], 'leone-consulting', '2026-11-02').length, 1);
  assert.deepEqual(publicGuides([fixture({ slug: 'z-guide' }), fixture({ slug: 'a-guide' })], 'leone-consulting', '2026-11-02').map(g => g.slug), ['a-guide', 'z-guide']);
});

test('phase one cannot enable an unimplemented commercial channel through config', () => {
  validatePlatformConfig(config);
  for (const flag of ['subscriptions', 'products', 'externalAffiliates', 'referrals', 'admin', 'ads', 'clickTracking']) {
    const changed = structuredClone(config); changed.features[flag] = true;
    assert.throws(() => validatePlatformConfig(changed), /not implemented/);
  }
  for (const change of [
    c => { c.features.subscriptions = 'false'; },
    c => { c.features.unknown = true; },
    c => { delete c.features.ads; },
    c => { c.plans.pop(); },
    c => { c.plans[1].monthly = { amountMinor: 1000, currency: 'CHF' }; },
    c => { c.products.push({ id: 'fake-product' }); },
    c => { c.brandId = ''; },
    c => { c.unknown = true; },
    c => { c.plans[0].unknown = true; },
  ]) {
    const changed = structuredClone(config); change(changed);
    assert.throws(() => validatePlatformConfig(changed), /Platform:/);
  }
});

test('all committed guide JSON follows the public editorial contract', async () => {
  const directory = new URL('../company/guides/', import.meta.url);
  const guides = await Promise.all((await readdir(directory)).filter(name => name.endsWith('.json')).map(async name => {
    const guide = validateGuide(JSON.parse(await readFile(new URL(name, directory), 'utf8')));
    assert.equal(`${guide.slug}.json`, name);
    return guide;
  }));
  assert.ok(guides.length > 0);
  publicGuides(guides, config.brandId);
});
