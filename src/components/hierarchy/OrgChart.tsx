import { Fragment, useLayoutEffect, useRef, useState } from 'react';
// lucide has no LinkedIn glyph in this version; the site already ships its own.
import { MemberAvatar } from './MemberAvatar';
import { memberLinks } from '@/lib/memberLinks';
import { hrefForLink, platformMeta } from '@/lib/socialPlatforms';
import { titleForRole, type HierarchyMemberRecord } from '@/services/hierarchyService';
import type { HierarchyRole } from '@/types';
import type { HierarchyTierGroup } from './groupByTier';

/*
 * Two layouts, one rule: the connectors are drawn from geometry the component already knows,
 * never from where the browser happened to put things.
 *
 * The branching tree only runs when every level fits on a single line — the card width is
 * solved for the widest level, and if that solution falls below MIN_CARD the chart becomes the
 * stacked rail instead. Nothing wraps, so nothing can leave a line pointing at empty space.
 * That is the whole reason the width is measured rather than handed to a media query: the
 * breakpoint that matters is "do fifteen people fit", which depends on the roster, and next
 * semester's roster is not this one.
 */

/** Horizontal gap between cards on one level of the tree. */
const GAP = 14;
/** Narrowest a tree card may be squeezed to before the chart gives up and stacks. */
const MIN_CARD = 128;
const MAX_CARD = 168;

/** Branch bands: card bottom → the level's bus, bus → bus, bus → card top. */
const RISER = 18;
const STEM = 22;
const DROP = 18;
const BRANCH_H = RISER + STEM + DROP;

/** Rail mode. The elbow meets each card at its avatar's centre: 12px padding + half of h-11. */
const RAIL_BASE = 10;
const RAIL_ARM = 12;
const RAIL_ELBOW_Y = 34;
const RAIL_TURN = 16;
const RAIL_ROW_GAP = 10;

type Prominence = 'lead' | 'exec' | 'core';

/**
 * The ring around a portrait. Emphasis fades down the chart, but every card keeps one.
 *
 * `core` used to be `ring-white`, on a white card — no ring at all, so everything below the
 * general secretary looked unfinished next to the tiers above it, whether the member had a
 * photograph or the logo. A tint of the same orange keeps the three tiers distinguishable while
 * giving the bottom one an edge you can actually see.
 */
const ringFor = (prominence: Prominence) =>
  prominence === 'lead'
    ? 'ring-ieee-orange'
    : prominence === 'exec'
      ? 'ring-ieee-orange/45'
      : 'ring-ieee-orange/25';

/** Depth in the chart, used only for emphasis — never for layout or for the connectors. */
const prominenceFor = (index: number): Prominence => (index === 0 ? 'lead' : index < 3 ? 'exec' : 'core');

/**
 * The rendered width of the chart's own box.
 *
 * A layout effect rather than an effect: the measurement has to land before the browser paints,
 * or the first frame is the stacked rail on a desktop that has room for the tree.
 */
function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Sub-pixel jitter from a scrollbar appearing would otherwise loop the observer.
    const record = (next: number) => setWidth((previous) => (Math.abs(previous - next) < 0.5 ? previous : next));
    const measure = () => record(element.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => record(entries[0]?.contentRect.width ?? 0));
    observer.observe(element);
    // The observer is the real mechanism: this box can change width with the window sitting
    // still. The listener is a second, cheaper path to the same measurement, for the case
    // where observer callbacks are not being delivered — they ride the frame lifecycle, so a
    // document that is not being rendered does not get them.
    window.addEventListener('resize', measure);
    measure();

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return [ref, width] as const;
}

/**
 * The branch joining one level to the next: risers up into a bus, one stem across the gap, a
 * bus back out and a drop into every card.
 *
 * Every count works out of the same four lines because the two rows share a centre. A level of
 * one has no bus at all — its single card sits on the centre line, so the stem simply runs the
 * full height and meets it. An odd count lands a card on the centre line and the stem meets its
 * drop; an even count lands the centre between two cards and the stem meets the bus midway.
 */
