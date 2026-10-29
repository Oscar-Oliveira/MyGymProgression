import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { useSettings } from './util';
import { Dashboard } from './pages/Dashboard';
import { ExerciseList } from './pages/ExerciseList';
import { ExerciseEdit } from './pages/ExerciseEdit';
import { ExerciseDetail } from './pages/ExerciseDetail';
import { PlanList } from './pages/PlanList';
import { PlanEdit } from './pages/PlanEdit';
import { WorkoutPage } from './pages/WorkoutPage';
import { History } from './pages/History';
import { Analysis } from './pages/Analysis';
import { SettingsPage } from './pages/SettingsPage';

const NAV = [
  ['/', 'dashboard', '⌂'],
  ['/exercises', 'exercises', '☰'],
  ['/plans', 'plans', '▦'],
  ['/history', 'history', '↺'],
  ['/analysis', 'analysis', '↗'],
  ['/settings', 'settings', '⚙'],
] as const;

export function App() {
  const { t, i18n } = useTranslation();
  const settings = useSettings();
  useEffect(() => {
    if (i18n.language !== settings.language) void i18n.changeLanguage(settings.language);
    document.documentElement.lang = settings.language;
  }, [settings.language, i18n]);

  return (
    <HashRouter>
      <header className="topbar">
        <span className="brand">{t('app.name')}</span>
        <nav aria-label="main">
          {NAV.map(([to, key, icon]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <span aria-hidden="true">{icon}</span>
              <span>{t(`nav.${key}`)}</span>
            </NavLink>
          ))}
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
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
    </HashRouter>
  );
}
