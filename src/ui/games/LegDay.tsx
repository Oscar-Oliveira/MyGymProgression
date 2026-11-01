import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { drawFace, fitCanvas, loop, pick, roundRect, themeColors, useAvatarImage, useEnd, type GameProps } from './canvas';
import { fx } from './feedback';

/** The gym: # machines (walls), . floor, P you, S the sergeant. */
const MAZE = [
  '###############',
  '#P....#.......#',
  '#.##..#.###.#.#',
  '#.#.......#...#',
  '#...###.#.#.###',
  '##.#....#.....#',
  '#..#.##.###.#.#',
  '#.......#...#.#',
  '#.###.#...#.#.#',
  '#.....#......S#',
  '###############',
];
const COLS = MAZE[0].length;
const ROWS = MAZE.length;
const TILE = 24;
const W = COLS * TILE;
const H = ROWS * TILE;
const HUD = 28;

type Pt = { x: number; y: number };
type Dir = 'up' | 'down' | 'left' | 'right';
const STEP: Record<Dir, Pt> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const find = (c: string): Pt => {
  const y = MAZE.findIndex((r) => r.includes(c));
  return { x: MAZE[y].indexOf(c), y };
};
const START = find('P');
const SARGE = find('S');
const open = (p: Pt) => MAZE[p.y]?.[p.x] !== undefined && MAZE[p.y][p.x] !== '#';
const add = (p: Pt, d: Pt) => ({ x: p.x + d.x, y: p.y + d.y });
const same = (a: Pt, b: Pt) => a.x === b.x && a.y === b.y;
const FLOOR = MAZE.flatMap((r, y) => [...r].flatMap((c, x) => (c === '#' ? [] : [{ x, y }])));

/** First step of the shortest way from `from` to `to` (breadth-first search). */
function nextStep(from: Pt, to: Pt): Pt {
  const key = (p: Pt) => p.y * COLS + p.x;
  const prev = new Map<number, Pt>([[key(from), from]]);
  const queue = [from];
  while (queue.length) {
    const p = queue.shift()!;
    if (same(p, to)) break;
    for (const d of Object.values(STEP)) {
      const n = add(p, d);
      if (open(n) && !prev.has(key(n))) {
        prev.set(key(n), p);
        queue.push(n);
      }
    }
  }
  let p = to;
  if (!prev.has(key(p))) return from;
  while (!same(prev.get(key(p))!, from)) p = prev.get(key(p))!;
  return p;
}

/** You: seconds per tile, and with a shake. The sergeant starts slower and gets faster. */
const YOU = 0.17;
const BOOSTED = 0.11;
const BOOST_S = 3;
const SARGE_START = 0.27;
const SARGE_MIN = 0.15;
const SHAKES = 2;
const SHAKE_POINTS = 10;
/** Squats to escape: 8, then 4 more on each catch, in 3 seconds. */
const SQUATS = 8;
const SQUATS_MORE = 4;
const SQUAT_S = 3;

interface Mover {
  at: Pt;
  from: Pt;
  /** 0 → 1 along the step from `from` to `at`. */
  t: number;
}

