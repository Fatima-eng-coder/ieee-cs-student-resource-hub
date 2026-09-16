/**
 * Splits a run of photos into rows that each fill the width at one height.
 *
 * Every tile in a row shares that row's height and takes a width from its own shape, so the
 * row's edges line up on both sides with no ragged gaps, and the photos keep the order the admin
 * gave them -- the lightbox steps through them in that same order.
 *
 * Where the rows break is chosen for the album as a whole rather than greedily. A greedy fill
 * packs every row as full as it will go and leaves whatever is over for the last one, which is
 * how a gallery ends in a single photo blown up to twice the height of everything above it. Here
 * each possible row is scored by how far its height strays from the target, and the breaks with
 * the lowest total win (a shortest-path over the break points), so the rows come out evenly sized
 * and the last one is balanced with the rest.
 */

export interface JustifiedRow {
  /** First photo in the row. */
  start: number;
  /** One past the last photo in the row. */
  end: number;
  /** Row height in pixels. */
  height: number;
  /**
   * False when the row is narrower than the width: only ever the last row, when filling the
   * width would have made it far taller than the rest. It is then drawn at `height` and centred.
   */
  filled: boolean;
}

export interface JustifiedOptions {
  /** Width available to a row, in pixels. */
  width: number;
  /** Space between tiles, in pixels. */
  gap: number;
  /** The height rows aim for. */
  targetHeight: number;
  /** No row is drawn taller than this. Defaults to 1.5 x the target. */
  maxHeight?: number;
  /** Most photos one row may hold. */
  maxPerRow?: number;
}

/**
 * @param ratios width / height of each photo, in display order.
 */
export function layoutJustifiedRows(ratios: number[], options: JustifiedOptions): JustifiedRow[] {
  const count = ratios.length;
  const width = Math.max(0, options.width);
  if (count === 0 || width === 0) return [];

  const { gap, targetHeight } = options;
  const maxHeight = options.maxHeight ?? targetHeight * 1.5;
  const maxPerRow = Math.max(1, options.maxPerRow ?? 8);

  // Prefix sums, so a row's total ratio is one subtraction.
  const prefix = [0];
  for (const ratio of ratios) prefix.push(prefix[prefix.length - 1] + ratio);

  const heightOf = (start: number, end: number) =>
    (width - gap * (end - start - 1)) / (prefix[end] - prefix[start]);

  const deviation = (height: number) => ((height - targetHeight) / targetHeight) ** 2;

  const costOf = (start: number, end: number, isLast: boolean) => {
    const height = heightOf(start, end);
    if (height <= 0) return Infinity;
    if (height <= maxHeight) return deviation(height);
    if (!isLast) {
      // Allowed, because a single portrait on a wide screen has no better option, but priced so
      // it is only chosen when nothing else is possible.
      return deviation(height) * 10;
    }
    // The last row can instead be left short of the width at maxHeight. That costs the height
    // it is drawn at plus the share of the width it leaves empty.
    return deviation(maxHeight) + (1 - maxHeight / height);
  };

  const best = new Array<number>(count + 1).fill(Infinity);
  const from = new Array<number>(count + 1).fill(0);
  best[0] = 0;

  for (let end = 1; end <= count; end += 1) {
    for (let start = Math.max(0, end - maxPerRow); start < end; start += 1) {
      if (best[start] === Infinity) continue;
      const total = best[start] + costOf(start, end, end === count);
      if (total < best[end]) {
        best[end] = total;
        from[end] = start;
      }
    }
  }

  const rows: JustifiedRow[] = [];
  for (let end = count; end > 0; end = from[end]) {
    const start = from[end];
    const height = heightOf(start, end);
    const isLast = end === count;
    rows.push(
      isLast && height > maxHeight
        ? { start, end, height: maxHeight, filled: false }
        : { start, end, height, filled: true }
    );
  }
  return rows.reverse();
}
