import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ToastProvider } from './context/ToastContext';
import { LoadingProvider } from './context/LoadingContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <LoadingProvider>
        <App />
      </LoadingProvider>
    </ToastProvider>
  </StrictMode>
);
