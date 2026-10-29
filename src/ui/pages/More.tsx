import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

// Outline icons (24×24, stroke = currentColor).
const ITEMS = [
  ['/plans', 'plans', 'M8 3h8v3H8zM6 5H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-1M8 11h8M8 15h5'],
  ['/exercises', 'exercises', 'M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11'],
  ['/analysis', 'analysis', 'M3 20h18M5 16l4-5 4 3 6-8M15 6h4v4'],
  ['/settings', 'settings', 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4'],
] as const;

export function More() {
  const { t } = useTranslation();
  return (
    <div>
      <div className="page-head">
        <h1>{t('nav.more')}</h1>
      </div>
      <ul className="menu card" style={{ padding: 0 }}>
        {ITEMS.map(([to, key, icon]) => (
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
