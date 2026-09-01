/**
 * Attaches a form to an event or an announcement, and — in the companion control below —
 * decides whether that item is promoted onto the homepage. The two live in one file because
 * the database keeps them on the same row and an admin sets them in the same sitting.
 *
 * The three attachment states are mutually exclusive in the database and a half-configured
 * row is refused outright (events_form_config_check / announcements_form_config_check), so
 * the picked mode is local state and only a complete triple is ever emitted: a blank URL or
 * an unpicked form reports "no form" rather than a shape the insert would reject. That also
 * means switching mode cannot strand the other mode's value in the payload.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  FileStack,
  Link2,
  Loader2,
  Megaphone,
  PlusCircle,
  Settings2,
} from 'lucide-react';
import SearchSelect from '@/components/ui/SearchSelect';
import { formsService } from '@/services/formsService';
import type { FormDef } from '@/types';
import { fromLocalInput, toLocalInput } from '@/utils/time';

/** Restated rather than imported from a service so the control stays usable by both. */
export type FormSource = 'none' | 'external' | 'internal';

export interface FormAttachmentValue {
  formSource: FormSource;
  externalFormUrl: string | null;
  formId: string | null;
}

export interface PromotionValue {
  promoted: boolean;
  promoHeadline: string;
  promoCtaLabel: string;
  promoStartsAt: string | null;
  promoEndsAt: string | null;
  promoSort: number;
}

/** What every incoherent combination collapses to, so nothing half-configured is emitted. */
const noAttachment: FormAttachmentValue = {
  formSource: 'none',
  externalFormUrl: null,
  formId: null,
};

/** "Build a new form" is a fourth thing to do, but it still resolves to an internal form. */
type Mode = FormSource | 'create';

const inputClass =
  'w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-ieee-orange focus:ring-2 focus:ring-ieee-orange/20 placeholder:text-slate-400';

const cardClass = 'rounded-2xl border border-black/5 bg-white p-3.5';

/**
 * Admins paste "forms.gle/abc" as often as a full link, and the database only checks that
 * the URL is non-empty — so a scheme is added here rather than storing something the public
 * page would render as a dead relative link.
 */
function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const attempts = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? [trimmed] : [`https://${trimmed}`];
  for (const candidate of attempts) {
    try {
      const parsed = new URL(candidate);
      if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.includes('.')) {
        return parsed.toString();
      }
    } catch {
      // Falls through to the caller's "that is not a link" message.
    }
  }

  return null;
}

/**
 * promo_sort is an integer column: a typed "1.5" reaches Postgres as 1.5 and fails the whole
 * save with a cast error the admin cannot act on. Anything that is not a number at all — an
 * empty box, a lone minus sign — settles at the column default rather than at NaN.
 */
const toPromoSort = (text: string): number => {
  const whole = Math.trunc(Number(text));
  return Number.isFinite(whole) ? whole : 0;
};

const statusLabels: Record<FormDef['status'], string> = {
  draft: 'Draft',
  open: 'Open',
  closed: 'Closed',
};

const statusStyles: Record<FormDef['status'], string> = {
  draft: 'bg-slate-100 text-slate-500',
  open: 'bg-emerald-50 text-emerald-700',
  closed: 'bg-rose-50 text-rose-600',
};

