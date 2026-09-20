import { useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import { AdminField, AdminInput, AdminTextarea } from '@/components/admin/AdminField';
import ConfirmModal from '@/components/ui/ConfirmModal';
import EmptyState from '@/components/ui/EmptyState';
import { adminAuthService } from '@/services/adminAuthService';
import { timelineService, type MilestoneInput } from '@/services/timelineService';
import type { TimelineEvent } from '@/types';
import {
  formatMilestoneDate,
  joinMilestoneDate,
  splitMilestoneDate,
  type MilestoneDateParts,
} from '@/utils/milestoneDate';

/**
 * The chapter timeline, editable.
 *
 * There are no reorder arrows here, unlike every other ordered list in this portal. The public
 * page is ordered by the dates things happened on, so a "move up" button would be offering to
 * put 2024 before 2023 — changing the date is the only thing that can move a milestone, and it
 * moves on its own once you do.
 */

const actionBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange';
const dangerBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600';

/** Today, in the local calendar. */
function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const emptyMilestone = (): TimelineEvent => ({
  id: '',
  date: todayIso(),
  precision: 'day',
  title: '',
  description: '',
});

const toInput = (draft: TimelineEvent): MilestoneInput => ({
  date: draft.date,
  precision: draft.precision,
  title: draft.title,
  description: draft.description,
});

/** Just the digits, so a pasted "Sep" or a stray dash never reaches the date. */
const digitsOnly = (value: string, max: number) => value.replace(/\D/g, '').slice(0, max);

/**
 * The date, in three boxes, because not every milestone is remembered to the day.
 *
 * A single date input cannot say "some time in 2019": it insists on a day, and whatever day it
 * was opened on then becomes part of the record. Here the month and the day are optional, and
 * what is left out is what the public page leaves out -- the year alone, the month and year, or
 * the whole date. The line under the boxes shows exactly what visitors will read, so the choice
 * is never guessed at from the empty fields.
 */
function MilestoneDateField({
  parts,
  onChange,
}: {
  parts: MilestoneDateParts;
  onChange: (parts: MilestoneDateParts) => void;
}) {
  const joined = joinMilestoneDate(parts);
  const yearTyped = parts.year.trim().length > 0;

  return (
    /* A fieldset, not AdminField: that renders a <label>, and the three boxes carry labels of
       their own — a label inside a label points at the wrong control and reads as one field. */
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-semibold text-slate-700">
        Date<span className="ml-0.5 text-ieee-orange">*</span>
      </legend>
      <p className="text-xs text-slate-400">
        The year is needed. Leave the month or day blank — or type 00 — when nobody is sure, and
        the page simply will not show that part.
      </p>
      <div className="mt-1 flex items-end gap-2">
        {[
          { key: 'year' as const, label: 'Year', placeholder: '2019', width: 'w-24', max: 4 },
          { key: 'month' as const, label: 'Month', placeholder: '00', width: 'w-20', max: 2 },
          { key: 'day' as const, label: 'Day', placeholder: '00', width: 'w-20', max: 2 },
        ].map(({ key, label, placeholder, width, max }) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-slate-400">{label}</span>
            <AdminInput
              className={width}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              aria-label={key === 'year' ? 'Year' : `${label} (optional)`}
              placeholder={placeholder}
              value={parts[key]}
              onChange={(e) => onChange({ ...parts, [key]: digitsOnly(e.target.value, max) })}
            />
          </label>
        ))}
      </div>

      <p
        className={`mt-2 text-xs ${joined ? 'text-slate-500' : yearTyped ? 'text-rose-600' : 'text-slate-400'}`}
        aria-live="polite"
      >
        {joined ? (
          <>
            Shown on the page as{' '}
            <span className="font-semibold text-slate-700">
              {formatMilestoneDate(joined.date, joined.precision)}
            </span>
            {joined.precision === 'year' && ' — year only.'}
            {joined.precision === 'month' && ' — month and year.'}
            {joined.precision === 'day' && ' — the full date.'}
          </>
        ) : yearTyped ? (
          'That is not a date yet. A four-digit year is needed; the month must be 1–12 and the day must exist in it.'
        ) : (
          'Enter the year this happened.'
        )}
      </p>
    </fieldset>
  );
}

