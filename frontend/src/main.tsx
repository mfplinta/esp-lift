import { createRoot } from 'react-dom/client';
import App from './app/App';
import './styles/index.css';
import { StrictMode } from 'react';
import { Provider } from 'react-redux';
import { initMachineStoreSubscriptions } from './app/storeBootstrap';
import { store } from './app/store';

initMachineStoreSubscriptions();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>
);
