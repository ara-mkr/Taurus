import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './styles/app.css';
import './styles/glass.css';
import './styles/shell.css';
import './styles/cloud.css';
// Inside the desktop app (apps/desktop) the preload sets window.oxbotDesktop; the macOS window has no title bar.
const desktop = (window as { oxbotDesktop?: { platform: string } }).oxbotDesktop;
if (desktop) document.documentElement.dataset.desktop = desktop.platform;
// Opened from the home screen: glass.css scrolls an inner layer instead of the page, so iOS can't move the tab bar.
if (matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true) document.documentElement.dataset.shell = 'app';
// Over plain Wi-Fi http the browser won't listen, so the phone hides Talk instead of offering a button that fails.
if (!window.isSecureContext) document.documentElement.dataset.insecure = '';
// The service worker keeps the app shell for when the Mac can't be reached. Browsers allow it only on secure
// pages: this Mac at localhost (and the desktop app). A phone over plain Wi-Fi http works without it.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
