/* Vault crypto: PBKDF2-SHA256 -> AES-256-GCM, TOTP, generators, strength. Everything runs in the browser. */
const enc = new TextEncoder(), dec = new TextDecoder();
export const ITER = 600000;
export const b64 = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const rnd = (n) => { const a = new Uint32Array(1); const lim = Math.floor(0x100000000 / n) * n; let x; do { crypto.getRandomValues(a); x = a[0]; } while (x >= lim); return x % n; };

export async function deriveKey(pw, salt, iter = ITER) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pw.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function seal(key, obj) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))); return { iv: b64(iv), ct: b64(ct) }; }
export async function open(key, box) { const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct)); return JSON.parse(dec.decode(pt)); }
/* create a brand-new envelope */
export async function createEnvelope(pw, payload) { const salt = crypto.getRandomValues(new Uint8Array(16)); const key = await deriveKey(pw, salt, ITER); const box = await seal(key, payload); return { env: { kind: 'techomato-vault', v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt), ...box }, key }; }
export async function unlockEnvelope(pw, env) { const key = await deriveKey(pw, unb64(env.salt), env.iter || ITER); const payload = await open(key, env); return { key, payload }; }
export async function resealEnvelope(env, key, payload) { const box = await seal(key, payload); return { ...env, ...box }; }

/* ---- TOTP (RFC 6238, SHA-1, 6 digits, 30 s) ---- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(s) { s = s.replace(/[\s=-]/g, '').toUpperCase(); let bits = ''; for (const ch of s) { const i = B32.indexOf(ch); if (i < 0) throw new Error('bad base32'); bits += i.toString(2).padStart(5, '0'); } const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return new Uint8Array(out); }
export async function totp(secret, t = Date.now(), period = 30, digits = 6) {
  const key = await crypto.subtle.importKey('raw', base32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']); const ctr = Math.floor(t / 1000 / period); const buf = new ArrayBuffer(8); const v = new DataView(buf); v.setUint32(0, Math.floor(ctr / 4294967296)); v.setUint32(4, ctr >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf)); const o = h[h.length - 1] & 15; const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]; return String(bin % 10 ** digits).padStart(digits, '0');
}
export const parseOtpAuth = (s) => { const m = /^otpauth:\/\/totp\/[^?]*\?(.*)$/i.exec(s.trim()); if (!m) return s.trim(); return new URLSearchParams(m[1]).get('secret') || s.trim(); };

/* ---- generators ---- */
const WORDS = 'able acid aged also area army atom aunt away baby back ball band bank barn base bath bean bear beat bell belt bend bike bird blue boat body bold bone book boot born boss bowl bulb bulk burn bush busy cafe cake calm camp card care cart case cash cast cave chef chip city clay clip club coal coat code coin cold cook cool cope copy cord core corn cost cozy crew crop crow cube curl dark dash data dawn deal deck deep deer desk dial dice dish dive dock dome door dove down draw drop drum duck dust duty each earn east easy echo edge epic even exit face fact fade fair farm fast fate fern file film fine fire firm fish five flag flat flip flow foam fold folk food foot fork form fort frog fuel full gain game gate gear gift glad glow goal goat gold golf good grab gray grid grin grow gulf hair half hall hand hard harp hawk heal heap heat help herb hero hill hint hive hold hole home hood hook hope horn host hour hunt hurt idea inch iron isle jade jazz join joke jump jury keen keep kind king kite knee knot lake lamp land lane lark last lawn leaf lean lens life lift lime line lion list loaf lock loft long loop lost loud love luck lunch lynx mail main many maps mark mask mast meal melt menu mesh mild mile milk mind mint mist moon moss move nail name navy neat nest news nice node noon note oaks oats ocean open orbit otter oven pace pack page palm park path peak pear pine pink plan play plum pond pony pool port quiz race rain rank reed rest rice ride ring road rock roof room rope rose ruby rush sage sail salt sand seal seed ship shoe silk snow soup star tide wolf'.split(' ');
export const WORD_COUNT = WORDS.length;
export function genPassword(o) {
  let sets = []; if (o.lower) sets.push('abcdefghijkmnopqrstuvwxyz' + (o.ambig ? '' : 'l')); if (o.upper) sets.push('ABCDEFGHJKLMNPQRSTUVWXYZ' + (o.ambig ? '' : 'IO')); if (o.digits) sets.push('23456789' + (o.ambig ? '' : '01')); if (o.symbols) sets.push(o.symbolSet || '!@#$%^&*-_=+?.');
  if (!sets.length) sets = ['abcdefghijkmnopqrstuvwxyz']; const all = sets.join(''); const out = sets.map((s) => s[rnd(s.length)]); while (out.length < o.length) out.push(all[rnd(all.length)]);
  for (let i = out.length - 1; i > 0; i--) { const j = rnd(i + 1); [out[i], out[j]] = [out[j], out[i]]; } return out.slice(0, Math.max(o.length, sets.length)).join('');
}
export function genPassphrase(o) { const w = Array.from({ length: o.words }, () => { let x = WORDS[rnd(WORDS.length)]; if (o.cap) x = x[0].toUpperCase() + x.slice(1); return x; }); let s = w.join(o.sep); if (o.num) s += o.sep + rnd(100); return s; }
export const poolSize = (o) => { let n = 0; if (o.lower) n += 25 + (o.ambig ? 0 : 1); if (o.upper) n += 24 + (o.ambig ? 0 : 2); if (o.digits) n += 8 + (o.ambig ? 0 : 2); if (o.symbols) n += (o.symbolSet || '!@#$%^&*-_=+?.').length; return n || 25; };
export const genBits = (o, mode) => (mode === 'phrase' ? Math.round(o.words * Math.log2(WORDS.length) + (o.num ? Math.log2(100) : 0)) : Math.round(o.length * Math.log2(poolSize(o))));

/* quick strength estimate for typed passwords (not a substitute for a real zxcvbn) */
const COMMON = ['password', '123456', 'qwerty', 'letmein', 'welcome', 'admin', 'iloveyou', 'monkey', 'dragon', 'abc123', 'football', 'login', 'princess', 'sunshine', 'master', 'shadow', 'passw0rd', '111111', '000000'];
export function strength(pw) {
  if (!pw) return { bits: 0, label: 'Empty', score: 0, tips: [] };
  const l = pw.toLowerCase(); let pool = 0; if (/[a-z]/.test(pw)) pool += 26; if (/[A-Z]/.test(pw)) pool += 26; if (/\d/.test(pw)) pool += 10; if (/[^A-Za-z0-9]/.test(pw)) pool += 32;
  let bits = pw.length * Math.log2(Math.max(pool, 2)); const tips = [];
  if (COMMON.some((c) => l.includes(c))) { bits = Math.min(bits, 20); tips.push('Contains a very common password'); }
  if (/(.)\1{2,}/.test(pw)) { bits -= 8; tips.push('Repeated characters'); }
  if (/(012|123|234|345|456|567|678|789|abc|bcd|cde|def|qwe|wer|ert|asd|sdf|zxc)/i.test(pw)) { bits -= 10; tips.push('Easy sequences like 123 or abc'); }
  if (/^[A-Za-z]+\d{1,4}$/.test(pw)) { bits -= 6; tips.push('Word followed by digits is easy to guess'); }
  if (pw.length < 12) tips.push('Use 12 or more characters');
  bits = Math.max(0, Math.round(bits)); const score = bits < 35 ? 1 : bits < 55 ? 2 : bits < 75 ? 3 : 4;
  return { bits, score, label: ['', 'Weak', 'Fair', 'Good', 'Strong'][score], tips };
}
