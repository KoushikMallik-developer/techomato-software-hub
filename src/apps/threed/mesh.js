/* Polygon mesh toolkit: {v:[x,y,z,...], f:[[i,j,k,...],...]} – primitives, modifiers, edit ops, OBJ/STL */
import { v3, m4, rayTri, clamp } from './math.js';
const P = (m, i) => [m.v[i * 3], m.v[i * 3 + 1], m.v[i * 3 + 2]];
export const nVerts = (m) => m.v.length / 3;
const avg = (pts) => { const s = [0, 0, 0]; for (const p of pts) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; } return [s[0] / pts.length, s[1] / pts.length, s[2] / pts.length]; };
const mk = (verts, faces) => ({ v: verts.flat(), f: faces });

/* ---------- primitives ---------- */
function signedVolume(m) { let s = 0; for (const f of m.f) { const a = P(m, f[0]); for (let i = 1; i < f.length - 1; i++) s += v3.dot(a, v3.cross(P(m, f[i]), P(m, f[i + 1]))); } return s; }
export function fixWinding(m) { return signedVolume(m) < 0 ? { ...m, f: m.f.map((f) => [...f].reverse()) } : m; }
export function primitive(kind, o = {}) {
  const seg = o.seg || 24, rings = o.rings || 12;
  if (kind === 'cube') return mk([[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]);
  if (kind === 'plane') return mk([[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]], [[0, 1, 2, 3]]);
  if (kind === 'grid') { const n = o.n || 8; const v = [], f = []; for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) v.push([(i / n) * 2 - 1, (j / n) * 2 - 1, 0]); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i; f.push([a, a + 1, a + n + 2, a + n + 1]); } return mk(v, f); }
  if (kind === 'circle') { const v = []; for (let i = 0; i < seg; i++) v.push([Math.cos((i / seg) * Math.PI * 2), Math.sin((i / seg) * Math.PI * 2), 0]); return mk(v, [v.map((_, i) => i)]); }
  if (kind === 'uvsphere') { const v = [[0, 0, 1]], f = []; for (let j = 1; j < rings; j++) { const th = (j / rings) * Math.PI; for (let i = 0; i < seg; i++) { const ph = (i / seg) * Math.PI * 2; v.push([Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)]); } } v.push([0, 0, -1]); const last = v.length - 1; const rg = (j, i) => 1 + (j - 1) * seg + (i % seg);
    for (let i = 0; i < seg; i++) f.push([0, rg(1, i), rg(1, i + 1)]); for (let j = 1; j < rings - 1; j++) for (let i = 0; i < seg; i++) f.push([rg(j, i), rg(j + 1, i), rg(j + 1, i + 1), rg(j, i + 1)]); for (let i = 0; i < seg; i++) f.push([last, rg(rings - 1, i + 1), rg(rings - 1, i)]); return fixWinding(mk(v, f)); }
  if (kind === 'icosphere') { const t = (1 + Math.sqrt(5)) / 2; let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((p) => v3.norm(p)); let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (let s = 0; s < (o.sub ?? 2); s++) { const cache = new Map(); const mid = (a, b) => { const k = a < b ? a + '_' + b : b + '_' + a; if (cache.has(k)) return cache.get(k); v.push(v3.norm(v3.lerp(v[a], v[b], 0.5))); cache.set(k, v.length - 1); return v.length - 1; }; const nf = []; for (const [a, b, c] of f) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); } f = nf; } return fixWinding(mk(v, f)); }
  if (kind === 'cylinder' || kind === 'cone') { const v = [], f = []; const cone = kind === 'cone'; for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; v.push([Math.cos(a), Math.sin(a), -1]); } if (cone) { v.push([0, 0, 1]); for (let i = 0; i < seg; i++) f.push([i, (i + 1) % seg, seg]); } else { for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; v.push([Math.cos(a), Math.sin(a), 1]); } for (let i = 0; i < seg; i++) f.push([i, (i + 1) % seg, seg + ((i + 1) % seg), seg + i]); f.push([...Array(seg).keys()].map((i) => seg + i)); } f.push([...Array(seg).keys()].reverse()); return fixWinding(mk(v, f)); }
  if (kind === 'torus') { const R = 1, r = o.minor || 0.35; const a = o.major || 32, b = o.ring || 16; const v = [], f = []; for (let i = 0; i < a; i++) for (let j = 0; j < b; j++) { const u = (i / a) * Math.PI * 2, w = (j / b) * Math.PI * 2; v.push([(R + r * Math.cos(w)) * Math.cos(u), (R + r * Math.cos(w)) * Math.sin(u), r * Math.sin(w)]); } for (let i = 0; i < a; i++) for (let j = 0; j < b; j++) f.push([i * b + j, ((i + 1) % a) * b + j, ((i + 1) % a) * b + ((j + 1) % b), i * b + ((j + 1) % b)]); return fixWinding(mk(v, f)); }
  return primitive('cube');
}
export function scaleMesh(m, s) { return { ...m, v: m.v.map((x) => x * s) }; }