export default function AdminTimelinePage() {
  const [milestones, setMilestones] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TimelineEvent | null>(null);
  /**
   * The three boxes as typed, kept beside the draft rather than derived from it.
   *
   * A half-typed year ("20") is not a date, so the draft cannot hold it — but the box has to,
   * or the admin's own keystrokes would be rewritten as they type. The draft is updated only
   * when what is in the boxes reads as a date.
   */
  const [dateParts, setDateParts] = useState<MilestoneDateParts>({ year: '', month: '', day: '' });
  const [isNew, setIsNew] = useState(false);
  const [deleting, setDeleting] = useState<TimelineEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const canManage = adminAuthService.canManageContent();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setMilestones(await timelineService.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the timeline.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  /**
   * Re-sorted after every write rather than appended, because the date decides where a milestone
   * belongs. Something added today can be dated 2019 and has to drop into 2019 straight away —
   * otherwise the table an admin is looking at disagrees with the page they just changed.
   */
  const sorted = (items: TimelineEvent[]) =>
    [...items].sort((a, b) => a.date.localeCompare(b.date));

  const openDraft = (milestone: TimelineEvent, fresh: boolean) => {
    setDraft(milestone);
    setDateParts(splitMilestoneDate(milestone.date, milestone.precision));
    setIsNew(fresh);
  };

  const save = async () => {
    if (!draft) return;

    // What is in the boxes wins over the draft: the draft only moves when the boxes read as a
    // date, so anything unfinished is caught here rather than saved as the last good value.
    const joined = joinMilestoneDate(dateParts);
    if (!joined) {
      setError('Please check the date. A year is needed; month and day can be left blank or 00.');
      return;
    }
    const dated: TimelineEvent = { ...draft, ...joined };

    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const created = await timelineService.create(toInput(dated));
        setMilestones((items) => sorted([...items, created]));
      } else {
        const updated = await timelineService.update(dated.id, toInput(dated));
        setMilestones((items) => sorted(items.map((item) => (item.id === updated.id ? updated : item))));
      }
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the milestone.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    setError(null);
    try {
      await timelineService.remove(deleting.id);
      setMilestones((items) => items.filter((item) => item.id !== deleting.id));
      setDeleting(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete the milestone.');
    } finally {
      setSaving(false);
    }
  };

  const columns: AdminTableColumn<TimelineEvent>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (m) => (
        <span className="font-mono text-xs whitespace-nowrap text-slate-500">
          {formatMilestoneDate(m.date, m.precision)}
        </span>
      ),
    },
    {
      key: 'title',
      header: 'Milestone',
      render: (m) => <span className="font-medium text-slate-900">{m.title}</span>,
    },
    {
      key: 'description',
      header: 'Description',
      render: (m) =>
        m.description.trim() ? (
          // Clamped rather than truncated to one line: two lines is usually the whole
          // description, and seeing it saves opening the drawer to check what is in there.
          <span className="line-clamp-2 max-w-md text-xs text-slate-500">{m.description}</span>
        ) : (
          <span className="text-xs italic text-slate-400">None</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (m) => {
        if (!canManage) return <span className="text-xs text-slate-400">Read only</span>;

        return (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <button
              type="button"
              className={actionBtn}
              onClick={() => openDraft(m, false)}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button type="button" className={dangerBtn} onClick={() => setDeleting(m)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <AdminTopbar
        title="Chapter Timeline"
        subtitle="Milestones shown on the public timeline page"
        action={
          canManage ? (
            <button
              onClick={() => openDraft(emptyMilestone(), true)}
              className="flex items-center gap-1.5 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
            >
              <Plus className="h-4 w-4" /> New milestone
            </button>
          ) : undefined
        }
      />

      <div className="p-4 sm:p-6">
        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}
        {canManage && (
          <p className="mb-4 text-xs text-slate-500">
            Milestones appear on the public page oldest first, in date order — there is nothing to
            reorder by hand. Everything saved here is visible to visitors immediately.
          </p>
        )}
        {loading ? (
          <EmptyState title="Loading the timeline" description="Fetching the recorded milestones." />
        ) : (
          <AdminTable
            columns={columns}
            rows={milestones}
            rowKey={(m) => m.id}
            searchable={(m) => `${m.date} ${m.title} ${m.description}`}
            emptyMessage="No milestones recorded yet. The public timeline page says so until one is added."
          />
        )}
      </div>

      <AdminEditDrawer
        open={!!draft}
        title={isNew ? 'New milestone' : 'Edit milestone'}
        subtitle="Saved changes appear on the public Chapter Timeline page."
        onClose={() => setDraft(null)}
        footer={
          <button
            onClick={save}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ieee-orange-dark disabled:opacity-70"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <MilestoneDateField
              parts={dateParts}
              onChange={(next) => {
                setDateParts(next);
                const joined = joinMilestoneDate(next);
                if (joined) setDraft((current) => (current ? { ...current, ...joined } : current));
              }}
            />
            <AdminField label="Heading" required hint="Short, and in the past tense — this is the milestone itself.">
              <AdminInput
                value={draft.title}
                placeholder="e.g. First open-source workshop"
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </AdminField>
            <AdminField
              label="Description"
              hint="Optional. A sentence or two of detail. Blank lines start a new paragraph, and lines beginning with * become bullet points."
            >
              <AdminTextarea
                value={draft.description}
                placeholder="What happened, and why it mattered."
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </AdminField>
          </div>
        )}
      </AdminEditDrawer>

      <ConfirmModal
        open={!!deleting}
        title="Delete this milestone?"
        description="It will be removed from the public Chapter Timeline page."
        confirmLabel={saving ? 'Deleting...' : 'Delete'}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
