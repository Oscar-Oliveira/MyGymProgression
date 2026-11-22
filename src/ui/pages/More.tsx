import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PageHead } from '../components/Bits';
import { Icon } from '../components/Icon';
import { MORE_ITEMS } from '../components/NavSheets';
import { useSettings } from '../util';

/** More as a page (old links): the same grid as the "More" sheet of the page headers (V2-D10). */
export function More() {
  const { t } = useTranslation();
  const s = useSettings();
  return (
    <div>
      <PageHead title={t('nav.more')} />
      <nav className="more-grid" aria-label={t('nav.more')}>
        {MORE_ITEMS.filter((i) => i.shown?.(s) ?? true).map((i) => (
          <Link key={i.to} to={i.to} className="more-tile">
            <span className="more-ico">
              <Icon name={i.icon} />
            </span>
            <span>{t(`nav.${i.key}`)}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
