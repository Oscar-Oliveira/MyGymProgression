import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';

interface Request {
  kind: 'alert' | 'confirm' | 'prompt';
  message: string;
  danger?: boolean;
  ok?: string;
  resolve: (v: string | undefined) => void;
}

let show: ((r: Request) => void) | undefined;
const open = (r: Omit<Request, 'resolve'>) => new Promise<string | undefined>((resolve) => (show ? show({ ...r, resolve }) : resolve(undefined)));

/** In-app replacements for alert, confirm and prompt, so every message looks the same. */
export const dialog = {
  alert: async (message: string) => void (await open({ kind: 'alert', message })),
  confirm: async (message: string, opts: { danger?: boolean; ok?: string } = {}) => (await open({ kind: 'confirm', message, ...opts })) !== undefined,
  prompt: (message: string) => open({ kind: 'prompt', message }),
};

/** Mounted once in the app shell; shows the dialog requested through `dialog`. */
export function DialogHost() {
  const { t } = useTranslation();
  const [req, setReq] = useState<Request>();
  const [text, setText] = useState('');
  useEffect(() => {
    show = (r) => (setText(''), setReq(r));
    return () => void (show = undefined);
  }, []);
  if (!req) return null;
  const close = (v: string | undefined) => (setReq(undefined), req.resolve(v));
  const title = req.kind === 'alert' ? t('dialog.notice') : t('dialog.confirm');

  return (
    <Modal key={req.message} title={title} onClose={() => close(undefined)}>
      <form
        className="dialog-body"
        onSubmit={(e) => {
          e.preventDefault();
          close(text);
        }}
      >
        <p>{req.message}</p>
        {req.kind === 'prompt' && <input autoFocus aria-label={req.message} value={text} onChange={(e) => setText(e.target.value)} />}
        <div className="dialog-actions">
          {req.kind !== 'alert' && (
            <button type="button" className="outline" onClick={() => close(undefined)}>
              {t('common.cancel')}
            </button>
          )}
          <button type="submit" className={req.danger ? 'primary danger' : 'primary'} autoFocus={req.kind !== 'prompt'}>
            {req.ok ?? t('dialog.ok')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
