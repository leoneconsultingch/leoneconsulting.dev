import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

/** Localized field: either a plain string (identical in it/en) or {it, en} non-empty strings. */
function assertLocalized(value, where) {
  if (typeof value === 'string') {
    assert.ok(value.trim().length > 0, `${where}: empty string`);
    return;
  }
  assert.ok(
    value && typeof value === 'object' && !Array.isArray(value),
    `${where}: localized field must be string or {it, en} object, got ${JSON.stringify(value).slice(0, 80)}`
  );
  for (const lang of ['it', 'en']) {
    assert.ok(
      typeof value[lang] === 'string' && value[lang].trim().length > 0,
      `${where}: missing non-empty "${lang}" (got ${JSON.stringify(value[lang])})`
    );
  }
}

function assertStringArray(arr, where) {
  assert.ok(Array.isArray(arr), `${where}: must be an array, got ${JSON.stringify(arr).slice(0, 80)}`);
  for (const [i, item] of arr.entries()) {
    assert.ok(typeof item === 'string' && item.trim().length > 0, `${where}[${i}]: non-empty string required`);
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

test('cv.json: top-level shape and localized fields', async () => {
  const cv = JSON.parse(await readFile(path.join(ROOT, 'company/cv.json'), 'utf8'));

  assert.ok(DATE_RE.test(cv.updated), `cv.updated must be YYYY-MM-DD, got ${cv.updated}`);
  assert.ok(typeof cv.name === 'string' && cv.name.length > 0, 'cv.name');
  assertLocalized(cv.role, 'cv.role');
  assertLocalized(cv.summary, 'cv.summary');

  assert.ok(Array.isArray(cv.stats) && cv.stats.length > 0, 'cv.stats: non-empty array');
  for (const [i, s] of cv.stats.entries()) {
    assert.ok(typeof s.value === 'string' && s.value.length > 0, `cv.stats[${i}].value`);
    assertLocalized(s.label, `cv.stats[${i}].label`);
  }

  assert.ok(Array.isArray(cv.projects), 'cv.projects: array');
  for (const [i, p] of cv.projects.entries()) {
    const where = `cv.projects[${i}]`;
    assertLocalized(p.name, `${where}.name`);
    assertLocalized(p.description, `${where}.description`);
    assertStringArray(p.tags, `${where}.tags`);
    if ('url' in p) assert.ok(typeof p.url === 'string' && p.url.length > 0, `${where}.url`);
  }

  assert.ok(Array.isArray(cv.experience), 'cv.experience: array');
  for (const [i, e] of cv.experience.entries()) {
    const where = `cv.experience[${i}]`;
    assertLocalized(e.role, `${where}.role`);
    assert.ok(typeof e.org === 'string' && e.org.length > 0, `${where}.org`);
    if (e.url !== undefined) assert.ok(typeof e.url === 'string', `${where}.url`);
    if (e.highlights !== undefined) {
      for (const [j, h] of e.highlights.entries()) assertLocalized(h, `${where}.highlights[${j}]`);
    }
  }

  assert.ok(Array.isArray(cv.languages), 'cv.languages: array');
  for (const [i, l] of cv.languages.entries()) {
    assertLocalized(l.name, `cv.languages[${i}].name`);
    assertLocalized(l.level, `cv.languages[${i}].level`);
  }
});

test('case studies: full schema for published, light check for drafts', async () => {
  const dir = path.join(ROOT, 'company/case-studies');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json') && f !== 'template.json');
  assert.ok(files.length >= 2, 'case studies: at least it+en expected');

  for (const file of files) {
    const where = `case-studies/${file}`;
    const cs = JSON.parse(await readFile(path.join(dir, file), 'utf8'));

    // --- checks that always apply (any state) ---
    assert.ok(typeof cs.slug === 'string' && cs.slug.length > 0, `${where}: slug`);
    assert.equal(typeof cs.published, 'boolean', `${where}: published must be boolean`);
    const expectedLang = file.endsWith('.en.json') ? 'en' : 'it';
    if (cs.metadata?.language !== undefined) {
      assert.equal(cs.metadata.language, expectedLang, `${where}: metadata.language must match filename (${expectedLang})`);
    }

    // --- full schema gate: enforced only when the case study is published ---
    if (!cs.published) continue;

    assert.ok(typeof cs.title === 'string' && cs.title.length > 0, `${where}: title`);
    assert.ok(typeof cs.client === 'string' && cs.client.length > 0, `${where}: client`);
    assert.ok(typeof cs.sector === 'string' && cs.sector.length > 0, `${where}: sector`);

    // problem
    assert.ok(typeof cs.problem?.description === 'string' && cs.problem.description.length > 0, `${where}: problem.description`);
    assertStringArray(cs.problem?.painPoints, `${where}: problem.painPoints`);

    // constraints
    assert.ok(typeof cs.constraints?.timeline === 'string', `${where}: constraints.timeline`);
    assert.ok(typeof cs.constraints?.budget === 'string', `${where}: constraints.budget`);
    assertStringArray(cs.constraints?.technical, `${where}: constraints.technical`);
    if (cs.constraints.compliance !== undefined) {
      assertStringArray(cs.constraints.compliance, `${where}: constraints.compliance`);
    }

    // solution
    assert.ok(typeof cs.solution?.architecture === 'string' && cs.solution.architecture.length > 0, `${where}: solution.architecture`);
    assertStringArray(cs.solution?.keyDecisions, `${where}: solution.keyDecisions`);
    assert.ok(typeof cs.solution?.approach === 'string' && cs.solution.approach.length > 0, `${where}: solution.approach`);

    // results
    assert.ok(Array.isArray(cs.results?.metrics), `${where}: results.metrics`);
    for (const [i, m] of cs.results.metrics.entries()) {
      const w = `${where}: results.metrics[${i}]`;
      assert.ok(typeof m.label === 'string' && m.label.length > 0, `${w}.label`);
      assert.ok(typeof m.value === 'string' && m.value.length > 0, `${w}.value`);
      assert.equal(typeof m.isProxy, 'boolean', `${w}.isProxy`);
      if (m.description !== undefined) assert.ok(typeof m.description === 'string', `${w}.description`);
    }
    assert.ok(typeof cs.results?.impact === 'string' && cs.results.impact.length > 0, `${where}: results.impact`);

    // tech
    assertStringArray(cs.tech?.stack, `${where}: tech.stack`);
    assertStringArray(cs.tech?.tools, `${where}: tech.tools`);

    // role
    assertStringArray(cs.role, `${where}: role`);

    // code (optional) — the field rendered as "Codice Essenziale"
    if (cs.code !== undefined) {
      assert.ok(Array.isArray(cs.code) && cs.code.length > 0, `${where}: code must be a non-empty array when present`);
      for (const [i, block] of cs.code.entries()) {
        const w = `${where}: code[${i}]`;
        assert.ok(typeof block.language === 'string' && block.language.length > 0, `${w}.language`);
        assert.ok(typeof block.caption === 'string' && block.caption.length > 0, `${w}.caption`);
        assert.ok(typeof block.snippet === 'string' && block.snippet.trim().length > 0, `${w}.snippet`);
      }
    }

    // metadata
    assert.ok(typeof cs.metadata?.duration === 'string', `${where}: metadata.duration`);
    assert.equal(typeof cs.metadata?.year, 'number', `${where}: metadata.year`);
    assert.equal(cs.metadata?.language, expectedLang, `${where}: metadata.language required and must match filename`);

    // links (optional)
    if (cs.links !== undefined) {
      assert.ok(typeof cs.links === 'object' && !Array.isArray(cs.links), `${where}: links must be an object`);
      if (cs.links.screenshots !== undefined) assertStringArray(cs.links.screenshots, `${where}: links.screenshots`);
      if (cs.links.repository !== undefined) assert.ok(typeof cs.links.repository === 'string', `${where}: links.repository`);
    }
  }
});

test('case studies: it/en pairing (no orphan translations among published)', async () => {
  const dir = path.join(ROOT, 'company/case-studies');
  const files = new Set((await readdir(dir)).filter((f) => f.endsWith('.json')));
  for (const file of files) {
    if (file === 'template.json' || file.endsWith('.en.json')) continue;
    const cs = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
    if (!cs.published) continue; // unpublished drafts may miss the translation
    assert.ok(
      files.has(file.replace(/\.json$/, '.en.json')),
      `case-studies/${file} is published but has no English counterpart (.en.json)`
    );
  }
});
