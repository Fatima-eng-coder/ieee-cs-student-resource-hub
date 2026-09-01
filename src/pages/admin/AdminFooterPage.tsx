import { useEffect, useState } from 'react';
import { Plus, ArrowUp, ArrowDown, Trash2, GripVertical, Info, Loader2 } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import FooterPreview from '@/components/admin/FooterPreview';
import { AdminField, AdminInput } from '@/components/admin/AdminField';
import EmptyState from '@/components/ui/EmptyState';
import { adminAuthService } from '@/services/adminAuthService';
import { footerLinksService, sortFooterLinks, type AdminFooterLink } from '@/services/siteContentService';
import { footerColumns } from '@/data/footerLinks';
import type { FooterColumn } from '@/types';

export default function AdminFooterPage() {
  const [links, setLinks] = useState<AdminFooterLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
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

  const addLink = async () => {
    setAdding(true);
    setError(null);
    try {
      const to = draft.to.trim();
      const created = await footerLinksService.create({
        label: draft.label,
        // A bare "about" is a relative path the router would resolve against whatever page the
        // visitor is on, so anything that is not an absolute URL is anchored at the site root.
        to: to && !to.startsWith('/') && !to.startsWith('http') ? `/${to}` : to,
        column: draft.column,
        enabled: true,
      });
      setLinks((items) => sortFooterLinks([...items, created]));
      setDraft({ label: '', to: '', column: draft.column });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add the link.');
    } finally {
      setAdding(false);
    }
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
                        <h4 className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          {col}
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

              {/* Add link */}
              {canManage && (
                <div className="h-max rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
                  <h3 className="font-display text-base font-bold text-slate-900">Add a Link</h3>
                  <p className="mt-1 text-xs text-slate-500">Point it at any page and pick a column.</p>
                  <div className="mt-4 flex flex-col gap-3">
                    <AdminField label="Label">
                      <AdminInput
                        value={draft.label}
                        onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                        placeholder="Alumni"
                      />
                    </AdminField>
                    <AdminField label="Path" hint="e.g. /about or /forms/123">
                      <AdminInput value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} placeholder="/about" />
                    </AdminField>
                    <AdminField label="Column">
                      <select
                        value={draft.column}
                        onChange={(e) => setDraft({ ...draft, column: e.target.value as FooterColumn })}
                        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-ieee-orange/60"
                      >
                        {footerColumns.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    </AdminField>
                    <button
                      onClick={() => void addLink()}
                      disabled={adding}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark disabled:opacity-70"
                    >
                      {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add to Footer
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
