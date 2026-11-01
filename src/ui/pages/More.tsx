import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useSettings } from '../util';

// Outline icons (24×24, stroke = currentColor).
const ITEMS = [
  ['/plans', 'plans', 'M8 3h8v3H8zM6 5H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-1M8 11h8M8 15h5'],
  ['/exercises', 'exercises', 'M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11'],
  ['/analysis', 'analysis', 'M3 20h18M5 16l4-5 4 3 6-8M15 6h4v4'],
  ['/challenges', 'challenges', 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3'],
  ['/coach', 'coach', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0M17 3l1 2 2 .5-1.5 1.5.5 2-2-1-2 1 .5-2L14 5.5l2-.5z'],
  ['/games', 'games', 'M6 9h12a4 4 0 0 1 4 4v1a3 3 0 0 1-5.2 2L15 14H9l-1.8 2A3 3 0 0 1 2 14v-1a4 4 0 0 1 4-4zM8 11v2M7 12h2M16 12h.01M18 12h.01'],
  ['/settings', 'settings', 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4'],
  ['/about', 'about', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01'],
] as const;

export function More() {
  const { t } = useTranslation();
  const s = useSettings();
  // The challenges page is listed only while the weekly challenge is on.
  const items = ITEMS.filter(([to]) => to !== '/challenges' || s.challenge);
  return (
    <div>
      <div className="page-head">
        <h1>{t('nav.more')}</h1>
      </div>
      <ul className="menu card" style={{ padding: 0 }}>
        {items.map(([to, key, icon]) => (
          <li key={to}>
            <Link to={to}>
              <span className="ico" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d={icon} />
                </svg>
              </span>
              <span>
                {t(`nav.${key}`)}
                <small>{t(`more.${key}`)}</small>
              </span>
              <span className="chev" aria-hidden="true">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
