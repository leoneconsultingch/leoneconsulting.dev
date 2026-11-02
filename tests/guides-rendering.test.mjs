import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

// Run after a clean build with GUIDE_BUILD_DIR=<copy>/.vercel/output/static.
const root = process.env.GUIDE_BUILD_DIR;
test('built bilingual guide pages expose navigation, complete content and language alternates', { skip: !root && 'Requires GUIDE_BUILD_DIR from the clean build' }, async () => {
  for (const [prefix, language, heading] of [['', 'it', 'Guide pratiche'], ['en/', 'en', 'Practical guides']]) {
    const index = await readFile(join(root, prefix, 'guide/index.html'), 'utf8');
    const detail = await readFile(join(root, prefix, 'guide/preparare-un-automazione/index.html'), 'utf8');
    assert.match(index, new RegExp(`<html lang="${language}"`));
    assert.ok(index.includes(heading));
    assert.ok(index.includes(`href="/${prefix}guide/preparare-un-automazione"`));
    assert.ok(detail.includes('id="verification"'));
    assert.ok(detail.includes('href="#verification"'));
    assert.match(detail, /hreflang="it-IT"/);
    assert.match(detail, /hreflang="en-US"/);
    assert.match(detail, /href="\/guide\/preparare-un-automazione\/?"/);
    assert.match(detail, /href="\/en\/guide\/preparare-un-automazione\/?"/);
    assert.ok(!index.includes('href="/pricing"') && !detail.includes('stripe.com'));
    assert.ok(!detail.includes('data-affiliate') && !detail.includes('checkout'));
  }
});

test('security build omits draft, premium and other-brand routes and escapes editorial HTML', { skip: !(root && process.env.GUIDE_SECURITY_FIXTURES) && 'Requires injected fixtures in the isolated build' }, async () => {
  for (const prefix of ['', 'en/']) {
    for (const slug of ['draft-security-fixture', 'premium-security-fixture', 'other-brand-security-fixture', 'future-security-fixture']) {
      await assert.rejects(readFile(join(root, prefix, 'guide', slug, 'index.html')), { code: 'ENOENT' });
    }
    const html = await readFile(join(root, prefix, 'guide/render-safety-fixture/index.html'), 'utf8');
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
    assert.ok(main?.includes('&lt;img'));
    assert.ok(!main.includes('<img src=x onerror='));
    assert.ok(!main.includes('<script>window.GUIDE_XSS'));
    // Metadata attributes may legally contain '<'; injected quotes must remain escaped.
    assert.ok(html.includes('onerror=&quot;window.GUIDE_XSS=true&quot;'));
    for (const [, script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
      assert.ok(!script.includes('<img src=x') && !script.includes('<script>window.GUIDE_XSS'));
    }
  }
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await inspect(path);
      else if (/\.(html|js|json|xml)$/.test(entry.name)) {
        const content = await readFile(path, 'utf8');
        assert.ok(!content.includes('GUIDE_PRIVATE_SENTINEL'), `Non-public metadata leaked into ${path}`);
      }
    }
  }
  await inspect(root);
});
