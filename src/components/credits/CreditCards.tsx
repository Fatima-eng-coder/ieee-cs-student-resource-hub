import type { ReactNode } from 'react';
import { Crown } from 'lucide-react';

import { MemberAvatar } from '@/components/hierarchy/MemberAvatar';
import { hrefForLink, platformMeta } from '@/lib/socialPlatforms';
import type { CreditedPerson, CreditWork } from '@/types';

/**
 * The cards on the credits page.
 *
 * Built from the same parts the committee chart uses — MemberAvatar for a true-circle portrait
 * with the gendered placeholder, and the platform registry for link icons — so a person looks the
 * same here as they do on /about/hierarchy, and a new platform added there shows up here too.
 */

/** A person's links, as a row of icon buttons. Renders nothing when there are none. */
export function ProfileLinks({
  person,
  size = 'md',
  align = 'center',
}: {
  person: CreditedPerson;
  size?: 'sm' | 'md';
  /** 'responsive' centres on phones and left-aligns from `sm`, matching the founder card. */
  align?: 'center' | 'start' | 'responsive';
}) {
  if (person.links.length === 0) return null;

  const justify =
    align === 'center' ? 'justify-center' : align === 'start' ? 'justify-start' : 'justify-center sm:justify-start';

  const box = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const glyph = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <ul
      className={`flex flex-wrap items-center gap-1.5 ${justify}`}
      aria-label={`${person.name}'s links`}
    >
      {person.links.map((link, index) => {
        const { label, Icon } = platformMeta(link.type);
        const name = link.label || label;
        const href = hrefForLink(link.type, link.url);
        // A link whose address normalised to nothing is not a link; skip it rather than render a
        // button that goes nowhere.
        if (!href) return null;
        const external = href.startsWith('http');

        return (
          <li key={`${link.type}-${index}`}>
            <a
              href={href}
              // mailto: must not open a tab; an http link should not navigate the credits away.
              target={external ? '_blank' : undefined}
              rel={external ? 'noopener noreferrer' : undefined}
              aria-label={`${person.name} on ${name}`}
              title={name}
              data-cursor="link"
              className={`${box} flex items-center justify-center rounded-full border border-black/10 bg-white text-slate-500 transition hover:-translate-y-0.5 hover:border-ieee-orange/50 hover:text-ieee-orange`}
            >
              <Icon className={glyph} />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * "Operations Manager IEEE CS CUI" — or nothing, never a placeholder like "Contributor".
 *
 * Size is a prop rather than something passed in className: `text-sm` here plus a caller's
 * `text-xs` would both be on the element, and which one wins comes down to stylesheet order
 * rather than to what the caller asked for.
 */
function Designation({
  person,
  small = false,
  className = '',
}: {
  person: CreditedPerson;
  small?: boolean;
  className?: string;
}) {
  const text = person.designation.trim();
  if (!text) return null;
  return (
    // overflow-wrap:anywhere, not break-words: break-words does not lower the min-content width,
    // so inside the two-column brainstormer grid a long unbroken designation still pushed the card
    // wider than its column and off the side of a phone.
    <p className={`${small ? 'text-xs' : 'text-sm'} font-medium text-ieee-orange-dark [overflow-wrap:anywhere] ${className}`}>
      {text}
    </p>
  );
}

/** The heading over each of the three sections. */
export function CreditSectionHeader({
  id,
  index,
  title,
  description,
}: {
  /** Put on the heading itself, so a section's aria-labelledby names it by its title alone. */
  id: string;
  index: string;
  title: string;
  description: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-2 sm:mb-10">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-ieee-orange">
        {index}
      </span>
      <h2 id={id} className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">
        {title}
      </h2>
      <p className="max-w-2xl text-sm leading-relaxed text-slate-600">{description}</p>
    </div>
  );
}

/** Section 1 — one person, given the width of the page. */
export function FounderCard({ person }: { person: CreditedPerson }) {
  return (
    <article className="relative overflow-hidden rounded-3xl border border-ieee-orange/20 bg-white p-6 shadow-sm sm:p-8">
      {/* A wash of the brand colour behind the portrait, so the one card in this section reads as
          the headline it is without needing a louder layout. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-ieee-orange/10 blur-3xl"
      />

      <div className="relative flex flex-col items-center gap-6 text-center sm:flex-row sm:items-center sm:gap-8 sm:text-left">
        <MemberAvatar
          src={person.photoUrl}
          alt={person.name}
          gender={person.gender}
          eager
          size="h-36 w-36 sm:h-44 sm:w-44"
          className="ring-4 ring-ieee-orange/30 ring-offset-4 ring-offset-white"
        />

        <div className="flex min-w-0 flex-col items-center gap-2 sm:items-start">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ieee-orange px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-white">
            <Crown aria-hidden="true" className="h-3 w-3" /> Founder
          </span>
          <h3 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">{person.name}</h3>
          <Designation person={person} />
          <div className="mt-2">
            <ProfileLinks person={person} align="responsive" />
          </div>
        </div>
      </div>
    </article>
  );
}

function WorkList({ work }: { work: CreditWork[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {work.map((item) => (
        <li key={item.title} className="flex gap-2.5">
          <span aria-hidden="true" className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-ieee-orange" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug text-slate-800">{item.title}</p>
            {item.detail && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{item.detail}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Section 2 — a developer and what they built. */
export function DeveloperCreditCard({ person, work }: { person: CreditedPerson; work: CreditWork[] }) {
  return (
    <article className="flex h-full flex-col rounded-3xl border border-black/5 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-ieee-orange/30 hover:shadow-lg">
      <div className="flex flex-col items-center gap-3 text-center">
        <MemberAvatar
          src={person.photoUrl}
          alt={person.name}
          gender={person.gender}
          size="h-28 w-28"
          className="ring-2 ring-ieee-orange/40 ring-offset-2 ring-offset-white"
        />
        <div>
          <h3 className="font-display text-lg font-bold text-slate-900">{person.name}</h3>
          <Designation person={person} className="mt-0.5" />
        </div>
        <ProfileLinks person={person} />
      </div>

      <div className="mt-5 border-t border-black/5 pt-5">
        <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          Work done
        </p>
        <WorkList work={work} />
      </div>
    </article>
  );
}

/** Section 3 — a compact card, because this section holds everyone. */
export function BrainstormerCard({ person }: { person: CreditedPerson }) {
  return (
    <article className="flex h-full flex-col items-center gap-2.5 rounded-2xl border border-black/5 bg-white p-4 text-center shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-ieee-orange/30 hover:shadow-md">
      <MemberAvatar
        src={person.photoUrl}
        alt={person.name}
        gender={person.gender}
        size="h-20 w-20"
        className="ring-2 ring-ieee-orange/30"
      />
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">{person.name}</h3>
        <Designation person={person} small className="mt-0.5" />
      </div>
      <div className="mt-auto">
        <ProfileLinks person={person} size="sm" />
      </div>
    </article>
  );
}
