// Single source for page titles, descriptions and structured data.
// Used at runtime (components/Seo.jsx) and at build time (vite-seo.js, which writes the same tags into static HTML).
import { SITE } from '../config.js';
import { software } from '../data/software.js';

export const SEO_START = '<!--seo-->';
export const SEO_END = '<!--/seo-->';

const SITE_TITLE = 'Techomato Softwares – Free apps that run in your browser';
const SITE_DESC = 'Free desktop-class apps in your browser: Docs, Sheets, Slides, PDF toolkit, photo, audio and video studios and more. No sign-up, and your files stay on your device.';

const LD_CATEGORY = {
  Office: 'BusinessApplication', Productivity: 'BusinessApplication', Business: 'BusinessApplication',
  Life: 'LifestyleApplication', Creative: 'DesignApplication', Studio: 'MultimediaApplication',
  Utilities: 'UtilitiesApplication', Developer: 'DeveloperApplication',
};

const clip = (s, n = 160) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');
const abs = (path) => SITE.url + path;

function softwareMeta(item) {
  const meta = {
    title: `${item.name} – ${item.tagline.replace(/\.$/, '')}`,
    description: clip(item.description),
    canonical: abs(`/software/${item.id}`),
    jsonLd: [],
  };
  if (item.status === 'available') {
    meta.jsonLd.push({
      '@context': 'https://schema.org', '@type': 'SoftwareApplication',
      name: item.name, description: item.description, url: abs(`/software/${item.id}`),
      applicationCategory: LD_CATEGORY[item.category] || 'UtilitiesApplication',
      operatingSystem: item.platforms.includes('windows') ? 'Windows, any modern web browser' : 'Any modern web browser',
      ...(item.url ? {} : { offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }), // external products may be paid
    });
  }
  return meta;
}

// path -> { title, description, canonical, robots?, jsonLd[] }
export function metaFor(path) {
  if (path === '/') {
    return {
      title: SITE_TITLE, description: SITE_DESC, canonical: abs('/'),
      jsonLd: [
        { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE.name, url: abs('/') },
        { '@context': 'https://schema.org', '@type': 'Organization', name: 'Techomato', url: abs('/'), logo: abs('/favicon.svg') },
      ],
    };
  }
  const [, kind, id] = path.split('/');
  const item = software.find((s) => s.id === id);
  if (item && kind === 'software') return softwareMeta(item);
  // The app page itself points search engines at the matching software page.
  if (item && kind === 'app' && item.launch) return softwareMeta(item);
  return { title: 'Page not found – Techomato Softwares', description: SITE_DESC, canonical: abs('/'), robots: 'noindex', jsonLd: [] };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// Same tags as components/Seo.jsx sets, as an HTML string for the build.
export function headHtml(m) {
  const tags = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}" />`,
    `<link rel="canonical" href="${esc(m.canonical)}" />`,
    m.robots && `<meta name="robots" content="${m.robots}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(SITE.name)}" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:url" content="${esc(m.canonical)}" />`,
    `<meta property="og:image" content="${abs('/og-image.png')}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="Techomato Softwares: free apps that run in your browser" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:image" content="${abs('/og-image.png')}" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    `<meta name="twitter:description" content="${esc(m.description)}" />`,
    ...m.jsonLd.map((d) => `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, '\\u003c')}</script>`),
  ];
  return tags.filter(Boolean).join('\n    ');
}

// Plain-HTML fallback for visitors and crawlers without JavaScript: the page's own text plus links to every page.
export function noscriptHtml(m) {
  const links = software.map((s) => `<li><a href="/software/${s.id}">${esc(s.name)}</a> – ${esc(s.tagline)}</li>`).join('');
  return `<noscript><h1>${esc(m.title)}</h1><p>${esc(m.description)}</p><p>Techomato Softwares needs JavaScript to run its apps.</p><ul>${links}</ul></noscript>`;
}
