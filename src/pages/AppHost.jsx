import { lazy, Suspense } from 'react';
import { useParams, Link } from 'react-router-dom';

const apps = {
  money: lazy(() => import('../apps/MoneyApp.jsx')),
  photo: lazy(() => import('../apps/PhotoApp.jsx')),
  audio: lazy(() => import('../apps/AudioApp.jsx')),
  video: lazy(() => import('../apps/VideoApp.jsx')),
  motion: lazy(() => import('../apps/MotionApp.jsx')),
  '3d': lazy(() => import('../apps/ThreeDApp.jsx')),
  pdf: lazy(() => import('../apps/PdfApp.jsx')),
  convert: lazy(() => import('../apps/ConvertApp.jsx')),
  mindmap: lazy(() => import('../apps/MindApp.jsx')),
  vault: lazy(() => import('../apps/VaultApp.jsx')),
  flow: lazy(() => import('../apps/FlowApp.jsx')),
};

// To add a new browser app: create src/apps/MyApp.jsx, register it here,
// and add a catalog entry in src/data/software.js with launch: '/app/<id>'.
export default function AppHost() {
  const { id } = useParams();
  const App = apps[id];
  if (!App) {
    return (
      <div className="wrap detail">
        <h1>App not found</h1>
        <Link className="btn primary" to="/">
          Back to all software
        </Link>
      </div>
    );
  }
  return (
    <Suspense fallback={<div className="loading">Loading...</div>}>
      <App />
    </Suspense>
  );
}
