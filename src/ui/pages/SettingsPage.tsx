import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { eventsCsv, setsCsv, workoutsCsv } from '../../domain/csv';
import { generateDemo } from '../../domain/demo';
import { buildBundle, parseBundle, planMerge, previewImport, TABLES, type Bundle, type ConflictPolicy, type DuplicatePolicy, type Preview, type Scope } from '../../domain/interchange';
import { NumInput } from '../components/NumInput';
import { download, fmtDate, saveBackup, stamp, useSettings } from '../util';
import { dialog } from '../components/Dialog';
import { parseLibraryFile } from '../../domain/library';
import { coachMessage } from '../../domain/coach';
import { COACH_BANKS } from '../../i18n/coach';
import type { CoachSettings, CoachStyle, CoachWhen } from '../../domain/types';
import { CoachAvatar } from '../components/CoachAvatar';

const COACH_STYLES: CoachStyle[] = ['support', 'spite', 'stoic', 'sergeant'];
const NO_COACH: CoachSettings = { enabled: false, style: 'support', profanity: false };


async function exportJson(scope: Scope) {
  if (scope === 'full') return void (await saveBackup());
  const data = await repo.readAll();
  download(`mygymprogression-${scope}-${stamp()}.json`, JSON.stringify(buildBundle(data, scope, __APP_VERSION__), null, 2));
}

