import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import i18n from './i18n';
import { db } from './data/db';
import './ui/styles.css';
import { App } from './ui/App';

registerSW({ immediate: true });
// A new version can upgrade the database. An older open page then closes its connection and reloads (to the new version).
// A page that cannot answer (frozen in the background) blocks the upgrade: a notice asks to close it. It goes when the database opens.
db.on('versionchange', () => {
  db.close();
  location.reload();
  return false;
});
db.on('blocked', () => {
  if (document.getElementById('db-blocked')) return;
  const note = document.createElement('div');
  note.id = 'db-blocked';
  note.setAttribute('role', 'alert');
  note.textContent = i18n.t('common.dbBlocked');
  document.body.appendChild(note);
});
db.on('ready', () => document.getElementById('db-blocked')?.remove());
// Ask the browser not to evict IndexedDB data under storage pressure.
void navigator.storage?.persist?.();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The splash (index.html, V2-D25) goes by itself when the app is ready: the database is open, after at least 0.4 s
// (no flash); never longer than 2.5 s.
const splash = document.getElementById('splash');
const shownAt = Date.now();
const hide = () => {
  if (!splash || splash.classList.contains('hide')) return;
  splash.classList.add('hide');
  setTimeout(() => splash.remove(), 350);
};
void db
  .open()
  .catch(() => undefined)
  .then(() => setTimeout(hide, Math.max(0, 400 - (Date.now() - shownAt))));
setTimeout(hide, 2500);
