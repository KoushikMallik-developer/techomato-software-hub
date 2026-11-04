import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { metaFor } from '../lib/seo.js';

// Single-page app: keep the head tags in step with the route (the build already wrote them for first load).
function put(selector, make, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) { el = document.createElement(make); document.head.appendChild(el); }
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
}
const name = (n, content) => put(`meta[name="${n}"]`, 'meta', { name: n, content });
const prop = (p, content) => put(`meta[property="${p}"]`, 'meta', { property: p, content });

export default function Seo() {
  const { pathname } = useLocation();
  useEffect(() => {
    const m = metaFor(pathname);
    document.title = m.title;
    name('description', m.description);
    put('link[rel="canonical"]', 'link', { rel: 'canonical', href: m.canonical });
    name('robots', m.robots || 'index, follow');
    prop('og:title', m.title); prop('og:description', m.description); prop('og:url', m.canonical);
    name('twitter:title', m.title); name('twitter:description', m.description);
    // Build-time JSON-LD has no data-seo mark; drop it too so tags are not doubled after navigation.
    document.head.querySelectorAll('script[type="application/ld+json"]').forEach((n) => n.remove());
    m.jsonLd.forEach((d) => {
      const s = document.createElement('script');
      s.type = 'application/ld+json';
      s.textContent = JSON.stringify(d);
      document.head.appendChild(s);
    });
  }, [pathname]);
  return null;
}
