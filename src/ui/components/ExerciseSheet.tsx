import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { muscleRoles } from '../../domain/audit';
import { MUSCLES } from '../../domain/challenge';
import { exerciseGroup, MUSCLE_DETAIL_PT } from '../../domain/library';
import type { Exercise } from '../../domain/types';
import { tr, useSettings } from '../util';
import { BodyMap } from './BodyMap';
import { Empty } from './Bits';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { assetUrl } from './Thumb';

let show: ((id: string) => void) | undefined;

/** Opens the exercise sheet (D75) over the current page. */
export const openExercise = (id: string) => show?.(id);

/** The button that opens the exercise sheet, next to an exercise name. It never follows a link or a button around it. */
export function InfoButton({ id, name }: { id: string; name: string }) {
  const { t } = useTranslation();
  const open = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openExercise(id);
  };
  return (
    <button type="button" className="info-btn" aria-label={t('exercise.info', { name })} onClick={open}>
      <Icon name="info" />
    </button>
  );
}

/** Star that marks or unmarks an exercise as a favourite (D83). */
export function FavoriteButton({ ex }: { ex: Exercise }) {
  const { t } = useTranslation();
  const on = !!ex.favorite;
  return (
    <button type="button" className={`fav-btn ${on ? 'on' : ''}`} aria-pressed={on} aria-label={t(on ? 'exercise.favRemove' : 'exercise.favAdd', { name: ex.name })} onClick={() => void repo.setFavorite(ex.id, !on)}>
      <Icon name="star" />
    </button>
  );
}

/** Muscles of one exercise: the body map (primary and secondary) and the names, detailed when the library has them. */
export function ExerciseMuscles({ ex }: { ex: Exercise }) {
  const { t } = useTranslation();
  const s = useSettings();
  const detail = (n: string) => (s.language === 'pt' ? (MUSCLE_DETAIL_PT[n] ?? n) : n);
  const [primary, secondary] = ex.muscleDetail?.primary.length
    ? [ex.muscleDetail.primary.map(detail), ex.muscleDetail.secondary.map(detail)]
    : [ex.primaryMuscles.map((m) => tr(t, 'muscle', m)), ex.secondaryMuscles.map((m) => tr(t, 'muscle', m))];
  return (
    <>
      {/* Only muscles the map draws (cardio, neck, full body have no place on it). */}
      {[...ex.primaryMuscles, ...ex.secondaryMuscles].some((m) => MUSCLES.includes(m)) && <BodyMap roles={muscleRoles([ex])} lang={s.language} small />}
      {primary.length > 0 && (
        <p>
          <strong>{t('exercise.primary')}:</strong> {primary.join(', ')}
        </p>
      )}
      {secondary.length > 0 && (
        <p>
          <strong>{t('exercise.secondary')}:</strong> {secondary.join(', ')}
        </p>
      )}
    </>
  );
}

/** Video, library source and the exercise's own links. */
export function ExerciseLinks({ ex }: { ex: Exercise }) {
  const { t } = useTranslation();
  if (!ex.video && !ex.source?.url && !ex.links.length) return null;
  return (
    <div className="row wrap">
      {ex.video && (
        <a className="btn primary" href={ex.video} target="_blank" rel="noopener noreferrer">
          <Icon name="play" /> {t('exercise.video')}
        </a>
      )}
      {ex.source?.url && (
        <a className="btn outline" href={ex.source.url} target="_blank" rel="noopener noreferrer">
          {ex.source.name} <Icon name="external" />
        </a>
      )}
      {ex.links.map((l) => (
        <a key={l.url} className="btn outline" href={l.url} target="_blank" rel="noopener noreferrer">
          {l.label || l.url} <Icon name="external" />
        </a>
      ))}
    </div>
  );
}

/** Quick sheet of an exercise (D75): what it is and how to do it, without leaving the page (also during a workout). */
function ExerciseSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  // null: no such exercise (deleted); undefined: still loading.
  const ex = useLiveQuery(async () => (await db.exercises.get(id)) ?? null, [id]);
  if (ex === undefined) return null;
  if (ex === null)
    return (
      <Modal title={t('exercise.title')} onClose={onClose}>
        <Empty>{t('exercise.noResults')}</Empty>
      </Modal>
    );
  const image = ex.image ?? ex.thumb;
  return (
    <Modal title={ex.name} onClose={onClose}>
      <div className="stack ex-sheet">
        {image && <img className="ex-hero" src={assetUrl(image)} alt={ex.name} onError={(e) => ex.thumb && (e.currentTarget.src = assetUrl(ex.thumb))} />}
        <div className="row between">
          <p className="eyebrow">
            {t(`group.${exerciseGroup(ex)}`)} · {tr(t, 'equipment', ex.equipment)}
          </p>
          <FavoriteButton ex={ex} />
        </div>
        <ExerciseMuscles ex={ex} />
        {ex.personalNotes && (
          <p className="setup-note">
            <Icon name="pin" /> {ex.personalNotes}
          </p>
        )}
        {ex.safetyNotes && (
          <p className="error pre">
            <Icon name="warning" /> {ex.safetyNotes}
          </p>
        )}
        {(ex.steps?.length || ex.instructions) && (
          <div>
            <h3>{t('exercise.howTo')}</h3>
            {ex.steps?.length ? (
              <ol className="steps">
                {ex.steps.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ol>
            ) : null}
            {ex.instructions && <p className="pre">{ex.instructions}</p>}
          </div>
        )}
        {ex.tips && ex.tips.length > 0 && (
          <div>
            <h3>{t('exercise.tips')}</h3>
            <ul className="steps">
              {ex.tips.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
        )}
        <ExerciseLinks ex={ex} />
        <Link className="btn outline xl" to={`/exercises/${ex.id}`}>
          {t('exercise.fullPage')} <Icon name="chevronRight" />
        </Link>
      </div>
    </Modal>
  );
}

/** Mounted once in the app shell. A new page closes the sheet ("full page", back). */
export function ExerciseSheetHost() {
  const [id, setId] = useState<string>();
  const { pathname } = useLocation();
  useEffect(() => {
    show = setId;
    return () => void (show = undefined);
  }, []);
  useEffect(() => setId(undefined), [pathname]);
  return id ? <ExerciseSheet id={id} onClose={() => setId(undefined)} /> : null;
}
