import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Thumb } from './Thumb';
import { Icon } from './Icon';
import { InfoButton } from './ExerciseSheet';

interface Props {
  name: string;
  thumb?: string;
  sub?: ReactNode;
  trailing?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  to?: string;
  /** Exercise id: a button opens the exercise sheet (D75). Not with `to`, which opens the exercise page. */
  info?: string;
  children?: ReactNode;
}

const SIZE = { sm: 40, md: 52, lg: 64 };

/** The one way an exercise is shown: image, name, detail line and an optional trailing element. */
export function ExerciseItem({ name, thumb, sub, trailing, size = 'md', to, info, children }: Props) {
  const body = (
    <>
      <Thumb src={thumb} name={name} size={SIZE[size]} />
      <span className="xitem-text">
        <span className="xitem-name">{name}</span>
        {sub && <span className="xitem-sub">{sub}</span>}
        {children}
      </span>
      {info && !to && <InfoButton id={info} name={name} />}
      {trailing && <span className="xitem-trail">{trailing}</span>}
      {to && !trailing && <span className="chev" aria-hidden="true"><Icon name="chevronRight" /></span>}
    </>
  );
  return to ? (
    <Link to={to} className={`xitem ${size}`}>
      {body}
    </Link>
  ) : (
    <div className={`xitem ${size}`}>{body}</div>
  );
}

/** Up to five small images of the exercises of a day or workout. */
export function ThumbStack({ items }: { items: { name: string; thumb?: string }[] }) {
  return (
    <span className="tstack" aria-hidden="true">
      {items.slice(0, 5).map((x, i) => (
        <Thumb key={i} src={x.thumb} name={x.name} size={28} />
      ))}
      {items.length > 5 && <span className="tmore">+{items.length - 5}</span>}
    </span>
  );
}
