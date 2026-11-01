import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { drawFace, fitCanvas, loop, overlap, pick, rand, roundRect, themeColors, useAvatarImage, useEnd, type GameProps } from './canvas';
import { fx } from './feedback';

const W = 360;
const H = 220;
const GROUND = 190;
const X = 50;
const GRAVITY = 1800;
const JUMP = -600;
const STAND = 52;
const DUCK = 32;
/** Logical pixels per metre. */
const PX_PER_M = 12;
/** The trainer speaks every CHEER metres. */
const CHEER = 500;

type Kind = 'dumbbell' | 'kettlebell' | 'bench' | 'bar';
const SIZE: Record<Kind, { w: number; h: number }> = { dumbbell: { w: 36, h: 16 }, kettlebell: { w: 24, h: 28 }, bench: { w: 54, h: 22 }, bar: { w: 64, h: 10 } };
/** Flying bars pass at head height: duck under them. */
const BAR_BOTTOM = GROUND - 38;

/** PT Runner, like the offline dinosaur game: the trainer runs through the gym. Score: metres. */
export function Runner({ style, gender, onEnd, onSay }: GameProps) {
  // The trainer's voice reads the cheers (when it is on); the loop uses the latest function.
  const say = useRef(onSay);
  say.current = onSay;
  const { t } = useTranslation();
  const ref = useRef<HTMLCanvasElement>(null);
  const { img, node } = useAvatarImage(style, gender);
  const end = useEnd(onEnd);
  const input = useRef({ jump: () => undefined as void, duck: (_on: boolean) => undefined as void });
  const cheers = t(`games.cheer.${style}`, { returnObjects: true }) as string[];

  useEffect(() => {
    const c = ref.current!;
    const ctx = fitCanvas(c, W, H);
    const col = themeColors();
    const st = { y: GROUND, vy: 0, duck: false, speed: 230, px: 0, time: 0, obstacles: [] as { kind: Kind; x: number }[], said: 0, bubble: '', bubbleT: 0, dead: false };
    input.current = {
      jump: () => {
        if (!st.dead && st.y >= GROUND) {
          st.vy = JUMP;
          fx('tap');
        }
      },
      duck: (on) => void (st.duck = on),
    };
    const boxOf = (o: { kind: Kind; x: number }) => {
      const s = SIZE[o.kind];
      return { x: o.x, y: o.kind === 'bar' ? BAR_BOTTOM - s.h : GROUND - s.h, w: s.w, h: s.h };
    };

    const drawObstacle = (o: { kind: Kind; x: number }) => {
      const b = boxOf(o);
      const ink = col.text;
      if (o.kind === 'dumbbell') {
        ctx.fillStyle = ink;
        ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, 4);
        roundRect(ctx, b.x, b.y, 9, b.h, 2, col.accent);
        roundRect(ctx, b.x + b.w - 9, b.y, 9, b.h, 2, col.accent);
      } else if (o.kind === 'kettlebell') {
        ctx.strokeStyle = ink;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(b.x + b.w / 2, b.y + 9, 7, Math.PI, 0);
        ctx.stroke();
        ctx.fillStyle = col.accent;
        ctx.beginPath();
        ctx.arc(b.x + b.w / 2, b.y + 17, 11, 0, Math.PI * 2);
        ctx.fill();
      } else if (o.kind === 'bench') {
        roundRect(ctx, b.x, b.y, b.w, 7, 3, col.accent);
        ctx.fillStyle = ink;
        ctx.fillRect(b.x + 6, b.y + 7, 4, b.h - 7);
        ctx.fillRect(b.x + b.w - 10, b.y + 7, 4, b.h - 7);
      } else {
        ctx.fillStyle = ink;
        ctx.fillRect(b.x, b.y + 3, b.w, 4);
        roundRect(ctx, b.x + 4, b.y - 6, 8, b.h + 12, 2, col.accent);
        roundRect(ctx, b.x + b.w - 12, b.y - 6, 8, b.h + 12, 2, col.accent);
      }
    };

    const drawRunner = () => {
      const h = st.duck ? DUCK : STAND;
      const head = st.duck ? 24 : 30;
      const top = st.y - h;
      const step = st.y >= GROUND ? Math.sin(st.px / 9) * 6 : 4;
      ctx.strokeStyle = col.text;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      // Legs and body.
      ctx.moveTo(X + 13 - step, st.y);
      ctx.lineTo(X + 13, st.y - 12);
      ctx.lineTo(X + 13 + step, st.y);
      ctx.moveTo(X + 13, st.y - 12);
      ctx.lineTo(X + 13, top + head);
      ctx.moveTo(X + 13, top + head + 6);
      ctx.lineTo(X + 24, top + head + 10 - step);
      ctx.stroke();
      drawFace(ctx, img.current, X + 13, top + head / 2, head, col.accent);
    };

    const draw = () => {
      ctx.fillStyle = col.bg;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = col.border;
      ctx.fillRect(0, GROUND, W, 2);
      // Floor marks show the speed.
      ctx.fillStyle = col.muted;
      for (let x = -(st.px % 40); x < W; x += 40) ctx.fillRect(x, GROUND + 10, 12, 2);
      st.obstacles.forEach(drawObstacle);
      drawRunner();
      ctx.fillStyle = col.text;
      ctx.font = '800 18px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.floor(st.px / PX_PER_M)} m`, W - 12, 26);
      if (st.bubbleT > 0) {
        ctx.font = '700 13px system-ui, sans-serif';
        ctx.textAlign = 'left';
        const w = Math.min(W - 24, ctx.measureText(st.bubble).width + 20);
        roundRect(ctx, 12, 40, w, 28, 10, col.accent);
        ctx.fillStyle = '#fff';
        ctx.fillText(st.bubble, 22, 59, w - 20);
      }
    };

    const stop = loop((dt) => {
      st.time += dt;
      st.speed = Math.min(620, 230 + 9 * st.time);
      st.px += st.speed * dt;
      st.vy += GRAVITY * (st.duck && st.y < GROUND ? 2.5 : 1) * dt;
      st.y = Math.min(GROUND, st.y + st.vy * dt);
      if (st.y >= GROUND) st.vy = 0;
      for (const o of st.obstacles) o.x -= st.speed * dt;
      st.obstacles = st.obstacles.filter((o) => o.x > -80);
      const last = st.obstacles[st.obstacles.length - 1];
      if (!last || last.x < W - (90 + st.speed * rand(0.75, 1.4))) {
        const kinds: Kind[] = st.px / PX_PER_M > 150 ? ['dumbbell', 'kettlebell', 'bench', 'bar'] : ['dumbbell', 'kettlebell', 'bench'];
        st.obstacles.push({ kind: pick(kinds), x: W + 10 });
      }
      const m = Math.floor(st.px / PX_PER_M);
      if (m >= st.said + CHEER) {
        st.said += CHEER;
        st.bubble = pick(cheers).replace('{{m}}', String(st.said));
        st.bubbleT = 2.2;
        fx('good');
        say.current?.(st.bubble);
      }
      st.bubbleT -= dt;
      const h = st.duck ? DUCK : STAND;
      const me = { x: X + 4, y: st.y - h + 3, w: 18, h: h - 3 };
      const hit = st.obstacles.some((o) => {
        const b = boxOf(o);
        return overlap(me, { x: b.x + 3, y: b.y + 2, w: b.w - 6, h: b.h - 2 });
      });
      draw();
      if (hit) {
        st.dead = true;
        fx('bad');
        setTimeout(() => end(m), 600);
        return false;
      }
      return true;
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (e.type === 'keydown') input.current.jump();
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        input.current.duck(e.type === 'keydown');
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      stop();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, []);

  const duck = (on: boolean) => () => input.current.duck(on);
  return (
    <div className="game-canvas">
      {node}
      <canvas ref={ref} style={{ aspectRatio: `${W} / ${H}` }} aria-label={t('games.names.runner')} onPointerDown={() => input.current.jump()} />
      <div className="game-pad">
        <button className="primary xl" onPointerDown={() => input.current.jump()}>
          ↑ {t('games.jump')}
        </button>
        <button className="outline xl" onPointerDown={duck(true)} onPointerUp={duck(false)} onPointerLeave={duck(false)} onPointerCancel={duck(false)}>
          ↓ {t('games.duck')}
        </button>
      </div>
    </div>
  );
}
