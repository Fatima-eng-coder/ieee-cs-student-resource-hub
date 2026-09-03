import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Info, Loader2, Lock, Plus, Trash2 } from 'lucide-react';

import { AdminField, AdminInput } from '@/components/admin/AdminField';
import { hrefForLink, platformMeta } from '@/lib/socialPlatforms';
import {
  SOCIAL_PLATFORMS,
  socialLinksService,
  type SocialLink,
  type SocialPlatform,
} from '@/services/siteContentService';

/**
 * The chapter's social accounts, as shown at the top left of the public footer.
 *
 * Its own card rather than more rows in the footer-links list: a footer link is a label and a
 * path inside one of three columns, a social account is a platform and a profile URL that draws
 * as an icon. They share a page because they share a corner of the footer, nothing more.
 *
 * One row per platform is a database constraint, not a rule invented here — see
 * social_links_platform_key. The picker below hides platforms already taken, so an admin cannot
 * walk into that refusal in the first place.
 */
export default function SocialLinksManager({ canManage }: { canManage: boolean }) {
  const [links, setLinks] = useState<SocialLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ platform: SocialPlatform; url: string; label: string }>({
    platform: 'instagram',
    url: '',
    label: '',
  });

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setLinks(await socialLinksService.list());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load the social links.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const taken = new Set(links.map((link) => link.platform));
  const available = SOCIAL_PLATFORMS.filter((platform) => !taken.has(platform));

  /**
   * Keeps the picker on a platform that is still free. Without this the select shows the first
   * free option while `draft.platform` still holds the one just used, and the add is refused
   * with a duplicate error naming a platform the admin never chose.
   */
  useEffect(() => {
    if (available.length > 0 && !available.includes(draft.platform)) {
      setDraft((current) => ({ ...current, platform: available[0] }));
    }
  }, [available, draft.platform]);

  const move = async (link: SocialLink, direction: -1 | 1) => {
    setBusyId(link.id);
    setError(null);
    try {
      setLinks(await socialLinksService.move(links, link.id, direction));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder the social links.');
    } finally {
      setBusyId(null);
    }
  };

  const toggle = async (link: SocialLink) => {
    setBusyId(link.id);
    setError(null);
    try {
      const updated = await socialLinksService.update(link.id, { ...link, isPublished: !link.isPublished });
      setLinks((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update the link.');
    } finally {
      setBusyId(null);
    }
  };

  const removeLink = async (link: SocialLink) => {
    setBusyId(link.id);
    setError(null);
    try {
      await socialLinksService.remove(link.id);
      setLinks((items) => items.filter((item) => item.id !== link.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete the link.');
    } finally {
      setBusyId(null);
    }
  };

  const add = async () => {
    setJustAdded(null);
    if (!draft.url.trim()) {
      setFormError('Add the address of the chapter profile, such as instagram.com/ieeecs.cui.');
      return;
    }
    setFormError(null);
    setAdding(true);
    try {
      const created = await socialLinksService.create({
        platform: draft.platform,
        url: draft.url.trim(),
        label: draft.label.trim(),
        isPublished: true,
      });
      setLinks((items) => [...items, created]);
      setJustAdded(created.label || platformMeta(created.platform).label);
      setDraft({ platform: draft.platform, url: '', label: '' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add the link.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-base font-bold text-slate-900">Social Accounts</h3>
        <span className="font-mono text-[11px] text-slate-400">
          {links.filter((link) => link.isPublished).length} shown
        </span>
      </div>

      <p className="mb-4 flex items-start gap-2 rounded-xl bg-cream/70 px-3 py-2 text-xs text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ieee-orange" />
        {canManage
          ? 'These are the round icons beside the chapter description in the footer. Paste the address of the chapter’s own profile — typing the bare handle or the site on its own is fine, the https:// is added for you.'
          : 'Only content managers can change these. You can see the current accounts here.'}
      </p>

      {error && (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{error}</p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 px-1 py-3 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading social accounts…
        </p>
      ) : loadError ? (
        /* Not an empty list. "No accounts yet" beside an Add form invites somebody to add a
           second Instagram row on top of the one the read failed to show. */
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-700">
          <p className="font-medium">{loadError}</p>
          <button
            onClick={() => void load()}
            className="mt-2 rounded-lg border border-rose-300 px-2.5 py-1 font-semibold transition hover:bg-white"
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {links.map((link, index) => {
              const { label, Icon } = platformMeta(link.platform);
              return (
                <li
                  key={link.id}
                  className={`flex items-center gap-2.5 rounded-xl border p-2.5 transition ${
                    link.isPublished ? 'border-ieee-orange/30 bg-ieee-orange/[0.04]' : 'border-black/5 bg-white'
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                      link.isPublished ? 'border-ieee-orange/30 text-ieee-orange' : 'border-black/10 text-slate-400'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm font-semibold ${
                        link.isPublished ? 'text-slate-900' : 'text-slate-500'
                      }`}
                    >
                      {link.label || label}
                    </p>
                    <p className="truncate font-mono text-[11px] text-slate-400">
                      {hrefForLink(link.platform, link.url)}
                    </p>
                  </div>

                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => void move(link, -1)}
                        disabled={index === 0 || busyId === link.id}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/5 text-slate-500 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:opacity-30"
                        aria-label={`Move ${link.label || label} up`}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => void move(link, 1)}
                        disabled={index === links.length - 1 || busyId === link.id}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/5 text-slate-500 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:opacity-30"
                        aria-label={`Move ${link.label || label} down`}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => void toggle(link)}
                        disabled={busyId === link.id}
                        className={`relative ml-1 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                          link.isPublished ? 'bg-ieee-orange' : 'bg-slate-300'
                        }`}
                        aria-label={link.isPublished ? 'Hide from footer' : 'Show in footer'}
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                            link.isPublished ? 'left-[22px]' : 'left-0.5'
                          }`}
                        />
                      </button>
                      <button
                        onClick={() => void removeLink(link)}
                        disabled={busyId === link.id}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/5 text-slate-400 transition hover:border-rose-300 hover:text-rose-600 disabled:opacity-30"
                        aria-label={`Delete ${link.label || label}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
            {links.length === 0 && (
              <li className="rounded-xl border border-dashed border-black/10 px-3 py-2 text-xs italic text-slate-400">
                No social accounts yet. The footer shows no icons until one is added.
              </li>
            )}
          </ul>

          {!canManage ? (
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-black/5 px-3 py-2 text-xs text-slate-500">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              Only a content manager can add or change these.
            </p>
          ) : available.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-black/10 px-3 py-2 text-xs text-slate-500">
              Every platform already has a link. Edit or remove one above to change it.
            </p>
          ) : (
            <form
              className="mt-4 grid gap-3 border-t border-black/5 pt-4 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                void add();
              }}
            >
              <AdminField label="Platform" required>
                <select
                  value={draft.platform}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, platform: event.target.value as SocialPlatform }));
                    setFormError(null);
                    setJustAdded(null);
                  }}
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-ieee-orange/60"
                >
                  {available.map((platform) => (
                    <option key={platform} value={platform}>
                      {platformMeta(platform).label}
                    </option>
                  ))}
                </select>
              </AdminField>

              <AdminField
                label="Address"
                required
                hint={
                  draft.platform === 'email'
                    ? 'An address, e.g. ieeecs@comsats.edu.pk'
                    : 'e.g. instagram.com/ieeecs.cui'
                }
              >
                <AdminInput
                  value={draft.url}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, url: event.target.value }));
                    setFormError(null);
                    setJustAdded(null);
                  }}
                  placeholder={draft.platform === 'email' ? 'ieeecs@comsats.edu.pk' : 'instagram.com/ieeecs.cui'}
                />
              </AdminField>

              <div className="sm:col-span-2">
                <AdminField
                  label="Label"
                  hint="Optional. Read out by screen readers and shown on hover; leave blank to use the platform name."
                >
                  <AdminInput
                    value={draft.label}
                    onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
                    placeholder={platformMeta(draft.platform).label}
                  />
                </AdminField>
              </div>

              {formError && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 sm:col-span-2">
                  {formError}
                </p>
              )}
              {justAdded && (
                <p className="flex items-start gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 sm:col-span-2">
                  <Check className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>{justAdded} added to the footer.</span>
                </p>
              )}

              <button
                type="submit"
                disabled={adding}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark disabled:opacity-70 sm:col-span-2"
              >
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add Social Account
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
