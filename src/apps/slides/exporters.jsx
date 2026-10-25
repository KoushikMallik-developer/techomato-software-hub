import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { SlideView } from './Render.jsx';
import { SLIDE_CSS } from './slidecss.js';
import { SW, SH } from './model.js';

/* render one slide off-screen and hand the DOM node to `fn` */
async function withSlideNode(deck, i, fn) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:960px;height:540px;overflow:hidden;pointer-events:none';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<><style>{SLIDE_CSS}</style><SlideView bare slide={deck.slides[i]} deck={deck} index={i} scale={1} mode="present" /></>));
    await new Promise((r) => requestAnimationFrame(() => r()));
    return await fn(host.querySelector('.slide'));
  } finally { root.unmount(); host.remove(); }
}

export async function slideHtmlParts(deck) {
  const out = [];
  for (let i = 0; i < deck.slides.length; i++) {
    out.push(await withSlideNode(deck, i, (n) => ({ html: n.outerHTML, notes: deck.slides[i].notes || '', hidden: !!deck.slides[i].hidden, trans: deck.slides[i].trans && deck.slides[i].trans.type, dur: deck.slides[i].trans && deck.slides[i].trans.dur })));
  }
  return out;
}

export async function slidesToHtml(deck, title) {
  const parts = (await slideHtmlParts(deck)).filter((p) => !p.hidden);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
${SLIDE_CSS}
html,body{margin:0;height:100%;background:#0b0f17;overflow:hidden;font-family:system-ui,sans-serif}
#stage{position:fixed;inset:0;display:grid;place-items:center}
#frame{position:relative;width:${SW}px;height:${SH}px;transform-origin:center center}
#frame .slide{position:absolute!important;left:0;top:0}
.pg{position:absolute;inset:0;opacity:0;pointer-events:none;transition:opacity .35s}
.pg.on{opacity:1;pointer-events:auto}
#bar{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);display:flex;gap:8px;align-items:center;background:rgba(15,23,42,.85);color:#fff;border-radius:999px;padding:6px 12px;font-size:14px;opacity:0;transition:opacity .25s}
body:hover #bar{opacity:1}
#bar button{border:0;background:transparent;color:#fff;font-size:18px;cursor:pointer;padding:0 6px}
#notes{position:fixed;right:0;top:0;bottom:0;width:300px;background:#111827;color:#e5e7eb;padding:16px;overflow:auto;display:none;font-size:15px;white-space:pre-wrap}
body.shownotes #notes{display:block}
</style></head><body>
<div id="stage"><div id="frame">${parts.map((p, i) => `<div class="pg${i === 0 ? ' on' : ''}" data-notes="${esc(p.notes).replace(/"/g, '&quot;')}">${p.html}</div>`).join('')}</div></div>
<div id="bar"><button id="pv" aria-label="Previous">&#8249;</button><span id="ct"></span><button id="nx" aria-label="Next">&#8250;</button><button id="nt" aria-label="Notes" title="Notes">&#9998;</button><button id="fs" aria-label="Fullscreen" title="Fullscreen">&#9974;</button></div>
<div id="notes"></div>
<script>
(function(){
var pages=[].slice.call(document.querySelectorAll('.pg')),i=0,f=document.getElementById('frame'),ct=document.getElementById('ct'),nt=document.getElementById('notes');
function fit(){var k=Math.min(innerWidth/${SW},innerHeight/${SH});f.style.transform='scale('+k+')'}
function show(n){i=Math.max(0,Math.min(pages.length-1,n));pages.forEach(function(p,k){p.classList.toggle('on',k===i)});ct.textContent=(i+1)+' / '+pages.length;nt.textContent=pages[i].getAttribute('data-notes')||'';location.hash='#'+(i+1)}
addEventListener('resize',fit);fit();
addEventListener('keydown',function(e){var k=e.key;if(k==='ArrowRight'||k===' '||k==='PageDown'||k==='Enter')show(i+1);else if(k==='ArrowLeft'||k==='PageUp'||k==='Backspace')show(i-1);else if(k==='Home')show(0);else if(k==='End')show(pages.length-1);else if(k==='n'||k==='N')document.body.classList.toggle('shownotes');else if(k==='f'||k==='F')fs()});
function fs(){if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen()}
document.getElementById('pv').onclick=function(){show(i-1)};document.getElementById('nx').onclick=function(){show(i+1)};document.getElementById('fs').onclick=fs;document.getElementById('nt').onclick=function(){document.body.classList.toggle('shownotes')};
f.addEventListener('click',function(e){if(e.target.closest('a'))return;show(i+1)});
var h=parseInt(location.hash.slice(1),10);show(h?h-1:0);
})();
</script></body></html>`;
}

/* ----- PNG ----- */
export async function slideToPng(deck, i, scale = 2) {
  const xhtml = await withSlideNode(deck, i, (n) => new XMLSerializer().serializeToString(n));
  const css = SLIDE_CSS.replace(/</g, '\\3c ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${SW}px;height:${SH}px"><style>${css}</style>${xhtml}</div></foreignObject></svg>`;
  const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('render failed')); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  const c = document.createElement('canvas'); c.width = SW * scale; c.height = SH * scale;
  const g = c.getContext('2d'); g.scale(scale, scale); g.drawImage(img, 0, 0, SW, SH);
  return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('could not encode image'))), 'image/png'));
}

export async function slidesToZip(deck) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (let i = 0; i < deck.slides.length; i++) zip.file(`slide-${String(i + 1).padStart(2, '0')}.png`, await slideToPng(deck, i, 1.5));
  return await zip.generateAsync({ type: 'blob' });
}
