import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { drawFace, fitCanvas, loop, overlap, rand, roundRect, themeColors, useAvatarImage, useEnd, type GameProps } from './canvas';
import { fx } from './feedback';

const W = 360;
const H = 480;
const GROUND = H - 24;
const GRAVITY = 1400;
const FLAP = -420;
const GAP = 150;
const TOWER = 50;
const SPEED = 150;
/** Seconds between towers. */
const EVERY = 1.55;
const R = 17;

/** Flappy Dumbbell: the trainer holds a dumbbell and flies between towers of plates. Score: towers passed. */
export function Flappy({ style, gender, onEnd }: GameProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLCanvasElement>(null);
  const { img, node } = useAvatarImage(style, gender);
  const end = useEnd(onEnd);
  const flap = useRef<() => void>(() => undefined);

  useEffect(() => {
    const c = ref.current!;
    const ctx = fitCanvas(c, W, H);
    const col = themeColors();
    const st = { y: H / 2, vy: 0, started: false, dead: false, towers: [] as { x: number; gap: number; passed: boolean }[], next: 0, score: 0, t: 0 };
    flap.current = () => {
      if (st.dead) return;
      st.started = true;
      st.vy = FLAP;
      fx('tap');
    };
    const x = 90;

    const draw = () => {
      ctx.fillStyle = col.bg;
      ctx.fillRect(0, 0, W, H);
      for (const tw of st.towers) {
        // A tower of plates above and below the gap.
        for (let y = tw.gap - 14; y > -14; y -= 16) roundRect(ctx, tw.x, y, TOWER, 14, 4, y === tw.gap - 14 ? col.accent : col.muted);
        for (let y = tw.gap + GAP; y < GROUND; y += 16) roundRect(ctx, tw.x, y, TOWER, 14, 4, y === tw.gap + GAP ? col.accent : col.muted);
      }
      ctx.fillStyle = col.border;
      ctx.fillRect(0, GROUND, W, H - GROUND);
      // The dumbbell under the chin.
      ctx.save();
      ctx.translate(x, st.y);
      ctx.rotate(Math.max(-0.4, Math.min(0.6, st.vy / 900)));
      ctx.fillStyle = col.text;
      ctx.fillRect(-22, R - 1, 44, 4);
      roundRect(ctx, -26, R - 7, 7, 16, 2, col.text);
      roundRect(ctx, 19, R - 7, 7, 16, 2, col.text);
      drawFace(ctx, img.current, 0, 0, R * 2.3, col.accent);
      ctx.restore();
      ctx.fillStyle = col.text;
      ctx.font = '800 32px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(st.score), W / 2, 50);
      if (!st.started) {
        ctx.font = '600 16px system-ui, sans-serif';
        ctx.fillText(t('games.tapToStart'), W / 2, H / 2 + 60);
      }
    };

    const stop = loop((dt) => {
      st.t += dt;
      if (!st.started) {
        st.y = H / 2 + Math.sin(st.t * 4) * 6;
        draw();
        return true;
      }
      st.vy += GRAVITY * dt;
      st.y += st.vy * dt;
      if (st.y < R) {
        st.y = R;
        st.vy = 0;
      }
      st.next -= dt;
      if (st.next <= 0) {
        st.towers.push({ x: W, gap: rand(60, GROUND - GAP - 60), passed: false });
        st.next = EVERY;
      }
      for (const tw of st.towers) {
        tw.x -= SPEED * dt;
        if (!tw.passed && tw.x + TOWER < x - R) {
          tw.passed = true;
          st.score++;
          fx('good');
        }
      }
      st.towers = st.towers.filter((tw) => tw.x > -TOWER);
      const me = { x: x - R + 3, y: st.y - R + 3, w: 2 * R - 6, h: 2 * R - 6 };
      const hit = st.y + R >= GROUND || st.towers.some((tw) => overlap(me, { x: tw.x, y: -100, w: TOWER, h: tw.gap + 100 }) || overlap(me, { x: tw.x, y: tw.gap + GAP, w: TOWER, h: H }));
      draw();
      if (hit) {
        st.dead = true;
        fx('bad');
        setTimeout(() => end(st.score), 600);
        return false;
      }
      return true;
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        flap.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      stop();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="game-canvas">
      {node}
      <canvas ref={ref} style={{ aspectRatio: `${W} / ${H}` }} aria-label={t('games.names.flappy')} onPointerDown={() => flap.current()} />
    </div>
  );
}
