import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { DialogProvider } from './components/Dialogs.jsx';
import './styles.css';
import './styles/techomato.css';

// Old links looked like /#/software/pdf; send them to the real URL so shared links keep working.
// A hash like #//other.com would make replaceState throw and stop the app, so only plain paths are followed.
if (/^#\/[^/\\]/.test(location.hash)) history.replaceState(null, '', location.hash.slice(1));

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <DialogProvider>
        <App />
      </DialogProvider>
    </BrowserRouter>
  </React.StrictMode>
);
