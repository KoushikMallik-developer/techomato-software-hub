import { Link, useParams } from 'react-router-dom';
import { getSoftware, software } from '../data/software.js';
import SoftwareCard, { PlatformBadges, Logo } from '../components/SoftwareCard.jsx';
import NotFound from './NotFound.jsx';

const related = (item) => software.filter((s) => s.id !== item.id && s.status === 'available').sort((a, b) => Number(b.category === item.category) - Number(a.category === item.category)).slice(0, 3);

export default function SoftwarePage() {
  const { id } = useParams();
  const item = getSoftware(id);
  if (!item) return <NotFound />;

  const available = item.status === 'available';
  const canLaunch = available && item.launch && item.platforms.includes('browser');
  const canDownload = available && item.download && item.download.url;

  return (
    <div className="wrap detail">
      <Link to="/" className="crumb">
        ← All apps
      </Link>
      <div className="detail-head">
        <Logo item={item} size={84} />
        <div>
          <h1>{item.name}</h1>
          <p className="lead">{item.tagline}</p>
          <div className="card-meta">
            <PlatformBadges platforms={item.platforms} />
            {!available && <span className="badge badge-soon">Coming soon</span>}
          </div>
        </div>
      </div>

      <div className="detail-actions">
        {canLaunch && (
          <Link className="btn primary lg" to={item.launch}>
            Open in browser
          </Link>
        )}
        {canDownload && (
          <a className="btn lg" href={item.download.url} download>
            Download for Windows
            {item.download.version ? ` (v${item.download.version}` : ''}
            {item.download.size ? `, ${item.download.size})` : item.download.version ? ')' : ''}
          </a>
        )}
        {!canLaunch && !canDownload && (
          <button className="btn lg" disabled>
            Coming soon
          </button>
        )}
      </div>

      <div className="detail-cols">
        <section>
          <h2>About</h2>
          <p>{item.description}</p>
          <h2>Features</h2>
          <ul className="feature-list">
            {item.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
        <aside className="facts">
          <h2>Details</h2>
          <dl>
            <dt>Category</dt>
            <dd>{item.category}</dd>
            {item.version && (
              <>
                <dt>Version</dt>
                <dd>{item.version}</dd>
              </>
            )}
            {item.requirements && (
              <>
                <dt>Requirements</dt>
                <dd>{item.requirements}</dd>
              </>
            )}
          </dl>
        </aside>
      </div>

      <h2 className="more-title">More from Techomato</h2>
      <div className="grid-cards">
        {related(item).map((s) => <SoftwareCard key={s.id} item={s} />)}
      </div>
    </div>
  );
}
