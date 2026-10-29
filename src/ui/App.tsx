import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
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
const MORE_PATHS = ['/more', '/exercises', '/plans', '/analysis', '/settings'];

function Shell() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const active = useLiveQuery(() => db.workouts.where('status').equals('in_progress').first(), []);
  // The active workout screen hides the tab bar to keep the focus on logging.
  const focus = !!active && pathname === `/workout/${active.id}`;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

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
      <main className={`shell ${focus ? 'focus' : ''}`}>
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
        </Routes>
      </main>
      <DialogHost />
    </>
  );
}

export function App() {
  const { i18n } = useTranslation();
  const settings = useSettings();
  useEffect(() => {
    if (i18n.language !== settings.language) void i18n.changeLanguage(settings.language);
    document.documentElement.lang = settings.language;
  }, [settings.language, i18n]);

  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
