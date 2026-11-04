import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { software as catalog, categories, categoryOrder } from '../data/software.js';
import SoftwareCard from '../components/SoftwareCard.jsx';
import AppLogo from '../components/AppLogo.jsx';
import { TomatoMark } from '../components/Brand.jsx';

const FACTS = [
  ['No sign-up', 'Open an app and start. No account, no install.'],
  ['Private by design', 'Your files are saved on your own device, not on a server.'],
  ['Office-compatible', 'Docs, Sheets and Slides open and save .docx, .xlsx and .pptx files.'],
  ['Light and dark', 'Every app follows your device theme and works on phones too.'],
];

// External products (own site, own sign-in) get their own landing section instead of an app card.
const software = catalog.filter((s) => !s.url);
const erp = catalog.find((s) => s.id === 'colleges');

// Flagship and newest apps shown in the hero (max 5); the full catalog is below.
const HERO_IDS = ['docs', 'sheets', 'slides', 'pdf', 'photo'];
const heroApps = HERO_IDS.map((id) => software.find((s) => s.id === id)).filter((s) => s && s.status === 'available');

export default function Home() {
  const [params, setParams] = useSearchParams();
  const platform = params.get('platform') || 'all';
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const apps = software.filter((s) => s.status === 'available');

  const setPlatform = (p) => (p === 'all' ? setParams({}) : setParams({ platform: p }));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return software.filter((s) => {
      if (platform !== 'all' && !s.platforms.includes(platform)) return false;
      if (category !== 'All' && s.category !== category) return false;
      if (!q) return true;
      return (s.name + ' ' + s.tagline + ' ' + s.category + ' ' + s.features.join(' ')).toLowerCase().includes(q);
    });
  }, [query, platform, category]);

  const available = filtered.filter((s) => s.status === 'available');
  const soon = filtered.filter((s) => s.status !== 'available');

  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="eyebrow"><TomatoMark size={20} /> Techomato Softwares</p>
            <h1>Everyday apps, <span className="hl">freshly picked.</span></h1>
            <p className="lead">
              {apps.length} full-featured apps that run right in your browser: documents, spreadsheets, slides, tasks, notes,
              calendar, money and habits, handy tools like a PDF toolkit, password vault, flashcards, whiteboard and code playground, plus a creative studio for photos, audio, video, motion graphics and 3D. Windows downloads are added as they are released.
            </p>
            <div className="hero-actions">
              <a className="btn primary lg" href="#apps">Browse all apps</a>
              <Link className="btn lg" to="/app/docs">Start a document</Link>
            </div>
          </div>
          <div className="hero-tiles" aria-label="Apps">
            {heroApps.map((s) => (
              <Link key={s.id} to={s.launch} className="hero-tile" title={s.name} aria-label={`Open ${s.name}`}>
                <AppLogo id={s.id} size={64} />
                <span>{s.name.replace('Techomato ', '').replace('PDF Toolkit', 'PDF')}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="wrap facts-strip" aria-label="Highlights">
        {FACTS.map(([t, d]) => (
          <div key={t} className="fact"><b>{t}</b><span>{d}</span></div>
        ))}
      </section>

      {erp && (
        <section className="wrap erp-band" aria-labelledby="erp-title">
          <div className="erp-grid">
            <div className="erp-copy">
              <p className="erp-eyebrow">Featured product</p>
              <h2 id="erp-title">{erp.name}</h2>
              <p className="erp-lead">{erp.description}</p>
              <div className="hero-actions">
                <a className="btn primary lg" href={erp.url} target="_blank" rel="noopener noreferrer">Open Techomato Colleges</a>
                <Link className="btn ghost lg" to={`/software/${erp.id}`}>Learn more</Link>
              </div>
              <p className="erp-note">Opens colleges.techomato.com · Separate sign-in required</p>
            </div>
            <ul className="erp-tiles">
              {erp.highlights.map(([t, d, icon]) => (
                <li key={t}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icon} /></svg>
                  <b>{t}</b><span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="wrap" id="apps">
        <div className="filters">
          <input type="search" className="search" placeholder={`Search ${apps.length} apps and features...`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search software" />
          <div className="chips" role="group" aria-label="Platform">
            {[['all', 'All platforms'], ['browser', 'Browser'], ['windows', 'Windows']].map(([k, label]) => (
              <button key={k} className={'chip' + (platform === k ? ' on' : '')} onClick={() => setPlatform(k)}>{label}</button>
            ))}
          </div>
          <div className="chips" role="group" aria-label="Category">
            {categories.map((c) => (
              <button key={c} className={'chip' + (category === c ? ' on' : '')} onClick={() => setCategory(c)}>{c}</button>
            ))}
          </div>
        </div>

        {categoryOrder.map((cat) => {
          const items = available.filter((s) => s.category === cat);
          if (!items.length) return null;
          return (
            <div key={cat} className="cat-block">
              <h2 className="section-title">{cat}</h2>
              <div className="grid-cards">{items.map((s) => <SoftwareCard key={s.id} item={s} />)}</div>
            </div>
          );
        })}

        {soon.length > 0 && (
          <div className="cat-block">
            <h2 className="section-title">Coming soon</h2>
            <div className="grid-cards">{soon.map((s) => <SoftwareCard key={s.id} item={s} />)}</div>
          </div>
        )}

        {filtered.length === 0 && <p className="muted empty">Nothing matches your filters.</p>}
      </section>
    </>
  );
}
