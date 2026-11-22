// Body (V2-D6): body weight with a goal, measurements and progress photos (before/after). Part of the Progress tab.
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { localDay } from '../../domain/analysis';
import { latestMeasurements, weeklyRate, weightChange, weightSeries } from '../../domain/body';
import { MEASURE_PARTS, type BodyWeight, type MeasurePart, type ProgressPhoto } from '../../domain/types';
import { convert } from '../../domain/units';
import { Empty, PageHead, ProgressSwitch } from '../components/Bits';
import { dialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { NumInput } from '../components/NumInput';
import { fmtDate, fmtNum, loadOut, useSettings } from '../util';

/** A picked image made small enough for a backup: JPEG, at most 1080 px on the long side. */
async function smallPhoto(file: File, max = 1080): Promise<string> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * k);
  canvas.height = Math.round(img.height * k);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

export function BodyPage() {
  const { t } = useTranslation();
  const s = useSettings();
  const [params, setParams] = useSearchParams();
  const data = useLiveQuery(async () => ({
    weights: await db.bodyWeights.toArray(),
    measures: await db.measurements.toArray(),
    photos: await db.photos.orderBy('date').toArray(),
  }));
  const [adding, setAdding] = useState<'weight' | 'measure' | undefined>(params.get('add') === 'weight' ? 'weight' : undefined);
  const [viewing, setViewing] = useState<ProgressPhoto>();
  const [comparing, setComparing] = useState(false);
  if (!data) return null;
  const n = (x: number, d = 1) => fmtNum(x, s.language, d);
  const series = weightSeries(data.weights);
  const last = series.at(-1);
  const change = weightChange(series);
  const rate = weeklyRate(series);
  const close = () => {
    setAdding(undefined);
    if (params.get('add')) setParams({}, { replace: true });
  };
  const addPhoto = async (file?: File) => {
    if (!file) return;
    await repo.addPhoto(await smallPhoto(file), localDay(new Date()));
  };

  return (
    <div>
      <PageHead title={t('nav.progress')} more />
      <ProgressSwitch on="body" />

      <section className="card stack" aria-labelledby="b-weight">
        <div className="card-head">
          <h2 id="b-weight">{t('body.weight')}</h2>
          <button className="primary sm" onClick={() => setAdding('weight')}>
            <Icon name="plus" /> {t('body.log')}
          </button>
        </div>
        {last ? (
          <>
            <p className="tool-result">
              <span className="big num">{n(loadOut(last.kg, s)!)}</span> {s.loadUnit}
              <small>{fmtDate(last.date, s.language)}</small>
            </p>
            <p className="muted num">
              {change !== undefined && t('body.change', { value: `${change > 0 ? '+' : ''}${n(loadOut(change, s)!)} ${s.loadUnit}` })}
              {rate !== undefined && ` · ${t('body.rate', { value: `${rate > 0 ? '+' : ''}${n(loadOut(rate, s)!, 2)} ${s.loadUnit}` })}`}
              {s.bodyGoal !== undefined && ` · ${t('body.goal', { value: `${n(loadOut(s.bodyGoal, s)!)} ${s.loadUnit}` })}`}
            </p>
            {series.length > 1 && <WeightChart series={series} goal={s.bodyGoal} />}
            <details>
              <summary>{t('body.history', { count: series.length })}</summary>
              <ul className="list">
                {[...data.weights].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 30).map((w) => (
                  <li key={w.id} className="row between">
                    <span>{fmtDate(w.date, s.language)}</span>
                    <span className="row">
                      <span className="num">
                        {n(loadOut(w.kg, s)!)} {s.loadUnit}
                      </span>
                      <button
                        className="ghost icon"
                        aria-label={t('body.deleteWeight', { date: fmtDate(w.date, s.language) })}
                        onClick={async () => (await dialog.confirm(t('body.deleteConfirm'), { danger: true, ok: t('common.delete') })) && repo.deleteBodyWeight(w.id)}
                      >
                        <Icon name="trash" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : (
          <p className="help">{t('body.noWeight')}</p>
        )}
        <label className="setting-row">
          <span className="lbl">{t('body.goalLabel', { unit: s.loadUnit })}</span>
          <NumInput label={t('body.goalLabel', { unit: s.loadUnit })} value={loadOut(s.bodyGoal, s)} onChange={(v) => void repo.saveSettings({ bodyGoal: v === undefined ? undefined : convert(v, s.loadUnit, 'kg') })} />
        </label>
      </section>

      <section className="card stack" aria-labelledby="b-measures">
        <div className="card-head">
          <h2 id="b-measures">{t('body.measures')}</h2>
          <button className="outline sm" onClick={() => setAdding('measure')}>
            <Icon name="plus" /> {t('body.addMeasure')}
          </button>
        </div>
        {data.measures.length ? (
          <ul className="list">
            {latestMeasurements(data.measures).map((m) => (
              <li key={m.part} className="row between">
                <span>
                  {t(`body.parts.${m.part}`)} <small>{fmtDate(m.date, s.language)}</small>
                </span>
                <span className="num">
                  {n(m.value)} {m.part === 'bodyFat' ? '%' : 'cm'}
                  {m.change !== undefined && m.change !== 0 && <small> ({m.change > 0 ? '+' : ''}{n(m.change)})</small>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="help">{t('body.noMeasures')}</p>
        )}
      </section>

      <section className="card stack" aria-labelledby="b-photos">
        <div className="card-head">
          <h2 id="b-photos">{t('body.photos')}</h2>
          {data.photos.length >= 2 && (
            <button className="outline sm" onClick={() => setComparing(true)}>
              {t('body.compare')}
            </button>
          )}
        </div>
        {data.photos.length ? (
          <div className="photo-grid">
            {data.photos.map((p) => (
              <button key={p.id} type="button" className="photo" onClick={() => setViewing(p)} aria-label={t('body.photoOf', { date: fmtDate(p.date, s.language) })}>
                <img src={p.dataUrl} alt="" loading="lazy" />
                <span>{fmtDate(p.date, s.language)}</span>
              </button>
            ))}
          </div>
        ) : (
          <Empty>{t('body.noPhotos')}</Empty>
        )}
        <label className="btn outline file-btn">
          <Icon name="image" /> {t('body.addPhoto')}
          <input type="file" accept="image/*" capture="environment" onChange={(e) => (void addPhoto(e.target.files?.[0]), (e.target.value = ''))} />
        </label>
        <p className="help">{t('body.photosPrivacy')}</p>
      </section>

      {adding === 'weight' && <WeightForm onClose={close} last={last} />}
      {adding === 'measure' && <MeasureForm onClose={close} />}
      {viewing && (
        <Modal title={fmtDate(viewing.date, s.language)} onClose={() => setViewing(undefined)}>
          <img className="photo-full" src={viewing.dataUrl} alt={t('body.photoOf', { date: fmtDate(viewing.date, s.language) })} />
          <button
            className="danger"
            onClick={async () => {
              if (!(await dialog.confirm(t('body.deleteConfirm'), { danger: true, ok: t('common.delete') }))) return;
              await repo.deletePhoto(viewing.id);
              setViewing(undefined);
            }}
          >
            <Icon name="trash" /> {t('common.delete')}
          </button>
        </Modal>
      )}
      {comparing && <Compare photos={data.photos} onClose={() => setComparing(false)} />}
    </div>
  );
}

function WeightForm({ onClose, last }: { onClose: () => void; last?: BodyWeight }) {
  const { t } = useTranslation();
  const s = useSettings();
  const [value, setValue] = useState<number | undefined>(loadOut(last?.kg, s));
  const [date, setDate] = useState(localDay(new Date()));
  const save = async () => {
    if (!value || value <= 0) return;
    await repo.addBodyWeight(convert(value, s.loadUnit, 'kg'), date);
    onClose();
  };
  return (
    <Modal title={t('body.log')} onClose={onClose}>
      <div className="stack">
        <label>
          {t('body.weight')} ({s.loadUnit})
          <NumInput label={`${t('body.weight')} (${s.loadUnit})`} value={value} onChange={setValue} step={0.1} stepper />
        </label>
        <label>
          {t('body.date')}
          <input type="date" value={date} max={localDay(new Date())} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="primary xl" disabled={!value} onClick={() => void save()}>
          {t('common.save')}
        </button>
      </div>
    </Modal>
  );
}

function MeasureForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [part, setPart] = useState<MeasurePart>('waist');
  const [value, setValue] = useState<number>();
  const [date, setDate] = useState(localDay(new Date()));
  return (
    <Modal title={t('body.addMeasure')} onClose={onClose}>
      <div className="stack">
        <label>
          {t('body.part')}
          <select value={part} onChange={(e) => setPart(e.target.value as MeasurePart)}>
            {MEASURE_PARTS.map((p) => (
              <option key={p} value={p}>
                {t(`body.parts.${p}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {part === 'bodyFat' ? '%' : 'cm'}
          <NumInput label={`${t(`body.parts.${part}`)} (${part === 'bodyFat' ? '%' : 'cm'})`} value={value} onChange={setValue} step={0.5} />
        </label>
        <label>
          {t('body.date')}
          <input type="date" value={date} max={localDay(new Date())} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button
          className="primary xl"
          disabled={!value}
          onClick={async () => {
            if (!value) return;
            await repo.addMeasurement(part, value, date);
            onClose();
          }}
        >
          {t('common.save')}
        </button>
      </div>
    </Modal>
  );
}

/** Weight over time: one line, the goal as a dashed line when it is in view. */
function WeightChart({ series, goal }: { series: BodyWeight[]; goal?: number }) {
  const { t } = useTranslation();
  const s = useSettings();
  const pts = series.slice(-60);
  const values = pts.map((w) => w.kg).concat(goal !== undefined ? [goal] : []);
  const lo = Math.min(...values) - 0.5;
  const hi = Math.max(...values) + 0.5;
  const W = 320;
  const H = 90;
  const x = (i: number) => (pts.length === 1 ? W / 2 : (i / (pts.length - 1)) * (W - 8) + 4);
  const y = (kg: number) => H - 6 - ((kg - lo) / (hi - lo)) * (H - 12);
  const first = pts[0];
  const last = pts[pts.length - 1];
  return (
    <svg className="weight-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('body.chart', { from: fmtNum(loadOut(first.kg, s), s.language, 1), to: fmtNum(loadOut(last.kg, s), s.language, 1), unit: s.loadUnit })}>
      {goal !== undefined && <line className="goal" x1="0" x2={W} y1={y(goal)} y2={y(goal)} />}
      <polyline points={pts.map((w, i) => `${x(i)},${y(w.kg)}`).join(' ')} />
      <circle cx={x(pts.length - 1)} cy={y(last.kg)} r="4" />
    </svg>
  );
}

/** Before and after: two photos on top of each other, a slider shows more of one or the other. */
function Compare({ photos, onClose }: { photos: ProgressPhoto[]; onClose: () => void }) {
  const { t } = useTranslation();
  const s = useSettings();
  const [a, setA] = useState(photos[0].id);
  const [b, setB] = useState(photos[photos.length - 1].id);
  const [cut, setCut] = useState(50);
  const pa = photos.find((p) => p.id === a)!;
  const pb = photos.find((p) => p.id === b)!;
  const pick = (value: string, set: (id: string) => void, label: string) => (
    <label>
      {label}
      <select value={value} onChange={(e) => set(e.target.value)}>
        {photos.map((p) => (
          <option key={p.id} value={p.id}>
            {fmtDate(p.date, s.language)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <Modal title={t('body.compare')} onClose={onClose}>
      <div className="stack">
        <div className="form-grid">
          {pick(a, setA, t('body.before'))}
          {pick(b, setB, t('body.after'))}
        </div>
        <div className="compare">
          <img src={pb.dataUrl} alt={t('body.photoOf', { date: fmtDate(pb.date, s.language) })} />
          <img src={pa.dataUrl} alt={t('body.photoOf', { date: fmtDate(pa.date, s.language) })} style={{ clipPath: `inset(0 ${100 - cut}% 0 0)` }} />
          <span className="compare-line" style={{ left: `${cut}%` }} aria-hidden="true" />
        </div>
        <label>
          {t('body.slider')}
          <input type="range" min={0} max={100} value={cut} onChange={(e) => setCut(Number(e.target.value))} />
        </label>
      </div>
    </Modal>
  );
}
