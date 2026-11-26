import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import {AuthProvider} from './contexts/AuthContext.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  let reloadedForSw = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedForSw) return;
    try {
      if (sessionStorage.getItem('megaachados_sw_reloaded') === '1') return;
      sessionStorage.setItem('megaachados_sw_reloaded', '1');
    } catch {
      // Ignore storage errors
    }
    reloadedForSw = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      registrations.forEach((reg) => {
        void reg.update();
      });
    })
    .catch(() => {
      // Ignore SW lookup issues in restricted browser contexts
    });
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <AuthProvider>
      <App />
    </AuthProvider>
  </ErrorBoundary>,
);
