/* Techomato 3D Studio – custom WebGL2 renderer (no three.js) */
import { m4, v3, D2R } from './math.js';
import { geom, edgesOf, triangulate } from './mesh.js';
import { viewMats, modelM, objById } from './scene.js';

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec3 aSnrm;
uniform mat4 uVP, uM; uniform mat3 uNM; uniform float uOutline;
out vec3 vW, vN, vO;
void main(){ vec3 n = normalize(uNM*aNrm); vec4 w = uM*vec4(aPos,1.0); if(uOutline>0.0){ w.xyz += normalize(uNM*aSnrm)*uOutline; } vW=w.xyz; vN=n; vO=aPos; gl_Position=uVP*w; }`;
const FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vW, vN, vO; out vec4 o;
uniform vec3 uCam, uCol, uCol2, uEmit, uAmb, uGround, uScl, uOutCol; uniform float uMetal, uRough, uAlpha, uPatScale, uEmitI, uShSize, uShBias;
uniform int uPat, uMode, uNL, uShLight, uOutlinePass; uniform vec4 uLPos[6], uLDir[6]; uniform vec3 uLCol[6]; uniform mat4 uLVP; uniform sampler2DShadow uSh;
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
float vnoise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); float a=mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y); float b=mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y); return mix(a,b,f.z); }
float pat(vec3 p){ if(uPat==1){ vec3 q=floor(p); return mod(q.x+q.y+q.z,2.0); } if(uPat==2){ return step(0.5, fract(p.x+p.y+p.z)); } if(uPat==3){ return smoothstep(0.35,0.65,vnoise(p*2.0)*0.65+vnoise(p*5.0)*0.35); } vec3 g=abs(fract(p)-0.5); return step(0.46, max(max(g.x,g.y),g.z)); }
float shadow(vec3 wp, vec3 N){ vec4 lp=uLVP*vec4(wp+N*uShBias,1.0); vec3 pr=lp.xyz/lp.w*0.5+0.5; if(pr.z>1.0||pr.x<0.0||pr.x>1.0||pr.y<0.0||pr.y>1.0) return 1.0; float s=0.0; for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) s+=texture(uSh, vec3(pr.xy+vec2(float(x),float(y))/uShSize, pr.z-0.0012)); return s/9.0; }
void main(){
  if(uOutlinePass==1){ o=vec4(uOutCol,1.0); return; }
  vec3 N=normalize(vN); if(!gl_FrontFacing) N=-N; vec3 V=normalize(uCam-vW); float t=0.0; if(uPat>0) t=pat(vO*uScl*uPatScale);
  if(uMode==0){ vec3 base=mix(uCol,uCol2,t); float hl=0.3+0.7*max(dot(N,V),0.0); float top=0.5+0.5*N.z; vec3 H=normalize(V+normalize(vec3(0.3,-0.4,0.8))); float sp=pow(max(dot(N,H),0.0), mix(60.0,6.0,uRough))*(1.0-uRough)*0.45; vec3 c=base*(0.22+0.58*hl+0.2*top)+vec3(sp); o=vec4(c,uAlpha); return; }
  vec3 base=lin(mix(uCol,uCol2,t)); vec3 F0=mix(vec3(0.04),base,uMetal); vec3 diff=base*(1.0-uMetal); float shin=exp2((1.0-uRough)*9.0+1.0);
  vec3 amb=mix(uGround,uAmb,N.z*0.5+0.5); vec3 col=diff*amb+F0*amb*0.35*(1.0-uRough);
  for(int i=0;i<6;i++){ if(i>=uNL) break; int ty=int(uLPos[i].w+0.5); vec3 L; float att=1.0;
    if(ty==1){ L=normalize(-uLDir[i].xyz); } else { vec3 d=uLPos[i].xyz-vW; float dist=max(length(d),0.05); L=d/dist; att=1.0/(dist*dist)/40.0; if(ty==2){ float cd=dot(-L,normalize(uLDir[i].xyz)); att*=smoothstep(uLDir[i].w, mix(uLDir[i].w,1.0,0.3), cd); } }
    float NdL=max(dot(N,L),0.0); if(NdL<=0.0) continue; float sh=1.0; if(i==uShLight) sh=shadow(vW,N);
    vec3 H=normalize(L+V); float sp=pow(max(dot(N,H),0.0),shin)*(shin+8.0)/25.13; vec3 fr=F0+(1.0-F0)*pow(1.0-max(dot(H,V),0.0),5.0);
    col+=uLCol[i]*att*sh*NdL*(diff+fr*sp); }
  col+=lin(uEmit)*uEmitI; col=(col*(2.51*col+0.03))/(col*(2.43*col+0.59)+0.14); col=pow(clamp(col,0.0,1.0),vec3(1.0/2.2)); o=vec4(col,uAlpha); }`;
