import type { CoachGender, CoachStyle } from '../../domain/types';
import { CoachAvatar } from './CoachAvatar';

const CREW: [CoachStyle, CoachGender][] = [
  ['support', 'female'],
  ['energy', 'male'],
  ['spite', 'female'],
  ['sergeant', 'male'],
  ['stoic', 'female'],
];

/** The trainers on the splash: they pop up one by one, each in its own way (the stoic arrives late and stays calm). */
export function SplashCrew() {
  return (
    <div className="splash-crew">
      {CREW.map(([style, gender], i) => (
        <span key={style} className={`crew-${style}`} style={{ '--i': i } as React.CSSProperties}>
          <CoachAvatar style={style} gender={gender} size={54} />
        </span>
      ))}
    </div>
  );
}
