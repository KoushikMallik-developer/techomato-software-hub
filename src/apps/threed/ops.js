/* Transform + edit operators for Techomato 3D Studio */
import { v3, m4, D2R } from './math.js';
import { objById, modelM } from './scene.js';
import * as M from './mesh.js';

export function axisAngleM(axis, a) { const [x, y, z] = v3.norm(axis); const c = Math.cos(a), s = Math.sin(a), t = 1 - c; return [t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0, t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0, t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0, 0, 0, 0, 1]; }
export function eulerFromM(m) { // column-major rotation (may include scale-free), XYZ euler in degrees
  const r20 = m[2], r21 = m[6], r22 = m[10], r10 = m[1], r00 = m[0]; const y = Math.asin(Math.max(-1, Math.min(1, -r20))); let x, z; if (Math.abs(r20) < 0.99999) { x = Math.atan2(r21, r22); z = Math.atan2(r10, r00); } else { x = Math.atan2(-m[9], m[5]); z = 0; } return [x / D2R, y / D2R, z / D2R];
}
const rotPart = (o) => m4.rotOnly(o.rot);
export const objPivot = (scene, ids) => { const ps = ids.map((id) => objById(scene, id)).filter(Boolean).map((o) => o.pos); return ps.length ? v3.mul(ps.reduce((a, b) => v3.add(a, b), [0, 0, 0]), 1 / ps.length) : [0, 0, 0]; };
export function editPivot(scene, objId, vs) { const o = objById(scene, objId); const Mx = modelM(o); const ps = [...vs].map((i) => m4.point(Mx, [o.mesh.v[i * 3], o.mesh.v[i * 3 + 1], o.mesh.v[i * 3 + 2]])); return ps.length ? v3.mul(ps.reduce((a, b) => v3.add(a, b), [0, 0, 0]), 1 / ps.length) : o.pos; }

/* xf: {kind:'move',delta} | {kind:'scale',f:[x,y,z],basis:[ax,ay,az]} | {kind:'rot',axis,angle}  – all in world space about pivot */
export function xformObjects(scene, ids, xf, pivot) {
  const set = new Set(ids); return { ...scene, objs: scene.objs.map((o) => { if (!set.has(o.id)) return o;
    if (xf.kind === 'move') return { ...o, pos: v3.add(o.pos, xf.delta) };
    if (xf.kind === 'scale') { const b = xf.basis; const d = v3.sub(o.pos, pivot); const c = [v3.dot(d, b[0]) * xf.f[0], v3.dot(d, b[1]) * xf.f[1], v3.dot(d, b[2]) * xf.f[2]]; const np = v3.add(pivot, v3.add(v3.mul(b[0], c[0]), v3.add(v3.mul(b[1], c[1]), v3.mul(b[2], c[2])))); const scl = o.scl.map((x, i) => x * xf.f[i]); return { ...o, pos: np, scl }; }
    if (xf.kind === 'rot') { const R = axisAngleM(xf.axis, xf.angle); const np = v3.add(pivot, m4.dir(R, v3.sub(o.pos, pivot))); const nr = eulerFromM(m4.mul(R, rotPart(o))); return { ...o, pos: np, rot: nr }; }
    return o; }) };
}
export const GLOBAL = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
export function xformVerts(scene, objId, vs, xf, pivot) {
  const o = objById(scene, objId); const Mx = modelM(o); const iM = m4.invert(Mx); const v = [...o.mesh.v];
  for (const i of vs) { const p = m4.point(Mx, [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]]); let np = p;
    if (xf.kind === 'move') np = v3.add(p, xf.delta); else if (xf.kind === 'scale') { const b = xf.basis; const d = v3.sub(p, pivot); const c = [v3.dot(d, b[0]) * xf.f[0], v3.dot(d, b[1]) * xf.f[1], v3.dot(d, b[2]) * xf.f[2]]; np = v3.add(pivot, v3.add(v3.mul(b[0], c[0]), v3.add(v3.mul(b[1], c[1]), v3.mul(b[2], c[2])))); } else if (xf.kind === 'rot') np = v3.add(pivot, m4.dir(axisAngleM(xf.axis, xf.angle), v3.sub(p, pivot)));
    const lp = m4.point(iM, np); v[i * 3] = lp[0]; v[i * 3 + 1] = lp[1]; v[i * 3 + 2] = lp[2]; }
  return { ...scene, objs: scene.objs.map((x) => (x.id === objId ? { ...x, mesh: { ...x.mesh, v } } : x)) };
}

/* ---------- edit operators: return {mesh, v?, f?} new selection ---------- */
export function runEditOp(kind, params, mesh, sel, smode) {
  const fsel = smode === 'face' ? sel.f : M.facesInside(mesh, sel.v);
  if (kind === 'extrude') {
    if (fsel.size) { const r = M.extrudeFaces(mesh, fsel, params.dist); const nf = new Set(r.faces); const vs = M.vertsOf(r.mesh, nf); return { mesh: r.mesh, f: nf, v: vs }; }
    const r = M.extrudeEdges(mesh, sel.v, params.dist); if (r) return { mesh: r.mesh, v: r.verts, f: new Set() };
    return { error: 'Extrude needs selected faces, or a boundary edge' };
  }
  if (kind === 'inset') { if (!fsel.size) return { error: 'Select faces to inset' }; const r = M.insetFaces(mesh, fsel, params.amount); const nf = new Set(r.faces); return { mesh: r.mesh, f: nf, v: M.vertsOf(r.mesh, nf) }; }
  if (kind === 'subdivide') { const r = M.subdivideFaces(mesh, fsel.size ? fsel : null); const nf = new Set(r.faces); return { mesh: r.mesh, f: nf, v: M.vertsOf(r.mesh, nf) }; }
  return { error: 'Unknown operator' };
}
export function deleteSelection(mesh, sel, smode) {
  if (smode === 'face') return M.deleteFaces(mesh, sel.f); return M.deleteVerts(mesh, sel.v);
}
