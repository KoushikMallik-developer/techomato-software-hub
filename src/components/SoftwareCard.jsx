import { Link } from 'react-router-dom';
import AppLogo, { APP_COLORS } from './AppLogo.jsx';

export function PlatformBadges({ platforms }) {
  return (
    <span className="badges">
      {platforms.includes('browser') && <span className="badge badge-browser">Browser</span>}
      {platforms.includes('windows') && <span className="badge badge-windows">Windows</span>}
    </span>
  );
}

// Logo tile: the app's own gradient logo when it has one, else a tinted emoji tile (coming-soon items).
export function Logo({ item, size = 52 }) {
  if (APP_COLORS[item.id]) return <AppLogo id={item.id} size={size} />;
  return <div className="card-icon" style={{ width: size, height: size, background: item.color + '22', color: item.color, fontSize: size * 0.5 }} aria-hidden="true">{item.icon}</div>;
}

export default function SoftwareCard({ item }) {
  const available = item.status === 'available';
  return (
    <article className={'card' + (available ? '' : ' card-soon')}>
      <div className="card-top">
        <Logo item={item} />
        <div className="card-body">
          <h3><Link to={`/software/${item.id}`}>{item.name}</Link></h3>
          <p className="card-tag">{item.tagline}</p>
        </div>
      </div>
      <div className="card-foot">
        <div className="card-meta">
          <PlatformBadges platforms={item.platforms} />
          {!available && <span className="badge badge-soon">Coming soon</span>}
          {available && <span className="badge">{item.category}</span>}
        </div>
        {available && item.launch ? (
          <Link className="btn primary" to={item.launch} aria-label={`Open ${item.name}`}>Open</Link>
        ) : (
          <Link className="btn ghost" to={`/software/${item.id}`}>Details</Link>
        )}
      </div>
    </article>
  );
}