/** Escape leg day: run from the sergeant through the gym; when caught, squat fast to escape. Score: points (seconds + shakes). */
export function LegDay({ gender, onEnd, onSay }: GameProps) {
  const say = useRef(onSay);
  say.current = onSay;
  const { t } = useTranslation();
  const ref = useRef<HTMLCanvasElement>(null);
  const { img, node } = useAvatarImage('sergeant', gender);
  const end = useEnd(onEnd);
  const input = useRef({ dir: (_d: Dir) => undefined as void, squat: () => undefined as void });
  const [squatting, setSquatting] = useState(false);
  const caught = t('games.legday.caught', { returnObjects: true }) as string[];
  const escaped = t('games.legday.escaped', { returnObjects: true }) as string[];
  const squatText = t('games.legday.squat');

  useEffect(() => {
    const c = ref.current!;
    const ctx = fitCanvas(c, W, H + HUD);
    const col = themeColors();
    const st = {
      you: { at: START, from: START, t: 1 } as Mover,
      sarge: { at: SARGE, from: SARGE, t: 1 } as Mover,
      dir: undefined as Dir | undefined,
      want: undefined as Dir | undefined,
      shakes: [] as Pt[],
      drunk: 0,
      boost: 0,
      time: 0,
      squat: undefined as { need: number; done: number; left: number } | undefined,
      escapes: 0,
      bubble: '',
      bubbleT: 0,
      over: false,
    };
    const talk = (lines: string[]) => {
      st.bubble = pick(lines);
      st.bubbleT = 2;
      say.current?.(st.bubble);
    };
    const pos = (m: Mover) => ({ x: m.from.x + (m.at.x - m.from.x) * Math.min(1, m.t), y: m.from.y + (m.at.y - m.from.y) * Math.min(1, m.t) });
    const score = () => Math.floor(st.time) + st.drunk * SHAKE_POINTS;
    const placeShakes = () => {
      while (st.shakes.length < SHAKES) {
        const far = FLOOR.filter((p) => Math.abs(p.x - st.you.at.x) + Math.abs(p.y - st.you.at.y) >= 5 && !st.shakes.some((s) => same(s, p)) && !same(p, st.sarge.at));
        st.shakes.push(pick(far));
      }
    };
    placeShakes();

    input.current = {
      dir: (d) => {
        st.want = d;
        if (!st.dir) st.dir = d;
      },
      squat: () => {
        if (!st.squat || st.over) return;
        st.squat.done++;
        fx('tap');
        if (st.squat.done >= st.squat.need) {
          st.squat = undefined;
          st.escapes++;
          setSquatting(false);
          // The sergeant goes back to the corner farther from you.
          const back = [SARGE, START].sort((a, b) => Math.abs(b.x - st.you.at.x) + Math.abs(b.y - st.you.at.y) - (Math.abs(a.x - st.you.at.x) + Math.abs(a.y - st.you.at.y)))[0];
          st.sarge = { at: back, from: back, t: 1 };
          fx('power');
          talk(escaped);
        }
      },
    };

    const draw = () => {
      ctx.fillStyle = col.bg;
      ctx.fillRect(0, 0, W, H + HUD);
      ctx.save();
      ctx.translate(0, HUD);
      // Machines.
      MAZE.forEach((r, y) =>
        [...r].forEach((ch, x) => {
          if (ch !== '#') return;
          roundRect(ctx, x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4, 5, col.border);
          ctx.fillStyle = col.muted;
          ctx.fillRect(x * TILE + 7, y * TILE + TILE / 2 - 1, TILE - 14, 2);
        }),
      );
      ctx.font = `${TILE - 6}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const s of st.shakes) ctx.fillText('🥛', s.x * TILE + TILE / 2, s.y * TILE + TILE / 2 + 1);
      // You: a round face, with a glow while boosted.
      const y0 = pos(st.you);
      const cx = y0.x * TILE + TILE / 2;
      const cy = y0.y * TILE + TILE / 2;
      if (st.boost > 0) {
        ctx.fillStyle = col.up;
        ctx.beginPath();
        ctx.arc(cx, cy, TILE / 2 + 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = col.accent;
      ctx.beginPath();
      ctx.arc(cx, cy, TILE / 2 - 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - 4, cy - 3, 3, 3);
      ctx.fillRect(cx + 2, cy - 3, 3, 3);
      const s0 = pos(st.sarge);
      drawFace(ctx, img.current, s0.x * TILE + TILE / 2, s0.y * TILE + TILE / 2, TILE + 4, col.down);
      ctx.restore();

      ctx.fillStyle = col.text;
      ctx.font = '800 16px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(`${score()}`, 10, 20);
      ctx.textAlign = 'right';
      ctx.fillText(`🥛 ${st.drunk}`, W - 10, 20);
      if (st.bubbleT > 0 && !st.squat) {
        ctx.font = '700 13px system-ui, sans-serif';
        ctx.textAlign = 'left';
        const w = Math.min(W - 24, ctx.measureText(st.bubble).width + 20);
        roundRect(ctx, 12, HUD + 6, w, 26, 10, col.down);
        ctx.fillStyle = '#fff';
        ctx.fillText(st.bubble, 22, HUD + 24, w - 20);
      }
      if (st.squat) {
        ctx.fillStyle = 'rgb(0 0 0 / 0.6)';
        ctx.fillRect(0, HUD, W, H);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = '900 26px system-ui, sans-serif';
        ctx.fillText(squatText, W / 2, HUD + H / 2 - 22);
        ctx.font = '800 40px system-ui, sans-serif';
        ctx.fillText(`${st.squat.done}/${st.squat.need}`, W / 2, HUD + H / 2 + 24);
        roundRect(ctx, W / 2 - 100, HUD + H / 2 + 44, 200, 10, 5, col.border);
        roundRect(ctx, W / 2 - 100, HUD + H / 2 + 44, (200 * st.squat.left) / SQUAT_S, 10, 5, col.warn);
      }
    };

    const stepYou = () => {
      const m = st.you;
      const next = st.want && open(add(m.at, STEP[st.want])) ? st.want : st.dir && open(add(m.at, STEP[st.dir])) ? st.dir : undefined;
      if (!next) return;
      st.dir = next;
      st.you = { from: m.at, at: add(m.at, STEP[next]), t: 0 };
      const shake = st.shakes.findIndex((s) => same(s, st.you.at));
      if (shake >= 0) {
        st.shakes.splice(shake, 1);
        st.drunk++;
        st.boost = BOOST_S;
        fx('power');
        placeShakes();
      }
    };

    const stop = loop((dt) => {
      if (st.squat) {
        st.squat.left -= dt;
        if (st.squat.left <= 0) {
          st.over = true;
          draw();
          fx('bad');
          setTimeout(() => end(score()), 500);
          return false;
        }
        draw();
        return true;
      }
      st.time += dt;
      st.boost = Math.max(0, st.boost - dt);
      st.bubbleT -= dt;
      st.you.t += dt / (st.boost > 0 ? BOOSTED : YOU);
      if (st.you.t >= 1) stepYou();
      st.sarge.t += dt / Math.max(SARGE_MIN, SARGE_START - 0.003 * st.time);
      if (st.sarge.t >= 1) st.sarge = { from: st.sarge.at, at: nextStep(st.sarge.at, st.you.at), t: 0 };
      const a = pos(st.you);
      const b = pos(st.sarge);
      if (Math.hypot(a.x - b.x, a.y - b.y) < 0.6) {
        st.squat = { need: SQUATS + SQUATS_MORE * st.escapes, done: 0, left: SQUAT_S };
        setSquatting(true);
        fx('alarm');
        talk(caught);
      }
      draw();
      return true;
    });

    const KEYS: Record<string, Dir> = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        input.current.squat();
      } else if (KEYS[e.code]) {
        e.preventDefault();
        input.current.dir(KEYS[e.code]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      stop();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // A swipe on the canvas turns; a tap squats.
  const swipe = useRef<Pt>(undefined);
  const onDown = (e: React.PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY };
    input.current.squat();
  };
  const onUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = undefined;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    input.current.dir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  };
  const pad = (d: Dir, label: string) => (
    <button className="outline" aria-label={t(`games.legday.${d}`)} onPointerDown={() => input.current.dir(d)}>
      {label}
    </button>
  );
  return (
    <div className="game-canvas">
      {node}
      <canvas ref={ref} style={{ aspectRatio: `${W} / ${H + HUD}` }} aria-label={t('games.names.legday')} onPointerDown={onDown} onPointerUp={onUp} />
      {squatting ? (
        <div className="game-pad one">
          <button className="primary xl" onPointerDown={() => input.current.squat()}>
            ⬇ {t('games.legday.squatBtn')}
          </button>
        </div>
      ) : (
        <div className="game-dpad">
          <span />
          {pad('up', '↑')}
          <span />
          {pad('left', '←')}
          {pad('down', '↓')}
          {pad('right', '→')}
        </div>
      )}
    </div>
  );
}
