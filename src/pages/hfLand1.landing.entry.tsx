import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import { MarketingPage } from './MarketingPage';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('hf-land-1 landing harness missing #root');

createRoot(rootEl).render(
  <ToastProvider>
    <MemoryRouter initialEntries={['/']}>
      <MarketingPage />
    </MemoryRouter>
  </ToastProvider>,
);
