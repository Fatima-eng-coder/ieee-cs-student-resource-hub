/**
 * The portrait shown for a member who has no photograph.
 *
 * It used to be the society logo. That reads as "this is IEEE CS" rather than "this is a
 * person", and on a roster where several people have no photo yet you get a wall of identical
 * logos — the eye cannot tell the cards apart, so the roster stops being a list of people.
 *
 * These are flat silhouettes instead: obviously placeholders, never mistaken for a real
 * photograph, and different enough from one another that a row of them still reads as a row of
 * individuals. Drawn inline as SVG rather than shipped as image files because they are three
 * small paths — no extra request, no cache to bust, and the colours come from the same palette
 * as everything else, so they sit inside the ring the card already draws.
 *
 * `unknown` is the honest default. Gender is optional on a member, and guessing it from a name
 * is both unreliable and not ours to guess, so a member who has not been given one gets a
 * neutral figure rather than a coin flip.
 */

import type { ReactElement } from 'react';

export type MemberGender = 'male' | 'female' | 'unknown';

/** Warm neutrals that sit against the cream card without competing with a real photo beside it. */
const PALETTE = {
  backdrop: '#F4EFE4',
  figure: '#C2B49B',
  figureDeep: '#AD9C7F',
};

function Backdrop() {
  return <circle cx="32" cy="32" r="32" fill={PALETTE.backdrop} />;
}

/** Short hair, square-ish shoulders. */
function MaleFigure() {
  return (
    <>
      {/* Hair is a larger disc sitting behind and slightly above the face, so what shows is a
          crescent across the crown and a sliver at each temple. Two circles rather than a carved
          path: it stays even at 28px, where a thin outlined arc turns into a smudge. */}
      <circle cx="32" cy="25.5" r="11" fill={PALETTE.figureDeep} />
      <circle cx="32" cy="27.5" r="9.5" fill={PALETTE.figure} />
      <path d="M32 39c9.4 0 17 6.6 17 14.8V56H15v-2.2C15 45.6 22.6 39 32 39z" fill={PALETTE.figure} />
    </>
  );
}

/** Longer hair falling past the jaw, softer shoulder line. */
function FemaleFigure() {
  return (
    <>
      <path
        d="M19.8 30c0-8.2 5.5-14 12.2-14s12.2 5.8 12.2 14c0 4-.7 7.4-1.9 9.9l-2.9-1.3c.7-2 1.1-4.7 1.1-7.6 0-1.4-.2-2.6-.6-3.6-2.3 1.6-6.2 2.4-11 2.4-1.6 0-3 .5-3.9 1.5-.5.6-.8 1.4-.8 2.4 0 2.5.3 4.9 1 6.9l-2.9 1.3c-1.1-2.6-1.5-6-1.5-9.9z"
        fill={PALETTE.figureDeep}
      />
      <circle cx="32" cy="28" r="9" fill={PALETTE.figure} />
      <path d="M32 39.5c9.1 0 16.5 6.5 16.5 14.5V56h-33v-2c0-8 7.4-14.5 16.5-14.5z" fill={PALETTE.figure} />
    </>
  );
}

/** No hair shape at all — a plain figure, so it reads as "not recorded" rather than as a guess. */
function NeutralFigure() {
  return (
    <>
      <circle cx="32" cy="27" r="9.5" fill={PALETTE.figure} />
      <path d="M32 39c9.4 0 17 6.6 17 14.8V56H15v-2.2C15 45.6 22.6 39 32 39z" fill={PALETTE.figure} />
    </>
  );
}

const FIGURES: Record<MemberGender, () => ReactElement> = {
  male: MaleFigure,
  female: FemaleFigure,
  unknown: NeutralFigure,
};

export default function DefaultAvatar({
  gender = 'unknown',
  className = '',
}: {
  gender?: MemberGender;
  className?: string;
}) {
  const Figure = FIGURES[gender] ?? NeutralFigure;

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      // Decorative: every caller already renders the member's name as text beside it, so
      // announcing "placeholder portrait" here would only repeat what was just read out.
      aria-hidden="true"
      focusable="false"
    >
      {/* No clip path. At the shoulder line (y=56) the backdrop circle spans x 10.8 to 53.2 and
          the widest figure spans 15 to 49, so every silhouette already sits inside it. Clipping
          would buy nothing and cost an id that repeats on every card sharing a gender. */}
      <Backdrop />
      <Figure />
    </svg>
  );
}
