import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, type TouchEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { createHashRouter, NavLink, Route, RouterProvider, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { db } from '../data/db';
import { useSettings } from './util';
import { DialogHost } from './components/Dialog';
import { Home } from './pages/Home';
import { Train } from './pages/Train';
import { More } from './pages/More';
import { ExerciseList } from './pages/ExerciseList';
import { ExerciseEdit } from './pages/ExerciseEdit';
import { ExerciseDetail } from './pages/ExerciseDetail';
import { PlanList } from './pages/PlanList';
import { PlanEdit } from './pages/PlanEdit';
import { WorkoutPage } from './pages/WorkoutPage';
import { History } from './pages/History';
import { Analysis } from './pages/Analysis';
import { SettingsPage } from './pages/SettingsPage';
import { About } from './pages/About';
import { ShareImport } from './pages/ShareImport';
import { Challenges } from './pages/Challenges';
import { CoachPage } from './pages/CoachPage';
import { GamePage, GamesPage } from './games/Games';

// Outline icons (24×24, stroke = currentColor).
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  train: 'M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11',
  history: 'M12 7v5l3 2M3.05 11a9 9 0 1 1 .5 4M3 4v4h4',
  more: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
} as const;
const TABS = [
  ['/', 'home'],
  ['/train', 'train'],
  ['/history', 'history'],
  ['/more', 'more'],
] as const;
const MORE_PATHS = ['/more', '/exercises', '/plans', '/analysis', '/settings', '/about', '/games', '/challenges', '/coach'];

/** Where "back" goes when the app has no earlier page (opened from a link or reloaded): the page above this one. */
function parentOf(pathname: string): string {
  if (pathname.startsWith('/workout/')) return '/history';
  if (pathname === '/share') return '/';
  const up = pathname.replace(/\/[^/]+$/, '');
  return up && up !== pathname ? up : '/more';
}

/** Touches that must not change the tab: form fields, windows, charts and areas that scroll sideways. */
function keepsSwipe(target: EventTarget | null): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    if (el.matches('input, select, textarea, dialog, .recharts-wrapper')) return true;
    const x = getComputedStyle(el).overflowX;
    if ((x === 'auto' || x === 'scroll') && el.scrollWidth > el.clientWidth) return true;
  }
  return false;
}

/**
 * A new page starts at the top; "back" returns to where the page was; a page that only updates its URL stays put.
 * Pages load their data after the first render, so the position is set again on each frame (up to about a second) until the page is tall enough.
 */
function useScrollMemory() {
  const { key } = useLocation();
  const type = useNavigationType();
  const positions = useRef(new Map<string, number>());
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    const save = () => positions.current.set(key, window.scrollY);
    addEventListener('scroll', save, { passive: true });
    return () => removeEventListener('scroll', save);
  }, [key]);
  useEffect(() => {
    // The same page updated its URL (filters, "show more"): stay where it is.
    if (type === 'REPLACE') return void positions.current.set(key, window.scrollY);
    const y = type === 'POP' ? positions.current.get(key) : undefined;
    if (!y) return void window.scrollTo(0, 0);
    let frame = 0;
    let tries = 0;
    const restore = () => {
      window.scrollTo(0, y);
      if (Math.abs(window.scrollY - y) > 2 && tries++ < 60) frame = requestAnimationFrame(restore);
    };
    restore();
    return () => cancelAnimationFrame(frame);
  }, [key, type]);
}

function Shell() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  useScrollMemory();
  const active = useLiveQuery(() => db.workouts.where('status').equals('in_progress').first(), []);
  // The active workout screen hides the tab bar to keep the focus on logging.
  const focus = !!active && pathname === `/workout/${active.id}`;
  // On a main tab, a horizontal swipe opens the tab to the left or right.
  const nav = useNavigate();
  const touch = useRef<{ x: number; y: number; t: number }>(undefined);
  const tab = TABS.findIndex(([to]) => to === pathname);
  // Pages below a tab have "back" (a button, and a swipe to the right); not the workout being logged.
  const sub = tab < 0 && !focus;
  const back = () => ((window.history.state as { idx?: number } | null)?.idx ? nav(-1) : nav(parentOf(pathname), { replace: true }));
  const onTouchStart = (e: TouchEvent) => {
    touch.current = (tab >= 0 || sub) && e.touches.length === 1 && !keepsSwipe(e.target) ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : undefined;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current;
    touch.current = undefined;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy) || Date.now() - start.t > 700) return;
    if (sub) return void (dx > 0 && back());
    const next = TABS[tab + (dx < 0 ? 1 : -1)];
    if (next) nav(next[0]);
  };
  return (
    <>
      {!focus && (
        <nav className="tabs" aria-label={t('nav.main')}>
          {TABS.map(([to, key]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => (isActive || (key === 'more' && MORE_PATHS.some((p) => pathname.startsWith(p))) ? 'active' : '')}
            >
              <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
                <path d={ICONS[key]} />
              </svg>
              <span>{t(`nav.${key}`)}</span>
            </NavLink>
          ))}
        </nav>
      )}
      <main className={`shell ${focus ? 'focus' : ''}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {sub && (
          <button type="button" className="ghost back-btn" onClick={back}>
            ‹ {t('common.back')}
          </button>
        )}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/train" element={<Train />} />
          <Route path="/more" element={<More />} />
          <Route path="/exercises" element={<ExerciseList />} />
          <Route path="/exercises/new" element={<ExerciseEdit />} />
          <Route path="/exercises/:id" element={<ExerciseDetail />} />
          <Route path="/exercises/:id/edit" element={<ExerciseEdit />} />
          <Route path="/plans" element={<PlanList />} />
          <Route path="/plans/:id" element={<PlanEdit />} />
          <Route path="/workout/:id" element={<WorkoutPage />} />
          <Route path="/history" element={<History />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/about" element={<About />} />
          <Route path="/share" element={<ShareImport />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/games/:id" element={<GamePage />} />
          <Route path="/challenges" element={<Challenges />} />
          <Route path="/coach" element={<CoachPage />} />
        </Routes>
      </main>
      <DialogHost />
    </>
  );
}

// A data router, so pages can ask before leaving with unsaved changes (useBlocker). The routes stay in Shell.
const router = createHashRouter([{ path: '*', element: <Shell /> }]);

export function App() {
  const { i18n } = useTranslation();
  const settings = useSettings();
  useEffect(() => {
    if (i18n.language !== settings.language) void i18n.changeLanguage(settings.language);
    document.documentElement.lang = settings.language;
  }, [settings.language, i18n]);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme ?? 'dark';
  }, [settings.theme]);

  return (
    <RouterProvider router={router} />
  );
}