/* ---------- geometry ---------- */
export function faceNormal(m, f) { const n = [0, 0, 0]; for (let i = 0; i < f.length; i++) { const a = P(m, f[i]), b = P(m, f[(i + 1) % f.length]); n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]); } return v3.norm(n); }
export function vertexNormals(m) { const n = new Float64Array(m.v.length); for (const f of m.f) { const fn = faceNormal(m, f); let area = 0; const a = P(m, f[0]); for (let i = 1; i < f.length - 1; i++) area += v3.len(v3.cross(v3.sub(P(m, f[i]), a), v3.sub(P(m, f[i + 1]), a))); area = Math.max(area, 1e-9); for (const i of f) { n[i * 3] += fn[0] * area; n[i * 3 + 1] += fn[1] * area; n[i * 3 + 2] += fn[2] * area; } } for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; } return n; }
export function triangulate(m) { const t = [], of = []; m.f.forEach((f, fi) => { for (let i = 1; i < f.length - 1; i++) { t.push(f[0], f[i], f[i + 1]); of.push(fi); } }); return { tris: t, faceOf: of }; }
export function edgesOf(m) { const map = new Map(); m.f.forEach((f, fi) => { for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length]; const k = a < b ? a * 1e6 + b : b * 1e6 + a; let e = map.get(k); if (!e) { e = { a: Math.min(a, b), b: Math.max(a, b), faces: [] }; map.set(k, e); } e.faces.push(fi); } }); return [...map.values()]; }
export function bounds(m) { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < m.v.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.v[i + k]); hi[k] = Math.max(hi[k], m.v[i + k]); } if (!isFinite(lo[0])) return { lo: [0, 0, 0], hi: [0, 0, 0] }; return { lo, hi }; }
export function geom(m, smooth) { // triangle-expanded buffers for GL
  const { tris, faceOf } = triangulate(m); const n = tris.length; const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), snrm = new Float32Array(n * 3); const vn = vertexNormals(m);
  const key = (i) => `${Math.round(m.v[i * 3] * 1e4)},${Math.round(m.v[i * 3 + 1] * 1e4)},${Math.round(m.v[i * 3 + 2] * 1e4)}`; const acc = new Map(); for (let i = 0; i < m.v.length / 3; i++) { const k = key(i); const a = acc.get(k) || [0, 0, 0]; a[0] += vn[i * 3]; a[1] += vn[i * 3 + 1]; a[2] += vn[i * 3 + 2]; acc.set(k, a); }
  const fns = m.f.map((f) => faceNormal(m, f));
  for (let t = 0; t < n; t++) { const i = tris[t]; pos[t * 3] = m.v[i * 3]; pos[t * 3 + 1] = m.v[i * 3 + 1]; pos[t * 3 + 2] = m.v[i * 3 + 2]; const fn = fns[faceOf[(t / 3) | 0]]; const sn = smooth ? [vn[i * 3], vn[i * 3 + 1], vn[i * 3 + 2]] : fn; nrm[t * 3] = sn[0]; nrm[t * 3 + 1] = sn[1]; nrm[t * 3 + 2] = sn[2]; const a = v3.norm(acc.get(key(i))); snrm[t * 3] = a[0]; snrm[t * 3 + 1] = a[1]; snrm[t * 3 + 2] = a[2]; }
  return { pos, nrm, snrm, count: n, tris, faceOf };
}

