import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// The house HUD (skill style-cartouche): its own night ground, whatever the host theme.
import './ui/hud.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
