import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { DialogProvider } from './components/Dialogs.jsx';
import './styles.css';
import './styles/techomato.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <DialogProvider>
        <App />
      </DialogProvider>
    </HashRouter>
  </React.StrictMode>
);
