import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

async function bootstrap() {
  let RootComponent: React.ComponentType;

  if (isDemoMode) {
    const { DemoApp } = await import('./demo');
    RootComponent = DemoApp;
  } else {
    RootComponent = App;
  }

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <RootComponent />
    </React.StrictMode>
  );
}

bootstrap();

// Only register service worker in production non-demo builds
if ('serviceWorker' in navigator && import.meta.env.PROD && !isDemoMode) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => console.log('[PWA] SW registered:', reg.scope))
      .catch((err) => console.error('[PWA] SW registration failed:', err));
  });
}
