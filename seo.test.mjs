// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { metaFor, headHtml } from './src/lib/seo.js';
import seo from './vite-seo.js';

test('software page gets its own canonical and structured data', () => {
  const m = metaFor('/software/pdf');
  assert.equal(m.canonical, 'https://softwares.techomato.com/software/pdf');
  assert.equal(m.jsonLd[0]['@type'], 'SoftwareApplication');
});

test('app page points at the software page', () => {
  assert.equal(metaFor('/app/pdf').canonical, metaFor('/software/pdf').canonical);
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

test('flowchart SVG cannot be injected through a file\'s colours or positions', async () => {
  // the model measures text with a canvas; fake one so it loads in Node
  globalThis.document = { createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 5 }), font: '' }) }) };
  const { nodeSvg, edgeSvg } = await import('./src/apps/flow/model.js');
  const evil = { id: '1', x: '1" onerror="x', y: 0, w: 100, h: 40, fs: 14, shape: 'process', fill: '"/><image href=x onerror=x>', stroke: 'red', text: 'hi' };
  assert.ok(!/onerror/.test(nodeSvg(evil)));
  assert.ok(!/onerror|script/.test(edgeSvg({ color: '"><script>' }, evil, { ...evil, x: 300 }).svg));
  assert.ok(nodeSvg({ ...evil, x: 10, fill: '#dbeafe' }).includes('fill="#dbeafe"'));
});

test('vault: right password opens the data, wrong password does not', async () => {
  const { createEnvelope, unlockEnvelope } = await import('./src/apps/vault/crypto.js');
  const { env } = await createEnvelope('correct horse', { items: [{ name: 'bank' }] });
  const { payload } = await unlockEnvelope('correct horse', env);
  assert.equal(payload.items[0].name, 'bank');
  await assert.rejects(unlockEnvelope('wrong horse', env));
});

test('money: amounts from bank files keep their sign and format', async () => {
  const { parseAmount } = await import('./src/apps/money/model.js');
  const cases = [['1,234.56', 1234.56], ['1.234,56', 1234.56], ['(45.00)', -45], ['5-', -5], ['-12.5', -12.5], ['$1,000', 1000], ['−5.00', -5]];
  for (const [text, want] of cases) assert.equal(parseAmount(text), want, text);
  assert.ok(Number.isNaN(parseAmount('abc')));
});

test('money: dates that do not exist are rejected', async () => {
  const { parseDateLoose } = await import('./src/apps/money/model.js');
  assert.equal(parseDateLoose('2024-02-29'), '2024-02-29');
  assert.equal(parseDateLoose('2024-02-30'), null);
  assert.equal(parseDateLoose('31/04/2024', true), null);
  assert.equal(parseDateLoose('05/01/2024', true), '2024-01-05');
});

test('money: monthly bills keep their day of the month', async () => {
  const { dueRecurring } = await import('./src/apps/money/model.js');
  const { dates } = dueRecurring({ freq: 'monthly', next: '2024-01-31', anchorDay: 31 }, '2024-06-30');
  assert.deepEqual(dates, ['2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30', '2024-05-31', '2024-06-30']);
});

test('pdf: page ranges', async () => {
  const { parseRanges } = await import('./src/apps/pdf/engine.js');
  assert.deepEqual(parseRanges('1-3,5', 10), [0, 1, 2, 4]);
  assert.deepEqual(parseRanges('5-3', 10), [4, 3, 2]);
  assert.deepEqual(parseRanges('8-', 10), [7, 8, 9]);
  assert.deepEqual(parseRanges('2 - 4', 10), [1, 2, 3]);
  assert.equal(parseRanges('0', 10), null);
  assert.equal(parseRanges('abc', 10), null);
});

test('converter: output size follows rotation, crop and the no-upscale flag', async () => {
  const { outSize } = await import('./src/apps/convert/engine.js');
  assert.deepEqual(outSize(4000, 3000, { rot: 90, mode: 'width', w: 1000 }), { cw: 3000, ch: 4000, tw: 1000, th: 1333 });
  assert.equal(outSize(4000, 3000, { crop: 1, mode: 'original' }).cw, 3000);
  const small = outSize(800, 600, { mode: 'width', w: 2000, noUp: true });
  assert.equal(small.tw, 800);
});

test('vault: TOTP matches the RFC 6238 test value', async () => {
  const { totp } = await import('./src/apps/vault/crypto.js');
  assert.equal(await totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000), '287082');
});

test('vault: a restored file must look like an envelope, with a sane iteration count', async () => {
  const { validEnv, createEnvelope } = await import('./src/apps/vault/crypto.js');
  const { env } = await createEnvelope('pw', { items: [] });
  assert.equal(validEnv(env), true);
  assert.equal(validEnv({ ...env, iter: 4294967295 }), false);
  assert.equal(validEnv({ ...env, ct: undefined }), false);
  assert.equal(validEnv(null), false);
});

test('mind maps: outline text becomes a tree; empty or broken node lists are unusable', async () => {
  const { fromOutline, usableNodes } = await import('./src/apps/mindmap/model.js');
  const m = fromOutline('A\n- B\n  - C\n- D');
  const by = Object.fromEntries(m.nodes.map((n) => [n.t, n]));
  assert.equal(by.C.p, by.B.id);
  assert.equal(by.D.p, by.A.id);
  assert.equal(usableNodes([]), false);
  assert.equal(usableNodes([null]), false);
  assert.equal(usableNodes(m.nodes), true);
});

