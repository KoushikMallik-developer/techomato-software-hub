import { Link, NavLink, Outlet } from 'react-router-dom';
import { SITE } from '../config.js';
import { TomatoMark } from './Brand.jsx';
import { software } from '../data/software.js';

export default function Layout() {
  const count = software.filter((s) => s.status === 'available').length;
  return (
    <div className="site">
      <header className="site-header no-print">
        <div className="wrap header-row">
          <Link to="/" className="brand" aria-label={`${SITE.name} home`}>
            <TomatoMark size={32} />
            <span>techomato<b> softwares</b></span>
          </Link>
          <nav className="nav" aria-label="Main">
            <NavLink to="/" end>All apps</NavLink>
            <Link to="/?platform=browser">Browser apps</Link>
            <Link to="/?platform=windows">Windows downloads</Link>
          </nav>
        </div>
      </header>
      <main className="site-main">
        <Outlet />
      </main>
      <footer className="site-footer no-print">
        <div className="wrap foot-row">
          <div>
            <p className="foot-brand"><TomatoMark size={26} /> techomato softwares</p>
            <p className="muted">{SITE.tagline}</p>
          </div>
          <div className="foot-r">
            <p>{count} apps, free to use, no sign-up.</p>
            <p className="muted">Your files stay on your own device. Use each app's backup to keep a copy elsewhere.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
