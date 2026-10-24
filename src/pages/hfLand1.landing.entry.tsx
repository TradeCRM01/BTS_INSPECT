import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { MarketingPage } from './MarketingPage';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('hf-land-1 landing harness missing #root');

createRoot(rootEl).render(
  <MemoryRouter initialEntries={['/']}>
    <MarketingPage />
  </MemoryRouter>,
);
