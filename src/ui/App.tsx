import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { db } from '../data/db';
import { repo } from '../data/repo';
import { useSettings } from './util';
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

const TABS = [
  ['/', 'home', '⌂'],
  ['/train', 'train', '▶'],
  ['/history', 'history', '☰'],
  ['/more', 'more', '⋯'],
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
          {TABS.map(([to, key, icon]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => (isActive || (key === 'more' && MORE_PATHS.some((p) => pathname.startsWith(p))) ? 'active' : '')}
            >
              <span className="ico" aria-hidden="true">
                {icon}
              </span>
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
    </>
  );
}

export function App() {
  const { i18n } = useTranslation();
  const settings = useSettings();
  // Keep the exercise library (images, how-to, video) applied to all exercises, without user action.
  useEffect(() => {
    void repo.syncLibrary();
  }, []);
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
