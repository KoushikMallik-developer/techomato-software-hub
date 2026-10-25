/* Scene model, animation and view helpers for Techomato 3D Studio */
import { m4, v3, D2R, clamp } from './math.js';
import { primitive } from './mesh.js';
let _n = 0;
export const uid = () => Math.random().toString(36).slice(2, 7) + (++_n).toString(36);
export const mkMat = (o = {}) => ({ color: '#cfd2d8', metal: 0, rough: 0.5, emit: '#ffffff', emitI: 0, alpha: 1, pat: 'none', patScale: 4, color2: '#555a63', ...o });
export const PRIMS = [['cube', 'Cube'], ['uvsphere', 'UV sphere'], ['icosphere', 'Ico sphere'], ['cylinder', 'Cylinder'], ['cone', 'Cone'], ['torus', 'Torus'], ['plane', 'Plane'], ['grid', 'Grid'], ['circle', 'Circle']];
export function mkObject(type, o = {}) {
  const base = { id: uid(), name: type, type, pos: [0, 0, 0], rot: [0, 0, 0], scl: [1, 1, 1], vis: true, lock: false, ...o };
  if (type === 'mesh') { base.mesh = o.mesh || primitive(o.prim || 'cube'); base.smooth = !!o.smooth; base.mat = o.mat || mkMat(); base.mods = o.mods || []; }
  if (type === 'light') base.light = { kind: 'point', color: '#ffffff', power: 1000, angle: 45, shadow: true, ...(o.light || {}) };
  if (type === 'camera') base.cam = { fov: 39.6, near: 0.1, far: 200, ...(o.cam || {}) };
  return base;
}
export const mkMod = (type, def) => ({ id: uid(), type, on: true, p: { ...def } });
export function newScene() {
  const cube = mkObject('mesh', { name: 'Cube', prim: 'cube', pos: [0, 0, 1], mat: mkMat({ color: '#e9632d', rough: 0.45 }) });
  const floor = mkObject('mesh', { name: 'Floor', prim: 'plane', pos: [0, 0, 0], scl: [8, 8, 1], mat: mkMat({ color: '#9aa3b2', rough: 0.8, pat: 'checker', patScale: 0.5, color2: '#7d8696' }) });
  const light = mkObject('light', { name: 'Sun', pos: [4, -3, 7], rot: [52, 8, 62], light: { kind: 'sun', power: 2.6, color: '#fff3e0', angle: 45, shadow: true } });
  const fill = mkObject('light', { name: 'Point light', pos: [-4, -2, 3.5], light: { kind: 'point', power: 700, color: '#9bb8ff', shadow: false, angle: 45 } });
  const cam = mkObject('camera', { name: 'Camera', pos: [7.4, -6.5, 5.2], rot: [63, 0, 46] });
  return { objs: [floor, cube, light, fill, cam], world: { bg: '#2c3038', ambient: '#8fa2c4', ambI: 0.42, shadows: true, resX: 1280, resY: 720 }, anim: { fps: 24, start: 1, end: 96, keys: {} }, frame: 1, activeCam: cam.id };
}
export const objById = (s, id) => s.objs.find((o) => o.id === id);
export const modelM = (o) => m4.trs(o.pos, o.rot, o.scl);
export const clone = (x) => JSON.parse(JSON.stringify(x));