/* ---------- modifiers ---------- */
function cc(m) {
  const nv = nVerts(m), nf = m.f.length; const fp = m.f.map((f) => avg(f.map((i) => P(m, i)))); const emap = new Map(); const elist = [];
  m.f.forEach((f, fi) => { for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length]; const k = a < b ? a * 1e6 + b : b * 1e6 + a; let e = emap.get(k); if (!e) { e = { a, b, faces: [], id: elist.length }; emap.set(k, e); elist.push(e); } e.faces.push(fi); } });
  const ep = elist.map((e) => { const A = P(m, e.a), B = P(m, e.b); return e.faces.length === 2 ? avg([A, B, fp[e.faces[0]], fp[e.faces[1]]]) : avg([A, B]); });
  const vfaces = Array.from({ length: nv }, () => []), vedges = Array.from({ length: nv }, () => []); m.f.forEach((f, fi) => f.forEach((i) => vfaces[i].push(fi))); elist.forEach((e) => { vedges[e.a].push(e); vedges[e.b].push(e); });
  const out = []; for (let i = 0; i < nv; i++) { const p = P(m, i); const es = vedges[i]; if (!es.length) { out.push(p); continue; } const bnd = es.filter((e) => e.faces.length < 2); if (bnd.length >= 2) { const o = bnd.map((e) => P(m, e.a === i ? e.b : e.a)); out.push(v3.mul(v3.add(v3.mul(p, 6), v3.add(o[0], o[1])), 1 / 8)); } else { const n = es.length; const F = avg(vfaces[i].map((fi) => fp[fi])); const R = avg(es.map((e) => avg([P(m, e.a), P(m, e.b)]))); out.push(v3.mul(v3.add(v3.add(F, v3.mul(R, 2)), v3.mul(p, n - 3)), 1 / n)); } }
  for (const p of fp) out.push(p); for (const p of ep) out.push(p); const edge = (a, b) => nv + nf + emap.get(a < b ? a * 1e6 + b : b * 1e6 + a).id; const faces = [];
  m.f.forEach((f, fi) => { for (let i = 0; i < f.length; i++) faces.push([f[i], edge(f[i], f[(i + 1) % f.length]), nv + fi, edge(f[(i + f.length - 1) % f.length], f[i])]); });
  return mk(out, faces);
}
export const subsurf = (m, lv) => { let r = m; for (let i = 0; i < lv; i++) { if (r.f.length > 40000) break; r = cc(r); } return r; };
export function mirrorMod(m, axis, merge = 0.0005) {
  const nv = nVerts(m); const v = [...m.v]; const map = []; for (let i = 0; i < nv; i++) { if (Math.abs(m.v[i * 3 + axis]) < merge) map.push(i); else { const p = P(m, i); p[axis] = -p[axis]; v.push(...p); map.push(v.length / 3 - 1); } }
  return { v, f: [...m.f, ...m.f.map((f) => f.map((i) => map[i]).reverse())] };
}
export function arrayMod(m, count, off) { const nv = nVerts(m); const v = [], f = []; for (let c = 0; c < count; c++) { for (let i = 0; i < nv; i++) v.push(m.v[i * 3] + off[0] * c, m.v[i * 3 + 1] + off[1] * c, m.v[i * 3 + 2] + off[2] * c); for (const face of m.f) f.push(face.map((i) => i + nv * c)); } return { v, f }; }
export function solidify(m, t) {
  const nv = nVerts(m); const vn = vertexNormals(m); const v = [...m.v]; for (let i = 0; i < nv; i++) v.push(m.v[i * 3] - vn[i * 3] * t, m.v[i * 3 + 1] - vn[i * 3 + 1] * t, m.v[i * 3 + 2] - vn[i * 3 + 2] * t);
  const f = [...m.f, ...m.f.map((x) => x.map((i) => i + nv).reverse())]; for (const e of edgesOf(m)) if (e.faces.length === 1) { const face = m.f[e.faces[0]]; const i = face.indexOf(e.a); const a = face[i], b = face[(i + 1) % face.length]; const [A, B] = (b === e.b) ? [a, b] : [b, a]; f.push([A, A + nv, B + nv, B]); }
  return { v, f };
}
export function twist(m, deg, axis = 2) { const b = bounds(m); const h = b.hi[axis] - b.lo[axis] || 1; const o = [...m.v]; const a1 = (axis + 1) % 3, a2 = (axis + 2) % 3; for (let i = 0; i < o.length; i += 3) { const t = (o[i + axis] - b.lo[axis]) / h; const r = (deg * Math.PI / 180) * (t - 0.5); const c = Math.cos(r), s = Math.sin(r); const x = o[i + a1], y = o[i + a2]; o[i + a1] = x * c - y * s; o[i + a2] = x * s + y * c; } return { ...m, v: o }; }
export function displaceMod(m, amt, scale) { const vn = vertexNormals(m); const o = [...m.v]; const h = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); }; const sm = (x, y, z) => { const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z); const fx = x - ix, fy = y - iy, fz = z - iz; const u = (t) => t * t * (3 - 2 * t); let r = 0; for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) r += h(ix + dx, iy + dy, iz + dz) * (dx ? u(fx) : 1 - u(fx)) * (dy ? u(fy) : 1 - u(fy)) * (dz ? u(fz) : 1 - u(fz)); return r; }; for (let i = 0; i < o.length / 3; i++) { const d = (sm(o[i * 3] * scale, o[i * 3 + 1] * scale, o[i * 3 + 2] * scale) - 0.5) * amt; o[i * 3] += vn[i * 3] * d; o[i * 3 + 1] += vn[i * 3 + 1] * d; o[i * 3 + 2] += vn[i * 3 + 2] * d; } return { ...m, v: o }; }
export const MODS = { subsurf: { label: 'Subdivision Surface', def: { level: 2 } }, mirror: { label: 'Mirror', def: { axis: 0 } }, array: { label: 'Array', def: { count: 3, x: 2.2, y: 0, z: 0 } }, solidify: { label: 'Solidify', def: { thickness: 0.2 } }, twist: { label: 'Twist', def: { angle: 90, axis: 2 } }, displace: { label: 'Displace (noise)', def: { amount: 0.3, scale: 1.5 } } };
export function applyMods(m, mods) {
  let r = m; for (const md of mods || []) { if (!md.on) continue; const q = md.p; if (md.type === 'subsurf') r = subsurf(r, q.level); else if (md.type === 'mirror') r = mirrorMod(r, q.axis); else if (md.type === 'array') r = arrayMod(r, Math.max(1, Math.min(50, Math.round(q.count))), [q.x, q.y, q.z]); else if (md.type === 'solidify') r = solidify(r, q.thickness); else if (md.type === 'twist') r = twist(r, q.angle, q.axis); else if (md.type === 'displace') r = displaceMod(r, q.amount, q.scale); } return r;
}

