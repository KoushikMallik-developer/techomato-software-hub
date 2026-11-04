// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { metaFor, headHtml } from './src/lib/seo.js';
import seo from './vite-seo.js';

test('software page gets its own canonical and structured data', () => {
  const m = metaFor('/software/docs');
  assert.equal(m.canonical, 'https://softwares.techomato.com/software/docs');
  assert.equal(m.jsonLd[0]['@type'], 'SoftwareApplication');
});

test('app page points at the software page', () => {
  assert.equal(metaFor('/app/docs').canonical, metaFor('/software/docs').canonical);
});

test('unknown paths are noindex', () => {
  assert.equal(metaFor('/nope').robots, 'noindex');
  assert.equal(metaFor('/app/colleges').robots, 'noindex');
});

test('quotes and < in text cannot break the tags', () => {
  const html = headHtml({ ...metaFor('/'), title: 'A "b" <c>' });
  assert.ok(html.includes('A &quot;b&quot; &lt;c>'));
});

test('build plugin gives every page exactly one noscript block and a sitemap', () => {
  const html = '<head><!--seo--><!--/seo--></head><body><div id="root"></div></body>';
  const emitted = {};
  const ctx = { emitFile: (f) => { emitted[f.fileName] = f.source; } };
  const bundle = { 'index.html': { source: html } };
  seo().generateBundle.call(ctx, {}, bundle);
  const pages = Object.entries(emitted).filter(([n]) => n.endsWith('index.html'));
  assert.ok(pages.length > 0);
  for (const [, src] of pages) assert.equal(src.split('<noscript>').length - 1, 1);
  assert.equal(bundle['index.html'].source.split('<noscript>').length - 1, 1);
  assert.ok(emitted['sitemap.xml'].includes('<urlset'));
});
