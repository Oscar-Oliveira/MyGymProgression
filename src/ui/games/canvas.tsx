import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { CoachGender, CoachStyle } from '../../domain/types';
import { CoachAvatar } from '../components/CoachAvatar';

/** Props of every game. `onEnd` is called once, with the final score. */
export interface GameProps {
  style: CoachStyle;
  gender?: CoachGender;
  onEnd: (score: number) => void;
}

/** Sizes the canvas for the screen density; drawing then uses `w` × `h` logical pixels. */
export function fitCanvas(c: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  const r = window.devicePixelRatio || 1;
  c.width = w * r;
  c.height = h * r;
  const ctx = c.getContext('2d')!;
  ctx.setTransform(r, 0, 0, r, 0, 0);
  return ctx;
}

/** Calls `frame` on every animation frame with the time step in seconds (at most 0.05) until it returns false. Returns a stop function. */
export function loop(frame: (dt: number) => boolean): () => void {
  let id = 0;
  let last = performance.now();
  let on = true;
  const tick = (t: number) => {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (on && frame(dt)) id = requestAnimationFrame(tick);
  };
  id = requestAnimationFrame(tick);
  return () => {
    on = false;
    cancelAnimationFrame(id);
  };
}

/** Pointer position in logical canvas pixels. */
export function canvasPoint(c: HTMLCanvasElement, e: PointerEvent | ReactPointerEvent, w: number, h: number) {
  const r = c.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * w) / r.width, y: ((e.clientY - r.top) * h) / r.height };
}

/** Theme colours from the CSS tokens, for drawing on a canvas. */
export function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return { bg: v('--surface'), text: v('--text'), muted: v('--muted'), border: v('--border'), accent: v('--accent'), up: v('--up'), down: v('--down'), warn: v('--warn') };
}

/** The latest `onEnd`, so a game loop started once always calls the current one, and only once. */
export function useEnd(onEnd: (score: number) => void) {
  const ref = useRef(onEnd);
  ref.current = onEnd;
  const done = useRef(false);
  return (score: number) => {
    if (done.current) return;
    done.current = true;
    ref.current(score);
  };
}

/**
 * The trainer's face as an image for a canvas. The SVG is rendered hidden in `node` and copied into an image.
 * `img.current` is undefined until the image has loaded.
 */
export function useAvatarImage(style: CoachStyle, gender?: CoachGender) {
  const holder = useRef<HTMLSpanElement>(null);
  const img = useRef<HTMLImageElement>(undefined);
  useEffect(() => {
    const svg = holder.current?.querySelector('svg');
    if (!svg) return;
    const i = new Image();
    i.onload = () => (img.current = i);
    i.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  }, [style, gender]);
  const node = (
    <span ref={holder} hidden>
      <CoachAvatar style={style} gender={gender} size={128} />
    </span>
  );
  return { img, node };
}

/** Draws the face centred on (x, y), or a plain circle until the image is ready. */
export function drawFace(ctx: CanvasRenderingContext2D, img: HTMLImageElement | undefined, x: number, y: number, size: number, fallback: string) {
  if (img) ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  else {
    ctx.fillStyle = fallback;
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Rounded rectangle path and fill. */
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

export const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const rand = (min: number, max: number) => min + Math.random() * (max - min);
export const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
