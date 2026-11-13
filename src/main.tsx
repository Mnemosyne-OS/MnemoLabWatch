import React from 'react';
import ReactDOM from 'react-dom/client';
import { onHostConfig } from '@mnemosyne_os/cartridge-sdk';
import App from './App';
// The app's theme (skill style-cartouche §0): every colour is a host variable.
import './ui/theme.css';

// Inside a Mnemosyne OS window, before the first paint: the window paints the
// ground and the page stays transparent (`html.in-host` in the CSS).
if (window.parent !== window) document.documentElement.classList.add('in-host');

// Wear the host's theme: its base lands as `data-theme` and its computed
// variables as inline properties on <html>, at load and on every change
// (theme, accent, window colours). Outside the OS nothing is broadcast and
// the fallbacks in theme.css apply. useI18n listens too, for the language only.
onHostConfig();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
