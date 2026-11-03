// Outline icons (24×24, stroke = currentColor), the same look as the tab bar (D67). No emoji or text symbols as icons.
const PATHS = {
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M8 5v14M16 5v14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-4',
  pin: 'M12 17v5M8 3h8l-1 6 3 3v2H6v-2l3-3z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  chevronRight: 'M9 5l7 7-7 7',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronDown: 'M5 9l7 7 7-7',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  equal: 'M6 9.5h12M6 14.5h12',
  alert: 'M12 5v9M12 19h.01',
  circuit: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4',
  swap: 'M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  share: 'M12 15V4M8 8l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 18v2',
  list: 'M5 7h14M5 12h14M5 17h14',
  table: 'M4 4h16v16H4zM4 10h16M4 15h16M10 4v16',
  timer: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 1.5M10 2h4',
  warning: 'M12 3L2 20h20zM12 10v4M12 17h.01',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  swords: 'M4 4l10 10M4 4v4M4 4h4M20 4L10 14M20 4v4M20 4h-4M7 17l-3 3M17 17l3 3M6 15l3 3M18 15l-3 3',
  // Games.
  cards: 'M4 7h10v14H4zM8 3h12v14',
  hammer: 'M13 4l7 7-3 3-7-7zM11.5 9.5L4 17l3 3 7.5-7.5',
  muscle: 'M5 19c-1-5 1-10 5-12l2-3 3 2-2 3c3 0 6 2 6 6 0 2-1 4-3 4z',
  dumbbell: 'M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11',
  runner: 'M15 4.5h.01M10 21l2.5-5.5L15 18v3M7 11l3-3 4 1.5 2.5 3.5h3M12.5 15.5L11 11',
  rocket: 'M12 3c3 2 5 6 4 11l-4 3-4-3c-1-5 1-9 4-11zM8 14l-3 3 3 1M16 14l3 3-3 1M12 9h.01M10 20l2 2 2-2',
  stairs: 'M4 20h5v-5h5v-5h5V5',
  joystick: 'M12 4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM12 9v6M4 15h16v5H4z',
} as const;

export type IconName = keyof typeof PATHS;

/** An icon that goes with a text: the size follows the text, and readers skip it. */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg className={`glyph glyph-${name}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
