import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { canvasPoint, drawFace, fitCanvas, loop, pick, rand, roundRect, themeColors, useAvatarImage, useEnd, type GameProps } from './canvas';

const W = 360;
const H = 520;
const SHIP = 22;
const FIRE_EVERY = 0.22;
const POWER_TIME = 8;
const LIVES = 3;
/** Every BOSS_EVERY waves the boss (the sofa) comes. */
const BOSS_EVERY = 5;
/** The finger stays below the ship, so the ship is visible. */
const FINGER = 56;
const FOOD = ['🍕', '🍩', '🍔', '🥤', '🍟'];

interface Thing {
  x: number;
  y: number;
}
interface Enemy extends Thing {
  base: number;
  phase: number;
  food: string;
  hp: number;
}
interface Power extends Thing {
  kind: 'shield' | 'triple';
}

const near = (a: Thing, b: Thing, d: number) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < d * d;

/** Starship, a vertical shooter: the trainer's ship against junk food. The shake gives a shield, creatine a triple shot. Score: points. */
export function Starship({ style, gender, onEnd }: GameProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLCanvasElement>(null);
  const { img, node } = useAvatarImage(style, gender);
  const end = useEnd(onEnd);
  const target = useRef<Thing | undefined>(undefined);

  useEffect(() => {
    const c = ref.current!;
    const ctx = fitCanvas(c, W, H);
    const col = themeColors();
    const keys = new Set<string>();
    const st = {
      ship: { x: W / 2, y: H - 70 },
      lives: LIVES,
      score: 0,
      wave: 1,
      spawned: 0,
      spawnT: 0,
      fireT: 0,
      shield: 0,
      triple: 0,
      hurt: 0,
      banner: 1.2,
      time: 0,
      shots: [] as (Thing & { vx: number })[],
      enemies: [] as Enemy[],
      crumbs: [] as (Thing & { vx: number; vy: number })[],
      powers: [] as Power[],
      boss: undefined as (Thing & { hp: number; max: number; shootT: number }) | undefined,
      stars: Array.from({ length: 40 }, () => ({ x: rand(0, W), y: rand(0, H), s: rand(0.4, 1.4) })),
    };
    const isBossWave = () => st.wave % BOSS_EVERY === 0;
    const waveSize = () => 6 + 2 * st.wave;
    const nextWave = () => {
      st.wave++;
      st.spawned = 0;
      st.banner = 1.2;
      if (isBossWave()) {
        const max = 20 + 10 * (st.wave / BOSS_EVERY - 1);
        st.boss = { x: W / 2, y: -60, hp: max, max, shootT: 1.5 };
      }
    };
    const hurt = () => {
      if (st.shield > 0 || st.hurt > 0) return;
      st.lives--;
      st.hurt = 1.2;
    };

    const draw = () => {
      ctx.fillStyle = col.bg;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = col.muted;
      for (const s of st.stars) ctx.fillRect(s.x, s.y, s.s * 2, s.s * 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '28px system-ui, sans-serif';
      for (const e of st.enemies) ctx.fillText(e.food, e.x, e.y);
      ctx.font = '24px system-ui, sans-serif';
      for (const p of st.powers) ctx.fillText(p.kind === 'shield' ? '🥛' : '💊', p.x, p.y);
      if (st.boss) {
        ctx.font = '72px system-ui, sans-serif';
        ctx.fillText('🛋️', st.boss.x, st.boss.y);
        roundRect(ctx, 40, 14, W - 80, 8, 4, col.border);
        roundRect(ctx, 40, 14, ((W - 80) * st.boss.hp) / st.boss.max, 8, 4, col.down);
      }
      ctx.fillStyle = '#a16207';
      for (const b of st.crumbs) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = col.warn;
      for (const s of st.shots) ctx.fillRect(s.x - 2, s.y - 8, 4, 12);
      // The ship blinks after a hit.
      if (st.hurt <= 0 || Math.floor(st.hurt * 10) % 2 === 0) {
        const { x, y } = st.ship;
        ctx.fillStyle = col.warn;
        ctx.beginPath();
        ctx.moveTo(x - 7, y + 20);
        ctx.lineTo(x, y + 30 + Math.random() * 8);
        ctx.lineTo(x + 7, y + 20);
        ctx.fill();
        ctx.fillStyle = col.accent;
        ctx.beginPath();
        ctx.moveTo(x, y - 30);
        ctx.lineTo(x + SHIP + 4, y + 20);
        ctx.lineTo(x - SHIP - 4, y + 20);
        ctx.closePath();
        ctx.fill();
        drawFace(ctx, img.current, x, y + 4, 28, col.text);
        if (st.shield > 0) {
          ctx.strokeStyle = col.up;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x, y, 36, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = col.text;
      ctx.font = '800 18px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(String(st.score), 12, st.boss ? 46 : 28);
      ctx.textAlign = 'right';
      ctx.fillText('❤️'.repeat(Math.max(0, st.lives)), W - 12, st.boss ? 46 : 28);
      if (st.banner > 0) {
        ctx.textAlign = 'center';
        ctx.font = '800 26px system-ui, sans-serif';
        ctx.fillText(`${t('games.wave')} ${st.wave}${isBossWave() ? ' 🛋️' : ''}`, W / 2, H / 2);
      }
    };

    const stop = loop((dt) => {
      st.time += dt;
      for (const s of st.stars) {
        s.y += 40 * s.s * dt;
        if (s.y > H) {
          s.y = 0;
          s.x = rand(0, W);
        }
      }
      // Ship: follows the finger, or the arrow keys.
      const sh = st.ship;
      if (target.current) {
        sh.x += (target.current.x - sh.x) * Math.min(1, dt * 14);
        sh.y += (target.current.y - FINGER - sh.y) * Math.min(1, dt * 14);
      }
      const kx = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
      const ky = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
      sh.x = Math.max(SHIP, Math.min(W - SHIP, sh.x + kx * 320 * dt));
      sh.y = Math.max(H / 3, Math.min(H - 34, sh.y + ky * 320 * dt));
      st.shield -= dt;
      st.triple -= dt;
      st.hurt -= dt;
      st.banner -= dt;

      st.fireT -= dt;
      if (st.fireT <= 0) {
        st.fireT = FIRE_EVERY;
        for (const vx of st.triple > 0 ? [-140, 0, 140] : [0]) st.shots.push({ x: sh.x, y: sh.y - 30, vx });
      }
      for (const s of st.shots) {
        s.y -= 520 * dt;
        s.x += s.vx * dt;
      }

      // Enemies of the wave arrive one by one.
      if (!isBossWave() && st.spawned < waveSize()) {
        st.spawnT -= dt;
        if (st.spawnT <= 0) {
          st.spawnT = Math.max(0.35, 0.9 - 0.05 * st.wave);
          st.spawned++;
          const food = pick(FOOD);
          const base = rand(30, W - 30);
          st.enemies.push({ x: base, y: -20, base, phase: rand(0, 6), food, hp: food === '🍔' ? 2 : 1 });
        }
      }
      for (const e of st.enemies) {
        e.y += (60 + 8 * st.wave) * dt;
        e.x = e.base + Math.sin(e.phase + st.time * 2) * 30;
      }
      if (st.boss) {
        const b = st.boss;
        b.y = Math.min(90, b.y + 60 * dt);
        b.x = W / 2 + Math.sin(st.time * 0.9) * 120;
        b.shootT -= dt;
        if (b.shootT <= 0) {
          b.shootT = Math.max(0.5, 1 - 0.05 * st.wave);
          const d = Math.hypot(sh.x - b.x, sh.y - b.y) || 1;
          st.crumbs.push({ x: b.x, y: b.y + 20, vx: ((sh.x - b.x) / d) * 200, vy: ((sh.y - b.y) / d) * 200 });
        }
      }
      for (const b of st.crumbs) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
      for (const p of st.powers) p.y += 90 * dt;

      // Hits by the shots.
      for (const s of st.shots) {
        const e = st.enemies.find((x) => x.hp > 0 && near(s, x, 18));
        if (e) {
          s.y = -100;
          if (--e.hp === 0) {
            st.score += e.food === '🍔' ? 20 : 10;
            if (Math.random() < 0.08) st.powers.push({ x: e.x, y: e.y, kind: Math.random() < 0.5 ? 'shield' : 'triple' });
          }
        } else if (st.boss && st.boss.y > 0 && Math.abs(s.x - st.boss.x) < 36 && Math.abs(s.y - st.boss.y) < 26) {
          s.y = -100;
          if (--st.boss.hp <= 0) {
            st.score += 250;
            st.boss = undefined;
            st.crumbs = [];
            nextWave();
          }
        }
      }
      // Hits on the ship.
      for (const e of st.enemies.filter((x) => x.hp > 0 && near(x, sh, 30))) {
        e.hp = 0;
        hurt();
      }
      for (const b of st.crumbs.filter((x) => near(x, sh, 22))) {
        b.y = H + 100;
        hurt();
      }
      for (const p of st.powers) {
        if (!near(p, sh, 32)) continue;
        if (p.kind === 'shield') st.shield = POWER_TIME;
        else st.triple = POWER_TIME;
        p.y = H + 100;
      }
      st.shots = st.shots.filter((s) => s.y > -20 && s.x > -10 && s.x < W + 10);
      st.enemies = st.enemies.filter((e) => e.hp > 0 && e.y < H + 30);
      st.crumbs = st.crumbs.filter((b) => b.y < H + 10 && b.y > -10 && b.x > -10 && b.x < W + 10);
      st.powers = st.powers.filter((p) => p.y < H + 20);
      if (!isBossWave() && st.spawned >= waveSize() && st.enemies.length === 0) nextWave();

      draw();
      if (st.lives <= 0) {
        setTimeout(() => end(st.score), 600);
        return false;
      }
      return true;
    });
    const onKey = (e: KeyboardEvent) => {
      if (!e.code.startsWith('Arrow')) return;
      e.preventDefault();
      if (e.type === 'keydown') keys.add(e.code);
      else keys.delete(e.code);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      stop();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, []);

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.type === 'pointerdown') e.currentTarget.setPointerCapture(e.pointerId);
    if (e.type === 'pointerdown' || target.current) target.current = canvasPoint(e.currentTarget, e, W, H);
  };
  const release = () => void (target.current = undefined);
  return (
    <div className="game-canvas">
      {node}
      <canvas ref={ref} style={{ aspectRatio: `${W} / ${H}` }} aria-label={t('games.names.starship')} onPointerDown={move} onPointerMove={move} onPointerUp={release} onPointerCancel={release} />
    </div>
  );
}