function Branch({
  parentCount,
  childCount,
  cardWidth,
}: {
  parentCount: number;
  childCount: number;
  cardWidth: number;
}) {
  const rowWidth = (count: number) => count * cardWidth + (count - 1) * GAP;
  const width = Math.max(rowWidth(parentCount), rowWidth(childCount));

  // Half-pixel offsets: a 1px stroke centred on a whole pixel is drawn across two of them.
  const centres = (count: number) => {
    const first = (width - rowWidth(count)) / 2 + cardWidth / 2;
    return Array.from({ length: count }, (_, i) => Math.round(first + i * (cardWidth + GAP)) + 0.5);
  };

  const middle = Math.round(width / 2) + 0.5;
  const busIn = RISER + 0.5;
  const busOut = RISER + STEM + 0.5;
  const above = centres(parentCount);
  const below = centres(childCount);

  return (
    <svg
      width={width}
      height={BRANCH_H}
      viewBox={`0 0 ${width} ${BRANCH_H}`}
      className="block shrink-0 text-slate-300"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="currentColor" strokeWidth={1}>
        {parentCount > 1 && (
          <>
            <line x1={above[0]} y1={busIn} x2={above[parentCount - 1]} y2={busIn} />
            {above.map((x, i) => (
              <line key={`riser-${i}`} x1={x} y1={0} x2={x} y2={busIn} />
            ))}
          </>
        )}

        <line
          x1={middle}
          y1={parentCount > 1 ? busIn : 0}
          x2={middle}
          y2={childCount > 1 ? busOut : BRANCH_H}
        />

        {childCount > 1 && (
          <>
            <line x1={below[0]} y1={busOut} x2={below[childCount - 1]} y2={busOut} />
            {below.map((x, i) => (
              <line key={`drop-${i}`} x1={x} y1={busOut} x2={x} y2={BRANCH_H} />
            ))}
          </>
        )}
      </g>
    </svg>
  );
}

/**
 * A member's contact links.
 *
 * Was two hardcoded icons reading `email` and `linkedin`; now reads the `links` array, so a
 * member can carry a portfolio, a GitHub and an Instagram as easily as an email. memberLinks()
 * keeps the two old columns working for any row written before the array existed.
 *
 * stopPropagation because these sit inside cards that may become clickable later; a contact
 * link should never also trigger whatever the card does.
 */
function MemberContacts({ member, compact = false }: { member: HierarchyMemberRecord; compact?: boolean }) {
  const links = memberLinks(member);
  if (links.length === 0) return null;

  const size = compact ? 'h-6 w-6' : 'h-7 w-7';

  return (
    <div className={`flex flex-wrap items-center justify-center gap-1.5 ${compact ? '' : 'mt-0.5'}`}>
      {links.map((link, index) => {
        const { label, Icon } = platformMeta(link.type);
        const name = link.label || label;
        const href = hrefForLink(link.type, link.url);

        return (
          <a
            key={`${link.type}-${link.url}-${index}`}
            href={href}
            // mailto: and tel: must not open a tab; an http link should not navigate the chart away.
            target={href.startsWith('http') ? '_blank' : undefined}
            rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
            onClick={(event) => event.stopPropagation()}
            aria-label={`${member.name} on ${name}`}
            title={name}
            data-cursor="link"
            className={`${size} flex items-center justify-center rounded-full border border-black/10 text-slate-500 transition hover:border-ieee-orange/50 hover:text-ieee-orange`}
          >
            <Icon className="h-3.5 w-3.5" />
          </a>
        );
      })}
    </div>
  );
}

