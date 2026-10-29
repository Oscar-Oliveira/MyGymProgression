import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { duplicateAsVariation, newExercise } from '../../domain/factory';
import type { Exercise, ExerciseCategory, LoadMode } from '../../domain/types';
import { MEASUREMENT_PRESETS, presetDefaults, presetMetrics, type MeasurementPreset } from '../../domain/units';
import { MetricsEditor, PrescriptionEditor, ProgressionEditor } from '../components/Editors';
import { splitList, useSettings } from '../util';

const CATS: ExerciseCategory[] = ['compound', 'isolation', 'cardio', 'warmup', 'mobility', 'other'];
export const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'core', 'quads', 'hamstrings', 'glutes', 'calves', 'cardio', 'full_body'];
const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'treadmill', 'bike', 'rower', 'other'];

function Chips({ value, onChange, label }: { value: string[]; onChange: (v: string[]) => void; label: string }) {
  const { t } = useTranslation();
  const options = [...new Set([...MUSCLES, ...value])];
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="row wrap">
        {options.map((m) => (
          <label className="check" key={m}>
            <input type="checkbox" checked={value.includes(m)} onChange={(e) => onChange(e.target.checked ? [...value, m] : value.filter((x) => x !== m))} />
            {t(`muscle.${m}`, { defaultValue: m })}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ExerciseEdit() {
  const { t } = useTranslation();
  const { id } = useParams();
  const nav = useNavigate();
  const s = useSettings();
  const [ex, setEx] = useState<Exercise>();
  const [preset, setPreset] = useState<MeasurementPreset>('reps_load');
  const [errors, setErrors] = useState<string[]>([]);
  const [original, setOriginal] = useState<Exercise>();

  useEffect(() => {
    if (id) {
      void db.exercises.get(id).then((e) => {
        setEx(e);
        setOriginal(e);
      });
    } else setEx(newExercise('reps_load', s));
    // Settings only matter for the initial draft.
  }, [id]);
  if (!ex) return null;
  const up = (patch: Partial<Exercise>) => setEx({ ...ex, ...patch });

  const applyPreset = (p: MeasurementPreset) => {
    setPreset(p);
    const d = presetDefaults(p, s.loadUnit);
    up({ metrics: presetMetrics(p, s.loadUnit, s.distanceUnit), defaultSets: d.sets, progression: d.progression });
  };

  const unitChanged = original && original.metrics.some((m) => ex.metrics.find((x) => x.key === m.key && x.unit !== m.unit));

  const save = async () => {
    const errs: string[] = [];
    if (!ex.name.trim()) errs.push(`${t('common.name')}: ${t('validation.required')}`);
    if (!ex.metrics.length) errs.push(`${t('exercise.metrics')}: ${t('validation.required')}`);
    for (const m of ex.metrics) if (m.key.startsWith('custom:') && (!m.label?.trim() || !m.unit.trim())) errs.push(`${t('metric.custom')}: ${t('validation.required')}`);
    for (const l of ex.links) if (l.url && !/^https?:\/\//i.test(l.url)) errs.push(`${t('exercise.linkUrl')}: ${t('validation.invalid')}`);
    if (ex.progression.strategy === 'double' && !ex.metrics.some((m) => m.key === 'reps')) errs.push(`${t('strategy.double')}: ${t('metric.reps')} ${t('validation.required')}`);
    setErrors(errs);
    if (errs.length) return;
    await repo.saveExercise({ ...ex, name: ex.name.trim(), links: ex.links.filter((l) => l.url) });
    nav(`/exercises/${ex.id}`);
  };

  const remove = async () => {
    const used = await repo.exerciseUsage(ex.id);
    if (used.length) return alert(t('exercise.usedIn', { plans: used.join(', ') }));
    if (!confirm(t('common.confirmDelete', { name: ex.name }))) return;
    await repo.deleteExercise(ex.id);
    nav('/exercises');
  };

  const variation = async () => {
    const v = duplicateAsVariation(ex, t('exercise.variationName', { name: ex.name }));
    await repo.saveExercise(v);
    nav(`/exercises/${v.id}/edit`);
  };

  return (
    <div className="stack">
      <h1>{id ? t('exercise.edit') : t('exercise.new')}</h1>
      <section className="card form-grid">
        <label>
          {t('common.name')}
          <input value={ex.name} onChange={(e) => up({ name: e.target.value })} required autoFocus={!id} />
        </label>
        <label>
          {t('exercise.aliases')}
          <input value={ex.aliases.join(', ')} onChange={(e) => up({ aliases: splitList(e.target.value) })} />
        </label>
        <label>
          {t('exercise.category')}
          <select value={ex.category} onChange={(e) => up({ category: e.target.value as ExerciseCategory })}>
            {CATS.map((c) => (
              <option key={c} value={c}>
                {t(`category.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('exercise.equipment')}
          <select value={ex.equipment} onChange={(e) => up({ equipment: e.target.value })}>
            <option value="">—</option>
            {[...new Set([...EQUIPMENT, ex.equipment].filter(Boolean))].map((q) => (
              <option key={q} value={q}>
                {t(`equipment.${q}`, { defaultValue: q })}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('exercise.tags')}
          <input value={ex.tags.join(', ')} onChange={(e) => up({ tags: splitList(e.target.value) })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={ex.active} onChange={(e) => up({ active: e.target.checked })} /> {t('exercise.active')}
        </label>
      </section>

      <section className="card stack-sm">
        <Chips label={t('exercise.primary')} value={ex.primaryMuscles} onChange={(v) => up({ primaryMuscles: v })} />
        <Chips label={t('exercise.secondary')} value={ex.secondaryMuscles} onChange={(v) => up({ secondaryMuscles: v })} />
      </section>

      <section className="card stack-sm">
        <h2>{t('exercise.metrics')}</h2>
        <div className="row wrap">
          <label>
            {t('preset.label')}
            <select value={preset} onChange={(e) => (id ? setPreset(e.target.value as MeasurementPreset) : applyPreset(e.target.value as MeasurementPreset))}>
              {MEASUREMENT_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {t(`preset.${p}`)}
                </option>
              ))}
            </select>
          </label>
          {id && (
            <button type="button" className="outline" onClick={() => confirm(t('exercise.presetWarn')) && applyPreset(preset)}>
              {t('exercise.applyPreset')}
            </button>
          )}
        </div>
        <MetricsEditor metrics={ex.metrics} onChange={(metrics) => up({ metrics })} />
        {unitChanged && <p className="help">{t('exercise.unitChangeWarn')}</p>}
        {ex.metrics.some((m) => m.key === 'load') && (
          <label>
            {t('loadMode.label')}
            <select value={ex.loadMode} onChange={(e) => up({ loadMode: e.target.value as LoadMode })}>
              <option value="total">{t('loadMode.total')}</option>
              <option value="perSide">{t('loadMode.perSide')}</option>
            </select>
          </label>
        )}
      </section>

      <section className="card stack-sm">
        <h2>{t('exercise.defaults')}</h2>
        <PrescriptionEditor sets={ex.defaultSets} metrics={ex.metrics} onChange={(defaultSets) => up({ defaultSets })} />
      </section>

      <section className="card">
        <h2>{t('exercise.progressionSettings')}</h2>
        <ProgressionEditor config={ex.progression} metrics={ex.metrics} onChange={(progression) => up({ progression })} />
      </section>

      <section className="card form-grid">
        <label>
          {t('exercise.instructions')}
          <textarea value={ex.instructions} onChange={(e) => up({ instructions: e.target.value })} />
        </label>
        <label>
          {t('exercise.safety')}
          <textarea value={ex.safetyNotes} onChange={(e) => up({ safetyNotes: e.target.value })} />
        </label>
        <label>
          {t('exercise.personal')}
          <textarea value={ex.personalNotes} onChange={(e) => up({ personalNotes: e.target.value })} />
        </label>
      </section>

      <section className="card stack-sm">
        <h2>{t('exercise.links')}</h2>
        {ex.links.map((l, i) => (
          <div className="row wrap" key={i}>
            <input aria-label={t('exercise.linkLabel')} placeholder={t('exercise.linkLabel')} value={l.label} onChange={(e) => up({ links: ex.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
            <input aria-label={t('exercise.linkUrl')} placeholder="https://" type="url" value={l.url} onChange={(e) => up({ links: ex.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
            <button type="button" className="ghost" onClick={() => up({ links: ex.links.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="outline" onClick={() => up({ links: [...ex.links, { label: '', url: '' }] })}>
          + {t('common.add')}
        </button>
      </section>

      {errors.length > 0 && (
        <ul className="error" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="sticky-actions">
        <button className="primary" onClick={() => void save()}>{t('common.save')}</button>
        <button className="outline" onClick={() => nav(-1)}>
          {t('common.cancel')}
        </button>
        {id && (
          <>
            <button className="outline" onClick={() => void variation()}>
              {t('exercise.variation')}
            </button>
            <span className="spacer" />
            <button className="danger" onClick={() => void remove()}>
              {t('common.delete')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
