import { useState } from 'react';

import DefaultAvatar from './DefaultAvatar';
import type { MemberGender } from '@/types';

/**
 * One member's portrait, drawn as a true circle in every surface that shows one.
 *
 * Written because the three places that drew their own each got a different detail wrong, and
 * the shape is the thing everybody notices:
 *
 * 1. A circle needs a square box, and `h-20 w-20` alone does not give one. Tailwind's preflight
 *    sets `img { max-width: 100% }`, so inside any parent narrower than the avatar the width is
 *    clamped while the height is not: the homepage strip was drawing 62x80 ellipses. `max-w-none`
 *    is what actually holds the box square; `shrink-0` and `aspect-square` stop a flex parent
 *    from taking a second bite.
 *
 * 2. A member with no photograph gets a drawn figure, not the society logo. The logo was square
 *    artwork that the circular mask cut the ends off, and -- worse -- a roster with several
 *    photo-less members became a column of identical logos that the eye could not tell apart.
 *    DefaultAvatar draws a person instead, chosen by the member's recorded gender.
 *
 * 3. A photo_url that 404s left a broken-image glyph in a round frame. onError falls back to the
 *    placeholder, and switching `failed` also switches the fit, so the fallback is not
 *    centre-cropped either.
 */
export function MemberAvatar({
  src,
  alt,
  size,
  gender = 'unknown',
  className = '',
  eager = false,
}: {
  src: string | undefined;
  alt: string;
  /** Picks the placeholder when there is no photograph. */
  gender?: MemberGender;
  /** Tailwind height and width, e.g. `h-24 w-24 sm:h-28 sm:w-28`. Keep the two equal. */
  size: string;
  /** Ring, border, shadow -- anything about how the circle is trimmed. */
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  const wanted = src?.trim();
  // A row still holding the old '/brand-logo.png' means "no photograph", not "show the logo".
  const hasPhoto = Boolean(wanted) && !failed && wanted !== '/brand-logo.png';

  if (!hasPhoto) {
    return (
      <DefaultAvatar
        gender={gender}
        className={`${size} aspect-square max-w-none shrink-0 rounded-full ${className}`}
      />
    );
  }

  return (
    <img
      src={wanted}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      onError={() => setFailed(true)}
      className={`${size} aspect-square max-w-none shrink-0 rounded-full bg-cream object-cover ${className}`}
    />
  );
}
