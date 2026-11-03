import { useEffect, useState } from 'react';

let show: ((text: string) => void) | undefined;

/** A short message that goes away by itself: the same for every "done" (copied, saved, added). */
export const toast = (text: string) => show?.(text);

/** Mounted once in the app shell; shows the latest message sent through `toast`. */
export function ToastHost() {
  const [msg, setMsg] = useState<{ text: string; at: number }>();
  useEffect(() => {
    show = (text) => setMsg({ text, at: Date.now() });
    return () => void (show = undefined);
  }, []);
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(undefined), 2500);
    return () => clearTimeout(id);
  }, [msg]);
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {msg && (
        <p key={msg.at} className="toast">
          {msg.text}
        </p>
      )}
    </div>
  );
}