test('audio: WAV file has a RIFF header and the right size', async () => {
  const { encodeWav } = await import('./src/apps/audio/engine.js');
  const buf = { numberOfChannels: 1, length: 2, sampleRate: 8000, getChannelData: () => new Float32Array([0, 1]) };
  const bytes = new Uint8Array(await encodeWav(buf, 16).arrayBuffer());
  assert.equal(bytes.length, 48);
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'RIFF');
});

test('3d: a scene missing its animation or transforms is rejected, a new scene is accepted', async () => {
  const { validScene, newScene } = await import('./src/apps/threed/scene.js');
  assert.equal(validScene(newScene()), true);
  assert.equal(validScene({ objs: [] }), false);
  assert.equal(validScene({ ...newScene(), objs: [{ pos: [0, 0, 0] }] }), false);
  assert.equal(validScene(null), false);
});

test('3d: OBJ and STL files import, including negative indices and a round trip', async () => {
  const { parseOBJ, parseSTL, toSTL, primitive } = await import('./src/apps/threed/mesh.js');
  const obj = parseOBJ('v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1');
  assert.equal(obj.length, 1);
  assert.equal(obj[0].mesh.f.length, 1);
  assert.equal(parseOBJ('v 1 2\nv 1 0 0\nv 0 1 0\nf 1 2 3')[0].mesh.v.every(Number.isFinite), true);
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const stl = parseSTL(toSTL([{ name: 'c', mesh: primitive('cube'), M: I }]).buffer);
  assert.equal(stl.v.length / 3, 8);
  assert.equal(stl.f.length, 12);
});

test('photo: every pixel-sized filter control named for preview scaling exists', async () => {
  const { FILTERS, PX } = await import('./src/apps/photo/filters.js');
  for (const [kind, keys] of Object.entries(PX)) for (const k of keys) assert.ok(FILTERS[kind].controls.some((c) => c.key === k), `${kind}.${k}`);
  assert.deepEqual(Object.keys(FILTERS).filter((k) => FILTERS[k].slow).sort(), ['median', 'motion', 'oil', 'zoomBlur']);
});

test('photo: curve lookup table is identity for a straight line and never goes down', async () => {
  const { curveLut } = await import('./src/apps/photo/adjust.js');
  const id = curveLut([[0, 0], [255, 255]]);
  assert.ok(id.every((v, i) => v === i));
  const bend = curveLut([[0, 0], [128, 200], [255, 255]]);
  assert.ok(bend.every((v, i) => i === 0 || v >= bend[i - 1]));
  assert.ok(bend[128] > 128);
});

test('motion and audio: projects the drawing code cannot run on are rejected', async () => {
  const { validComp, compDefaults, mkLayer } = await import('./src/apps/motion/engine.js');
  const c = compDefaults();
  assert.equal(validComp({ ...c, layers: [mkLayer('text', c)] }), true);
  assert.equal(validComp({ ...c, layers: [] }), true);
  assert.equal(validComp({ ...c, layers: [{ type: 'text', p: {}, fx: [] }] }), false);
  assert.equal(validComp({ ...c, layers: [{ type: 'solid', p: {} }] }), false);
  assert.equal(validComp({}), false);
  const { validProject } = await import('./src/apps/audio/engine.js');
  const track = { fx: {}, vol: 1, pan: 0, clips: [{ start: 0, dur: 1 }] };
  assert.equal(validProject({ tracks: [track] }), true);
  assert.equal(validProject({ tracks: [{ clips: [] }] }), false);
  assert.equal(validProject({ tracks: [{ ...track, vol: undefined }] }), false);
  assert.equal(validComp({ ...c, layers: [{ ...mkLayer('solid', c), fx: [null] }] }), false);
  assert.equal(validProject({ tracks: [{}] }), false);
  assert.equal(validProject({ tracks: [] }), false);
});

test('motion: the PNG-sequence ZIP has the right checksum and directory', async () => {
  const { makeZip } = await import('./src/apps/motion/engine.js');
  const bytes = new TextEncoder().encode('123456789');
  const v = new DataView(await makeZip([{ name: 'a.txt', data: bytes }]).arrayBuffer());
  assert.equal(v.getUint32(14, true), 0xcbf43926);
  const end = v.byteLength - 22;
  assert.equal(v.getUint16(end + 10, true), 1);
  assert.equal(v.getUint32(end + 16, true), 30 + 5 + 9);
});

test('vercel.json serves each built page for exactly the apps in the catalog', async () => {
  const { readFileSync } = await import('node:fs');
  const { software } = await import('./src/data/software.js');
  const rules = JSON.parse(readFileSync('./vercel.json', 'utf8')).rewrites;
  const ids = (prefix) => rules.find((r) => r.source.startsWith(`/${prefix}/:id(`)).source.match(/\(([^)]*)\)/)[1].split('|').sort();
  assert.deepEqual(ids('software'), software.map((s) => s.id).sort());
  assert.deepEqual(ids('app'), software.filter((s) => s.launch).map((s) => s.id).sort());
});
