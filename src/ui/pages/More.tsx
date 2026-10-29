import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

const ITEMS = [
  ['/plans', 'plans', '▦'],
  ['/exercises', 'exercises', '◆'],
  ['/analysis', 'analysis', '↗'],
  ['/settings', 'settings', '⚙'],
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
                {icon}
              </span>
              <span>
                {t(`nav.${key}`)}
                <small>{t(`more.${key}`)}</small>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
