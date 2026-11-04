import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { repo } from '../../data/repo';
import { coachMessage } from '../../domain/coach';
import type { CoachGender, CoachHairColor, CoachLook, CoachSettings, CoachSkin, CoachStyle, CoachWhen } from '../../domain/types';
import { COACH_BANKS } from '../../i18n/coach';
import { BEARDS, CoachAvatar, CoachName, defaultLook, GLASSES, HAIR_COLORS, HAIRS, SKINS } from '../components/CoachAvatar';
import { Empty, PageHead } from '../components/Bits';
import { Link } from 'react-router-dom';
import { useSettings } from '../util';
import { canSpeak, speak } from '../voice';

const COACH_STYLES: CoachStyle[] = ['support', 'energy', 'spite', 'stoic', 'sergeant'];
export const NO_COACH: CoachSettings = { enabled: false, style: 'support', profanity: false };
/**
 * Extras of the trainer (D45, D47), all off by default. Voice only where the device can speak. The week report and the rival are in Reports (D57).
 * Technique tips no longer need the trainer (D75): the old `tips` setting is kept in the data but not used.
 */
const EXTRAS = ['live', 'voice'] as const;

/** One part of the look (D63): a row of round buttons, one per option. */
function LookChoice<T extends string>({ label, options, value, name, onPick, children }: { label: string; options: readonly T[]; value: T; name: (o: T) => string; onPick: (o: T) => void; children: (o: T) => ReactNode }) {
  return (
    <div className="look-row">
      <span>{label}</span>
      <div className="swatches" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={o === value} aria-label={name(o)} title={name(o)} className={`swatch face ${o === value ? 'on' : ''}`} onClick={() => onPick(o)}>
            {children(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Personal trainer page (D37): style, name and look (D63), when it speaks and the extras. */
export function CoachPage() {
  const { t } = useTranslation();
  const s = useSettings();
  const [sample, setSample] = useState<string>();
  const coach = s.coach ?? NO_COACH;
  const save = (patch: Partial<CoachSettings>) => repo.saveSettings({ coach: { ...coach, ...patch } });
  const look = coach.look ?? defaultLook(coach.style, coach.gender);
  const saveLook = (patch: Partial<CoachLook>) => void save({ look: { ...look, ...patch } });
  const face = (patch: Partial<CoachLook>) => <CoachAvatar style={coach.style} gender={coach.gender} look={{ ...look, ...patch }} size={40} />;
  const name = coach.name?.trim();
  const showSample = () => {
    const text = coachMessage(COACH_BANKS[s.language].start, coach, { month: 3, days: 4, increase: { exercise: t('coach.sampleExercise'), from: '40 kg', to: '42.5 kg' } }, String(Date.now()));
    setSample(text);
    if (coach.voice) speak(text, s.language, coach);
  };

  return (
    <div>
      <PageHead eyebrow={name && t('coach.title')} title={name || t('coach.title')} aside={<CoachAvatar style={coach.style} gender={coach.gender} look={coach.look} />} />
      {!coach.enabled && (
        <Empty
          action={
            <Link className="btn outline" to="/settings">
              {t('nav.settings')}
            </Link>
          }
        >
          {t('coach.off')}
        </Empty>
      )}
      {coach.enabled && (
        <section className="card">
          <label className="setting-row">
            <span>{t('coach.name')}</span>
            <input type="text" defaultValue={coach.name ?? ''} maxLength={40} placeholder={t('coach.namePlaceholder')} onChange={(e) => void save({ name: e.target.value })} />
          </label>
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
          <div className="coach-style">
            <CoachAvatar style={coach.style} gender={coach.gender} look={coach.look} />
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
              <CoachAvatar style={coach.style} gender={coach.gender} look={coach.look} />
              <p>
                <CoachName name={coach.name} />
                {sample}
              </p>
            </div>
          )}
          <button className="outline" style={{ width: '100%', marginTop: '0.5rem' }} onClick={showSample}>
            {t('coach.preview')}
          </button>
        </section>
      )}

      {coach.enabled && (
        <>
          <div className="section-head">
            <h2>{t('coach.look')}</h2>
          </div>
          <section className="card">
            <p className="help" style={{ marginTop: 0 }}>
              {t('coach.lookHelp')}
            </p>
            <div className="look-preview">
              <CoachAvatar style={coach.style} gender={coach.gender} look={look} size={96} />
            </div>
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
            <LookChoice label={t('coach.skin')} options={Object.keys(SKINS) as CoachSkin[]} value={look.skin} name={(o) => t(`coach.skins.${o}`)} onPick={(skin) => saveLook({ skin })}>
              {(o) => <span className="dot" style={{ background: SKINS[o] }} />}
            </LookChoice>
            <LookChoice label={t('coach.hair')} options={HAIRS} value={look.hair} name={(o) => t(`coach.hairs.${o}`)} onPick={(hair) => saveLook({ hair })}>
              {(o) => face({ hair: o })}
            </LookChoice>
            <LookChoice label={t('coach.hairColor')} options={Object.keys(HAIR_COLORS) as CoachHairColor[]} value={look.hairColor} name={(o) => t(`coach.hairColors.${o}`)} onPick={(hairColor) => saveLook({ hairColor })}>
              {(o) => <span className="dot" style={{ background: HAIR_COLORS[o] }} />}
            </LookChoice>
            <LookChoice label={t('coach.beard')} options={BEARDS} value={look.beard} name={(o) => t(`coach.beards.${o}`)} onPick={(beard) => saveLook({ beard })}>
              {(o) => face({ beard: o })}
            </LookChoice>
            <LookChoice label={t('coach.glasses')} options={GLASSES} value={look.glasses} name={(o) => t(`coach.glassesOptions.${o}`)} onPick={(glasses) => saveLook({ glasses })}>
              {(o) => face({ glasses: o })}
            </LookChoice>
            {coach.look && (
              <button className="outline" style={{ width: '100%', marginTop: '0.9rem' }} onClick={() => void save({ look: undefined })}>
                {t('coach.lookReset')}
              </button>
            )}
          </section>

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
