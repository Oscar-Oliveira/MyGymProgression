import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { canvasPoint, fitCanvas, loop, pick, rand, themeColors, useEnd, type GameProps } from './canvas';
import { fx } from './feedback';

const W = 360;
const H = 440;
const KG = [2, 5, 10, 20] as const;
type Kg = (typeof KG)[number];
/** Rack slots at the top, the floor below. */
const SLOT_W = 80;
const SLOT_GAP = 6;
const SLOT_X = (W - KG.length * SLOT_W - (KG.length - 1) * SLOT_GAP) / 2;
const RACK_Y = 34;
const RACK_H = 96;
const FLOOR_TOP = RACK_Y + RACK_H + 18;
const FLOOR_BOTTOM = H - 30;
/** More weights on the floor than this and the gym owner comes: the end. */
const MAX_FLOOR = 10;
const PUDDLE_R = 36;
const PIXEL = '"Courier New", ui-monospace, monospace';

interface Weight {
  id: number;
  kg: Kg;
  x: number;
  y: number;
  vx: number;
  vy: number;
}
type Pest = { kind: 'phone'; slot: number; taps: number } | { kind: 'grunt'; x: number; y: number; left: number } | { kind: 'sweat'; x: number; y: number; left: number };

const size = (kg: Kg) => ({ w: 34 + kg * 1.6, h: 14 + kg * 0.5 });
const slotX = (i: number) => SLOT_X + i * (SLOT_W + SLOT_GAP);
const slotAt = (x: number, y: number) => (y < RACK_Y + RACK_H + 10 ? KG.findIndex((_, i) => x >= slotX(i) && x <= slotX(i) + SLOT_W) : -1);