/* ---------- edit operations (selection = Set of indices) ---------- */
export function compact(m) { const used = new Set(); for (const f of m.f) for (const i of f) used.add(i); const map = new Map(); const v = []; [...used].sort((a, b) => a - b).forEach((i, k) => { map.set(i, k); v.push(m.v[i * 3], m.v[i * 3 + 1], m.v[i * 3 + 2]); }); return { mesh: { v, f: m.f.map((f) => f.map((i) => map.get(i))) }, map }; }
export const facesInside = (m, vs) => { const s = new Set(); m.f.forEach((f, fi) => { if (f.every((i) => vs.has(i))) s.add(fi); }); return s; };
export const vertsOf = (m, fs) => { const s = new Set(); for (const fi of fs) for (const i of m.f[fi]) s.add(i); return s; };
export function deleteFaces(m, fs) { return compact({ v: m.v, f: m.f.filter((_, fi) => !fs.has(fi)) }).mesh; }
export function deleteVerts(m, vs) { return compact({ v: m.v, f: m.f.filter((f) => !f.some((i) => vs.has(i))) }).mesh; }
export function extrudeFaces(m, fs, dist) {
  const nv = nVerts(m); const v = [...m.v]; const dup = new Map(); const vnrm = new Map(); for (const fi of fs) { const fn = faceNormal(m, m.f[fi]); for (const i of m.f[fi]) { const a = vnrm.get(i) || [0, 0, 0]; vnrm.set(i, v3.add(a, fn)); } }
  for (const [i, n] of vnrm) { const nn = v3.norm(n); dup.set(i, v.length / 3); v.push(m.v[i * 3] + nn[0] * dist, m.v[i * 3 + 1] + nn[1] * dist, m.v[i * 3 + 2] + nn[2] * dist); }
  const edgeCount = new Map(); const dirEdge = []; for (const fi of fs) { const f = m.f[fi]; for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length]; const k = a < b ? a * 1e6 + b : b * 1e6 + a; edgeCount.set(k, (edgeCount.get(k) || 0) + 1); dirEdge.push([a, b, k]); } }
  const f = m.f.map((face, fi) => (fs.has(fi) ? face.map((i) => dup.get(i)) : face)); const newFaces = [...fs]; for (const [a, b, k] of dirEdge) if (edgeCount.get(k) === 1) f.push([a, b, dup.get(b), dup.get(a)]);
  void nv; return { mesh: { v, f }, faces: newFaces };
}
export function extrudeEdges(m, vs, dist) { // extrude boundary edges whose both verts are selected
  const v = [...m.v]; const dup = new Map(); const f = [...m.f]; const vn = vertexNormals(m); let any = false; const es = edgesOf(m).filter((e) => e.faces.length === 1 && vs.has(e.a) && vs.has(e.b));
  for (const e of es) { any = true; for (const i of [e.a, e.b]) if (!dup.has(i)) { dup.set(i, v.length / 3); const n = [vn[i * 3], vn[i * 3 + 1], vn[i * 3 + 2]]; v.push(m.v[i * 3] + n[0] * dist, m.v[i * 3 + 1] + n[1] * dist, m.v[i * 3 + 2] + n[2] * dist); } const face = m.f[e.faces[0]]; const i0 = face.indexOf(e.a); const a = face[i0], b = face[(i0 + 1) % face.length]; const [A, B] = b === e.b ? [a, b] : [b, a]; f.push([B, A, dup.get(A), dup.get(B)]); }
  return any ? { mesh: { v, f }, verts: new Set(dup.values()) } : null;
}
export function insetFaces(m, fs, amt) {
  const v = [...m.v]; const f = []; const newFaces = []; m.f.forEach((face, fi) => { if (!fs.has(fi)) { f.push(face); return; } const c = avg(face.map((i) => P(m, i))); const ni = face.map((i) => { const p = P(m, i); v.push(c[0] + (p[0] - c[0]) * (1 - amt), c[1] + (p[1] - c[1]) * (1 - amt), c[2] + (p[2] - c[2]) * (1 - amt)); return v.length / 3 - 1; }); for (let i = 0; i < face.length; i++) { const j = (i + 1) % face.length; f.push([face[i], face[j], ni[j], ni[i]]); } newFaces.push(f.length); f.push(ni); });
  return { mesh: { v, f }, faces: newFaces };
}
export function subdivideFaces(m, fs) {
  const v = [...m.v]; const f = []; const mids = new Map(); const mid = (a, b) => { const k = a < b ? a * 1e6 + b : b * 1e6 + a; if (mids.has(k)) return mids.get(k); const p = avg([P(m, a), P(m, b)]); v.push(...p); mids.set(k, v.length / 3 - 1); return v.length / 3 - 1; }; const nfs = [];
  m.f.forEach((face, fi) => { if (fs && !fs.has(fi)) { f.push(face); return; } const c = avg(face.map((i) => P(m, i))); v.push(...c); const ci = v.length / 3 - 1; const k = face.length; for (let i = 0; i < k; i++) { nfs.push(f.length); f.push([face[i], mid(face[i], face[(i + 1) % k]), ci, mid(face[(i + k - 1) % k], face[i])]); } });
  return { mesh: { v, f }, faces: nfs };
}
export function flipFaces(m, fs) { return { ...m, f: m.f.map((f, fi) => (!fs || fs.has(fi) ? [...f].reverse() : f)) }; }
export function mergeVerts(m, vs) {
  if (vs.size < 2) return m; const sel = [...vs]; const c = avg(sel.map((i) => P(m, i))); const keep = Math.min(...sel); const v = [...m.v]; v[keep * 3] = c[0]; v[keep * 3 + 1] = c[1]; v[keep * 3 + 2] = c[2];
  const f = m.f.map((face) => { const r = []; for (const i of face) { const j = vs.has(i) ? keep : i; if (!r.length || r[r.length - 1] !== j) r.push(j); } if (r.length > 1 && r[0] === r[r.length - 1]) r.pop(); return r; }).filter((f2) => f2.length >= 3 && new Set(f2).size === f2.length); return compact({ v, f }).mesh;
}
export function bakeTransform(m, M) { const v = []; for (let i = 0; i < m.v.length; i += 3) v.push(...m4.point(M, [m.v[i], m.v[i + 1], m.v[i + 2]])); return { ...m, v }; }
export function recenter(m) { const b = bounds(m); const c = v3.mul(v3.add(b.lo, b.hi), 0.5); const v = [...m.v]; for (let i = 0; i < v.length; i += 3) { v[i] -= c[0]; v[i + 1] -= c[1]; v[i + 2] -= c[2]; } return { mesh: { ...m, v }, offset: c }; }
export function mergeMeshes(list) { const v = [], f = []; let off = 0; for (const m of list) { v.push(...m.v); for (const face of m.f) f.push(face.map((i) => i + off)); off += nVerts(m); } return { v, f }; }