function ImportPanel() {
  const { t } = useTranslation();
  const [bundle, setBundle] = useState<Bundle>();
  const [migrated, setMigrated] = useState<number>();
  const [preview, setPreview] = useState<Preview>();
  const [errors, setErrors] = useState<string[]>([]);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [policy, setPolicy] = useState<ConflictPolicy>('skip');
  const [dups, setDups] = useState<DuplicatePolicy>('useExisting');
  const [msg, setMsg] = useState('');

  const errorText = (e: string) => {
    const [code, v] = e.split(':');
    return code in { invalid_json: 1, not_a_backup: 1, schema_version_missing: 1, schema_version_newer: 1, file_too_large: 1 } ? t(`import.error.${code}`, { v }) : e;
  };

  const onFile = async (f: File | undefined) => {
    setBundle(undefined);
    setPreview(undefined);
    setErrors([]);
    setMsg('');
    if (!f) return;
    const r = parseBundle(await f.text());
    if (!r.ok) return setErrors(r.errors);
    setBundle(r.bundle);
    setMigrated(r.migratedFrom);
    setPreview(previewImport(r.bundle.data, await repo.readAll()));
  };

  const commit = async () => {
    if (!bundle) return;
    const existing = await repo.readAll();
    if (mode === 'replace') {
      if (!(await dialog.confirm(t('import.replaceWarn'), { danger: true }))) return;
      download(`mygymprogression-before-import-${stamp()}.json`, JSON.stringify(buildBundle(existing, 'full', __APP_VERSION__), null, 2));
      await repo.importReplace({ ...bundle.data, settings: bundle.data.settings ?? existing.settings });
    } else {
      await repo.importMerge(planMerge(bundle.data, existing, policy, dups));
    }
    setMsg(t('import.done'));
    setBundle(undefined);
    setPreview(undefined);
  };

  return (
    <div className="stack-sm">
      {/* The native file control is hidden; the label is the visible, translated button. */}
      <label className="btn btn-outline file-btn">
        ⤒ {t('settings.chooseFile')}
        <input type="file" accept="application/json,.json" onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>
      {errors.length > 0 && (
        <div className="error" role="alert">
          <p>{t('import.errors')}</p>
          <ul>
            {errors.map((e) => (
              <li key={e}>{errorText(e)}</li>
            ))}
          </ul>
        </div>
      )}
      {msg && <p role="status">{msg}</p>}
      {bundle && preview && (
        <div className="stack-sm">
          <h3>{t('import.preview')}</h3>
          <p className="help">
            {t('import.exportedAt')}: {fmtDate(bundle.exportedAt, 'en', true)} · {t('import.scope')}: {bundle.scope} · app {bundle.app.version}
            {migrated && ` · ${t('import.migrated', { v: migrated })}`}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('import.table')}</th>
                  <th className="num">{t('import.incoming')}</th>
                  <th className="num">{t('import.new')}</th>
                  <th className="num">{t('import.identical')}</th>
                  <th className="num">{t('import.conflicts')}</th>
                </tr>
              </thead>
              <tbody>
                {TABLES.map((tb) => (
                  <tr key={tb}>
                    <td>{t(`import.tables.${tb}`)}</td>
                    <td className="num">{preview.tables[tb].incoming}</td>
                    <td className="num">{preview.tables[tb].new}</td>
                    <td className="num">{preview.tables[tb].identical}</td>
                    <td className="num">{preview.tables[tb].conflicts.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.missingExerciseRefs.length > 0 && <p className="help">{t('import.missingRefs', { count: preview.missingExerciseRefs.length })}</p>}
          <fieldset>
            <legend>{t('import.mode')}</legend>
            <label className="check">
              <input type="radio" name="mode" checked={mode === 'merge'} onChange={() => setMode('merge')} /> {t('import.merge')}
            </label>
            <label className="check">
              <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /> {t('import.replace')}
            </label>
          </fieldset>
          {mode === 'replace' && <p className="error">{t('import.replaceWarn')}</p>}
          {mode === 'merge' && (
            <>
              <label>
                {t('import.conflictPolicy')}
                <select value={policy} onChange={(e) => setPolicy(e.target.value as ConflictPolicy)}>
                  <option value="skip">{t('import.skip')}</option>
                  <option value="overwrite">{t('import.overwrite')}</option>
                  <option value="keepBoth">{t('import.keepBoth')}</option>
                </select>
              </label>
              {preview.duplicateExercises.length > 0 && (
                <label>
                  {t('import.duplicates', { count: preview.duplicateExercises.length })}
                  <select value={dups} onChange={(e) => setDups(e.target.value as DuplicatePolicy)}>
                    <option value="useExisting">{t('import.dupUseExisting')}</option>
                    <option value="import">{t('import.dupImport')}</option>
                  </select>
                </label>
              )}
            </>
          )}
          <button className="primary" onClick={() => void commit()}>{t('import.commit')}</button>
        </div>
      )}
    </div>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const s = useSettings();
  const [persisted, setPersisted] = useState<boolean>();
  const [msg, setMsg] = useState('');
  const [sample, setSample] = useState<string>();
  const coach = s.coach ?? NO_COACH;
  const saveCoach = (patch: Partial<CoachSettings>) => repo.saveSettings({ coach: { ...coach, ...patch } });
  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);
  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 2500);
  };

  const csv = async (kind: 'sets' | 'workouts' | 'events') => {
    const d = await repo.readAll();
    const finished = d.workouts.filter((w) => w.status !== 'in_progress').sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const names = Object.fromEntries(d.exercises.map((e) => [e.id, e.name]));
    const text = kind === 'sets' ? setsCsv(finished) : kind === 'workouts' ? workoutsCsv(finished) : eventsCsv(d.progressionEvents, names);
    download(`mygymprogression-${kind}-${stamp()}.csv`, '﻿' + text, 'text/csv');
  };
  const importLibrary = async (file?: File) => {
    if (!file) return;
    flash('…');
    let records;
    try {
      records = parseLibraryFile(JSON.parse(await file.text()));
    } catch {
      records = undefined;
    }
    if (!records) return flash(t('settings.libraryInvalid'));
    flash(t('settings.libraryResult', await repo.importLibrary(records)));
  };
  // The open library is published with the app (public/library), and downloaded only when asked for.
  const openLibrary = async () => {
    flash('…');
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}library/free-exercise-db.json`);
      const records = res.ok ? parseLibraryFile(await res.json()) : undefined;
      if (!records) return flash(t('settings.openLibraryFailed'));
      flash(t('settings.libraryResult', await repo.importLibrary(records)));
    } catch {
      flash(t('settings.openLibraryFailed'));
    }
  };
  const demo = async () => {
    if (!(await dialog.confirm(t('settings.demoConfirm')))) return;
    await repo.seedLibrary();
    const data = generateDemo(await db.exercises.toArray());
    await repo.importMerge(data);
    flash(t('settings.demoDone'));
  };
  const reset = async () => {
    if (!(await dialog.confirm(t('settings.resetConfirm'), { danger: true, ok: t('common.delete') }))) return;
    if ((await dialog.prompt(t('settings.resetConfirm2')))?.trim() !== 'DELETE') return;
    await repo.clearAll();
  };

  return (
    <div>
      <div className="page-head">
        <h1>{t('settings.title')}</h1>
      </div>

      <div className="section-head">
        <h2>{t('settings.preferences')}</h2>
      </div>
      <section className="card">
        <label className="setting-row">
          <span>{t('settings.language')}</span>
          <select value={s.language} onChange={(e) => void repo.saveSettings({ language: e.target.value as 'pt' | 'en' })}>
            <option value="pt">Português (PT)</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="setting-row">
          <span>{t('settings.theme')}</span>
          <select value={s.theme ?? 'dark'} onChange={(e) => void repo.saveSettings({ theme: e.target.value as 'dark' | 'light' | 'system' })}>
            {(['dark', 'light', 'system'] as const).map((th) => (
              <option key={th} value={th}>
                {t(`settings.themes.${th}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="setting-row">
          <span>{t('settings.loadUnit')}</span>
          <select value={s.loadUnit} onChange={(e) => void repo.saveSettings({ loadUnit: e.target.value as 'kg' | 'lb' })}>
            <option>kg</option>
            <option>lb</option>
          </select>
        </label>
        <label className="setting-row">
          <span>{t('settings.distanceUnit')}</span>
          <select value={s.distanceUnit} onChange={(e) => void repo.saveSettings({ distanceUnit: e.target.value as 'km' | 'mi' })}>
            <option>km</option>
            <option>mi</option>
          </select>
        </label>
        <label className="setting-row">
          <span>{t('settings.stalledThreshold')}</span>
          <NumInput label={t('settings.stalledThreshold')} value={s.stalledThreshold} onChange={(v) => v && v >= 2 && v <= 20 && Number.isInteger(v) && void repo.saveSettings({ stalledThreshold: v })} />
        </label>
      </section>

      <div className="section-head">
        <h2>{t('coach.title')}</h2>
      </div>
      <section className="card">
        <label className="setting-row">
          <span>{t('coach.enabled')}</span>
          <input type="checkbox" checked={coach.enabled} onChange={(e) => void saveCoach({ enabled: e.target.checked })} />
        </label>
        {coach.enabled && (
          <>
            <label className="setting-row">
              <span>{t('coach.style')}</span>
              <select value={coach.style} onChange={(e) => (setSample(undefined), void saveCoach({ style: e.target.value as CoachStyle }))}>
                {COACH_STYLES.map((st) => (
                  <option key={st} value={st}>
                    {t(`coach.styles.${st}`)}
                  </option>
                ))}
              </select>
            </label>
            <div className="coach-style">
              <CoachAvatar style={coach.style} />
              <p className="help">{t(`coach.styleHelp.${coach.style}`)}</p>
            </div>
            <label className="setting-row">
              <span>{t('coach.when')}</span>
              <select value={coach.when ?? 'random'} onChange={(e) => void saveCoach({ when: e.target.value as CoachWhen })}>
                {(['random', 'each', 'start'] as const).map((w) => (
                  <option key={w} value={w}>
                    {t(`coach.whenOptions.${w}`)}
                  </option>
                ))}
              </select>
            </label>
            {coach.style === 'spite' && (
              <label className="setting-row">
                <span>{t('coach.profanity')}</span>
                <input type="checkbox" checked={coach.profanity} onChange={(e) => void saveCoach({ profanity: e.target.checked })} />
              </label>
            )}
            {sample && (
              <div key={sample} className="coach" role="status" aria-label={t('coach.title')}>
                <CoachAvatar style={coach.style} />
                <p>{sample}</p>
              </div>
            )}
            <button className="outline" onClick={() => setSample(coachMessage(COACH_BANKS[s.language], coach, { month: 3, days: 4, increase: { exercise: t('coach.sampleExercise'), from: '40 kg', to: '42.5 kg' } }, String(Date.now())))}>
              {t('coach.preview')}
            </button>
          </>
        )}
      </section>

      <div className="section-head">
        <h2>{t('settings.data')}</h2>
      </div>
      <section className="card">
        <p className="help">
          {t('settings.privacy')} {persisted ? t('settings.persisted') : t('settings.notPersisted')}
        </p>
        <div className="actions">
          <button className="primary" onClick={() => void exportJson('full')}>
            ⤓ {t('settings.exportFull')}
          </button>
        </div>
        <p className="help">
          {s.lastBackupAt ? t('dashboard.backupReminder', { date: fmtDate(s.lastBackupAt, s.language) }) : t('home.noBackup')}
        </p>
        <details>
          <summary>{t('settings.export')}</summary>
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="outline sm" onClick={() => void exportJson('library')}>
              {t('settings.exportLibrary')}
            </button>
            <button className="outline sm" onClick={() => void exportJson('plans')}>
              {t('settings.exportPlans')}
            </button>
            <button className="outline sm" onClick={() => void csv('sets')}>
              {t('settings.csvSets')}
            </button>
            <button className="outline sm" onClick={() => void csv('workouts')}>
              {t('settings.csvWorkouts')}
            </button>
            <button className="outline sm" onClick={() => void csv('events')}>
              {t('settings.csvEvents')}
            </button>
          </div>
          <p className="help">{t('settings.formatDoc')}</p>
        </details>
      </section>

      <div className="section-head">
        <h2>{t('settings.import')}</h2>
      </div>
      <section className="card">
        <ImportPanel />
      </section>

      <div className="section-head">
        <h2>{t('settings.library')}</h2>
      </div>
      <section className="card">
        <p className="help" style={{ marginTop: 0 }}>
          {t('settings.libraryNotice')}
        </p>
        <button className="primary" onClick={() => void openLibrary()}>
          ⤓ {t('settings.openLibrary')}
        </button>
        <p className="help">{t('settings.openLibraryHelp')}</p>
        <div className="actions" style={{ marginTop: 0 }}>
          <label className="btn btn-outline file-btn">
            ⤒ {t('settings.importLibrary')}
            <input type="file" accept="application/json,.json" onChange={(e) => (void importLibrary(e.target.files?.[0]), (e.target.value = ''))} />
          </label>
          <button className="outline" onClick={() => void repo.seedLibrary().then((n) => flash(t('settings.seeded', { count: n })))}>
            {t('settings.seed')}
          </button>
          <button className="ghost" onClick={() => void demo()}>
            {t('settings.demo')}
          </button>
        </div>
        {msg && (
          <p role="status" className="help">
            {msg}
          </p>
        )}
      </section>

      <div className="section-head">
        <h2>{t('settings.danger')}</h2>
      </div>
      <section className="card">
        <p className="help">{t('settings.resetConfirm')}</p>
        <button className="danger" onClick={() => void reset()}>
          {t('settings.reset')}
        </button>
      </section>
    </div>
  );
}
