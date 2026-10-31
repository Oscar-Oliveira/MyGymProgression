import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './i18n';
import './ui/styles.css';
import { App } from './ui/App';
import { SplashCrew } from './ui/components/SplashCrew';

registerSW({ immediate: true });
// Ask the browser not to evict IndexedDB data under storage pressure.
void navigator.storage?.persist?.();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The splash (index.html) shows the trainers popping up, then fades out; a tap closes it sooner.
const splash = document.getElementById('splash');
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const crew = splash && createRoot(splash.appendChild(document.createElement('div')));
crew?.render(<SplashCrew />);
const hide = () => {
  if (!splash || splash.classList.contains('hide')) return;
  splash.classList.add('hide');
  setTimeout(() => (crew?.unmount(), splash.remove()), 400);
};
if (splash) {
  splash.style.pointerEvents = 'auto';
  splash.addEventListener('click', hide);
}
setTimeout(hide, calm ? 900 : 1800);
