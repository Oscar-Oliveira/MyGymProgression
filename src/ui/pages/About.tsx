import { useTranslation } from 'react-i18next';
import { CHANGELOG } from '../../changelog';
import { fmtDate, useSettings } from '../util';

const REPO = 'https://github.com/Oscar-Oliveira/MyGymProgression';

export function About() {
  const { t } = useTranslation();
  const s = useSettings();
  return (
    <div>
      <section className="about-head">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} width={72} height={72} alt="" />
        <h1>MyGymProgression</h1>
        <p className="num">
          {t('about.version', { version: __APP_VERSION__ })} · {t('about.built', { date: fmtDate(__BUILD_DATE__, s.language) })}
        </p>
        <p className="muted">{t('about.tagline')}</p>
      </section>

      <div className="section-head">
        <h2>{t('about.whatsNew')}</h2>
      </div>
      {CHANGELOG.map((c) => (
        <section key={c.date} className="card tight">
          <p className="eyebrow">{fmtDate(c.date, s.language)}</p>
          <ul className="steps">
            {c[s.language].map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      ))}

      <div className="section-head">
        <h2>{t('about.privacy')}</h2>
      </div>
      <section className="card tight">
        <p>{t('about.privacyText')}</p>
      </section>

      <div className="section-head">
        <h2>{t('about.credits')}</h2>
      </div>
      <section className="card tight">
        <p>{t('about.creditsText')}</p>
        <a className="btn btn-outline" href={REPO} target="_blank" rel="noopener noreferrer">
          {t('about.source')} ↗
        </a>
      </section>
    </div>
  );
}
