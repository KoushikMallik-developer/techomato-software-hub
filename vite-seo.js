// Build-time SEO: writes real titles/meta/structured data into static HTML for every page
// (so crawlers and link previews that do not run JavaScript still see them), plus sitemap.xml.
import { software } from './src/data/software.js';
import { SITE } from './src/config.js';
import { metaFor, headHtml, noscriptHtml, SEO_START, SEO_END } from './src/lib/seo.js';

const block = (path) => `${SEO_START}\n    ${headHtml(metaFor(path))}\n    ${SEO_END}`;

export default function seo() {
  return {
    name: 'techomato-seo',
    enforce: 'post', // after Vite has emitted index.html
    transformIndexHtml: (html) => html.replace(SEO_START + SEO_END, block('/')),
    generateBundle(_, bundle) {
      const index = bundle['index.html'];
      const base = index.source;
      const start = base.indexOf(SEO_START);
      const end = base.indexOf(SEO_END) + SEO_END.length;
      if (start < 0 || end < SEO_END.length) throw new Error('techomato-seo: markers missing in index.html');
      const withMeta = (path) => (base.slice(0, start) + block(path) + base.slice(end))
        .replace('<div id="root"></div>', `<div id="root"></div>\n    ${noscriptHtml(metaFor(path))}`);
      index.source = withMeta('/');

      const pages = software.flatMap((s) => [`/software/${s.id}`, ...(s.launch ? [`/app/${s.id}`] : [])]);
      for (const p of pages) this.emitFile({ type: 'asset', fileName: `${p.slice(1)}/index.html`, source: withMeta(p) });

      const urls = ['/', ...software.map((s) => `/software/${s.id}`)];
      this.emitFile({
        type: 'asset', fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE.url}${u}</loc></url>`).join('\n')}\n</urlset>\n`,
      });
    },
  };
}