function TreeCard({
  member,
  roleIndex,
  prominence,
}: {
  member: HierarchyMemberRecord;
  roleIndex: Map<string, HierarchyRole>;
  prominence: Prominence;
}) {
  return (
    <div className="flex h-full flex-col items-center gap-2 rounded-2xl border border-black/5 bg-white px-2.5 py-3.5 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-ieee-orange/30 hover:shadow-md">
      <MemberAvatar src={member.photo} alt="" gender={member.gender} size="h-24 w-24" className={`ring-2 ${ringFor(prominence)}`} />
      <div className="min-w-0">
        <p className="text-[13px] leading-tight font-semibold break-words text-slate-900">{member.name}</p>
        <p className="mt-1 font-mono text-[10px] leading-tight tracking-wide break-words text-ieee-orange uppercase">
          {titleForRole(roleIndex, member.roleSlug)}
        </p>
      </div>
      <MemberContacts member={member} compact />
    </div>
  );
}

function RailCard({
  member,
  roleIndex,
  prominence,
}: {
  member: HierarchyMemberRecord;
  roleIndex: Map<string, HierarchyRole>;
  prominence: Prominence;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-black/5 bg-white px-3 py-3 shadow-sm">
      <MemberAvatar src={member.photo} alt="" gender={member.gender} size="h-20 w-20" className={`ring-2 ${ringFor(prominence)}`} />
      {/* min-h tracks the avatar height (h-20) so a one-line name still reads as vertically
          centred while the avatar stays pinned to the top — which is what fixes the elbow's y.
          Change one and change the other, or the connector stops meeting the card. */}
      <div className="flex min-h-20 min-w-0 flex-col justify-center">
        <p className="text-sm leading-tight font-semibold text-slate-900">{member.name}</p>
        <p className="mt-0.5 font-mono text-[10px] tracking-wide text-ieee-orange uppercase">
          {titleForRole(roleIndex, member.roleSlug)}
        </p>
        <MemberContacts member={member} />
      </div>
    </div>
  );
}

