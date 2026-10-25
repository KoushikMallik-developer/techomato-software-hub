export function detectDelim(text) {
  const head = text.slice(0, 4000).split(/\r?\n/).slice(0, 8);
  const score = (d) => { const counts = head.filter(Boolean).map((l) => l.split(d).length - 1); return counts.length && counts.every((c) => c === counts[0]) ? counts[0] : 0; };
  let best = ','; let bs = 0;
  [',', '\t', ';', '|'].forEach((d) => { const s = score(d); if (s > bs) { bs = s; best = d; } });
  return best;
}
export function parseCSV(text, delim) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const D = delim || detectDelim(text);
  const rows = []; let row = []; let cur = ''; let q = false; let touched = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"' && cur === '') { q = true; touched = true; }
    else if (ch === D) { row.push(cur); cur = ''; touched = true; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = ''; touched = false;
    } else { cur += ch; touched = true; }
  }
  if (cur !== '' || touched || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
export function toCSV(rows, delim = ',') {
  const re = new RegExp(`["\\n\\r${delim === '\t' ? '\\t' : delim}]`);
  return rows.map((r) => r.map((s) => { const t = s === null || s === undefined ? '' : String(s); return re.test(t) || /^\s|\s$/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }).join(delim)).join('\r\n');
}
