import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import { AuthShell } from '../components/auth/AuthShell';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('hf-land-1 auth harness missing #root');

const signup = window.location.hash === '#signup';

createRoot(rootEl).render(
  <ToastProvider>
    <MemoryRouter initialEntries={[signup ? '/signup' : '/login']}>
      <AuthShell
        seoKey={signup ? 'signup' : 'login'}
        title={signup ? 'Create a workspace' : 'Sign in to Grafter'}
        lede={signup ? 'Start a crew workspace.' : 'Welcome back.'}
      >
        <p>Auth body for HF-LAND-1 geometry.</p>
      </AuthShell>
    </MemoryRouter>
  </ToastProvider>,
);
