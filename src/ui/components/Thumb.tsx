import { useState } from 'react';

/** Small exercise image. Library thumbnails are app files (offline); without one, the first letter is shown. */
export function Thumb({ src, name, size = 48 }: { src?: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (!src || failed) {
    return (
      <span className="thumb empty" style={style} aria-hidden="true">
        {name.trim().charAt(0).toUpperCase()}
      </span>
    );
  }
  const url = /^https?:/.test(src) ? src : `${import.meta.env.BASE_URL}${src}`;
  return <img className="thumb" style={style} src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}
