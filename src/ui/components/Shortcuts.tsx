// Home shortcuts (V2-D11): a grid of icons; the user chooses which ones and their order.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { repo } from '../../data/repo';
import { useStart } from '../start';
import { saveBackup, useSettings } from '../util';
import { Icon, type IconName } from './Icon';
import { Modal } from './Modal';
import { toast } from './Toast';

interface Shortcut {
  id: string;
  icon: IconName;
  /** A page to open, or an action. */
  to?: string;
  run?: 'free' | 'backup';
}

/** Every shortcut the app offers. Rest timer, plates, 1RM and body weight join with their features (F5). */
export const SHORTCUTS: Shortcut[] = [
  { id: 'free', icon: 'plus', run: 'free' },
  { id: 'weight', icon: 'scale', to: '/body?add=weight' },
  { id: 'onerm', icon: 'calc', to: '/tools' },
  { id: 'plates', icon: 'plates', to: '/tools#plates' },
  { id: 'history', icon: 'history', to: '/history' },
  { id: 'reports', icon: 'chart', to: '/reports' },
  { id: 'exercises', icon: 'dumbbell', to: '/exercises' },
  { id: 'newExercise', icon: 'edit', to: '/exercises/new' },
  { id: 'scan', icon: 'qr', to: '/plans/scan' },
  { id: 'backup', icon: 'cloud', run: 'backup' },
  { id: 'settings', icon: 'sliders', to: '/settings' },
  { id: 'achievements', icon: 'medal', to: '/achievements' },
  { id: 'games', icon: 'joystick', to: '/games' },
  { id: 'coach', icon: 'user', to: '/coach' },
];
export const DEFAULT_SHORTCUTS = ['free', 'weight', 'onerm', 'plates', 'history', 'backup'];

/** The user's shortcuts, in order; unknown ids (from a newer or older version) are left out. */
export function chosenShortcuts(ids: string[] | undefined): Shortcut[] {
  return (ids ?? DEFAULT_SHORTCUTS).map((id) => SHORTCUTS.find((s) => s.id === id)).filter((s): s is Shortcut => !!s);
}

export function ShortcutGrid() {
  const { t } = useTranslation();
  const s = useSettings();
  const nav = useNavigate();
  const start = useStart();
  const [editing, setEditing] = useState(false);
  const run = async (sc: Shortcut) => {
    if (sc.to) return nav(sc.to);
    if (sc.run === 'free') return void start();
    if (sc.run === 'backup' && (await saveBackup())) toast(t('shortcuts.backupDone'));
  };
  return (
    <section className="shortcuts" aria-labelledby="shortcuts-title">
      <div className="section-head">
        <h2 id="shortcuts-title">{t('shortcuts.title')}</h2>
        <button type="button" className="link-btn" onClick={() => setEditing(true)}>
          {t('shortcuts.edit')}
        </button>
      </div>
      <div className="shortcut-grid">
        {chosenShortcuts(s.shortcuts).map((sc) => (
          <button key={sc.id} type="button" className="shortcut" onClick={() => void run(sc)}>
            <span className="more-ico">
              <Icon name={sc.icon} />
            </span>
            <span>{t(`shortcuts.items.${sc.id}`)}</span>
          </button>
        ))}
      </div>
      {editing && <ShortcutEditor onClose={() => setEditing(false)} />}
    </section>
  );
}

/** Choose and order the shortcuts: on/off, up and down, back to the default. Saved at once. */
function ShortcutEditor({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const s = useSettings();
  const [ids, setIds] = useState<string[]>(chosenShortcuts(s.shortcuts).map((x) => x.id));
  const save = (next: string[]) => {
    setIds(next);
    void repo.saveSettings({ shortcuts: next });
  };
  const move = (id: string, by: number) => {
    const i = ids.indexOf(id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };
  const ordered = [...ids, ...SHORTCUTS.map((x) => x.id).filter((id) => !ids.includes(id))];
  return (
    <Modal title={t('shortcuts.editTitle')} onClose={onClose}>
      <p className="muted">{t('shortcuts.help')}</p>
      <ul className="shortcut-edit">
        {ordered.map((id) => {
          const sc = SHORTCUTS.find((x) => x.id === id)!;
          const on = ids.includes(id);
          const name = t(`shortcuts.items.${id}`);
          return (
            <li key={id} className={on ? 'on' : ''}>
              <label className="check">
                <input type="checkbox" checked={on} onChange={() => save(on ? ids.filter((x) => x !== id) : [...ids, id])} />
                <Icon name={sc.icon} /> {name}
              </label>
              {on && (
                <span className="row">
                  <button type="button" className="ghost icon" aria-label={t('shortcuts.up', { name })} disabled={ids.indexOf(id) === 0} onClick={() => move(id, -1)}>
                    <Icon name="arrowUp" />
                  </button>
                  <button type="button" className="ghost icon" aria-label={t('shortcuts.down', { name })} disabled={ids.indexOf(id) === ids.length - 1} onClick={() => move(id, 1)}>
                    <Icon name="arrowDown" />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <button type="button" className="ghost" onClick={() => save([...DEFAULT_SHORTCUTS])}>
        {t('shortcuts.reset')}
      </button>
    </Modal>
  );
}
