/**
 * The portrait shown for a member who has no photograph.
 *
 * It used to be the society logo. That reads as "this is IEEE CS" rather than "this is a
 * person", and on a roster where several people have no photo you get a column of identical
 * logos — the eye cannot tell the cards apart, so the roster stops reading as a list of people.
 *
 * Male and female are supplied artwork in public/placeholder_pics. `unknown` is drawn here
 * instead, because there is no artwork for "not recorded" and reusing either portrait for it
 * would be exactly the guess this field exists to avoid.
 */

import type { ReactElement } from 'react';

export type MemberGender = 'male' | 'female' | 'unknown';

/**
 * Supplied artwork, in public/placeholder_pics. Both are 615x615, so a square frame shows them
 * whole and `object-cover` never has to crop or letterbox -- the head is centred and survives
 * the circular mask, and the shoulders run off the bottom the way a real portrait does.
 */
const PORTRAIT: Partial<Record<MemberGender, string>> = {
  male: '/placeholder_pics/male.jpeg',
  female: '/placeholder_pics/female.jpeg',
};

/**
 * Drawn, not photographed, and only for `unknown`.
 *
 * There is no supplied artwork for "not recorded", and inventing one by reusing either portrait
 * would be the guess this field exists to avoid. A plain figure in the same warm tones says
 * "nobody has set this" without implying an answer.
 */
function NeutralFigure(): ReactElement {
  return (
    <>
      <circle cx="32" cy="32" r="32" fill="#F4EFE4" />
      <circle cx="32" cy="27" r="9.5" fill="#C2B49B" />
      <path d="M32 39c9.4 0 17 6.6 17 14.8V56H15v-2.2C15 45.6 22.6 39 32 39z" fill="#C2B49B" />
    </>
  );
}

export default function DefaultAvatar({
  gender = 'unknown',
  className = '',
}: {
  gender?: MemberGender;
  className?: string;
}) {
  const portrait = PORTRAIT[gender];

  if (portrait) {
    return (
      <img
        src={portrait}
        alt=""
        // Decorative: every caller renders the member's name as text beside it, so announcing
        // "placeholder portrait" here would only repeat what was just read out.
        aria-hidden="true"
        loading="lazy"
        className={`${className} object-cover`}
      />
    );
  }

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <NeutralFigure />
    </svg>
  );
}
