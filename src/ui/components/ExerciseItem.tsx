import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Thumb } from './Thumb';

interface Props {
  name: string;
  thumb?: string;
  sub?: ReactNode;
  trailing?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  to?: string;
  children?: ReactNode;
}

const SIZE = { sm: 40, md: 52, lg: 64 };

/** The one way an exercise is shown: image, name, detail line and an optional trailing element. */
export function ExerciseItem({ name, thumb, sub, trailing, size = 'md', to, children }: Props) {
  const body = (
    <>
      <Thumb src={thumb} name={name} size={SIZE[size]} />
      <span className="xitem-text">
        <span className="xitem-name">{name}</span>
        {sub && <span className="xitem-sub">{sub}</span>}
        {children}
      </span>
      {trailing && <span className="xitem-trail">{trailing}</span>}
      {to && !trailing && <span className="chev" aria-hidden="true">›</span>}
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
