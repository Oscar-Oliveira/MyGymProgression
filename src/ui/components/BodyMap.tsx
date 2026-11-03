import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MUSCLE_SETS_GUIDE, muscleLevel, type MuscleLevel } from '../../domain/analysis';
import { fmtNum, tr } from '../util';

type Shape = { m?: string } & ({ rect: [number, number, number, number, number] } | { ell: [number, number, number, number] });

/** Front and back of a stylised body (viewBox 100 × 190 each). Shapes without `m` are the body, not a muscle. */
const LIMBS = (arm: string, leg?: string): Shape[] => [
  { ell: [50, 15, 10, 11] },
  { rect: [45, 25, 10, 8, 2] },
  { m: 'shoulders', ell: [31, 40, 8, 7] },
  { m: 'shoulders', ell: [69, 40, 8, 7] },
  { m: arm, ell: [25, 56, 5, 10] },
  { m: arm, ell: [75, 56, 5, 10] },
  { m: 'forearms', ell: [21, 79, 4.5, 11] },
  { m: 'forearms', ell: [79, 79, 4.5, 11] },
  { ell: [19, 94, 4, 4.5] },
  { ell: [81, 94, 4, 4.5] },
  { m: leg, rect: [36, 140, 11, 32, 5] },
  { m: leg, rect: [53, 140, 11, 32, 5] },
  { ell: [41.5, 178, 6, 3.5] },
  { ell: [58.5, 178, 6, 3.5] },
];
const FRONT: Shape[] = [
  ...LIMBS('biceps'),
  { m: 'chest', rect: [36, 35, 13.5, 18, 6] },
  { m: 'chest', rect: [50.5, 35, 13.5, 18, 6] },
  { m: 'core', rect: [39, 55, 22, 30, 6] },
  { rect: [37, 85, 26, 10, 4] },
  { m: 'quads', rect: [36, 96, 11, 42, 5.5] },
  { m: 'adductors', rect: [47.5, 96, 5, 24, 2.5] },
  { m: 'quads', rect: [53, 96, 11, 42, 5.5] },
];
const BACK: Shape[] = [
  ...LIMBS('triceps', 'calves'),
  { m: 'back', rect: [36, 33, 28, 46, 9] },
  { rect: [38, 79, 24, 6, 3] },
  { m: 'glutes', ell: [43.5, 93, 7, 8.5] },
  { m: 'glutes', ell: [56.5, 93, 7, 8.5] },
  { m: 'hamstrings', rect: [36, 102, 12, 36, 6] },
  { m: 'hamstrings', rect: [52, 102, 12, 36, 6] },
];
const LEVELS: MuscleLevel[] = ['none', 'low', 'ok', 'high'];

/**
 * Body map (D71): each of the 12 muscles coloured by its sets per week against the 10–20 guideline.
 * Tapping a muscle (or Enter on it) shows its name and value under the map.
 */
export function BodyMap({ sets, lang, small }: { sets: Record<string, number>; lang: string; small?: boolean }) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<string>();
  const label = (m: string) => `${tr(t, 'muscle', m)}: ${t('bodyMap.sets', { n: fmtNum(sets[m] ?? 0, lang, 1) })}`;
  const figure = (shapes: Shape[], dx: number, side: string) => (
    <g transform={`translate(${dx} 0)`}>
      {shapes.map((s, i) => {
        const level = s.m ? muscleLevel(sets[s.m]) : undefined;
        const props = {
          className: s.m ? `bm-muscle bm-${level} ${picked === s.m ? 'on' : ''}` : 'bm-body',
          ...(s.m && {
            role: 'button',
            tabIndex: 0,
            'aria-label': label(s.m),
            onClick: () => setPicked(s.m),
            onKeyDown: (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setPicked(s.m)),
          }),
        };
        if ('rect' in s) {
          const [x, y, w, h, r] = s.rect;
          return <rect key={`${side}${i}`} x={x} y={y} width={w} height={h} rx={r} {...props} />;
        }
        const [cx, cy, rx, ry] = s.ell;
        return <ellipse key={`${side}${i}`} cx={cx} cy={cy} rx={rx} ry={ry} {...props} />;
      })}
      <text x={50} y={189} className="bm-side">
        {t(`bodyMap.${side}`)}
      </text>
    </g>
  );
  return (
    <div className={`body-map ${small ? 'small' : ''}`}>
      <svg viewBox="0 0 210 192" role="group" aria-label={t('bodyMap.title')}>
        {figure(FRONT, 0, 'front')}
        {figure(BACK, 110, 'back')}
      </svg>
      <p className="bm-picked" aria-live="polite">
        {picked ? label(picked) : t('bodyMap.tap')}
      </p>
      <ul className="bm-legend">
        {LEVELS.map((l) => (
          <li key={l}>
            <span className={`bm-swatch bm-${l}`} aria-hidden="true" />
            {t(`bodyMap.level.${l}`, MUSCLE_SETS_GUIDE)}
          </li>
        ))}
      </ul>
    </div>
  );
}