const LVS = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uMVP; uniform float uSize, uBias; void main(){ gl_Position=uMVP*vec4(aPos,1.0); gl_Position.z-=uBias*gl_Position.w; gl_PointSize=uSize; }`;
const LFS = `#version 300 es
precision mediump float; uniform vec4 uColor; uniform float uRound; out vec4 o; void main(){ if(uRound>0.5){ vec2 c=gl_PointCoord-0.5; if(dot(c,c)>0.25) discard; } o=uColor; }`;
const DVS = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uMVP; void main(){ gl_Position=uMVP*vec4(aPos,1.0); }`;
const DFS = `#version 300 es
precision mediump float; void main(){}`;

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const lin = (c) => c.map((x) => Math.pow(x, 2.2));
const geomCache = new WeakMap();
export function geomOf(mesh, smooth) { let c = geomCache.get(mesh); if (!c) { c = {}; geomCache.set(mesh, c); } const k = smooth ? 's' : 'f'; if (!c[k]) c[k] = geom(mesh, smooth); return c[k]; }
const edgeCache = new WeakMap();
const edgeData = (mesh) => { let e = edgeCache.get(mesh); if (!e) { const es = edgesOf(mesh); const a = new Float32Array(es.length * 6); es.forEach((x, i) => { for (let k = 0; k < 3; k++) { a[i * 6 + k] = mesh.v[x.a * 3 + k]; a[i * 6 + 3 + k] = mesh.v[x.b * 3 + k]; } }); e = { a, es }; edgeCache.set(mesh, e); } return e; };

