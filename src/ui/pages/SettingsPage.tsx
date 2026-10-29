import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { loadLibrary } from '../../data/library';
import { eventsCsv, setsCsv, workoutsCsv } from '../../domain/csv';
import { generateDemo } from '../../domain/demo';
import { buildBundle, parseBundle, planMerge, previewImport, TABLES, type Bundle, type ConflictPolicy, type DuplicatePolicy, type Preview, type Scope } from '../../domain/interchange';
import { NumInput } from '../components/NumInput';
import { download, fmtDate, stamp, useSettings } from '../util';

const APP_VERSION = '0.1.0';

async function exportJson(scope: Scope) {
  const data = await repo.readAll();
  download(`mygymprogression-${scope}-${stamp()}.json`, JSON.stringify(buildBundle(data, scope, APP_VERSION), null, 2));
  if (scope === 'full') await repo.saveSettings({ lastBackupAt: new Date().toISOString() });
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
      if (!confirm(t('import.replaceWarn'))) return;
      download(`mygymprogression-before-import-${stamp()}.json`, JSON.stringify(buildBundle(existing, 'full', APP_VERSION), null, 2));
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
  const importLibrary = async () => {
    const lib = await loadLibrary();
    if (!lib) return flash(t('settings.libraryMissing'));
    flash('…');
    flash(t('settings.libraryResult', await repo.importLibrary(lib.exercises)));
  };
  const demo = async () => {
    if (!confirm(t('settings.demoConfirm'))) return;
    await repo.seedOrImport();
    const data = generateDemo(await db.exercises.toArray());
    await repo.importMerge(data);
    flash(t('settings.demoDone'));
  };
  const reset = async () => {
    if (!confirm(t('settings.resetConfirm'))) return;
    if (prompt(t('settings.resetConfirm2')) !== 'DELETE') return;
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
        <div className="actions" style={{ marginTop: 0 }}>
          <button className="outline" onClick={() => void importLibrary()}>
            {t('settings.importLibrary')}
          </button>
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
