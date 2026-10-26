import { lazy, Suspense } from 'react';
import { useParams, Link } from 'react-router-dom';

const apps = {
  docs: lazy(() => import('../apps/DocsApp.jsx')),
  sheets: lazy(() => import('../apps/SheetsApp.jsx')),
  slides: lazy(() => import('../apps/SlidesApp.jsx')),
  todo: lazy(() => import('../apps/TodoApp.jsx')),
  calendar: lazy(() => import('../apps/CalendarApp.jsx')),
  calculator: lazy(() => import('../apps/CalculatorApp.jsx')),
  clock: lazy(() => import('../apps/ClockApp.jsx')),
  notes: lazy(() => import('../apps/NotesApp.jsx')),
  paint: lazy(() => import('../apps/PaintApp.jsx')),
  money: lazy(() => import('../apps/MoneyApp.jsx')),
  planner: lazy(() => import('../apps/PlannerApp.jsx')),
  forms: lazy(() => import('../apps/FormsApp.jsx')),
  habits: lazy(() => import('../apps/HabitsApp.jsx')),
  photo: lazy(() => import('../apps/PhotoApp.jsx')),
  audio: lazy(() => import('../apps/AudioApp.jsx')),
  video: lazy(() => import('../apps/VideoApp.jsx')),
  motion: lazy(() => import('../apps/MotionApp.jsx')),
  '3d': lazy(() => import('../apps/ThreeDApp.jsx')),
  pdf: lazy(() => import('../apps/PdfApp.jsx')),
  whiteboard: lazy(() => import('../apps/WhiteboardApp.jsx')),
  code: lazy(() => import('../apps/CodeApp.jsx')),
  convert: lazy(() => import('../apps/ConvertApp.jsx')),
  recorder: lazy(() => import('../apps/RecorderApp.jsx')),
  mindmap: lazy(() => import('../apps/MindApp.jsx')),
  vault: lazy(() => import('../apps/VaultApp.jsx')),
  flow: lazy(() => import('../apps/FlowApp.jsx')),
  writer: lazy(() => import('../apps/WriterApp.jsx')),
  cards: lazy(() => import('../apps/CardsApp.jsx')),
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
