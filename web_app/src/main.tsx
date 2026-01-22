import { createRoot } from 'react-dom/client';
import App from './app/App';
import './styles/index.css';
import { StrictMode } from 'react';
import { initMachineStoreSubscriptions } from './app/storeBootstrap';

initMachineStoreSubscriptions();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