/* ---------- animation ---------- */
const smooth = (u) => u * u * (3 - 2 * u);
export function sampleKeys(keys, f) {
  if (!keys || !keys.length) return null; if (f <= keys[0].f) return keys[0].v; const n = keys.length; if (f >= keys[n - 1].f) return keys[n - 1].v;
  let i = 0; while (i < n - 2 && f >= keys[i + 1].f) i++; const a = keys[i], b = keys[i + 1]; let u = (f - a.f) / (b.f - a.f); if (a.e !== 'linear') u = smooth(u); return a.v.map((x, k) => x + (b.v[k] - x) * u);
}
export function evalAnim(scene, f) {
  const K = scene.anim.keys; let changed = false; const objs = scene.objs.map((o) => { const k = K[o.id]; if (!k) return o; const n = { ...o }; for (const [ch, prop] of [['pos', 'pos'], ['rot', 'rot'], ['scl', 'scl']]) { const v = sampleKeys(k[ch], f); if (v) { n[prop] = v; changed = true; } } return n; });
  return changed ? { ...scene, objs, frame: f } : { ...scene, frame: f };
}
export function insertKey(scene, ids, f, channels = ['pos', 'rot', 'scl']) {
  const keys = { ...scene.anim.keys }; for (const id of ids) { const o = objById(scene, id); if (!o) continue; const k = { ...(keys[id] || {}) }; for (const ch of channels) { const arr = (k[ch] || []).filter((x) => x.f !== f); arr.push({ f, v: [...o[ch]], e: 'ease' }); arr.sort((a, b) => a.f - b.f); k[ch] = arr; } keys[id] = k; }
  return { ...scene, anim: { ...scene.anim, keys } };
}
export function deleteKey(scene, ids, f) { const keys = { ...scene.anim.keys }; for (const id of ids) { const k = keys[id]; if (!k) continue; const n = {}; for (const ch of Object.keys(k)) { const arr = k[ch].filter((x) => x.f !== f); if (arr.length) n[ch] = arr; } if (Object.keys(n).length) keys[id] = n; else delete keys[id]; } return { ...scene, anim: { ...scene.anim, keys } }; }

/* ---------- view ---------- */
export const defaultView = () => ({ target: [0, 0, 1], dist: 14, yaw: 38 * D2R, pitch: 24 * D2R, fov: 50, ortho: false, cam: false });
export function viewMats(view, aspect, camObj, camAspect) {
  if (view.cam && camObj) { const M = m4.trs(camObj.pos, camObj.rot, [1, 1, 1]); const V = m4.invert(M); const asp = camAspect || aspect; const Pm = m4.perspective(camObj.cam.fov * D2R, asp, camObj.cam.near, camObj.cam.far); return { V, P: Pm, VP: m4.mul(Pm, V), eye: [M[12], M[13], M[14]], asp, near: camObj.cam.near, ortho: false, fov: camObj.cam.fov * D2R, dist: 10 }; }
  const cp = Math.cos(view.pitch), eye = v3.add(view.target, v3.mul([cp * Math.sin(view.yaw), -cp * Math.cos(view.yaw), Math.sin(view.pitch)], view.dist)); const V = m4.lookAt(eye, view.target, [0, 0, 1]); const fov = view.fov * D2R;
  const Pm = view.ortho ? (() => { const hh = view.dist * Math.tan(fov / 2); return m4.ortho(-hh * aspect, hh * aspect, -hh, hh, -1000, 1000); })() : m4.perspective(fov, aspect, Math.max(0.02, view.dist * 0.01), 2000);
  return { V, P: Pm, VP: m4.mul(Pm, V), eye, asp: aspect, near: 0.05, ortho: view.ortho, fov, dist: view.dist };
}
export const VIEW_PRESETS = { front: [0, 0], back: [Math.PI, 0], right: [Math.PI / 2, 0], left: [-Math.PI / 2, 0], top: [0, 89.99 * D2R], bottom: [0, -89.99 * D2R] };
export function sceneBounds(scene) { let c = [0, 0, 0], n = 0; for (const o of scene.objs) if (o.type === 'mesh' && o.vis) { c = v3.add(c, o.pos); n++; } if (!n) return { c: [0, 0, 0], r: 6 }; c = v3.mul(c, 1 / n); let r = 2; for (const o of scene.objs) if (o.type === 'mesh' && o.vis) r = Math.max(r, v3.len(v3.sub(o.pos, c)) + Math.max(...o.scl.map(Math.abs)) * 1.8); return { c, r }; }
export const dimsOf = (mesh, scl) => { let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < mesh.v.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], mesh.v[i + k]); hi[k] = Math.max(hi[k], mesh.v[i + k]); } return lo[0] === Infinity ? [0, 0, 0] : [0, 1, 2].map((k) => (hi[k] - lo[k]) * Math.abs(scl[k])); };
export { clamp };