function Tree({
  tiers,
  roleIndex,
  cardWidth,
}: {
  tiers: HierarchyTierGroup[];
  roleIndex: Map<string, HierarchyRole>;
  cardWidth: number;
}) {
  return (
    <div className="flex flex-col items-center">
      {tiers.map(({ tier, people }, index) => (
        <Fragment key={tier}>
          {index > 0 && (
            <Branch
              parentCount={tiers[index - 1].people.length}
              childCount={people.length}
              cardWidth={cardWidth}
            />
          )}
          {/* The level and the branch above it are both centred in the same column, which is
              what makes the stem land where the branch says it does. */}
          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(${people.length}, ${cardWidth}px)`, columnGap: GAP }}
          >
            {people.map((member) => (
              <TreeCard
                key={member.id}
                member={member}
                roleIndex={roleIndex}
                prominence={prominenceFor(index)}
              />
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

/**
 * The narrow-screen chart: one card per line, each level indented one step further and hung off
 * a rail, the way a file tree reads.
 *
 * The rail is not decoration hidden at a breakpoint — it carries the same information the
 * branches do. Every x is arithmetic on the level index, so nothing here depends on measuring a
 * card, and every segment is drawn by the row it belongs to, so a name that wraps to three
 * lines lengthens the rail with it.
 */
function Rail({ tiers, roleIndex }: { tiers: HierarchyTierGroup[]; roleIndex: Map<string, HierarchyRole> }) {
  // The indent has to stay inside the phone, so a council with more levels gets a finer step
  // rather than a card squeezed off the right edge.
  const step = Math.max(6, Math.min(14, Math.floor(96 / Math.max(1, tiers.length - 1))));
  const railX = (index: number) => RAIL_BASE + (Math.max(1, index) - 1) * step;

  return (
    <div className="text-slate-300">
      {tiers.map(({ tier, people }, index) => {
        const lastTier = index === tiers.length - 1;

        return (
          <Fragment key={tier}>
            {index > 0 &&
              people.map((member, row) => {
                const lastRow = row === people.length - 1;
                return (
                  <div
                    key={member.id}
                    className="relative"
                    style={{
                      paddingLeft: railX(index) + RAIL_ARM,
                      paddingBottom: lastRow && lastTier ? 0 : RAIL_ROW_GAP,
                    }}
                  >
                    {/* The rail stops at the elbow only where nothing follows it; everywhere
                        else it runs the full row so the next row picks it up seamlessly. */}
                    <span
                      className="absolute w-px bg-current"
                      style={{
                        left: railX(index),
                        top: 0,
                        height: lastRow && lastTier ? RAIL_ELBOW_Y : '100%',
                      }}
                      aria-hidden="true"
                    />
                    <span
                      className="absolute h-px bg-current"
                      style={{ left: railX(index), top: RAIL_ELBOW_Y, width: RAIL_ARM }}
                      aria-hidden="true"
                    />
                    <RailCard member={member} roleIndex={roleIndex} prominence={prominenceFor(index)} />
                  </div>
                );
              })}

            {/* The root level has no rail to hang from, so its cards are drawn bare. */}
            {index === 0 &&
              people.map((member) => (
                <div key={member.id} style={{ paddingBottom: RAIL_ROW_GAP }}>
                  <RailCard member={member} roleIndex={roleIndex} prominence={prominenceFor(index)} />
                </div>
              ))}

            {/* The turn from this level's rail to the next one's, one step to the right. */}
            {!lastTier && (
              <div className="relative" style={{ height: RAIL_TURN }} aria-hidden="true">
                <span className="absolute top-0 bottom-0 w-px bg-current" style={{ left: railX(index) }} />
                {railX(index + 1) > railX(index) && (
                  <span
                    className="absolute bottom-0 h-px bg-current"
                    style={{ left: railX(index), width: railX(index + 1) - railX(index) + 1 }}
                  />
                )}
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * The public org chart.
 *
 * Levels are whatever the role catalogue says they are — see groupByTier. This component only
 * decides how many cards fit on a line and draws the joins.
 */
export default function OrgChart({
  tiers,
  roleIndex,
}: {
  tiers: HierarchyTierGroup[];
  roleIndex: Map<string, HierarchyRole>;
}) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();

  const widest = tiers.reduce((most, { people }) => Math.max(most, people.length), 1);
  const treeWidth = (card: number) => widest * card + (widest - 1) * GAP;

  /*
   * The rail is for phones, not for wide councils.
   *
   * This used to ask whether the WIDEST tier fits, which meant one crowded level dragged the
   * whole chart down to the single-column rail on a full desktop — ten joint secretaries need
   * 1246px at the minimum card, more than a 1280px window has after padding, and the tree
   * vanished on a machine with room for it several times over.
   *
   * So the question is now only "is there room to read a tree at all", and a level too wide for
   * the window scrolls sideways instead, the way a wide table does. The branches are arithmetic
   * on a fixed card width and stay correct at any width; only the viewport moves.
   */
  const RAIL_BELOW = 3 * MIN_CARD + 2 * GAP;
  // width is 0 until the layout effect runs, so an unmeasured chart takes the rail rather than
  // overflowing — the failure that costs nothing.
  const fitsAsTree = width >= RAIL_BELOW;
  const natural = treeWidth(MIN_CARD);
  const cardWidth =
    width >= natural
      ? Math.min(MAX_CARD, Math.floor((width - (widest - 1) * GAP) / widest))
      : MIN_CARD;

  return (
    <div ref={ref} className="w-full">
      {fitsAsTree ? (
        <div className="overflow-x-auto pb-2">
          {/* max-content so the grid keeps its natural width inside the scroller and the
              branches are not re-measured against a squeezed container. */}
          <div className="mx-auto w-max min-w-full">
            <Tree tiers={tiers} roleIndex={roleIndex} cardWidth={cardWidth} />
          </div>
        </div>
      ) : (
        <Rail tiers={tiers} roleIndex={roleIndex} />
      )}
    </div>
  );
}
