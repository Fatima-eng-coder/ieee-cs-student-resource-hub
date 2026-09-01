/**
 * Fitting room names into room boxes on the floor plan.
 *
 * Rooms here range from a 3 m lift shaft to a 16 m office block, and the names range from
 * "201" to "High End Computing lab". Drawing every name at one size overflows the small
 * boxes; truncating everything to "High…" is useless. So each name gets a ladder of
 * progressively shorter forms, and the renderer picks the longest one that actually fits —
 * wrapping onto two lines first, and only falling back to initials when nothing else will.
 */

/**
 * Hand-written short forms for the names the generic rules handle badly.
 * Ordered longest → shortest; the renderer walks down until something fits.
 */
const SHORT_FORMS: Record<string, string[]> = {
  'female washrooms': ['Female WC', 'F. WC'],
  'female washroom': ['Female WC', 'F. WC'],
  'male washrooms': ['Male WC', 'M. WC'],
  'male washroom': ['Male WC', 'M. WC'],
  'female prayer room': ['Prayer Room', 'Prayer', 'F. Prayer'],
  administration: ['Admin'],
  'fyp lab': ['FYP'],
  'unnamed room': ['Unnamed', '—'],
  'front office': ['Office'],
  'admin / conference': ['Admin / Conf.', 'Admin'],
  'high end computing lab': ['High-End Lab', 'HEC Lab'],
  'haier lab': ['Haier Lab', 'Haier'],
  'print shop': ['Print Shop', 'Print'],
  laboratory: ['Lab'],
  unclassified: ['Room'],
  studio: ['Studio'],
  canteen: ['Canteen'],
  classroom: ['Class'],
};

/** Initials fallback: "High End Computing lab" → "HECL", "Female Washrooms" → "FW". */
function initials(name: string): string {
  const letters = name
    .split(/[\s/&-]+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
  return letters.slice(0, 4) || name.slice(0, 3);
}

/**
 * Every form of a name worth trying, longest first. Always ends with something short
 * enough to draw in a small box.
 */
export function labelLadder(name: string): string[] {
  const key = name.trim().toLowerCase();
  const forms = [name, ...(SHORT_FORMS[key] ?? [])];

  // A bare room code ("201", "CL-11", "G-05") is already as short as it gets.
  if (!/\s/.test(name)) return [...new Set(forms)];

  const shortest = initials(name);
  return [...new Set([...forms, shortest])];
}

/**
 * Rough text width in the same units as `fontSize`.
 *
 * SVG gives no way to measure text without laying it out, and measuring 21 labels per
 * frame during a pinch-zoom is not worth it. Inter's average advance is ~0.55 em for
 * mixed-case text; 0.58 leaves a little headroom so labels stop short of their walls
 * rather than touching them.
 */
const AVERAGE_GLYPH_WIDTH = 0.58;
export const textWidth = (text: string, fontSize: number) => text.length * fontSize * AVERAGE_GLYPH_WIDTH;

export interface FittedLabel {
  lines: string[];
  fontSize: number;
}

/**
 * The best label for a box, or null when even initials will not fit.
 *
 * Tries each form on one line, then on two lines if the box is tall enough — two lines
 * of the full name reads far better than one line of an abbreviation.
 */
export function fitLabel(
  name: string,
  boxWidth: number,
  boxHeight: number,
  fontSize: number
): FittedLabel | null {
  // Keep a little air between the text and the walls.
  const maxWidth = boxWidth * 0.86;
  const lineHeight = fontSize * 1.15;

  for (const form of labelLadder(name)) {
    if (textWidth(form, fontSize) <= maxWidth) return { lines: [form], fontSize };

    // Two lines, split at the space closest to the middle so neither line dominates.
    const words = form.split(' ');
    if (words.length < 2 || boxHeight < lineHeight * 2.2) continue;

    let best: string[] | null = null;
    let bestImbalance = Infinity;
    for (let split = 1; split < words.length; split += 1) {
      const top = words.slice(0, split).join(' ');
      const bottom = words.slice(split).join(' ');
      const widest = Math.max(textWidth(top, fontSize), textWidth(bottom, fontSize));
      if (widest > maxWidth) continue;
      const imbalance = Math.abs(top.length - bottom.length);
      if (imbalance < bestImbalance) {
        bestImbalance = imbalance;
        best = [top, bottom];
      }
    }
    if (best) return { lines: best, fontSize };
  }

  return null;
}