/** Rerack the weights (secret game, D59): drag each weight to its slot before the floor fills up. Score: weights racked. */
export function Rerack({ onEnd }: GameProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLCanvasElement>(null);
  const end = useEnd(onEnd);
  const input = useRef({ down: (_x: number, _y: number) => undefined as void, move: (_x: number, _y: number) => undefined as void, up: (_x: number, _y: number) => undefined as void });
  const text = { floor: t('games.rerack.floor'), owner: t('games.rerack.owner'), grunt: t('games.rerack.grunt'), phone: t('games.rerack.phone') };

  useEffect(() => {
    const c = ref.current!;
    const ctx = fitCanvas(c, W, H);
    const col = themeColors();
    const KG_COL: Record<Kg, string> = { 2: col.up, 5: col.accent, 10: col.warn, 20: col.down };
    let nextId = 1;
    const st = {
      time: 0,
      spawn: 0.6,
      pestIn: 15,
      score: 0,
      racked: [0, 0, 0, 0],
      floor: [] as Weight[],
      pests: [] as Pest[],
      drag: undefined as { w: Weight; dx: number; dy: number; home: { x: number; y: number } } | undefined,
      shake: 0,
      flash: 0,
      over: 0,
    };
    const inPuddle = (x: number, y: number) => st.pests.some((p) => p.kind === 'sweat' && Math.hypot(p.x - x, p.y - y) < PUDDLE_R);
    const blocked = (slot: number) => st.pests.some((p) => p.kind === 'phone' && p.slot === slot);
    const clampFloor = (w: Weight) => {
      const s = size(w.kg);
      w.x = Math.min(W - s.w / 2 - 4, Math.max(s.w / 2 + 4, w.x));
      w.y = Math.min(FLOOR_BOTTOM - s.h / 2, Math.max(FLOOR_TOP + s.h / 2, w.y));
    };
    const addWeight = () => {
      const kg = pick(KG);
      const s = size(kg);
      st.floor.push({ id: nextId++, kg, x: rand(s.w / 2 + 6, W - s.w / 2 - 6), y: rand(FLOOR_TOP + s.h, FLOOR_BOTTOM - s.h), vx: 0, vy: 0 });
      fx('tick');
    };
    const addPest = () => {
      const kinds = (['phone', 'grunt', 'sweat'] as const).filter((k) => !st.pests.some((p) => p.kind === k));
      if (!kinds.length) return;
      const kind = pick(kinds);
      if (kind === 'phone') st.pests.push({ kind, slot: Math.floor(Math.random() * KG.length), taps: 2 });
      else if (kind === 'grunt') {
        st.pests.push({ kind, x: rand(40, W - 40), y: rand(FLOOR_TOP + 30, FLOOR_BOTTOM - 30), left: 5 });
        fx('alarm');
      } else st.pests.push({ kind, x: rand(60, W - 60), y: rand(FLOOR_TOP + 50, FLOOR_BOTTOM - 40), left: 10 });
    };

    input.current = {
      down: (x, y) => {
        if (st.over) return;
        // Tap a pest: the phone guy leaves after 2 taps, the grunter stops.
        const slot = slotAt(x, y);
        const phone = st.pests.find((p) => p.kind === 'phone' && p.slot === slot);
        if (phone && phone.kind === 'phone') {
          phone.taps--;
          fx('pop');
          if (phone.taps <= 0) st.pests = st.pests.filter((p) => p !== phone);
          return;
        }
        const grunt = st.pests.find((p) => p.kind === 'grunt' && Math.hypot(p.x - x, p.y - y) < 26);
        if (grunt) {
          st.pests = st.pests.filter((p) => p !== grunt);
          fx('pop');
          return;
        }
        // The top weight under the finger.
        const w = [...st.floor].reverse().find((v) => {
          const s = size(v.kg);
          return Math.abs(v.x - x) <= s.w / 2 + 6 && Math.abs(v.y - y) <= s.h / 2 + 8;
        });
        if (!w) return;
        st.floor = [...st.floor.filter((v) => v !== w), w];
        st.drag = { w, dx: w.x - x, dy: w.y - y, home: { x: w.x, y: w.y } };
        w.vx = w.vy = 0;
        fx('tap');
      },
      move: (x, y) => {
        if (!st.drag) return;
        st.drag.w.x = x + st.drag.dx;
        st.drag.w.y = y + st.drag.dy;
      },
      up: (x, y) => {
        const d = st.drag;
        if (!d) return;
        st.drag = undefined;
        const slot = slotAt(x, y);
        if (slot >= 0) {
          if (KG[slot] === d.w.kg && !blocked(slot)) {
            st.floor = st.floor.filter((v) => v !== d.w);
            st.racked[slot]++;
            st.score++;
            fx('good');
          } else {
            // Wrong slot, or the phone guy is on it: back to where it was.
            Object.assign(d.w, d.home);
            st.flash = 0.25;
            fx(blocked(slot) ? 'block' : 'bad');
          }
          return;
        }
        clampFloor(d.w);
        // Dropped on a puddle: it slides away.
        if (inPuddle(d.w.x, d.w.y)) {
          const a = rand(0, Math.PI * 2);
          d.w.vx = Math.cos(a) * 260;
          d.w.vy = Math.sin(a) * 260;
        }
      },
    };

    const drawWeight = (w: Weight) => {
      const s = size(w.kg);
      const x = Math.round(w.x - s.w / 2);
      const y = Math.round(w.y - s.h / 2);
      ctx.fillStyle = col.text;
      ctx.fillRect(x + 6, y + s.h / 2 - 2, s.w - 12, 4);
      ctx.fillStyle = KG_COL[w.kg];
      ctx.fillRect(x, y, 10, s.h);
      ctx.fillRect(x + s.w - 10, y, 10, s.h);
      ctx.fillStyle = col.text;
      ctx.font = `bold 11px ${PIXEL}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${w.kg}`, w.x, y - 1);
    };

    const draw = () => {
      ctx.save();
      if (st.shake > 0) ctx.translate(rand(-4, 4), rand(-4, 4));
      ctx.fillStyle = col.bg;
      ctx.fillRect(-6, -6, W + 12, H + 12);
      // Floor tiles, 8-bit.
      ctx.fillStyle = col.border;
      for (let row = 0; FLOOR_TOP + row * 24 < FLOOR_BOTTOM; row++) for (let x = row % 2 ? 0 : 24; x < W; x += 48) ctx.fillRect(x, FLOOR_TOP + row * 24, 24, Math.min(24, FLOOR_BOTTOM - FLOOR_TOP - row * 24));
      for (const p of st.pests) {
        if (p.kind !== 'sweat') continue;
        ctx.fillStyle = col.accent;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(p.x, p.y, PUDDLE_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.font = '22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💦', p.x, p.y);
      }
      // The rack.
      KG.forEach((kg, i) => {
        const x = slotX(i);
        ctx.fillStyle = col.muted;
        ctx.fillRect(x, RACK_Y, SLOT_W, 4);
        ctx.fillRect(x, RACK_Y + RACK_H - 4, SLOT_W, 4);
        ctx.fillRect(x + SLOT_W / 2 - 2, RACK_Y, 4, RACK_H);
        ctx.fillStyle = KG_COL[kg];
        for (let n = 0; n < Math.min(8, st.racked[i]); n++) ctx.fillRect(x + 8 + (n % 2) * (SLOT_W / 2), RACK_Y + RACK_H - 14 - Math.floor(n / 2) * 12, SLOT_W / 2 - 16, 8);
        ctx.fillStyle = col.text;
        ctx.font = `bold 14px ${PIXEL}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(`${kg} KG`, x + SLOT_W / 2, RACK_Y - 8);
      });
      for (const p of st.pests) {
        if (p.kind === 'phone') {
          const x = slotX(p.slot);
          ctx.fillStyle = 'rgb(0 0 0 / 0.55)';
          ctx.fillRect(x, RACK_Y, SLOT_W, RACK_H);
          ctx.font = '30px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🤳', x + SLOT_W / 2, RACK_Y + RACK_H / 2 - 6);
          ctx.fillStyle = '#fff';
          ctx.font = `bold 10px ${PIXEL}`;
          ctx.fillText(text.phone, x + SLOT_W / 2, RACK_Y + RACK_H - 12, SLOT_W - 6);
        } else if (p.kind === 'grunt') {
          ctx.font = '30px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('😤', p.x, p.y);
          ctx.fillStyle = col.down;
          ctx.font = `bold 12px ${PIXEL}`;
          ctx.fillText(text.grunt, p.x, p.y - 26);
        }
      }
      st.floor.forEach(drawWeight);
      ctx.restore();
      // Bottom bar: weights on the floor.
      const n = st.floor.length;
      ctx.fillStyle = col.bg;
      ctx.fillRect(0, FLOOR_BOTTOM, W, H - FLOOR_BOTTOM);
      ctx.fillStyle = n >= MAX_FLOOR - 2 ? col.down : col.text;
      ctx.font = `bold 13px ${PIXEL}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${text.floor} ${n}/${MAX_FLOOR}`, 8, FLOOR_BOTTOM + 15);
      ctx.textAlign = 'right';
      ctx.fillStyle = col.text;
      ctx.fillText(`${st.score}`, W - 8, FLOOR_BOTTOM + 15);
      for (let i = 0; i < MAX_FLOOR; i++) {
        ctx.fillStyle = i < n ? (n >= MAX_FLOOR - 2 ? col.down : col.warn) : col.border;
        ctx.fillRect(150 + i * 14, FLOOR_BOTTOM + 9, 10, 12);
      }
      if (st.flash > 0) {
        ctx.fillStyle = 'rgb(255 0 60 / 0.25)';
        ctx.fillRect(0, 0, W, H);
      }
      if (st.over) {
        ctx.fillStyle = 'rgb(0 0 0 / 0.7)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = col.down;
        ctx.font = `bold 22px ${PIXEL}`;
        ctx.textAlign = 'center';
        ctx.fillText(text.owner, W / 2, H / 2, W - 20);
      }
    };

    const stop = loop((dt) => {
      if (st.over) {
        st.over -= dt;
        draw();
        if (st.over <= 0) {
          end(st.score);
          return false;
        }
        return true;
      }
      st.time += dt;
      st.flash -= dt;
      // A new weight every 1.8 s, down to 0.55 s.
      st.spawn -= dt;
      if (st.spawn <= 0) {
        addWeight();
        st.spawn = Math.max(0.55, 1.8 - st.time * 0.025);
      }
      st.pestIn -= dt;
      if (st.pestIn <= 0) {
        addPest();
        st.pestIn = rand(7, 12);
      }
      st.pests = st.pests.filter((p) => p.kind === 'phone' || (p.left -= dt) > 0);
      st.shake = st.pests.some((p) => p.kind === 'grunt') ? 1 : 0;
      for (const w of st.floor) {
        if (w === st.drag?.w) continue;
        // On a puddle a weight keeps sliding; elsewhere it stops soon.
        const slip = inPuddle(w.x, w.y) ? 0.995 : 0.9;
        w.x += w.vx * dt;
        w.y += w.vy * dt;
        w.vx *= slip;
        w.vy *= slip;
        const s = size(w.kg);
        if (w.x < s.w / 2 + 4 || w.x > W - s.w / 2 - 4) w.vx = -w.vx;
        if (w.y < FLOOR_TOP + s.h / 2 || w.y > FLOOR_BOTTOM - s.h / 2) w.vy = -w.vy;
        clampFloor(w);
      }
      if (st.floor.length > MAX_FLOOR) {
        st.over = 1.2;
        st.drag = undefined;
        fx('end');
      }
      draw();
      return true;
    });
    return stop;
  }, []);

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => canvasPoint(e.currentTarget, e, W, H);
  return (
    <div className="game-canvas rerack">
      <canvas
        ref={ref}
        style={{ aspectRatio: `${W} / ${H}` }}
        aria-label={t('games.names.rerack')}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = at(e);
          input.current.down(p.x, p.y);
        }}
        onPointerMove={(e) => {
          const p = at(e);
          input.current.move(p.x, p.y);
        }}
        onPointerUp={(e) => {
          const p = at(e);
          input.current.up(p.x, p.y);
        }}
        onPointerCancel={(e) => {
          const p = at(e);
          input.current.up(p.x, p.y);
        }}
      />
    </div>
  );
}