function StatusPill({ status }: { status: FormDef['status'] }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusStyles[status]}`}>
      {statusLabels[status]}
    </span>
  );
}

const countFields = (form: FormDef) => form.pages.reduce((total, page) => total + page.fields.length, 0);

const seatSummary = (form: FormDef) =>
  form.maxResponses == null
    ? 'Unlimited responses'
    : `${form.maxResponses} responses max${form.showRemaining ? ' · seats left shown to students' : ''}`;

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Why the attached form would turn the register button into a dead end. Status alone used to
 * be the whole test, which let a form that is nominally open but outside its own window pass
 * as ready — the admin only found out when a student hit "not open yet".
 *
 * The response limit is deliberately not checked: knowing whether a form has filled up costs
 * one form_capacity call per form, and this control lists them all. A full form still reads
 * as fine here and says so on its own page.
 */
function attachmentWarning(form: FormDef): string | null {
  if (form.status === 'draft') {
    return 'This form is still a draft, so nobody can open it. Publish it from Forms when it is ready.';
  }
  if (form.status === 'closed') {
    return 'This form is closed, so nobody can submit it.';
  }

  const now = Date.now();
  if (form.opensAt && new Date(form.opensAt).getTime() > now) {
    return `This form does not start accepting responses until ${formatWhen(form.opensAt)}. Anyone who clicks through before then is asked to come back.`;
  }
  if (form.closesAt && new Date(form.closesAt).getTime() <= now) {
    return `This form stopped accepting responses on ${formatWhen(form.closesAt)}, so nobody can submit it.`;
  }

  return null;
}

interface ModeOption {
  mode: Mode;
  label: string;
  hint: string;
  icon: typeof Ban;
}

const modeOptions: ModeOption[] = [
  { mode: 'none', label: 'No form', hint: 'Nothing to sign up for.', icon: Ban },
  { mode: 'external', label: 'Link a Google Form', hint: 'Send people to a form you built elsewhere.', icon: Link2 },
  { mode: 'internal', label: 'Use an existing form', hint: 'Pick a form already built in Forms.', icon: FileStack },
  { mode: 'create', label: 'Create a new form', hint: 'Start a blank form and attach it now.', icon: PlusCircle },
];

export default function FormAttachmentField({
  value,
  onChange,
  itemNoun,
  disabled = false,
}: {
  value: FormAttachmentValue;
  onChange: (next: FormAttachmentValue) => void;
  /** Used in the copy: "event" or "announcement". */
  itemNoun: string;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(value.formSource);
  const [urlText, setUrlText] = useState(value.externalFormUrl ?? '');
  const [forms, setForms] = useState<FormDef[]>([]);
  const [loadingForms, setLoadingForms] = useState(true);
  const [formsError, setFormsError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    formsService
      .list()
      .then((list) => {
        if (alive) setForms(list);
      })
      .catch((err: unknown) => {
        if (alive) setFormsError(err instanceof Error ? err.message : 'Forms could not be loaded.');
      })
      .finally(() => {
        if (alive) setLoadingForms(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const emit = (nextMode: Mode, nextUrl: string, nextFormId: string | null) => {
    if (nextMode === 'external') {
      const url = normalizeUrl(nextUrl);
      onChange(url ? { formSource: 'external', externalFormUrl: url, formId: null } : noAttachment);
      return;
    }

    if (nextMode === 'internal' || nextMode === 'create') {
      onChange(nextFormId ? { formSource: 'internal', externalFormUrl: null, formId: nextFormId } : noAttachment);
      return;
    }

    onChange(noAttachment);
  };

  // Choosing "create a new form" detaches whatever was attached: the alternative is a
  // title box sitting above a summary card for a different form, which reads as a rename.
  const pickMode = (nextMode: Mode) => {
    setMode(nextMode);
    setCreateError(null);
    emit(nextMode, urlText, nextMode === 'create' ? null : value.formId);
  };

  const attached = useMemo(
    () => (value.formId ? (forms.find((form) => form.id === value.formId) ?? null) : null),
    [forms, value.formId]
  );

  /**
   * A closed form is not offered, but one that is already attached stays in the list — the
   * picker would otherwise render an empty box over a link that is very much still set.
   */
  const pickable = useMemo(() => {
    const open = forms.filter((form) => form.status !== 'closed');
    return attached && !open.some((form) => form.id === attached.id) ? [attached, ...open] : open;
  }, [forms, attached]);

  const urlProblem = mode === 'external' && urlText.trim() !== '' && normalizeUrl(urlText) === null;
  const normalizedUrl = mode === 'external' ? normalizeUrl(urlText) : null;

  const createForm = async () => {
    const title = newTitle.trim();
    if (!title) {
      setCreateError('Give the new form a title first.');
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      // Draft, not open: an empty form released to students would collect blank responses
      // between this click and the admin adding the first question.
      const created = await formsService.create({ title, description: '', pages: [], status: 'draft' });
      setForms((list) => [created, ...list]);
      setNewTitle('');
      setMode('internal');
      emit('internal', urlText, created.id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'The form could not be created.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <fieldset className="rounded-2xl border border-black/10 bg-cream/60 p-4" disabled={disabled}>
      <legend className="px-1 text-sm font-semibold text-slate-700">Sign-up form</legend>
      <p className="mb-3 text-xs text-slate-500">
        How people register for this {itemNoun}. Pick one.
      </p>

      <div className="grid gap-2">
        {modeOptions.map((option) => {
          const Icon = option.icon;
          const active = mode === option.mode;

          return (
            <label
              key={option.mode}
              className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition ${
                active ? 'border-ieee-orange bg-white shadow-sm' : 'border-black/5 bg-white/70 hover:border-ieee-orange/40'
              }`}
            >
              <input
                type="radio"
                name={`form-source-${itemNoun}`}
                checked={active}
                onChange={() => pickMode(option.mode)}
                className="mt-0.5 accent-ieee-orange"
              />
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${active ? 'text-ieee-orange' : 'text-slate-400'}`} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-800">{option.label}</span>
                <span className="block text-xs text-slate-500">{option.hint}</span>
              </span>
            </label>
          );
        })}
      </div>

      {mode === 'external' && (
        <div className={`mt-3 ${cardClass}`}>
          <span className="mb-1.5 block text-xs font-semibold text-slate-700">Form link</span>
          <input
            type="url"
            inputMode="url"
            value={urlText}
            placeholder="https://forms.gle/..."
            onChange={(event) => {
              setUrlText(event.target.value);
              emit('external', event.target.value, null);
            }}
            className={inputClass}
          />
          {urlProblem ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-rose-600">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              That does not look like a web address, so nothing will be attached. Paste the full link.
            </p>
          ) : normalizedUrl && normalizedUrl !== urlText.trim() ? (
            <p className="mt-1.5 text-xs text-slate-500">Will be saved as {normalizedUrl}</p>
          ) : (
            <p className="mt-1.5 text-xs text-slate-400">
              Responses stay in Google — they will not appear under Forms here.
            </p>
          )}
        </div>
      )}

      {mode === 'internal' && (
        <div className={`mt-3 ${cardClass}`}>
          <span className="mb-1.5 block text-xs font-semibold text-slate-700">Form</span>
          {formsError ? (
            <p className="flex items-start gap-1.5 text-xs font-medium text-rose-600">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {formsError}
            </p>
          ) : (
            <SearchSelect
              items={pickable}
              value={value.formId}
              onChange={(key) => emit('internal', urlText, key || null)}
              getKey={(form) => form.id}
              getLabel={(form) => form.title}
              getSearchText={(form) => `${form.title} ${form.description}`}
              label="Attached form"
              placeholder="Search forms"
              emptyMessage="No open or draft forms yet."
              loading={loadingForms}
              allowClear
              renderOption={(form) => (
                <span className="block">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-800">{form.title}</span>
                    <StatusPill status={form.status} />
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-400">
                    {countFields(form)} question{countFields(form) === 1 ? '' : 's'} · {seatSummary(form)}
                  </span>
                </span>
              )}
              footer={
                <Link
                  to="/portal/forms"
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-cream hover:text-ieee-orange"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Manage all forms
                </Link>
              }
            />
          )}

          {attached && (
            <div className="mt-3 rounded-xl border border-black/5 bg-cream px-3 py-2.5">
              <p className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                {attached.title}
                <StatusPill status={attached.status} />
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {countFields(attached)} question{countFields(attached) === 1 ? '' : 's'} · {seatSummary(attached)}
              </p>
              {attachmentWarning(attached) && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-amber-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {attachmentWarning(attached)}
                </p>
              )}
              {countFields(attached) === 0 && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-amber-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  This form has no questions yet.
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-3">
                {/* The seat limit belongs to the form, not to the item it is attached to:
                    repeating it here would give one number two places to be set. */}
                <Link
                  to={`/portal/forms/${attached.id}/edit`}
                  className="flex items-center gap-1 text-xs font-semibold text-ieee-orange transition hover:text-ieee-orange-dark"
                >
                  Questions &amp; seat limit <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  to={`/portal/forms/${attached.id}/responses`}
                  className="flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-ieee-orange"
                >
                  Responses <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'create' && (
        <div className={`mt-3 ${cardClass}`}>
          <span className="mb-1.5 block text-xs font-semibold text-slate-700">New form title</span>
          <input
            value={newTitle}
            placeholder={`${itemNoun === 'announcement' ? 'Sign-up' : 'Registration'} form`}
            onChange={(event) => setNewTitle(event.target.value)}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => void createForm()}
            disabled={creating}
            className="mt-2.5 flex items-center justify-center gap-2 rounded-xl bg-ieee-orange px-4 py-2 text-sm font-semibold text-white transition hover:bg-ieee-orange-dark disabled:opacity-70"
          >
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            Create and attach
          </button>
          {createError ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-rose-600">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {createError}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-slate-400">
              Created as a draft with no questions. Add them next, then open it for responses.
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}

export function PromotionFields({
  value,
  onChange,
  itemNoun,
  fallbackHeadline,
}: {
  value: PromotionValue;
  onChange: (next: PromotionValue) => void;
  itemNoun: string;
  /** The title the promo card falls back to when no headline is given. */
  fallbackHeadline: string;
}) {
  const patch = (part: Partial<PromotionValue>) => onChange({ ...value, ...part });

  // Held as text, the way the form builder holds its response limit: a number input reports a
  // half-typed "-" as an empty value, and coercing that to 0 on the keystroke writes "0" back
  // over the box — so a negative order, which the column allows and which is the natural way
  // to pin a card in front, can never be finished.
  const [sortText, setSortText] = useState(() => String(value.promoSort));

  // Follows the row underneath when it changes to a different order, but never overwrites a
  // box that already agrees with what it emitted.
  useEffect(() => {
    setSortText((text) => (toPromoSort(text) === value.promoSort ? text : String(value.promoSort)));
  }, [value.promoSort]);

  const sortNumber = Number(sortText);
  const fractionalSort = sortText.trim() !== '' && Number.isFinite(sortNumber) && !Number.isInteger(sortNumber);

  const now = Date.now();
  const startsAt = value.promoStartsAt ? new Date(value.promoStartsAt).getTime() : null;
  const endsAt = value.promoEndsAt ? new Date(value.promoEndsAt).getTime() : null;

  // The database refuses a window that closes before it opens, so it is worth saying so
  // before the admin loses the rest of the drawer to a constraint error.
  const windowInverted = startsAt !== null && endsAt !== null && endsAt <= startsAt;

  // A window entirely in the past passes every constraint and then promotes nothing:
  // active_promotions() filters on now(), so the card simply never appears and the admin has
  // no error to read. The same goes the other way for a start date nobody has reached yet.
  const alreadyEnded = !windowInverted && endsAt !== null && endsAt <= now;
  const notStartedYet = !windowInverted && !alreadyEnded && startsAt !== null && startsAt > now;

  return (
    <fieldset className="rounded-2xl border border-black/10 bg-cream/60 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-700">Homepage promotion</legend>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-black/5 bg-white px-3 py-2.5">
        <input
          type="checkbox"
          checked={value.promoted}
          onChange={(event) => patch({ promoted: event.target.checked })}
          className="mt-0.5 accent-ieee-orange"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <Megaphone className="h-4 w-4 text-ieee-orange" />
            Show this {itemNoun} on the homepage
          </span>
          <span className="block text-xs text-slate-500">
            Adds a card to the promo strip at the top of the site, with a button to the sign-up form above.
          </span>
        </span>
      </label>

      {value.promoted && (
        <div className="mt-3 grid gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-700">Promo headline</span>
            <input
              value={value.promoHeadline}
              placeholder={fallbackHeadline || 'Falls back to the title'}
              onChange={(event) => patch({ promoHeadline: event.target.value })}
              className={inputClass}
            />
            <span className="text-xs text-slate-400">
              Shown on the homepage card only. The {itemNoun} page keeps its own title.
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-700">Button label</span>
              <input
                value={value.promoCtaLabel}
                placeholder="Register now"
                onChange={(event) => patch({ promoCtaLabel: event.target.value })}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-700">Order</span>
              <input
                type="number"
                step={1}
                value={sortText}
                onChange={(event) => {
                  setSortText(event.target.value);
                  patch({ promoSort: toPromoSort(event.target.value) });
                }}
                className={inputClass}
              />
              {fractionalSort ? (
                // The box is no longer rewritten under the typist, so what will actually be
                // stored is said out loud instead.
                <span className="text-xs font-medium text-amber-700">
                  Whole numbers only — this will be saved as {toPromoSort(sortText)}.
                </span>
              ) : (
                <span className="text-xs text-slate-400">Lower shows first; negatives come first of all.</span>
              )}
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-700">Starts</span>
              <input
                type="datetime-local"
                value={toLocalInput(value.promoStartsAt)}
                onChange={(event) => patch({ promoStartsAt: fromLocalInput(event.target.value) })}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-700">Ends</span>
              <input
                type="datetime-local"
                value={toLocalInput(value.promoEndsAt)}
                onChange={(event) => patch({ promoEndsAt: fromLocalInput(event.target.value) })}
                className={inputClass}
              />
            </label>
          </div>

          {windowInverted ? (
            <p className="flex items-start gap-1.5 text-xs font-medium text-rose-600">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              The end must come after the start, or the database will refuse to save this.
            </p>
          ) : alreadyEnded ? (
            <p className="flex items-start gap-1.5 text-xs font-medium text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This window closed on {formatWhen(value.promoEndsAt!)}, so the card will not appear on the homepage.
            </p>
          ) : notStartedYet ? (
            <p className="text-xs text-slate-500">
              The card appears on the homepage on {formatWhen(value.promoStartsAt!)}
              {endsAt !== null ? ` and comes down on ${formatWhen(value.promoEndsAt!)}.` : ' and stays until you turn this off.'}
            </p>
          ) : endsAt !== null ? (
            <p className="text-xs text-slate-500">Showing on the homepage until {formatWhen(value.promoEndsAt!)}.</p>
          ) : (
            <p className="text-xs text-slate-400">
              Leave both empty to promote from the moment you save until you turn this off.
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}
