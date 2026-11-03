// QR codes of plan days (D60): drawing one, and reading one with the camera or from an image.
import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

/**
 * QR code of `text`, or undefined when the text is too long for one code.
 * Low error correction: a code read from a screen is rarely damaged, and fewer modules are easier to read.
 */
function makeQr(text: string) {
  try {
    const q = qrcode(0, 'L');
    q.addData(text, 'Byte');
    q.make();
    return q;
  } catch {
    return undefined;
  }
}

/** The code as an SVG (black on white, with the quiet zone). `fallback` is shown when the text does not fit in one code. */
export function QrCode({ text, label, fallback }: { text: string; label: string; fallback: React.ReactNode }) {
  const qr = useMemo(() => makeQr(text), [text]);
  if (!qr) return <>{fallback}</>;
  const n = qr.getModuleCount();
  // One rectangle per run of dark modules in a row keeps the path short.
  let d = '';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      let len = 1;
      while (c + len < n && qr.isDark(r, c + len)) len++;
      d += `M${c} ${r}h${len}v1h-${len}z`;
      c += len - 1;
    }
  return (
    <svg className="qr" viewBox={`-4 -4 ${n + 8} ${n + 8}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect x={-4} y={-4} width={n + 8} height={n + 8} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

type Read = (src: HTMLVideoElement | ImageBitmap) => Promise<string | undefined>;
interface NativeDetector {
  detect(src: HTMLVideoElement | ImageBitmap): Promise<{ rawValue: string }[]>;
}
interface NativeDetectorClass {
  new (o: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

/** The browser's own QR reader when it has one (Chrome on Android); else jsQR, loaded only then (e.g. iPhone). */
async function makeReader(): Promise<Read> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (Native && (await Native.getSupportedFormats().catch((): string[] => [])).includes('qr_code')) {
    const d = new Native({ formats: ['qr_code'] });
    return async (src) => (await d.detect(src))[0]?.rawValue;
  }
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return async (src) => {
    const w = src instanceof HTMLVideoElement ? src.videoWidth : src.width;
    const h = src instanceof HTMLVideoElement ? src.videoHeight : src.height;
    if (!w || !h) return undefined;
    // Large photos are made smaller: jsQR is slow on big images.
    const k = Math.min(1, 1200 / Math.max(w, h));
    canvas.width = Math.round(w * k);
    canvas.height = Math.round(h * k);
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    return jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data;
  };
}
let reader: Promise<Read> | undefined;
const getReader = () => (reader ??= makeReader());

/** Camera view that calls `onText` for each new code it sees, and a button to read a code from an image (e.g. a screenshot). */
export function QrScanner({ onText }: { onText: (text: string) => void }) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const handler = useRef(onText);
  handler.current = onText;
  const [camera, setCamera] = useState<'starting' | 'on' | 'off'>('starting');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer = 0;
    void (async () => {
      try {
        const read = await getReader();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) return stream.getTracks().forEach((x) => x.stop());
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        setCamera('on');
        let last = '';
        const tick = async () => {
          if (stopped) return;
          const text = v.readyState >= 2 ? await read(v).catch(() => undefined) : undefined;
          if (text && text !== last) {
            last = text;
            handler.current(text);
          }
          timer = window.setTimeout(() => void tick(), 150);
        };
        void tick();
      } catch {
        if (!stopped) setCamera('off');
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((x) => x.stop());
    };
  }, []);

  const fromImage = async (file: File) => {
    setMsg('');
    try {
      const text = await (await getReader())(await createImageBitmap(file));
      if (text) handler.current(text);
      else setMsg(t('scan.noQr'));
    } catch {
      setMsg(t('scan.noQr'));
    }
  };

  return (
    <div className="scanner">
      {camera !== 'off' && <video ref={video} className="scan-video" playsInline muted aria-label={t('scan.camera')} />}
      {camera === 'off' && <p className="help">{t('scan.noCamera')}</p>}
      <label className="btn outline file-btn">
        <Icon name="image" /> {t('scan.photo')}
        <input type="file" accept="image/*" onChange={(e) => (e.target.files?.[0] && void fromImage(e.target.files[0]), (e.target.value = ''))} />
      </label>
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}
