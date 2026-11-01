import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CHANGELOG } from '../../changelog';
import { repo } from '../../data/repo';
import { fx } from '../games/feedback';
import { canSpeak, speak } from '../voice';
import { fmtDate, useSettings } from '../util';

const REPO = 'https://github.com/Oscar-Oliveira/MyGymProgression';
/** Easter egg (D59): 7 taps on the logo, at most 1.5 s apart, turn the "1987" look on or off. */
const TAPS = 7;
const GAP_MS = 1500;

export function About() {
  const { t } = useTranslation();
  const s = useSettings();
  const taps = useRef({ n: 0, at: 0 });
  const [egg, setEgg] = useState({ msg: '', spin: 0 });
  const tap = () => {
    const now = Date.now();
    const n = now - taps.current.at > GAP_MS ? 1 : taps.current.n + 1;
    taps.current = { n: n % TAPS, at: now };
    if (n < TAPS) return setEgg({ ...egg, msg: n >= 4 ? t('about.egg.left', { count: TAPS - n }) : '' });
    const on = !s.retro;
    const msg = on ? (s.secretGame ? t('about.egg.on') : t('about.egg.unlocked')) : t('about.egg.off');
    void repo.saveSettings({ retro: on, secretGame: true });
    fx('record');
    if (s.coach?.enabled && s.coach.voice && canSpeak()) speak(msg, s.language, s.coach);
    setEgg({ msg, spin: egg.spin + 1 });
  };
  return (
    <div>
      <section className="about-head">
        <button type="button" className="about-logo" aria-label="MyGymProgression" onClick={tap}>
          <img key={egg.spin} className={egg.spin ? 'spin' : ''} src={`${import.meta.env.BASE_URL}icon.svg`} width={72} height={72} alt="" />
        </button>
        <p className="egg-msg" role="status">
          {egg.msg}
        </p>
        <h1>MyGymProgression</h1>
        <p className="num">
          {t('about.version', { version: __APP_VERSION__ })} · {t('about.built', { date: fmtDate(__BUILD_DATE__, s.language) })}
        </p>
        <p className="muted">{t('about.tagline')}</p>
      </section>

      <div className="section-head">
        <h2>{t('about.whatsNew')}</h2>
      </div>
      {CHANGELOG.map((c, i) => (
        <section key={i} className="card tight">
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
