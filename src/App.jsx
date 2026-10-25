import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import SoftwarePage from './pages/SoftwarePage.jsx';
import AppHost from './pages/AppHost.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="software/:id" element={<SoftwarePage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      {/* Browser apps run full-screen, without the site header/footer */}
      <Route path="app/:id" element={<AppHost />} />
    </Routes>
  );
}
