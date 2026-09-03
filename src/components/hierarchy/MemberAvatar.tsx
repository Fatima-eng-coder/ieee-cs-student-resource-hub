import { useState } from 'react';

import { PLACEHOLDER_PHOTO } from '@/data/hierarchy';

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
 * 2. The placeholder is the chapter's logo -- square artwork, 482x482, with the wordmark running
 *    corner to corner. `object-cover` fills the frame, which is right for a photograph and wrong
 *    here: the circular mask cuts the corners off, so the logo lost its ends. It gets
 *    `object-contain` and padding instead, so the whole mark sits inside the circle the mask
 *    leaves behind. A photograph still gets `object-cover` -- letterboxing a face would be worse.
 *
 * 3. A photo_url that 404s left a broken-image glyph in a round frame. onError falls back to the
 *    placeholder, and switching `failed` also switches the fit, so the fallback is not
 *    centre-cropped either.
 */
export function MemberAvatar({
  src,
  alt,
  size,
  className = '',
  eager = false,
}: {
  src: string | undefined;
  alt: string;
  /** Tailwind height and width, e.g. `h-24 w-24 sm:h-28 sm:w-28`. Keep the two equal. */
  size: string;
  /** Ring, border, shadow -- anything about how the circle is trimmed. */
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  const wanted = src?.trim();
  const isLogo = !wanted || failed || wanted === PLACEHOLDER_PHOTO;

  return (
    <img
      src={isLogo ? PLACEHOLDER_PHOTO : wanted}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      onError={() => setFailed(true)}
      className={`${size} aspect-square max-w-none shrink-0 rounded-full ${
        // p-[14%] keeps the logo inside the square the circle inscribes; bg-white stops the
        // padding reading as a hole when the card behind it is not white.
        isLogo ? 'bg-white object-contain p-[14%]' : 'bg-cream object-cover'
      } ${className}`}
    />
  );
}
