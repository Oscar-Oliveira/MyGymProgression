// Brings v1 data into v2 (F3, docs/V2-PLAN.md): choose the source, review the exercise matches, check the report, import.
// v1 data is only read (from this browser's v1 database or a v1 backup file); the v1 database is never changed.
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { readV1 } from '../../data/v1source';
import { parseBundle, type DataSet } from '../../domain/interchange';
import { parseLibraryFile, type LibraryRecord } from '../../domain/library';
import { defaultDecisions, KEEP, migrateV1, suggestMatches, type MatchSuggestion, type MigrationReport } from '../../domain/migrate';
import { PageHead } from '../components/Bits';
import { dialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { toast } from '../components/Toast';
import { tr, useSettings } from '../util';

type Phase = 'source' | 'review' | 'report' | 'done';
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function MigrationPage() {
  const { t } = useTranslation();
  const settings = useSettings();
  const v2Workouts = useLiveQuery(() => db.workouts.count(), [], 0);
  const [phase, setPhase] = useState<Phase>('source');
  /** v1 data of this browser: undefined while looking, null when there is none. */
  const [v1, setV1] = useState<DataSet | null>();
  const [source, setSource] = useState<DataSet>();
  const [lib, setLib] = useState<LibraryRecord[]>([]);
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ data: DataSet; report: MigrationReport }>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    readV1().then(
      (d) => setV1(d ?? null),
      () => setV1(null),
    );
  }, []);

  const bySid = useMemo(() => new Map(lib.map((r) => [r.sid, r])), [lib]);
  const lang = source?.settings?.language ?? settings.language;
  const nameOf = (sid: string) => {
    const r = bySid.get(sid);
    return r ? (lang === 'pt' && r.pt?.name) || r.name : sid;
  };
  // Library exercises chosen for more than one v1 exercise: those v1 exercises become one.
  const joins = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of suggestions) {
      const d = decisions[s.exerciseId];
      if (d && d !== KEEP) m.set(d, [...(m.get(d) ?? []), s.name]);
    }
    return m;
  }, [suggestions, decisions]);

  const begin = async (data: DataSet) => {
    setBusy(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}library/exercises-dataset.json`);
      const records = res.ok ? parseLibraryFile(await res.json()) : undefined;
      if (!records) return void toast(t('migrate.libraryFailed'));
      const s = suggestMatches(data, records);
      setSource(data);
      setLib(records);
      setSuggestions(s);
      setDecisions(defaultDecisions(s));
      setConfirmed(new Set(s.filter((x) => x.kind !== 'probable').map((x) => x.exerciseId)));
      setPhase('review');
    } catch {
      toast(t('migrate.libraryFailed'));
    } finally {
      setBusy(false);
    }
  };
  const fromFile = async (file?: File) => {
    if (!file) return;
    const parsed = parseBundle(await file.text());
    if (!parsed.ok) {
      const [code, v] = parsed.errors[0].split(':');
      return void toast(t(`import.error.${code}`, { v, defaultValue: parsed.errors[0] }));
    }
    await begin(parsed.bundle.data);
  };
  const choose = (id: string, value: string) => {
    setDecisions((d) => ({ ...d, [id]: value }));
    setConfirmed((c) => new Set(c).add(id));
  };
  const pending = suggestions.filter((s) => !confirmed.has(s.exerciseId)).length;
  const check = () => {
    if (!source) return;
    setResult(migrateV1(source, lib, decisions, source.settings ?? settings));
    setPhase('report');
  };
  const commit = async () => {
    if (!result?.report.ok) return;
    if (v2Workouts > 0 && !(await dialog.confirm(t('migrate.replaceWarn'), { danger: true }))) return;
    setBusy(true);
    try {
      await repo.importReplace(result.data);
      setPhase('done');
    } finally {
      setBusy(false);
    }
  };

  const groups: [string, MatchSuggestion[], boolean][] = [
    ['toConfirm', suggestions.filter((s) => s.kind === 'probable'), true],
    ['none', suggestions.filter((s) => s.kind === 'none'), true],
    ['exact', suggestions.filter((s) => s.kind === 'exact'), false],
  ];

  return (
    <div>
      <PageHead title={t('migrate.title')} sub={t('migrate.intro')} />

      {phase === 'source' && (
        <section className="card">
          <div className="act-list">
            <button type="button" className="act-row" disabled={!v1 || busy} onClick={() => v1 && void begin(v1)}>
              <span className="act-ico" aria-hidden="true">
                <Icon name="download" />
              </span>
              <span className="main">
                <span className="title">{t('migrate.fromBrowser')}</span>
                <span className="meta">
                  {v1 === undefined
                    ? t('migrate.checking')
                    : v1
                      ? t('migrate.foundSub', { workouts: v1.workouts.length, plans: v1.plans.length, exercises: v1.exercises.length })
                      : t('migrate.notFound')}
                </span>
              </span>
              <span className="chev" aria-hidden="true">
                <Icon name="chevronRight" />
              </span>
            </button>
            <label className="act-row file-btn">
              <span className="act-ico" aria-hidden="true">
                <Icon name="upload" />
              </span>
              <span className="main">
                <span className="title">{t('migrate.fromFile')}</span>
                <span className="meta">{t('migrate.fromFileSub')}</span>
              </span>
              <span className="chev" aria-hidden="true">
                <Icon name="chevronRight" />
              </span>
              <input type="file" accept="application/json,.json" disabled={busy} onChange={(e) => (void fromFile(e.target.files?.[0]), (e.target.value = ''))} />
            </label>
          </div>
          {busy && <p className="muted">{t('migrate.loading')}</p>}
        </section>
      )}

      {phase === 'review' && (
        <>
          <section className="card">
            <h2>{t('migrate.reviewTitle')}</h2>
            <p className="muted">{t('migrate.reviewIntro', { count: suggestions.length })}</p>
            <p className="muted">{t('migrate.joinsHelp')}</p>
          </section>
          {groups.map(([key, list, open]) =>
            list.length ? (
              <details key={key} className="card mig-group" open={open}>
                <summary>
                  <h2>{t(`migrate.${key}`, { count: list.length })}</h2>
                </summary>
                {list.map((s) => (
                  <MatchRow
                    key={s.exerciseId}
                    s={s}
                    value={decisions[s.exerciseId] ?? KEEP}
                    confirmed={confirmed.has(s.exerciseId)}
                    joinsWith={(joins.get(decisions[s.exerciseId]) ?? []).filter((n) => n !== s.name)}
                    lib={lib}
                    nameOf={nameOf}
                    onChoose={(v) => choose(s.exerciseId, v)}
                  />
                ))}
              </details>
            ) : null,
          )}
          <section className="card stack">
            {pending > 0 && <p className="muted">{t('migrate.pending', { count: pending })}</p>}
            {pending > 0 && (
              <button className="outline xl" onClick={() => setConfirmed(new Set(suggestions.map((s) => s.exerciseId)))}>
                {t('migrate.confirmAll')}
              </button>
            )}
            <button className="primary xl" disabled={pending > 0} onClick={check}>
              {t('migrate.check')}
            </button>
          </section>
        </>
      )}

      {phase === 'report' && result && (
        <>
          <section className={`card ${result.report.ok ? '' : 'warn'}`}>
            <h2>{t('migrate.reportTitle')}</h2>
            <p>
              <strong>{result.report.ok ? t('migrate.reportOk') : t('migrate.reportBad')}</strong>
            </p>
            <table className="mig-table">
              <thead>
                <tr>
                  <th scope="col">{t('migrate.what')}</th>
                  <th scope="col">{t('migrate.before')}</th>
                  <th scope="col">{t('migrate.after')}</th>
                  <th scope="col">
                    <span className="vh">{t('migrate.status')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.report.tables.map((row) => (
                  <tr key={row.name}>
                    <th scope="row">{t(`migrate.tables.${row.name}`)}</th>
                    <td>{row.before}</td>
                    <td>{row.after}</td>
                    <td aria-label={row.ok ? t('migrate.same') : t('migrate.different')}>
                      <Icon name={row.ok ? 'check' : 'warning'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">{t('migrate.exSummary', result.report.exercises)}</p>
            <p className="muted">{t('migrate.exLeft', result.report.exercises)}</p>
            <p className="muted">{t('migrate.exAdded', { added: result.report.exercises.libraryAdded })}</p>
            {result.report.dangling.length > 0 && <pre className="mig-pre">{result.report.dangling.slice(0, 20).join('\n')}</pre>}
            {result.report.workoutMismatches.length > 0 && <pre className="mig-pre">{result.report.workoutMismatches.join('\n')}</pre>}
          </section>
          <section className="card stack">
            <button className="primary xl" disabled={!result.report.ok || busy} onClick={() => void commit()}>
              {t('migrate.import')}
            </button>
            <button className="ghost" onClick={() => setPhase('review')}>
              {t('migrate.back')}
            </button>
          </section>
        </>
      )}

      {phase === 'done' && (
        <section className="card stack">
          <p>
            <strong>{t('migrate.done')}</strong>
          </p>
          <Link className="btn primary xl" to="/">
            {t('migrate.home')}
          </Link>
          <Link className="btn outline xl" to="/settings">
            {t('migrate.getMedia')}
          </Link>
        </section>
      )}
    </div>
  );
}

/** One v1 exercise: its library match (best candidates, or any library exercise by search) or "keep as my own". */
function MatchRow({
  s,
  value,
  confirmed,
  joinsWith,
  lib,
  nameOf,
  onChoose,
}: {
  s: MatchSuggestion;
  value: string;
  confirmed: boolean;
  joinsWith: string[];
  lib: LibraryRecord[];
  nameOf: (sid: string) => string;
  onChoose: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const hits = q.trim().length >= 2 ? lib.filter((r) => fold(`${r.pt?.name ?? ''} ${r.name}`).includes(fold(q.trim()))).slice(0, 8) : [];
  const options = [...s.candidates.map((c) => c.sid), ...(value !== KEEP && !s.candidates.some((c) => c.sid === value) ? [value] : [])];
  const score = (sid: string) => s.candidates.find((c) => c.sid === sid)?.score;
  const english = (sid: string) => lib.find((r) => r.sid === sid)?.name;
  const uses = s.uses ? t('migrate.uses', { count: s.uses }) : t('migrate.usesZero');
  return (
    <div className={`mig-row${confirmed ? '' : ' pending'}`}>
      <div className="main">
        <span className="title">{s.name}</span>
        <span className="meta">
          {uses}
          {s.equipment ? ` · ${tr(t, 'equipment', s.equipment)}` : ''}
        </span>
      </div>
      <select value={value} aria-label={t('migrate.matchFor', { name: s.name })} onChange={(e) => onChoose(e.target.value)}>
        {options.map((sid) => (
          <option key={sid} value={sid}>
            {nameOf(sid)}
            {english(sid) && english(sid) !== nameOf(sid) ? ` (${english(sid)})` : ''}
            {score(sid) !== undefined ? ` · ${Math.round(score(sid)! * 100)} %` : ''}
          </option>
        ))}
        <option value={KEEP}>{t('migrate.keep')}</option>
      </select>
      {joinsWith.length > 0 && <p className="mig-join">{t('migrate.joinsWith', { names: joinsWith.join(', ') })}</p>}
      <div className="mig-actions">
        {!confirmed && (
          <button className="primary" onClick={() => onChoose(value)}>
            <Icon name="check" /> {t('migrate.confirm')}
          </button>
        )}
        <button className="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
          {t('migrate.search')}
        </button>
      </div>
      {open && (
        <div className="mig-search">
          <input type="search" value={q} placeholder={t('migrate.searchPlaceholder')} aria-label={t('migrate.searchPlaceholder')} onChange={(e) => setQ(e.target.value)} />
          {hits.map((r) => (
            <button
              key={r.sid}
              className="mig-hit"
              onClick={() => {
                onChoose(r.sid);
                setOpen(false);
                setQ('');
              }}
            >
              <span>{r.pt?.name ?? r.name}</span>
              <small>{r.name}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