/* ---------- picking ---------- */
export function rayMesh(g, M, ray) { // g: geom(); returns {t, face}
  const iM = m4.invert(M); const o = m4.point(iM, ray.o), d = m4.dir(iM, ray.d); let best = Infinity, bf = -1; const p = g.pos;
  for (let t = 0; t < g.count; t += 3) { const a = [p[t * 3], p[t * 3 + 1], p[t * 3 + 2]], b = [p[t * 3 + 3], p[t * 3 + 4], p[t * 3 + 5]], c = [p[t * 3 + 6], p[t * 3 + 7], p[t * 3 + 8]]; const h = rayTri(o, d, a, b, c); if (h > 0 && h < best) { best = h; bf = g.faceOf[t / 3]; } }
  return bf < 0 ? null : { t: best, face: bf };
}

/* ---------- sculpt ---------- */
const adjCache = new WeakMap();
export function adjacency(m) { let a = adjCache.get(m); if (a) return a; a = Array.from({ length: nVerts(m) }, () => new Set()); for (const f of m.f) for (let i = 0; i < f.length; i++) { a[f[i]].add(f[(i + 1) % f.length]); a[f[i]].add(f[(i + f.length - 1) % f.length]); } adjCache.set(m, a); return a; }
export function sculpt(m, o) { // o: {type, hit, normal, radius, strength, sign, delta, mirror}
  const v = [...m.v]; const vn = vertexNormals(m); const adj = adjacency(m); const sets = [{ hit: o.hit, normal: o.normal }]; if (o.mirrorX) sets.push({ hit: [-o.hit[0], o.hit[1], o.hit[2]], normal: [-o.normal[0], o.normal[1], o.normal[2]], mx: true });
  for (const s of sets) for (let i = 0; i < v.length / 3; i++) { const p = [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]]; const d = v3.len(v3.sub(p, s.hit)); if (d > o.radius) continue; const u = 1 - d / o.radius; const fall = u * u * (3 - 2 * u); const k = o.strength * fall; let np = p;
    if (o.type === 'draw') np = v3.add(p, v3.mul(s.normal, o.sign * k * o.radius * 0.18)); else if (o.type === 'inflate') np = v3.add(p, v3.mul([vn[i * 3], vn[i * 3 + 1], vn[i * 3 + 2]], o.sign * k * o.radius * 0.18));
    else if (o.type === 'smooth') { const ns = [...adj[i]]; if (ns.length) { const a = avg(ns.map((j) => [m.v[j * 3], m.v[j * 3 + 1], m.v[j * 3 + 2]])); np = v3.lerp(p, a, clamp(k * 0.6, 0, 1)); } }
    else if (o.type === 'pinch') np = v3.lerp(p, s.hit, clamp(k * 0.25 * o.sign, -1, 1)); else if (o.type === 'flatten') { const dd = v3.dot(v3.sub(p, s.hit), s.normal); np = v3.sub(p, v3.mul(s.normal, dd * clamp(k * 0.7, 0, 1))); }
    else if (o.type === 'grab') { const dl = s.mx ? [-o.delta[0], o.delta[1], o.delta[2]] : o.delta; np = v3.add(p, v3.mul(dl, fall * o.strength)); }
    v[i * 3] = np[0]; v[i * 3 + 1] = np[1]; v[i * 3 + 2] = np[2]; }
  return { ...m, v };
}

