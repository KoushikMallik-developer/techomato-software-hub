/* Minimal vec3 / mat4 library for Techomato 3D Studio (column-major, Z-up like Blender) */
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const D2R = Math.PI / 180;
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]), norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }, lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
export const m4 = {
  ident: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; },
  perspective(fovY, aspect, n, f) { const t = 1 / Math.tan(fovY / 2); return [t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]; },
  ortho(l, r, b, t, n, f) { return [2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]; },
  lookAt(e, c, up) { const z = v3.norm(v3.sub(e, c)); let x = v3.cross(up, z); if (v3.len(x) < 1e-6) x = [1, 0, 0]; x = v3.norm(x); const y = v3.cross(z, x); return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -v3.dot(x, e), -v3.dot(y, e), -v3.dot(z, e), 1]; },
  invert(m) { const inv = new Array(16); const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m; const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32; let d = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!d) return m4.ident(); d = 1 / d;
    inv[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d; inv[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d; inv[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d; inv[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d; inv[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d; inv[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d; inv[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d; inv[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d; inv[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d; inv[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d; inv[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d; inv[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d; inv[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d; inv[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d; inv[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d; inv[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d; return inv; },
  /* translate * Rz * Ry * Rx * scale  (Blender XYZ Euler) */
  trs(p, r, s) { const cx = Math.cos(r[0] * D2R), sx = Math.sin(r[0] * D2R), cy = Math.cos(r[1] * D2R), sy = Math.sin(r[1] * D2R), cz = Math.cos(r[2] * D2R), sz = Math.sin(r[2] * D2R);
    const r00 = cz * cy, r01 = cz * sy * sx - sz * cx, r02 = cz * sy * cx + sz * sx, r10 = sz * cy, r11 = sz * sy * sx + cz * cx, r12 = sz * sy * cx - cz * sx, r20 = -sy, r21 = cy * sx, r22 = cy * cx;
    return [r00 * s[0], r10 * s[0], r20 * s[0], 0, r01 * s[1], r11 * s[1], r21 * s[1], 0, r02 * s[2], r12 * s[2], r22 * s[2], 0, p[0], p[1], p[2], 1]; },
  rotOnly(r) { return m4.trs([0, 0, 0], r, [1, 1, 1]); },
  point(m, p) { const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15] || 1; return [(m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w, (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w, (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w]; },
  dir(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]]; },
  normalMat(m) { const i = m4.invert(m); return [i[0], i[4], i[8], i[1], i[5], i[9], i[2], i[6], i[10]]; }, // transpose(inverse(3x3)) as column-major 3x3
};
/* project a world point to pixel coordinates inside a w×h viewport; returns [x,y,depth(ndc z), clipW] */
export function project(vp, p, w, h) { const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12], y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13], z = vp[2] * p[0] + vp[6] * p[1] + vp[10] * p[2] + vp[14], ww = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15]; return [(x / ww * 0.5 + 0.5) * w, (1 - (y / ww * 0.5 + 0.5)) * h, z / ww, ww]; }
export function unproject(invVP, sx, sy, ndcZ, w, h) { const x = (sx / w) * 2 - 1, y = 1 - (sy / h) * 2; const p = m4.point(invVP, [x, y, ndcZ]); return p; }
export function rayFrom(invVP, sx, sy, w, h) { const a = unproject(invVP, sx, sy, -1, w, h), b = unproject(invVP, sx, sy, 1, w, h); return { o: a, d: v3.norm(v3.sub(b, a)) }; }
/* Möller–Trumbore; returns t or -1 */
export function rayTri(o, d, a, b, c) { const e1 = v3.sub(b, a), e2 = v3.sub(c, a); const p = v3.cross(d, e2); const det = v3.dot(e1, p); if (Math.abs(det) < 1e-9) return -1; const inv = 1 / det; const tv = v3.sub(o, a); const u = v3.dot(tv, p) * inv; if (u < 0 || u > 1) return -1; const q = v3.cross(tv, e1); const v = v3.dot(d, q) * inv; if (v < 0 || u + v > 1) return -1; const t = v3.dot(e2, q) * inv; return t > 1e-6 ? t : -1; }
export function distSegPoint(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy; let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = clamp(t, 0, 1); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); }
