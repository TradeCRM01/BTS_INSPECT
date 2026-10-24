import { createRoot } from 'react-dom/client';
import { ToastProvider } from '../components/ui/Toast';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('hf-land-1 review harness missing #root');

createRoot(rootEl).render(
  <ToastProvider>
    <div className="insp-doc-theme min-h-screen">
      <div className="insp-review-head text-white sticky top-0 z-40 h-14 flex items-center px-4 gap-3">
        <button type="button">Back</button>
        <p>Review Inspection</p>
      </div>
    </div>
  </ToastProvider>,
);