export function gizmoShapes(g) { // polylines per axis used for drawing and picking
  const out = []; const s = g.size; for (let a = 0; a < 3; a++) { const d = g.axes[a]; const o = g.origin; const p1 = g.axes[(a + 1) % 3], p2 = g.axes[(a + 2) % 3]; let pts;
    if (g.kind === 'rot') { pts = []; for (let i = 0; i <= 48; i++) { const t = (i / 48) * Math.PI * 2; pts.push(v3.add(o, v3.mul(v3.add(v3.mul(p1, Math.cos(t)), v3.mul(p2, Math.sin(t))), s * 0.95))); } }
    else { const e = v3.add(o, v3.mul(d, s)); pts = [o, e]; const h = g.kind === 'scl' ? 0.07 : 0.18; if (g.kind === 'scl') { for (const [x, y, z] of [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]) { void x; void y; void z; } const c = (sx, sy, sz) => v3.add(e, v3.add(v3.mul(d, sz * h * s), v3.add(v3.mul(p1, sx * h * s), v3.mul(p2, sy * h * s)))); pts.push(c(-1, -1, -1), c(1, -1, -1), c(1, 1, -1), c(-1, 1, -1), c(-1, -1, -1), c(-1, -1, 1), c(1, -1, 1), c(1, 1, 1), c(-1, 1, 1), c(-1, -1, 1)); }
      else { const b = v3.sub(e, v3.mul(d, h * s)); for (const [x, y] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) pts.push(v3.add(b, v3.add(v3.mul(p1, x * 0.07 * s), v3.mul(p2, y * 0.07 * s))), e); } }
    out.push({ axis: a, pts }); }
  return out;
}
const AXC = [[0.9, 0.27, 0.3], [0.45, 0.78, 0.25], [0.25, 0.52, 0.96]];

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true }); if (!gl) throw new Error('WebGL 2 is not available in this browser');
    this.gl = gl; this.canvas = canvas; this.pm = this.prog(VS, FS); this.pl = this.prog(LVS, LFS); this.pd = this.prog(DVS, DFS); this.U = new Map(); this.bufs = new WeakMap(); this.last = null; this.shadow = null;
    this.dyn = gl.createBuffer(); this.dynVao = gl.createVertexArray(); gl.bindVertexArray(this.dynVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
    this.grid = this.makeGrid();
  }
  prog(vs, fs) { const gl = this.gl; const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; }; const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }
  loc(p, n) { let m = this.U.get(p); if (!m) { m = new Map(); this.U.set(p, m); } if (!m.has(n)) m.set(n, this.gl.getUniformLocation(p, n)); return m.get(n); }
  u(p, n, v) { const gl = this.gl; const l = this.loc(p, n); if (l == null) return; if (typeof v === 'number') gl.uniform1f(l, v); else if (v.length === 3) gl.uniform3fv(l, v); else if (v.length === 4) gl.uniform4fv(l, v); else if (v.length === 9) gl.uniformMatrix3fv(l, false, v); else if (v.length === 16) gl.uniformMatrix4fv(l, false, v); }
  ui(p, n, v) { const l = this.loc(p, n); if (l != null) this.gl.uniform1i(l, v); }
  meshBuf(mesh, smooth) {
    const gl = this.gl; let c = this.bufs.get(mesh); if (!c) { c = {}; this.bufs.set(mesh, c); } const k = smooth ? 's' : 'f'; if (c[k]) return c[k]; const g = geomOf(mesh, smooth); const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    [g.pos, g.nrm, g.snrm].forEach((arr, i) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 0, 0); }); gl.bindVertexArray(null); c[k] = { vao, count: g.count, bufs: null }; return c[k];
  }
  lines(pts, color, VP, mode, { size = 1, bias = 0.0006, round = false } = {}) {
    const gl = this.gl; if (!pts.length) return; const arr = pts instanceof Float32Array ? pts : new Float32Array(pts.flat ? pts.flat() : pts); gl.useProgram(this.pl); this.u(this.pl, 'uMVP', VP); this.u(this.pl, 'uColor', color); this.u(this.pl, 'uSize', size); this.u(this.pl, 'uBias', bias); this.u(this.pl, 'uRound', round ? 1 : 0);
    gl.bindVertexArray(this.dynVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STREAM_DRAW); gl.drawArrays(mode, 0, arr.length / 3); gl.bindVertexArray(null);
  }
  makeGrid() { const minor = [], major = []; const N = 24; for (let i = -N; i <= N; i++) { if (i === 0) continue; (i % 5 === 0 ? major : minor).push(i, -N, 0, i, N, 0, -N, i, 0, N, i, 0); } return { minor: new Float32Array(minor), major: new Float32Array(major), ax: new Float32Array([-N, 0, 0, N, 0, 0]), ay: new Float32Array([0, -N, 0, 0, N, 0]) }; }
  ensureShadow(size) { const gl = this.gl; if (this.shadow && this.shadow.size === size) return this.shadow; const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL); const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0); gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); gl.bindFramebuffer(gl.FRAMEBUFFER, null); this.shadow = { tex, fb, size }; return this.shadow; }

  /* o: {mode, sel:Set, active, editId, edit:{v,f,smode}, xray, gizmo, overlays, evalMesh(obj), hideIds} */
  render(scene, view, o) {
    const gl = this.gl; const W = this.canvas.width, H = this.canvas.height; const camObj = objById(scene, scene.activeCam); const resA = scene.world.resX / scene.world.resY;
    let rect = { x: 0, y: 0, w: W, h: H }; if (view.cam && camObj) { if (W / H > resA) { const h = H, w = Math.round(H * resA); rect = { x: Math.round((W - w) / 2), y: 0, w, h }; } else { const w = W, h = Math.round(W / resA); rect = { x: 0, y: Math.round((H - h) / 2), w, h }; } }
    const mats = viewMats(view, rect.w / rect.h, camObj && camObj.type === 'camera' ? camObj : null, resA); this.last = { rect, mats, W, H };
    const rendered = o.mode === 'rendered'; const bg = rendered ? hex(scene.world.bg) : [0.17, 0.18, 0.2]; const overlays = o.overlays !== false;
    // lights
    const lights = []; for (const L of scene.objs) if (L.type === 'light' && L.vis) { const M = modelM(L); const dir = v3.norm(m4.dir(M, [0, 0, -1])); const k = L.light.kind; const col = lin(hex(L.light.color)); const pw = L.light.power * (k === 'sun' ? 0.45 : 1); lights.push({ L, type: k === 'sun' ? 1 : k === 'spot' ? 2 : 0, pos: [M[12], M[13], M[14]], dir, col: col.map((c) => c * pw), cos: Math.cos((L.light.angle * D2R) / 2) }); } lights.length = Math.min(lights.length, 6);
    const meshes = scene.objs.filter((x) => x.type === 'mesh' && x.vis && !(o.hideIds && o.hideIds.has(x.id)));
    const drawables = meshes.map((ob) => { const mesh = o.evalMesh(ob); return { ob, mesh, M: modelM(ob), smooth: ob.smooth || (ob.mods && ob.mods.some((m) => m.type === 'subsurf' && m.on && ob.id !== o.editId)) }; });
    // shadow pass
    let shLight = -1, LVP = m4.ident(), shSize = 2048; const sc = (() => { let c = [0, 0, 0], n = 0, r = 3; for (const d of drawables) { c = v3.add(c, d.ob.pos); n++; } if (n) { c = v3.mul(c, 1 / n); for (const d of drawables) r = Math.max(r, v3.len(v3.sub(d.ob.pos, c)) + Math.max(...d.ob.scl.map(Math.abs)) * 1.9); } return { c, r }; })();
    if (rendered && scene.world.shadows) { shLight = lights.findIndex((l) => (l.type === 1 || l.type === 2) && l.L.light.shadow); if (shLight >= 0) { const l = lights[shLight]; const sh = this.ensureShadow(shSize); let LV, LP; if (l.type === 1) { const eye = v3.sub(sc.c, v3.mul(l.dir, sc.r * 2)); LV = m4.lookAt(eye, sc.c, Math.abs(l.dir[2]) > 0.99 ? [0, 1, 0] : [0, 0, 1]); LP = m4.ortho(-sc.r, sc.r, -sc.r, sc.r, 0.1, sc.r * 4); } else { LV = m4.lookAt(l.pos, v3.add(l.pos, l.dir), Math.abs(l.dir[2]) > 0.99 ? [0, 1, 0] : [0, 0, 1]); LP = m4.perspective(Math.min(150, l.L.light.angle + 10) * D2R, 1, 0.2, sc.r * 6); } LVP = m4.mul(LP, LV);
        gl.bindFramebuffer(gl.FRAMEBUFFER, sh.fb); gl.viewport(0, 0, shSize, shSize); gl.disable(gl.SCISSOR_TEST); gl.clear(gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.colorMask(false, false, false, false); gl.useProgram(this.pd); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 4); gl.disable(gl.CULL_FACE);
        for (const d of drawables) { if (d.ob.mat.alpha < 0.5) continue; const b = this.meshBuf(d.mesh, d.smooth); this.u(this.pd, 'uMVP', m4.mul(LVP, d.M)); gl.bindVertexArray(b.vao); gl.drawArrays(gl.TRIANGLES, 0, b.count); }
        gl.disable(gl.POLYGON_OFFSET_FILL); gl.colorMask(true, true, true, true); gl.bindFramebuffer(gl.FRAMEBUFFER, null); } }
    // main
    gl.viewport(0, 0, W, H); gl.disable(gl.SCISSOR_TEST); gl.clearColor(0.09, 0.095, 0.105, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.viewport(rect.x, rect.y, rect.w, rect.h); gl.enable(gl.SCISSOR_TEST); gl.scissor(rect.x, rect.y, rect.w, rect.h); gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.depthFunc(gl.LEQUAL); gl.disable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const VP = mats.VP; const amb = lin(hex(scene.world.ambient)).map((c) => c * scene.world.ambI);
    const setup = (p) => { gl.useProgram(p); this.u(p, 'uVP', VP); this.u(p, 'uCam', mats.eye); this.ui(p, 'uMode', rendered ? 1 : 0); this.u(p, 'uAmb', amb); this.u(p, 'uGround', amb.map((c) => c * 0.3)); this.ui(p, 'uNL', rendered ? lights.length : 0); this.ui(p, 'uShLight', shLight); this.u(p, 'uLVP', LVP); this.u(p, 'uShSize', shSize); this.u(p, 'uShBias', sc.r * 0.004);
      lights.forEach((l, i) => { const lp = this.loc(p, `uLPos[${i}]`); gl.uniform4f(lp, l.pos[0], l.pos[1], l.pos[2], l.type); gl.uniform4f(this.loc(p, `uLDir[${i}]`), l.dir[0], l.dir[1], l.dir[2], l.cos); gl.uniform3fv(this.loc(p, `uLCol[${i}]`), l.col); }); if (shLight >= 0) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shadow.tex); this.ui(p, 'uSh', 0); } else { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.dummyDepth()); this.ui(p, 'uSh', 0); } };
    const drawMesh = (d, outline = 0, outCol = null) => { const p = this.pm; const m = d.ob.mat; const b = this.meshBuf(d.mesh, d.smooth); this.u(p, 'uM', d.M); this.u(p, 'uNM', m4.normalMat(d.M)); this.u(p, 'uOutline', outline); this.ui(p, 'uOutlinePass', outline > 0 ? 1 : 0); if (outCol) this.u(p, 'uOutCol', outCol); this.u(p, 'uCol', hex(m.color)); this.u(p, 'uCol2', hex(m.color2)); this.u(p, 'uEmit', hex(m.emit)); this.u(p, 'uEmitI', m.emitI); this.u(p, 'uMetal', m.metal); this.u(p, 'uRough', m.rough); this.u(p, 'uAlpha', m.alpha); this.ui(p, 'uPat', ['none', 'checker', 'stripes', 'noise', 'grid'].indexOf(m.pat)); this.u(p, 'uPatScale', m.patScale); this.u(p, 'uScl', d.ob.scl.map(Math.abs)); gl.bindVertexArray(b.vao); gl.drawArrays(gl.TRIANGLES, 0, b.count); };
    const opaque = drawables.filter((d) => d.ob.mat.alpha >= 0.999), trans = drawables.filter((d) => d.ob.mat.alpha < 0.999).sort((a, b) => v3.len(v3.sub(b.ob.pos, mats.eye)) - v3.len(v3.sub(a.ob.pos, mats.eye)));
    const dpx = (pos) => (mats.ortho ? (2 * mats.dist * Math.tan(mats.fov / 2)) / rect.h : (2 * v3.len(v3.sub(pos, mats.eye)) * Math.tan(mats.fov / 2)) / rect.h);
    if (o.mode === 'wire') {
      for (const d of drawables) { const e = edgeData(d.mesh); const pts = new Float32Array(e.a.length); for (let i = 0; i < e.a.length; i += 3) { const p = m4.point(d.M, [e.a[i], e.a[i + 1], e.a[i + 2]]); pts[i] = p[0]; pts[i + 1] = p[1]; pts[i + 2] = p[2]; } this.lines(pts, o.sel && o.sel.has(d.ob.id) ? [1, 0.62, 0.2, 1] : [0.78, 0.8, 0.84, 1], VP, gl.LINES, { bias: 0 }); }
    } else {
      setup(this.pm); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1);
      for (const d of opaque) drawMesh(d); gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    // edit overlays
    if (o.editId && o.edit && o.mode !== 'wire') {
      const d = drawables.find((x) => x.ob.id === o.editId); if (d) { const e = edgeData(d.mesh); const pts = new Float32Array(e.a.length); for (let i = 0; i < e.a.length; i += 3) { const p = m4.point(d.M, [e.a[i], e.a[i + 1], e.a[i + 2]]); pts[i] = p[0]; pts[i + 1] = p[1]; pts[i + 2] = p[2]; } if (o.xray) gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND); const sf = o.edit.f; if (sf && sf.size) { const tri = []; for (const fi of sf) { const f = d.mesh.f[fi]; if (!f) continue; for (let i = 1; i < f.length - 1; i++) for (const k of [f[0], f[i], f[i + 1]]) tri.push(...m4.point(d.M, [d.mesh.v[k * 3], d.mesh.v[k * 3 + 1], d.mesh.v[k * 3 + 2]])); } this.lines(new Float32Array(tri), [1, 0.6, 0.15, 0.45], VP, gl.TRIANGLES, { bias: 0.0004 }); }
        this.lines(pts, [0.05, 0.05, 0.06, 0.85], VP, gl.LINES, { bias: 0.0004 });
        const se = []; if (o.edit.v && o.edit.v.size) for (let i = 0; i < e.es.length; i++) { const x = e.es[i]; if (o.edit.v.has(x.a) && o.edit.v.has(x.b)) se.push(pts[i * 6], pts[i * 6 + 1], pts[i * 6 + 2], pts[i * 6 + 3], pts[i * 6 + 4], pts[i * 6 + 5]); } if (se.length) this.lines(new Float32Array(se), [1, 0.6, 0.15, 1], VP, gl.LINES, { bias: 0.0008 });
        if (o.edit.smode === 'vert' || !o.edit.smode) { const all = [], sel = []; for (let i = 0; i < d.mesh.v.length / 3; i++) { const p = m4.point(d.M, [d.mesh.v[i * 3], d.mesh.v[i * 3 + 1], d.mesh.v[i * 3 + 2]]); (o.edit.v && o.edit.v.has(i) ? sel : all).push(...p); } this.lines(new Float32Array(all), [0.03, 0.03, 0.04, 1], VP, gl.POINTS, { size: 6, round: true, bias: 0.0012 }); this.lines(new Float32Array(sel), [1, 0.62, 0.15, 1], VP, gl.POINTS, { size: 8, round: true, bias: 0.0014 }); }
        gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); }
    }
    // outlines (selected objects)
    if (overlays && o.sel && o.sel.size && o.mode !== 'wire') {
      setup(this.pm); gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT);
      for (const d of drawables) { if (!o.sel.has(d.ob.id) || d.ob.id === o.editId) continue; const act = d.ob.id === o.active; drawMesh(d, dpx(d.ob.pos) * 2.2, act ? [1, 0.78, 0.35] : [0.93, 0.45, 0.1]); } gl.disable(gl.CULL_FACE);
    }
    // transparent
    if (trans.length && o.mode !== 'wire') { setup(this.pm); gl.enable(gl.BLEND); gl.depthMask(false); for (const d of trans) drawMesh(d); gl.depthMask(true); gl.disable(gl.BLEND); }
    gl.bindVertexArray(null);
    if (overlays) {
      gl.enable(gl.BLEND); const g = this.grid; this.lines(g.minor, [0.5, 0.52, 0.56, 0.1], VP, gl.LINES, { bias: 0.0004 }); this.lines(g.major, [0.55, 0.57, 0.62, 0.2], VP, gl.LINES, { bias: 0.0004 }); this.lines(g.ax, [0.9, 0.27, 0.3, 0.7], VP, gl.LINES, { bias: 0.0004 }); this.lines(g.ay, [0.45, 0.78, 0.25, 0.7], VP, gl.LINES, { bias: 0.0004 });
      for (const ob of scene.objs) { if (!ob.vis || ob.type === 'mesh') continue; if (view.cam && ob.id === scene.activeCam) continue; const sel = o.sel && o.sel.has(ob.id); const col = sel ? (ob.id === o.active ? [1, 0.78, 0.35, 1] : [0.93, 0.45, 0.1, 1]) : ob.type === 'light' ? [0.9, 0.9, 0.9, 1] : [0.8, 0.82, 0.86, 1]; this.lines(this.iconLines(ob, resA), col, VP, gl.LINES, { bias: 0.0002 }); }
      gl.disable(gl.BLEND);
      if (o.gizmo) { gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); const shapes = gizmoShapes(o.gizmo); for (const s of shapes) { const c = AXC[s.axis]; const hi = o.gizmo.hover === s.axis; this.lines(new Float32Array(s.pts.flat()), hi ? [1, 0.92, 0.3, 1] : [c[0], c[1], c[2], 1], VP, gl.LINE_STRIP, { bias: 0 }); } gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); }
    }
    gl.disable(gl.SCISSOR_TEST);
  }
  dummyDepth() { if (this._dd) return this._dd; const gl = this.gl; const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, 1, 1, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL); this._dd = t; return t; }
  iconLines(ob, resA) {
    const M = m4.trs(ob.pos, ob.rot, [1, 1, 1]); const L = []; const seg = (a, b) => L.push(...m4.point(M, a), ...m4.point(M, b)); const circle = (plane, r, z = 0, n = 28) => { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2; const f = (t) => (plane === 0 ? [Math.cos(t) * r, Math.sin(t) * r, z] : plane === 1 ? [Math.cos(t) * r, 0, Math.sin(t) * r] : [0, Math.cos(t) * r, Math.sin(t) * r]); seg(f(a), f(b)); } };
    if (ob.type === 'light') { const k = ob.light.kind; circle(0, 0.3); if (k === 'point') { circle(1, 0.3); circle(2, 0.3); seg([0, 0, 0], [0, 0, 0]); } else if (k === 'sun') { for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; seg([Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0], [Math.cos(a) * 0.65, Math.sin(a) * 0.65, 0]); } seg([0, 0, 0], [0, 0, -2.2]); seg([0, 0, -2.2], [0.12, 0, -1.9]); seg([0, 0, -2.2], [-0.12, 0, -1.9]); } else { const Ln = 1.8, r = Ln * Math.tan((ob.light.angle * D2R) / 2); circle(0, r, -Ln, 32); for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; seg([0, 0, 0], [Math.cos(a) * r, Math.sin(a) * r, -Ln]); } } const w = [0, 0, 0]; const pw = m4.point(M, w); L.push(pw[0], pw[1], pw[2], pw[0], pw[1], 0); }
    else if (ob.type === 'camera') { const d = 1.6, hy = d * Math.tan((ob.cam.fov * D2R) / 2), hx = hy * resA; const c = [[-hx, -hy, -d], [hx, -hy, -d], [hx, hy, -d], [-hx, hy, -d]]; for (const p of c) seg([0, 0, 0], p); for (let i = 0; i < 4; i++) seg(c[i], c[(i + 1) % 4]); seg([-hx * 0.5, hy * 1.08, -d], [0, hy * 1.5, -d]); seg([0, hy * 1.5, -d], [hx * 0.5, hy * 1.08, -d]); seg([-hx * 0.5, hy * 1.08, -d], [hx * 0.5, hy * 1.08, -d]); }
    else { seg([-0.5, 0, 0], [0.5, 0, 0]); seg([0, -0.5, 0], [0, 0.5, 0]); seg([0, 0, -0.5], [0, 0, 0.5]); }
    return new Float32Array(L);
  }
}
