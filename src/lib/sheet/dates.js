// Excel date serial helpers (1900 date system, with the 1900 leap-year quirk).
const MS_DAY = 86400000;
const EPOCH = Date.UTC(1899, 11, 30);

export function serialFromYMD(y, m, d) {
  // m is 1-12 but may overflow (like Excel DATE)
  const t = Date.UTC(2000, 0, 1);
  const dt = new Date(t);
  dt.setUTCFullYear(y, m - 1, d);
  let s = Math.round((dt.getTime() - EPOCH) / MS_DAY);
  if (y === 1900 && s < 61 && s >= 1 && (m < 3)) s -= 1; // before the fake Feb 29, 1900
  if (s < 61 && s > 0 && !(y === 1900 && m < 3)) { /* ok */ }
  return s;
}

export function ymdFromSerial(serial) {
  let n = Math.floor(serial);
  if (n === 60) return { y: 1900, m: 2, d: 29, wd: 3 };
  if (n < 60) n += 1; // account for the fake leap day
  const dt = new Date(EPOCH + n * MS_DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), wd: dt.getUTCDay() };
}

export const serialFromDate = (date) => (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds()) - EPOCH) / MS_DAY;

export function timeParts(serial) {
  let f = serial - Math.floor(serial);
  let ms = Math.round(f * MS_DAY);
  if (ms >= MS_DAY) ms = 0;
  const h = Math.floor(ms / 3600000);
  const mi = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const frac = (ms % 1000) / 1000;
  return { h, mi, s, frac };
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* Try to read text as a date and/or time. Returns serial number or null. */
export function parseDateTime(text) {
  const t = text.trim();
  let m;
  const mk = (y, mo, d) => {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(2000, 0, 1)); dt.setUTCFullYear(y, mo - 1, d);
    if (dt.getUTCMonth() !== mo - 1) return null;
    return serialFromYMD(y, mo, d);
  };
  const timePart = (s) => {
    const mm = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(AM|PM|am|pm)?$/.exec(s.trim());
    if (!mm) return null;
    let h = +mm[1]; const mi = +mm[2]; const sec = mm[3] ? +mm[3] : 0;
    if (mm[5]) { const pm = /pm/i.test(mm[5]); if (h > 12 || h === 0) return null; h = (h % 12) + (pm ? 12 : 0); }
    if (h > 23 && !mm[5] && !(h < 10000)) return null;
    if (mi > 59 || sec > 59) return null;
    return (h * 3600 + mi * 60 + sec) / 86400;
  };
  // time only
  const tOnly = timePart(t);
  if (tOnly !== null && /:/.test(t)) return tOnly;
  let datePart = t; let tm = 0;
  const sp = /^(.*?\d)(?:[ T]+(\d{1,2}:\d{2}.*))$/.exec(t);
  if (sp) { const tp = timePart(sp[2]); if (tp === null) return null; tm = tp; datePart = sp[1]; }
  let d = null;
  if ((m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(datePart))) d = mk(+m[1], +m[2], +m[3]);
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(datePart))) { let y = +m[3]; if (y < 100) y += y < 30 ? 2000 : 1900; d = mk(y, +m[1], +m[2]); }
  else if ((m = /^(\d{1,2})[- ]([A-Za-z]{3,9})[- ,]+(\d{2,4})$/.exec(datePart))) {
    const mo = MONTHS.findIndex((x) => x.toLowerCase().startsWith(m[2].toLowerCase().slice(0, 3)));
    let y = +m[3]; if (y < 100) y += y < 30 ? 2000 : 1900;
    if (mo >= 0) d = mk(y, mo + 1, +m[1]);
  } else if ((m = /^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/.exec(datePart))) {
    const mo = MONTHS.findIndex((x) => x.toLowerCase().startsWith(m[1].toLowerCase().slice(0, 3)));
    if (mo >= 0) d = mk(+m[3], mo + 1, +m[2]);
  }
  return d === null ? null : d + tm;
}
