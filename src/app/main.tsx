import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { APP_NAME } from './config';
import { services } from './services';
import { App } from '../ui/App';
import '../ui/styles.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <App appName={APP_NAME} modrinthClient={services.modrinthClient} />
  </StrictMode>,
);
