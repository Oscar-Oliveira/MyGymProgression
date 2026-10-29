import { useState } from 'react';

/** Small exercise image. Library thumbnails are app files (offline); without one, a neutral exercise icon is shown. */
export function Thumb({ src, name, size = 48 }: { src?: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (!src || failed) {
    return (
      <span className="thumb empty" style={style} aria-hidden="true" title={name}>
        <svg viewBox="0 0 24 24" width={Math.round(size * 0.55)} height={Math.round(size * 0.55)} fill="currentColor">
          <rect x="1.5" y="9" width="3" height="6" rx="1" />
          <rect x="4.5" y="7" width="3" height="10" rx="1" />
          <rect x="7.5" y="11" width="9" height="2" rx="1" />
          <rect x="16.5" y="7" width="3" height="10" rx="1" />
          <rect x="19.5" y="9" width="3" height="6" rx="1" />
        </svg>
      </span>
    );
  }
  const url = /^https?:/.test(src) ? src : `${import.meta.env.BASE_URL}${src}`;
  return <img className="thumb" style={style} src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}
