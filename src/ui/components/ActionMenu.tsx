import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { Icon, type IconName } from './Icon';

export interface MenuAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
  icon?: IconName;
  /** One line under the label. */
  sub?: string;
}

/** The ⋯ button of a page or an item: its secondary actions (duplicate, share, archive, delete) in a sheet. */
export function ActionMenu({ title, actions }: { title: string; actions: (MenuAction | false | undefined)[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button type="button" className="ghost icon" aria-label={`${t('plan.actions')} ${title}`} onClick={() => setOpen(true)}>
        <Icon name="more" />
      </button>
      {open && (
        <Modal title={title} onClose={() => setOpen(false)}>
          <div className="sheet">
            {actions
              .filter((a): a is MenuAction => !!a)
              .map((a, i) => (
                // The label is the button's name; the detail line is its description (not part of the name).
                <button
                  key={a.label}
                  className={`menu-row ${a.danger ? 'danger' : ''}`}
                  aria-label={a.label}
                  aria-describedby={a.sub ? `${id}-${i}` : undefined}
                  onClick={() => (setOpen(false), a.onClick())}
                >
                  {a.icon && (
                    <span className="menu-ico">
                      <Icon name={a.icon} />
                    </span>
                  )}
                  <span className="main">
                    <span className="title">{a.label}</span>
                    {a.sub && (
                      <span className="meta" id={`${id}-${i}`}>
                        {a.sub}
                      </span>
                    )}
                  </span>
                </button>
              ))}
          </div>
        </Modal>
      )}
    </>
  );
}
