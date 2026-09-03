import { Plus, Trash2 } from 'lucide-react';

import { hrefForLink, platformMeta } from '@/lib/socialPlatforms';
import { MEMBER_LINK_TYPES, type MemberLink, type MemberLinkType } from '@/types';

/**
 * The links on one member's card.
 *
 * Replaces the two fixed fields this drawer used to have, Email and LinkedIn, whose hint read
 * "shown to nobody yet" — accurate at the time, and the reason anything typed into them went
 * into the database and was seen by no one. Both now render on the public cards, and a member
 * can carry a portfolio and a GitHub beside them.
 *
 * Eight is the table's ceiling (hierarchy_members_links_check), repeated here so the Add button
 * stops rather than the save failing on a constraint nobody has heard of.
 */
const MAX_LINKS = 8;

export default function MemberLinksEditor({
  links,
  onChange,
}: {
  links: MemberLink[];
  onChange: (links: MemberLink[]) => void;
}) {
  const update = (index: number, patch: Partial<MemberLink>) =>
    onChange(links.map((link, i) => (i === index ? { ...link, ...patch } : link)));

  const remove = (index: number) => onChange(links.filter((_, i) => i !== index));

  const add = () => onChange([...links, { type: 'portfolio', label: '', url: '' }]);

  return (
    <div className="sm:col-span-2">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-slate-700">Links</span>
        <span className="font-mono text-[11px] text-slate-400">
          {links.length}/{MAX_LINKS}
        </span>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Shown as small icons on this member’s card, in the order below. Type the address however
        you have it — <span className="font-mono">github.com/name</span> works, the
        <span className="font-mono"> https://</span> is added for you.
      </p>

      <div className="flex flex-col gap-2">
        {links.map((link, index) => {
          const href = hrefForLink(link.type, link.url);
          const { Icon, label } = platformMeta(link.type);

          return (
            <div
              key={index}
              className="rounded-xl border border-black/10 bg-white p-2.5"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/10 text-slate-500">
                  <Icon className="h-4 w-4" />
                </span>

                <select
                  value={link.type}
                  onChange={(event) => update(index, { type: event.target.value as MemberLinkType })}
                  aria-label={`Link ${index + 1} type`}
                  className="w-32 shrink-0 rounded-lg border border-black/10 bg-white px-2 py-2 text-sm text-slate-900 outline-none transition focus:border-ieee-orange/60"
                >
                  {MEMBER_LINK_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {platformMeta(type).label}
                    </option>
                  ))}
                </select>

                <input
                  value={link.url}
                  onChange={(event) => update(index, { url: event.target.value })}
                  aria-label={`Link ${index + 1} address`}
                  placeholder={link.type === 'email' ? 'name@comsats.edu.pk' : 'github.com/name'}
                  className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-ieee-orange/60"
                />

                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label={`Remove link ${index + 1}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/5 text-slate-400 transition hover:border-rose-300 hover:text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mt-2 flex items-center gap-2 pl-10">
                <input
                  value={link.label}
                  onChange={(event) => update(index, { label: event.target.value })}
                  aria-label={`Link ${index + 1} label`}
                  placeholder={`Label (optional, defaults to "${label}")`}
                  className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none transition focus:border-ieee-orange/60"
                />
              </div>

              {/* What the icon will actually point at, once the address has been normalised.
                  A typo is far easier to see here than by clicking it on the live page. */}
              {href && (
                <p className="mt-1.5 truncate pl-10 font-mono text-[11px] text-slate-400" title={href}>
                  {href}
                </p>
              )}
            </div>
          );
        })}

        {links.length === 0 && (
          <p className="rounded-xl border border-dashed border-black/10 px-3 py-2 text-xs italic text-slate-400">
            No links yet. This member’s card shows their photo, name and role only.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={add}
        disabled={links.length >= MAX_LINKS}
        className="mt-2.5 flex items-center gap-1.5 rounded-xl border border-ieee-orange/30 px-3 py-2 text-sm font-semibold text-ieee-orange transition hover:bg-ieee-orange/5 disabled:opacity-40"
      >
        <Plus className="h-4 w-4" /> Add a link
      </button>
      {links.length >= MAX_LINKS && (
        <p className="mt-1.5 text-[11px] text-slate-400">
          Eight links is the most a member card can hold.
        </p>
      )}
    </div>
  );
}
