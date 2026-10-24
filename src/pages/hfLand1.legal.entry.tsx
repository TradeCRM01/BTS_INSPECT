import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import { LegalShell } from '../components/legal/LegalShell';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('hf-land-1 legal harness missing #root');

const title = window.location.hash === '#terms' ? 'Terms of Use' : 'Privacy Policy';
const seoKey = title === 'Terms of Use' ? 'terms' : 'privacy';

createRoot(rootEl).render(
  <ToastProvider>
    <MemoryRouter initialEntries={[seoKey === 'terms' ? '/terms' : '/privacy']}>
      <LegalShell seoKey={seoKey} title={title}>
        <p>Legal body for HF-LAND-1 geometry.</p>
      </LegalShell>
    </MemoryRouter>
  </ToastProvider>,
);