/* ---------- OBJ / STL ---------- */
export function toOBJ(items) { let s = '# Techomato 3D Studio\n'; let off = 1; for (const { name, mesh, M } of items) { s += `o ${name.replace(/\s+/g, '_')}\n`; for (let i = 0; i < mesh.v.length; i += 3) { const p = m4.point(M, [mesh.v[i], mesh.v[i + 1], mesh.v[i + 2]]); s += `v ${p[0].toFixed(6)} ${p[1].toFixed(6)} ${p[2].toFixed(6)}\n`; } for (const f of mesh.f) s += `f ${f.map((i) => i + off).join(' ')}\n`; off += mesh.v.length / 3; } return s; }
export function parseOBJ(text) {
  const V = [], objs = []; let cur = null; const start = (n) => { cur = { name: n || 'Object', f: [] }; objs.push(cur); };
  for (const raw of text.split(/\r?\n/)) { const l = raw.trim(); if (!l || l[0] === '#') continue; const t = l.split(/\s+/); if (t[0] === 'v') V.push([+t[1], +t[2], +t[3]]); else if (t[0] === 'o' || t[0] === 'g') { if (!cur || cur.f.length) start(t.slice(1).join(' ')); else cur.name = t.slice(1).join(' ') || cur.name; } else if (t[0] === 'f') { if (!cur) start(); const idx = t.slice(1).map((x) => { const n = parseInt(x.split('/')[0], 10); return n < 0 ? V.length + n : n - 1; }); if (idx.length >= 3 && idx.every((i) => i >= 0 && i < V.length)) cur.f.push(idx); } }
  return objs.filter((o) => o.f.length).map((o) => { const m = compact({ v: V.flat(), f: o.f }).mesh; return { name: o.name, mesh: m }; });
}
export function toSTL(items) { let tris = 0; const parts = items.map(({ mesh, M }) => { const out = []; const { tris: t } = triangulate(mesh); for (let i = 0; i < t.length; i += 3) { out.push([t[i], t[i + 1], t[i + 2]].map((k) => m4.point(M, [mesh.v[k * 3], mesh.v[k * 3 + 1], mesh.v[k * 3 + 2]]))); } tris += out.length; return out; }); const buf = new ArrayBuffer(84 + tris * 50); const dv = new DataView(buf); const hd = 'Techomato 3D Studio'; for (let i = 0; i < hd.length; i++) dv.setUint8(i, hd.charCodeAt(i)); dv.setUint32(80, tris, true); let o = 84; for (const part of parts) for (const [a, b, c] of part) { const n = v3.norm(v3.cross(v3.sub(b, a), v3.sub(c, a))); for (const q of [n, a, b, c]) for (const x of q) { dv.setFloat32(o, x, true); o += 4; } dv.setUint16(o, 0, true); o += 2; } return new Uint8Array(buf); }
export function parseSTL(buf) {
  const u8 = new Uint8Array(buf); const head = new TextDecoder().decode(u8.slice(0, 5)); const verts = []; const faces = []; const map = new Map(); const add = (p) => { const k = p.map((x) => Math.round(x * 1e5)).join(','); if (map.has(k)) return map.get(k); verts.push(p); map.set(k, verts.length - 1); return verts.length - 1; };
  const dv = new DataView(buf); const n = u8.length >= 84 ? dv.getUint32(80, true) : 0; const binary = !(head === 'solid' && 84 + n * 50 !== u8.length);
  if (binary) { let o = 84; for (let t = 0; t < n; t++) { o += 12; const f = []; for (let k = 0; k < 3; k++) { f.push(add([dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)])); o += 12; } o += 2; if (new Set(f).size === 3) faces.push(f); } }
  else { const txt = new TextDecoder().decode(u8); const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g; let m; const cur = []; while ((m = re.exec(txt))) { cur.push(add([+m[1], +m[2], +m[3]])); if (cur.length === 3) { if (new Set(cur).size === 3) faces.push([...cur]); cur.length = 0; } } }
  if (!faces.length) throw new Error('No triangles found'); return { v: verts.flat(), f: faces };
}
