import { useState } from 'react';
import { Plus, ArrowUp, ArrowDown, Trash2, GripVertical, Info, Check, Loader2 } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import NavbarPreview from '@/components/admin/NavbarPreview';
import { AdminField, AdminInput } from '@/components/admin/AdminField';
import { useNavLinks } from '@/hooks/useNavLinks';
import { makeId } from '@/utils/storage';

/**
 * What the admin typed, as the router will actually read it. A bare "events" is a relative
 * path React Router would resolve against whatever page the visitor is on, so anything that is
 * not an absolute URL is anchored at the site root.
 */
const normalisePath = (raw: string) => {
  const to = raw.trim();
  if (!to) return '';
  return /^https?:\/\//i.test(to) ? to : `/${to.replace(/^\/+/, '')}`;
};

export default function AdminNavbarPage() {
  const { items, loaded, update, setAll, add, remove, error: navbarError, saving, dirty, saveChanges, reload } =
    useNavLinks(true);
  const [draft, setDraft] = useState({ label: '', to: '' });
  const [formError, setFormError] = useState<string | null>(null);

  const enabled = items.filter((l) => l.enabled);

  const move = (id: string, dir: -1 | 1) => {
    if (!loaded) return;
    const i = items.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setAll(next);
  };

  /**
   * Said here rather than left to the database, which has no CHECK on nav_links at all and
   * would take "Home " twice or a path with a space in it without complaint — and then serve
   * both to every visitor.
   */
  const validate = (): string | null => {
    if (!loaded) return 'The navbar has not been read yet, so it cannot be edited.';

    const label = draft.label.trim();
    const to = normalisePath(draft.to);

    if (!label) return 'Give the link a label — it is the word visitors will see.';
    if (!draft.to.trim()) return 'Add the path the link points to, such as /events.';
    if (/\s/.test(to)) return 'A path cannot contain spaces. Try /projects-expo rather than /projects expo.';
    if (to === '/') {
      // The logo already goes home, so a second one is a link nobody needs and a duplicate
      // the check below would not catch if the labels differ.
      if (items.some((l) => l.to === '/')) return 'The navbar already has a link to the home page.';
    }
    if (items.some((l) => l.label.trim().toLowerCase() === label.toLowerCase())) {
      return `The navbar already has a link labelled "${label}". Two identical labels give visitors no way to tell them apart.`;
    }
    if (items.some((l) => l.to === to)) {
      const existing = items.find((l) => l.to === to);
      return `"${existing?.label}" already points at ${to}.`;
    }
    return null;
  };

  const addLink = () => {
    const problem = validate();
    setFormError(problem);
    if (problem) return;

    add({ id: makeId('nl'), label: draft.label.trim(), to: normalisePath(draft.to), enabled: true });
    setDraft({ label: '', to: '' });
  };

  return (
    <div>
      <AdminTopbar title="Navbar" subtitle="Choose which links show in the site navbar, and their order" />
      <div className="p-4 sm:p-6">
        {navbarError && (
          <p className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
            {navbarError}
          </p>
        )}

        {/* Editing what was never read would save this page's idea of the navbar over the real
            one, so until a read succeeds there is nothing here to edit. */}
        {!loaded && !navbarError && (
          <p className="mb-4 rounded-xl border border-black/5 bg-white px-4 py-3 text-sm text-slate-500">
            Loading the navbar…
          </p>
        )}

        {/* Live replica */}
        <NavbarPreview links={enabled} />

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* Link manager */}
          <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">Navbar Links</h3>
              <span className="font-mono text-[11px] text-slate-400">{enabled.length} shown</span>
            </div>
            <p className="mb-4 flex items-start gap-2 rounded-xl bg-cream/70 px-3 py-2 text-xs text-slate-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ieee-orange" />
              Toggle links on and off and reorder them with the arrows, then press Save. Nothing
              reaches the live navbar until you do — enable "Date Sheets" near exams, or a
              registration link during an event.
            </p>

            {/*
              An explicit save, rather than a write behind every click.
              
              Edits used to save themselves on a short debounce, which made "has this actually
              landed" impossible to answer from the screen -- and when a bug stopped the writes
              going out, the only symptom was a toggle flipping back seconds later, long after
              the click. A bar that appears when there is something to save, and goes when there
              is not, makes the state something you can read.
            */}
            {dirty && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ieee-orange/30 bg-ieee-orange/[0.06] px-3 py-2.5">
                <span className="text-xs font-medium text-slate-700">
                  Unsaved changes — the live navbar still shows the previous version.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void reload()}
                    disabled={saving}
                    className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 disabled:opacity-50"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveChanges()}
                    disabled={saving}
                    className="flex items-center gap-1.5 rounded-lg bg-ieee-orange px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark disabled:opacity-70"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
            )}

            <ul className="flex flex-col gap-2">
              {items.map((l, i) => (
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

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => move(l.id, -1)}
                      disabled={i === 0}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/5 text-slate-500 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => move(l.id, 1)}
                      disabled={i === items.length - 1}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/5 text-slate-500 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>

                    {/* toggle */}
                    <button
                      onClick={() => update(l.id, { enabled: !l.enabled })}
                      className={`relative ml-1 h-6 w-11 shrink-0 rounded-full transition-colors ${
                        l.enabled ? 'bg-ieee-orange' : 'bg-slate-300'
                      }`}
                      aria-label={l.enabled ? 'Hide from navbar' : 'Show in navbar'}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                          l.enabled ? 'left-[22px]' : 'left-0.5'
                        }`}
                      />
                    </button>

                    <button
                      onClick={() => remove(l.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/5 text-slate-400 transition hover:border-rose-300 hover:text-rose-600"
                      aria-label="Delete link"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Add link */}
          <div className="h-max rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
            <h3 className="font-display text-base font-bold text-slate-900">Add a Link</h3>
            <p className="mt-1 text-xs text-slate-500">Point it at any page on the site.</p>
            <div className="mt-4 flex flex-col gap-3">
              <AdminField label="Label" required>
                <AdminInput
                  value={draft.label}
                  onChange={(e) => {
                    setDraft({ ...draft, label: e.target.value });
                    setFormError(null);
                  }}
                  placeholder="Registrations"
                />
              </AdminField>
              <AdminField label="Path" required hint="A page on this site, e.g. /events or /forms/123. A full https:// address works too.">
                <AdminInput
                  value={draft.to}
                  onChange={(e) => {
                    setDraft({ ...draft, to: e.target.value });
                    setFormError(null);
                  }}
                  placeholder="/events"
                />
              </AdminField>
              {formError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{formError}</p>}
              <button
                onClick={addLink}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
              >
                <Plus className="h-4 w-4" /> Add to Navbar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
