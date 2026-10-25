import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="wrap detail">
      <h1>Page not found</h1>
      <p className="lead">We couldn't find what you were looking for.</p>
      <Link className="btn primary" to="/">
        Back to all software
      </Link>
    </div>
  );
}
