import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CoachGender, CoachStyle } from '../../domain/types';
import { CoachAvatar } from '../components/CoachAvatar';
import { useEnd, type GameProps } from './canvas';
import { fx } from './feedback';

const STYLES: CoachStyle[] = ['support', 'spite', 'stoic', 'sergeant', 'energy'];
const GENDERS: CoachGender[] = ['male', 'female'];
/** A wrong pair stays visible this long. */
const SHOW_MS = 800;

const shuffle = <T,>(xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Memory with the 10 trainer faces (5 styles × 2 genders). Score: moves (fewer is better). */
export function Memory({ onEnd }: GameProps) {
  const { t } = useTranslation();
  const end = useEnd(onEnd);
  const [deck] = useState(() => shuffle(STYLES.flatMap((style) => GENDERS.map((gender) => ({ style, gender }))).flatMap((c) => [c, c])));
  const [open, setOpen] = useState<number[]>([]);
  const [found, setFound] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);
  const same = (a: number, b: number) => deck[a].style === deck[b].style && deck[a].gender === deck[b].gender;

  useEffect(() => {
    if (open.length !== 2) return;
    const [a, b] = open;
    if (same(a, b)) {
      fx('good');
      setFound((f) => new Set([...f, a, b]));
      setOpen([]);
      return;
    }
    fx('bad');
    const id = setTimeout(() => setOpen([]), SHOW_MS);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (found.size === deck.length) setTimeout(() => end(moves), 500);
  }, [found]);

  const turn = (i: number) => {
    if (open.length === 2 || open.includes(i) || found.has(i)) return;
    if (open.length === 1) setMoves((m) => m + 1);
    else fx('tap');
    setOpen([...open, i]);
  };

  return (
    <div>
      <p className="game-hud">
        <span>
          {t('games.moves')}: <b>{moves}</b>
        </span>
      </p>
      <div className="memory-grid">
        {deck.map((c, i) => {
          const up = open.includes(i) || found.has(i);
          return (
            <button key={i} className={`memory-card ${up ? 'up' : ''} ${found.has(i) ? 'found' : ''}`} aria-label={up ? `${t(`coach.styles.${c.style}`)} · ${t(`coach.genders.${c.gender}`)}` : t('games.card', { n: i + 1 })} onClick={() => turn(i)}>
              {up ? <CoachAvatar style={c.style} gender={c.gender} size={52} /> : <span aria-hidden="true">?</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
