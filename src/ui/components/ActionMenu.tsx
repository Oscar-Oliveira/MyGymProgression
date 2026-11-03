import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';

export interface MenuAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

/** The ⋯ button of a page or an item: its secondary actions (duplicate, share, archive, delete) in a sheet. */
export function ActionMenu({ title, actions }: { title: string; actions: (MenuAction | false | undefined)[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="ghost icon" aria-label={`${t('plan.actions')} ${title}`} onClick={() => setOpen(true)}>
        ⋯
      </button>
      {open && (
        <Modal title={title} onClose={() => setOpen(false)}>
          <div className="sheet">
            {actions
              .filter((a): a is MenuAction => !!a)
              .map((a) => (
                <button key={a.label} className={a.danger ? 'danger' : ''} onClick={() => (setOpen(false), a.onClick())}>
                  {a.label}
                </button>
              ))}
          </div>
        </Modal>
      )}
    </>
  );
}
