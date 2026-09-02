import { useEffect, useState } from 'react';
import { Plus, ArrowUp, ArrowDown, Trash2, GripVertical, Info, Loader2, Check, Lock } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import FooterPreview from '@/components/admin/FooterPreview';
import { AdminField, AdminInput } from '@/components/admin/AdminField';
import EmptyState from '@/components/ui/EmptyState';
import { adminAuthService } from '@/services/adminAuthService';
import { footerLinksService, sortFooterLinks, type AdminFooterLink } from '@/services/siteContentService';
import { footerColumns } from '@/data/footerLinks';
import type { FooterColumn } from '@/types';

/**
 * What the admin typed, as the router will actually read it. A bare "about" is a relative path
 * React Router would resolve against whatever page the visitor is on, so anything that is not
 * an absolute URL is anchored at the site root.
 */
const normalisePath = (raw: string) => {
  const to = raw.trim();
  if (!to) return '';
  return /^https?:\/\//i.test(to) ? to : `/${to.replace(/^\/+/, '')}`;
};

export default function AdminFooterPage() {
  const [links, setLinks] = useState<AdminFooterLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  /**
   * The add form's own problems and its own confirmation. The page banner is at the very top
   * and the form is at the very bottom of a fifteen-link list on anything narrower than a
   * desktop, so "Please enter the link label." was being announced entirely off screen — the
   * button looked like it did nothing at all.
   */
  const [formError, setFormError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<{ label: string; column: FooterColumn } | null>(null);
  const [draft, setDraft] = useState<{ label: string; to: string; column: FooterColumn }>({
    label: '',
    to: '',
    column: 'Explore',
  });
  const canManage = adminAuthService.canManageContent();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setLinks(await footerLinksService.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the footer links.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const enabled = links.filter((l) => l.enabled);

  /** Reorder a link within its own column — the only place two footer links are seen together. */
  const move = async (link: AdminFooterLink, direction: -1 | 1) => {
    setBusyId(link.id);
    setError(null);
    try {
      setLinks(await footerLinksService.move(links, link.id, direction));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder the footer.');
    } finally {
      setBusyId(null);
    }
  };

  const toggle = async (link: AdminFooterLink) => {
    setBusyId(link.id);
    setError(null);
    try {
      const updated = await footerLinksService.update(link.id, { ...link, enabled: !link.enabled });
      setLinks((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update the link.');
    } finally {
      setBusyId(null);
    }
  };

  const removeLink = async (link: AdminFooterLink) => {
    setBusyId(link.id);
    setError(null);
    try {
      await footerLinksService.remove(link.id);
      setLinks((items) => items.filter((item) => item.id !== link.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete the link.');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Said here rather than left to the database. footer_links only refuses a blank label, a
   * blank path and a column outside the three — it would take "About Us" twice in the same
   * column, or a path with a space in it, and put both in front of every visitor. Duplicates
   * are judged within a column because a column is the only place two of these links are ever
   * seen next to each other.
   */
  const validate = (): string | null => {
    const label = draft.label.trim();
    const to = normalisePath(draft.to);
    const column = links.filter((l) => l.column === draft.column);

    if (!label) return 'Give the link a label — it is the word visitors will see in the footer.';
    if (!draft.to.trim()) return 'Add the path the link points to, such as /about.';
    if (/\s/.test(to)) return 'A path cannot contain spaces. Try /quick-links rather than /quick links.';
    if (column.some((l) => l.label.trim().toLowerCase() === label.toLowerCase())) {
      return `The ${draft.column} column already has a link labelled "${label}".`;
    }
    const clash = column.find((l) => l.to === to);
    if (clash) return `"${clash.label}" in the ${draft.column} column already points at ${to}.`;
    return null;
  };

  const addLink = async () => {
    setJustAdded(null);
    const problem = validate();
    setFormError(problem);
    if (problem) return;

    setAdding(true);
    setError(null);
    try {
      const created = await footerLinksService.create({
        label: draft.label.trim(),
        to: normalisePath(draft.to),
        column: draft.column,
        enabled: true,
      });
      setLinks((items) => sortFooterLinks([...items, created]));
      // A new link lands at the bottom of its column, which on a narrow screen is well above
      // the form. Naming the column is what tells the admin the click did anything.
      setJustAdded({ label: created.label, column: created.column });
      setDraft({ label: '', to: '', column: draft.column });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add the link.');
    } finally {
      setAdding(false);
    }
  };

  const editDraft = (patch: Partial<typeof draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setFormError(null);
    setJustAdded(null);
  };

  return (
    <div>
      <AdminTopbar title="Footer" subtitle="Choose which links show in each footer column, and their order" />
      <div className="p-4 sm:p-6">
        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <EmptyState title="Loading footer links" description="Fetching the links the public footer renders." />
        ) : (
          <>
            {/* Live replica */}
            <FooterPreview links={enabled} />

            <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              {/* Link manager, grouped by column */}
              <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-display text-base font-bold text-slate-900">Footer Links</h3>
                  <span className="font-mono text-[11px] text-slate-400">{enabled.length} shown</span>
                </div>
                <p className="mb-4 flex items-start gap-2 rounded-xl bg-cream/70 px-3 py-2 text-xs text-slate-500">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ieee-orange" />
                  {canManage
                    ? 'Toggle links on/off and reorder them within a column with the arrows. Every change is saved to the database, and visitors see it the next time they load a page.'
                    : 'Only content managers can change the footer. You can see the current links here.'}
                </p>

                <div className="flex flex-col gap-5">
                  {footerColumns.map((col) => {
                    const colLinks = links.filter((l) => l.column === col);
                    return (
                      <div key={col}>
                        <h4 className="mb-2 flex items-center justify-between gap-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          {col}
                          <span className="font-sans normal-case tracking-normal text-slate-400">
                            {colLinks.filter((l) => l.enabled).length} of {colLinks.length} shown
                          </span>
                        </h4>
                        <ul className="flex flex-col gap-2">
                          {colLinks.map((l, i) => (
                            <li
                              key={l.id}
                              className={`flex items-center gap-2 rounded-xl border p-2.5 transition ${
                                l.enabled ? 'border-ieee-orange/30 bg-ieee-orange/[0.04]' : 'border-black/5 bg-white'
                              }`}
                            >
                              <GripVertical className="h-4 w-4 shrink-0 text-slate-300" />
                              <div className="min-w-0 flex-1">
                                <p className={`truncate text-sm font-semibold ${l.enabled ? 'text-slate-900' : 'text-slate-500'}`}>
                                  {l.label}
                                </p>
                                <p className="truncate font-mono text-[11px] text-slate-400">{l.to}</p>
                              </div>

                              {canManage && (
                                <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    onClick={() => void move(l, -1)}
                                    disabled={i === 0 || busyId === l.id}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/5 text-slate-500 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:opacity-30"
                                    aria-label="Move up"
                                  >
                                    <ArrowUp className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => void move(l, 1)}
                                    disabled={i === colLinks.length - 1 || busyId === l.id}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/5 text-slate-500 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:opacity-30"
                                    aria-label="Move down"
                                  >
                                    <ArrowDown className="h-3.5 w-3.5" />
                                  </button>

                                  {/* toggle */}
                                  <button
                                    onClick={() => void toggle(l)}
                                    disabled={busyId === l.id}
                                    className={`relative ml-1 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                                      l.enabled ? 'bg-ieee-orange' : 'bg-slate-300'
                                    }`}
                                    aria-label={l.enabled ? 'Hide from footer' : 'Show in footer'}
                                  >
                                    <span
                                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                                        l.enabled ? 'left-[22px]' : 'left-0.5'
                                      }`}
                                    />
                                  </button>

                                  <button
                                    onClick={() => void removeLink(l)}
                                    disabled={busyId === l.id}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/5 text-slate-400 transition hover:border-rose-300 hover:text-rose-600 disabled:opacity-30"
                                    aria-label="Delete link"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </li>
                          ))}
                          {colLinks.length === 0 && (
                            <li className="rounded-xl border border-dashed border-black/10 px-3 py-2 text-xs italic text-slate-400">
                              No links in this column yet.
                            </li>
                          )}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/*
                First in the stack, second in the desktop grid. Below `lg` the two cards sit one
                above the other, and the list above this one runs to fifteen links under three
                headings — long enough that the only way to find "Add a Link" was to already
                know it was down there.
              */}
              {canManage ? (
                <div className="order-first h-max rounded-2xl border border-ieee-orange/25 bg-white p-4 shadow-sm sm:p-5 lg:order-none">
                  <h3 className="font-display text-base font-bold text-slate-900">Add a Link</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Point it at any page on the site and choose which of the three footer columns it
                    belongs under. New links go to the bottom of that column, switched on.
                  </p>
                  <form
                    className="mt-4 flex flex-col gap-3"
                    onSubmit={(e) => {
                      // Without this the form is keyboard-dead: typing a label and pressing
                      // Enter reloads the page instead of adding the link.
                      e.preventDefault();
                      void addLink();
                    }}
                  >
                    <AdminField label="Label" required>
                      <AdminInput
                        value={draft.label}
                        onChange={(e) => editDraft({ label: e.target.value })}
                        placeholder="Alumni"
                      />
                    </AdminField>
                    <AdminField
                      label="Path"
                      required
                      hint="A page on this site, e.g. /about or /forms/123. A full https:// address works too."
                    >
                      <AdminInput
                        value={draft.to}
                        onChange={(e) => editDraft({ to: e.target.value })}
                        placeholder="/about"
                      />
                    </AdminField>
                    <AdminField label="Column" required hint="The public footer has these three columns and no others.">
                      <select
                        value={draft.column}
                        onChange={(e) => editDraft({ column: e.target.value as FooterColumn })}
                        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-ieee-orange/60"
                      >
                        {footerColumns.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    </AdminField>

                    {formError && (
                      <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{formError}</p>
                    )}
                    {justAdded && (
                      <p className="flex items-start gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                        <Check className="mt-px h-3.5 w-3.5 shrink-0" />
                        <span>
                          "{justAdded.label}" added to the bottom of the {justAdded.column} column.
                        </span>
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={adding}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark disabled:opacity-70"
                    >
                      {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add to Footer
                    </button>
                  </form>
                </div>
              ) : (
                /* Said where the form would have been. Left only to the grey note above the
                   list, "you cannot add links" reads as "there is no way to add links". */
                <div className="order-first h-max rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5 lg:order-none">
                  <h3 className="flex items-center gap-2 font-display text-base font-bold text-slate-900">
                    <Lock className="h-4 w-4 text-slate-400" /> Adding links is restricted
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    Footer links can only be added, edited or removed by a content manager — the
                    webmaster, chairperson, vice chairperson or general secretary. Your account can
                    see the footer here but not change it. Ask one of them to make the change, or to
                    update your role under Users.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
