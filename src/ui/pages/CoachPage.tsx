import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { repo } from '../../data/repo';
import { coachMessage } from '../../domain/coach';
import type { CoachGender, CoachSettings, CoachStyle, CoachWhen } from '../../domain/types';
import { COACH_BANKS } from '../../i18n/coach';
import { CoachAvatar } from '../components/CoachAvatar';
import { useSettings } from '../util';
import { canSpeak, speak } from '../voice';

const COACH_STYLES: CoachStyle[] = ['support', 'energy', 'spite', 'stoic', 'sergeant'];
export const NO_COACH: CoachSettings = { enabled: false, style: 'support', profanity: false };
/** Extras of the trainer (D45, D47, D48), all off by default. Voice only where the device can speak. The week report and the rival are in Reports (D57). */
const EXTRAS = ['live', 'tips', 'voice'] as const;

/** Personal trainer page (D37): style, when it speaks and the extras. */
export function CoachPage() {
  const { t } = useTranslation();
  const s = useSettings();
  const [sample, setSample] = useState<string>();
  const coach = s.coach ?? NO_COACH;
  const save = (patch: Partial<CoachSettings>) => repo.saveSettings({ coach: { ...coach, ...patch } });
  const showSample = () => {
    const text = coachMessage(COACH_BANKS[s.language].start, coach, { month: 3, days: 4, increase: { exercise: t('coach.sampleExercise'), from: '40 kg', to: '42.5 kg' } }, String(Date.now()));
    setSample(text);
    if (coach.voice) speak(text, s.language, coach);
  };

  return (
    <div>
      <div className="page-head">
        <h1>{t('coach.title')}</h1>
        <CoachAvatar style={coach.style} gender={coach.gender} />
      </div>
      <section className="card">
        <label className="setting-row">
          <span>{t('coach.enabled')}</span>
          <input type="checkbox" role="switch" className="switch" checked={coach.enabled} onChange={(e) => void save({ enabled: e.target.checked })} />
        </label>
        {!coach.enabled && <p className="help">{t('coach.off')}</p>}
        {coach.enabled && (
          <>
            <label className="setting-row">
              <span>{t('coach.style')}</span>
              <select value={coach.style} onChange={(e) => (setSample(undefined), void save({ style: e.target.value as CoachStyle }))}>
                {COACH_STYLES.map((st) => (
                  <option key={st} value={st}>
                    {t(`coach.styles.${st}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="setting-row">
              <span>{t('coach.gender')}</span>
              <select value={coach.gender ?? 'male'} onChange={(e) => void save({ gender: e.target.value as CoachGender })}>
                {(['male', 'female'] as const).map((g) => (
                  <option key={g} value={g}>
                    {t(`coach.genders.${g}`)}
                  </option>
                ))}
              </select>
            </label>
            <div className="coach-style">
              <CoachAvatar style={coach.style} gender={coach.gender} />
              <p className="help">{t(`coach.styleHelp.${coach.style}`)}</p>
            </div>
            {coach.style === 'spite' && (
              <label className="setting-row">
                <span>{t('coach.profanity')}</span>
                <input type="checkbox" role="switch" className="switch" checked={coach.profanity} onChange={(e) => void save({ profanity: e.target.checked })} />
              </label>
            )}
            {sample && (
              <div key={sample} className="coach" role="status" aria-label={t('coach.title')}>
                <CoachAvatar style={coach.style} gender={coach.gender} />
                <p>{sample}</p>
              </div>
            )}
            <button className="outline" style={{ width: '100%', marginTop: '0.5rem' }} onClick={showSample}>
              {t('coach.preview')}
            </button>
          </>
        )}
      </section>

      {coach.enabled && (
        <>
          <div className="section-head">
            <h2>{t('coach.messages')}</h2>
          </div>
          <section className="card">
            <label className="setting-row">
              <span>{t('coach.when')}</span>
              <select value={coach.when ?? 'random'} onChange={(e) => void save({ when: e.target.value as CoachWhen })}>
                {(['random', 'each', 'start'] as const).map((w) => (
                  <option key={w} value={w}>
                    {t(`coach.whenOptions.${w}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="setting-row">
              <span className="lbl">
                {t('coach.pages')}
                <small>{t('coach.pagesSub')}</small>
              </span>
              <input type="checkbox" role="switch" className="switch" checked={coach.pages !== false} onChange={(e) => void save({ pages: e.target.checked })} />
            </label>
          </section>

          <div className="section-head">
            <h2>{t('coach.extras')}</h2>
          </div>
          <section className="card">
            {EXTRAS.filter((k) => k !== 'voice' || canSpeak()).map((k) => (
              <label key={k} className="setting-row">
                <span className="lbl">
                  {t(`coach.${k}`)}
                  <small>{t(`coach.${k}Sub`)}</small>
                </span>
                <input type="checkbox" role="switch" className="switch" checked={!!coach[k]} onChange={(e) => void save({ [k]: e.target.checked })} />
              </label>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
