import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './styles/app.css';
import './styles/glass.css';
import './styles/shell.css';
import './styles/cloud.css';
import './styles/hud.css';
import './styles/deck.css';
// Renamed from OXBOT (November 19, 2026): carry this browser's saved choices (onboarding done, appearance, and the
// like) from the old oxbot-* names to taurus-*, once, before anything reads them. The old dashboard page was also
// called Taurus, so its saved start page "taurus" is now "hud".
try {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('oxbot')) continue;
    const next = `taurus${key.slice(5)}`;
    const value = localStorage.getItem(key) ?? '';
    if (localStorage.getItem(next) === null) localStorage.setItem(next, value === 'taurus' ? 'hud' : value);
    localStorage.removeItem(key);
  }
} catch { /* storage blocked: start fresh */ }
// Inside the desktop app (apps/desktop) the preload sets window.taurusDesktop; the macOS window has no title bar.
const desktop = (window as { taurusDesktop?: { platform: string } }).taurusDesktop;
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
