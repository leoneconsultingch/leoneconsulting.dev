import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderMathText } from '../src/lib/blog-math.ts';

test('plain prose, prices and HTML remain escaped text', () => {
  assert.equal(renderMathText('CHF 100 & $20 <img src=x onerror="alert(1)">'),
    'CHF 100 &amp; $20 &lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});

test('inline LaTeX renders accessible math between escaped prose', () => {
  const html = renderMathText(String.raw`Con \(x^2 + \frac{1}{2}\) & testo.`);
  assert.match(html, /^Con <span class="katex">/);
  assert.match(html, /<math[^>]+xmlns=/);
  assert.match(html, /application\/x-tex/);
  assert.match(html, / &amp; testo\.$/);
  assert.doesNotMatch(html, /katex-display/);
});

test('both display delimiters render centered math and multiple formulas', () => {
  const html = renderMathText(String.raw`Prima \[\sum_{i=1}^{n} i\] poi $$\frac{n(n+1)}{2}$$.`);
  assert.equal((html.match(/class="katex-display"/g) ?? []).length, 2);
  assert.match(html, /display="block"/);
});

test('invalid math and unclosed delimiters stop rendering', () => {
  for (const text of [String.raw`\(\frac{1}{\)`, String.raw`\[x`, '$$x', String.raw`\(\unknowncommand{x}\)`]) {
    assert.throws(() => renderMathText(text));
  }
});

test('math cannot create links, load images or execute surrounding HTML', () => {
  const html = renderMathText(String.raw`<script>alert(1)</script> \(\href{javascript:alert(1)}{x}\) \(\includegraphics{https://example.com/image.png}\)`);
  assert.doesNotMatch(html, /<script|<img|<a\b|href="javascript:/);
  assert.match(html, /&lt;script&gt;/);
});

test('macros stay local to a formula and expansion is bounded', () => {
  renderMathText(String.raw`\(\gdef\localmacro{x}\localmacro\)`);
  assert.throws(() => renderMathText(String.raw`\(\localmacro\)`));
  assert.throws(() => renderMathText(String.raw`\(\def\loop{\loop}\loop\)`));
});
