import { useLiveQuery } from 'dexie-react-hooks';
import { Fragment, lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type TouchEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { createHashRouter, Link, Navigate, NavLink, Route, RouterProvider, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { db } from '../data/db';
import { useSettings } from './util';
import { DialogHost } from './components/Dialog';
import { ToastHost } from './components/Toast';
import { ExerciseSheetHost } from './components/ExerciseSheet';
import { Home } from './pages/Home';
import { Train } from './pages/Train';
import { More } from './pages/More';
import { ExerciseList } from './pages/ExerciseList';
import { ExerciseEdit } from './pages/ExerciseEdit';
import { PlanEdit } from './pages/PlanEdit';
import { WorkoutPage } from './pages/WorkoutPage';
import { History } from './pages/History';
import { Reports } from './pages/Reports';
import { SettingsPage } from './pages/SettingsPage';
import { About } from './pages/About';
import { ShareImport } from './pages/ShareImport';
import { PlanScan } from './pages/PlanScan';
import { Challenges } from './pages/Challenges';
import { Achievements } from './pages/Achievements';
import { CoachPage } from './pages/CoachPage';
import { MigrationPage } from './pages/MigrationPage';
import { ToolsPage } from './pages/ToolsPage';
import { BodyPage } from './pages/BodyPage';
import { StartSheet } from './components/NavSheets';
import { Icon } from './components/Icon';
import { toneStyle, useTones } from './colors';
// Loaded on demand: the charts (recharts) and the games are the largest parts and are not needed at start.
const ExerciseDetail = lazy(() => import('./pages/ExerciseDetail').then((m) => ({ default: m.ExerciseDetail })));
const GamesPage = lazy(() => import('./games/Games').then((m) => ({ default: m.GamesPage })));
const GamePage = lazy(() => import('./games/Games').then((m) => ({ default: m.GamePage })));

// Tabs (V2-D10): Home · Plan · ▶ (start or resume) · Progress · Exercises. "More" opens from the page headers.
const TABS = [
  ['/', 'home', 'home'],
  ['/train', 'plan', 'calendar'],
  ['/reports', 'progress', 'chart'],
  ['/exercises', 'exercises', 'dumbbell'],
] as const;
/** Pages below each tab, for the active mark. The plan pages belong to Plan (D77); History belongs to Progress. */
const TAB_PATHS: Record<string, string[]> = {
  plan: ['/train', '/plans'],
  progress: ['/reports', '/analysis', '/history', '/workout/', '/body'],
  exercises: ['/exercises'],
};

const PROGRESS_VIEWS = ['/history', '/body'];

/** Where "back" goes when the app has no earlier page (opened from a link or reloaded): the page above this one. */
function parentOf(pathname: string): string {
  if (pathname.startsWith('/workout/')) return '/history';
  if (pathname === '/share' || pathname === '/migrate') return '/';
  if (pathname.startsWith('/plans')) return '/train';
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
  // Set before the browser sends a scroll event: a page loaded on demand first empties the screen, and the scroll to 0
  // that this causes must not be saved for the page left behind.
  const current = useRef(key);
  useLayoutEffect(() => {
    current.current = key;
  }, [key]);
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    const save = () => positions.current.set(current.current, window.scrollY);
    addEventListener('scroll', save, { passive: true });
    return () => removeEventListener('scroll', save);
  }, []);
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
  const toneFor = useTones();
  const active = useLiveQuery(() => db.workouts.where('status').equals('in_progress').first(), []);
  const [starting, setStarting] = useState(false);
  // The active workout screen hides the tab bar to keep the focus on logging.
  const focus = !!active && pathname === `/workout/${active.id}`;
  // On a main tab, a horizontal swipe opens the tab to the left or right.
  const nav = useNavigate();
  const touch = useRef<{ x: number; y: number; t: number }>(undefined);
  // History and Body are views of Progress, like Reports (Progress switch): no "back", same swipes.
  const tab = TABS.findIndex(([to]) => to === pathname || (to === '/reports' && PROGRESS_VIEWS.includes(pathname)));
  // Pages below a tab have "back" (a button, and a swipe to the right); not the workout being logged.
  const sub = tab < 0 && !focus;
  // In a game a swipe is a move, not "back".
  const game = pathname.startsWith('/games/');
  const back = () => ((window.history.state as { idx?: number } | null)?.idx ? nav(-1) : nav(parentOf(pathname), { replace: true }));
  const onTouchStart = (e: TouchEvent) => {
    touch.current = (tab >= 0 || (sub && !game)) && e.touches.length === 1 && !keepsSwipe(e.target) ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : undefined;
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
          {TABS.map(([to, key, icon], i) => (
            <Fragment key={to}>
              {i === 2 &&
                (active ? (
                  <Link to={`/workout/${active.id}`} className="tab-go" aria-label={t('home.continue')}>
                    <Icon name="play" />
                  </Link>
                ) : (
                  <button type="button" className="tab-go" aria-label={t('nav.train')} aria-haspopup="dialog" onClick={() => setStarting(true)}>
                    <Icon name="play" />
                  </button>
                ))}
              <NavLink to={to} end={to === '/'} className={({ isActive }) => (isActive || TAB_PATHS[key]?.some((p) => pathname.startsWith(p)) ? 'active' : '')}>
                <Icon name={icon} />
                <span>{t(`nav.${key}`)}</span>
              </NavLink>
            </Fragment>
          ))}
        </nav>
      )}
      {starting && <StartSheet onClose={() => setStarting(false)} />}
      {/* A workout in progress is one tap away on every page (D78); Home shows it in its own card. */}
      {active && !focus && pathname !== '/' && (
        <Link to={`/workout/${active.id}`} className="active-bar toned" style={toneStyle(toneFor(active.planId, active.dayId))}>
          <Icon name="play" />
          <span className="main">
            <small>{t('start.bar')}</small>
            {active.dayName ?? t('workout.free')}
          </span>
          <span className="go">
            {t('home.continue')} <Icon name="chevronRight" />
          </span>
        </Link>
      )}
      <main className={`shell ${focus ? 'focus' : ''} ${active && !focus && pathname !== '/' ? 'has-bar' : ''}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {sub && (
          <button type="button" className="ghost back-btn" onClick={back}>
            <Icon name="chevronLeft" /> {t('common.back')}
          </button>
        )}
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/train" element={<Train />} />
            <Route path="/more" element={<More />} />
            <Route path="/exercises" element={<ExerciseList />} />
            <Route path="/exercises/new" element={<ExerciseEdit />} />
            <Route path="/exercises/:id" element={<ExerciseDetail />} />
            <Route path="/exercises/:id/edit" element={<ExerciseEdit />} />
            {/* Plans are listed in Train (D77); old links still open it. */}
            <Route path="/plans" element={<Navigate to="/train" replace />} />
            <Route path="/plans/scan" element={<PlanScan />} />
            <Route path="/plans/:id" element={<PlanEdit />} />
            <Route path="/workout/:id" element={<WorkoutPage />} />
            <Route path="/history" element={<History />} />
            <Route path="/reports" element={<Reports />} />
            {/* Analysis is a tab of Reports (D57); old links still open it. */}
            <Route path="/analysis" element={<Navigate to="/reports" replace />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/about" element={<About />} />
            <Route path="/share" element={<ShareImport />} />
            <Route path="/games" element={<GamesPage />} />
            <Route path="/games/:id" element={<GamePage />} />
            <Route path="/challenges" element={<Challenges />} />
            <Route path="/achievements" element={<Achievements />} />
            <Route path="/coach" element={<CoachPage />} />
            <Route path="/migrate" element={<MigrationPage />} />
            <Route path="/tools" element={<ToolsPage />} />
            <Route path="/body" element={<BodyPage />} />
          </Routes>
        </Suspense>
      </main>
      <ExerciseSheetHost />
      <DialogHost />
      <ToastHost />
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
  // The "1987" look of the About easter egg (D59), over any theme.
  useEffect(() => {
    if (settings.retro) document.documentElement.dataset.retro = 'on';
    else delete document.documentElement.dataset.retro;
  }, [settings.retro]);

  return (
    <RouterProvider router={router} />
  );
}
