import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './popup.css';
import { initI18n } from '../shared/i18n';

// Initialize i18n
initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
