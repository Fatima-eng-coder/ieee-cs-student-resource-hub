import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, ArrowUp, ArrowDown, GripVertical, Loader2, Save, X, FileStack, Ticket } from 'lucide-react';
import type { FormDef, FormField, FormFieldType, FormPage, FormStatus } from '@/types';
import { formsService } from '@/services/formsService';
import { makeId } from '@/utils/storage';
import { fromLocalInput, toLocalInput } from '@/utils/time';
import { fieldTypeMeta, fieldTypeOrder } from '@/components/forms/fieldTypes';
import AdminTopbar from '@/components/admin/AdminTopbar';

const newField = (): FormField => ({ id: makeId('ff'), type: 'short-text', label: '', required: false });
const newPage = (): FormPage => ({ id: makeId('fp'), fields: [newField()] });

/** A datetime-local value is wall-clock, so it is read back on the same clock it was typed on. */
const whenLabel = (localValue: string) =>
  new Date(localValue).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Whether the saved form was inside its own window when it was read. Used to interpret a
 * false is_open: if neither the status nor the window explains the refusal, the only reason
 * left is that the response limit has been reached — which is how a form that hides its seat
 * counts still reports being full.
 */
const withinSavedWindow = (form: FormDef): boolean => {
  const now = Date.now();
  if (form.status !== 'open') return false;
  if (form.opensAt && new Date(form.opensAt).getTime() > now) return false;
  if (form.closesAt && new Date(form.closesAt).getTime() <= now) return false;
  return true;
};

export default function FormBuilderPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pages, setPages] = useState<FormPage[]>([newPage()]);
  const [status, setStatus] = useState<FormStatus>('open');
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  // Kept as text, not a number: an empty box and a zero both mean "unlimited", and a
  // controlled number input cannot hold the half-typed state in between.
  const [limit, setLimit] = useState('');
  const [showRemaining, setShowRemaining] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Responses already recorded, or null when the form hides its counts — form_capacity()
  // withholds them from everyone, the admin included. The Responses page reads the rows
  // directly and always knows, so the panel points there instead of guessing.
  const [collected, setCollected] = useState<number | null>(null);
  // The database refuses new responses for a reason neither the status nor the window explains.
  const [atCapacity, setAtCapacity] = useState(false);
  // The seat read failed outright, which is a third thing from a withheld count: neither the
  // tally nor the database's own verdict arrived, so nothing here may speak for either.
  const [seatsUnread, setSeatsUnread] = useState(false);
  // The cap as stored, so a refusal read from the database can be told apart from one the
  // admin has since typed their way out of.
  const [savedLimit, setSavedLimit] = useState('');

  useEffect(() => {
    if (!editing) return;
    let alive = true;

    formsService
      .get(id!)
      .then((f) => {
        if (!alive) return;
        if (f) {
          setTitle(f.title);
          setDescription(f.description);
          setPages(f.pages.length ? f.pages : [newPage()]);
          setStatus(f.status);
          setOpensAt(toLocalInput(f.opensAt));
          setClosesAt(toLocalInput(f.closesAt));
          setLimit(f.maxResponses == null ? '' : String(f.maxResponses));
          setSavedLimit(f.maxResponses == null ? '' : String(f.maxResponses));
          setShowRemaining(Boolean(f.showRemaining));

          // Seats describe the form as saved, not as it is being retyped above, so they are
          // read once here. A failure costs the readout only.
          formsService
            .capacity(f.id)
            .then((seats) => {
              if (!alive) return;
              setCollected(seats.responseCount);
              setAtCapacity(!seats.isOpen && withinSavedWindow(f));
            })
            .catch(() => {
              if (alive) setSeatsUnread(true);
            });
        }
      })
      .catch((cause: unknown) => {
        // The rejection used to land nowhere and the page kept its loading skeleton, so a
        // form that could not be read looked exactly like one still loading.
        if (alive) setError(cause instanceof Error ? cause.message : 'This form could not be loaded.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [editing, id]);

  // --- immutable nested updates ---
  const patchPage = (pid: string, patch: Partial<FormPage>) =>
    setPages((ps) => ps.map((p) => (p.id === pid ? { ...p, ...patch } : p)));

  const patchField = (pid: string, fid: string, patch: Partial<FormField>) =>
    setPages((ps) =>
      ps.map((p) =>
        p.id === pid ? { ...p, fields: p.fields.map((f) => (f.id === fid ? { ...f, ...patch } : f)) } : p
      )
    );

  const addField = (pid: string) =>
    setPages((ps) => ps.map((p) => (p.id === pid ? { ...p, fields: [...p.fields, newField()] } : p)));

  const removeField = (pid: string, fid: string) =>
    setPages((ps) => ps.map((p) => (p.id === pid ? { ...p, fields: p.fields.filter((f) => f.id !== fid) } : p)));

  const moveField = (pid: string, fid: string, dir: -1 | 1) =>
    setPages((ps) =>
      ps.map((p) => {
        if (p.id !== pid) return p;
        const i = p.fields.findIndex((f) => f.id === fid);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= p.fields.length) return p;
        const fields = [...p.fields];
        [fields[i], fields[j]] = [fields[j], fields[i]];
        return { ...p, fields };
      })
    );

  const setType = (pid: string, fid: string, type: FormFieldType) => {
    const needsOptions = fieldTypeMeta[type].hasOptions;
    setPages((ps) =>
      ps.map((p) =>
        p.id === pid
          ? {
              ...p,
              fields: p.fields.map((f) =>
                f.id === fid
                  ? {
                      ...f,
                      type,
                      options: needsOptions
                        ? f.options?.length
                          ? f.options
                          : [
                              { id: makeId('opt'), label: 'Option 1' },
                              { id: makeId('opt'), label: 'Option 2' },
                            ]
                        : undefined,
                    }
                  : f
              ),
            }
          : p
      )
    );
  };

  const addOption = (pid: string, fid: string) =>
    setPages((ps) =>
      ps.map((p) =>
        p.id === pid
          ? {
              ...p,
              fields: p.fields.map((f) =>
                f.id === fid ? { ...f, options: [...(f.options ?? []), { id: makeId('opt'), label: '' }] } : f
              ),
            }
          : p
      )
    );

  const patchOption = (pid: string, fid: string, oid: string, label: string) =>
    setPages((ps) =>
      ps.map((p) =>
        p.id === pid
          ? {
              ...p,
              fields: p.fields.map((f) =>
                f.id === fid
                  ? { ...f, options: f.options?.map((o) => (o.id === oid ? { ...o, label } : o)) }
                  : f
              ),
            }
          : p
      )
    );

  const removeOption = (pid: string, fid: string, oid: string) =>
    setPages((ps) =>
      ps.map((p) =>
        p.id === pid
          ? { ...p, fields: p.fields.map((f) => (f.id === fid ? { ...f, options: f.options?.filter((o) => o.id !== oid) } : f)) }
          : p
      )
    );

  const addPage = () => setPages((ps) => [...ps, newPage()]);
  const removePage = (pid: string) => setPages((ps) => (ps.length > 1 ? ps.filter((p) => p.id !== pid) : ps));

  /** Blank and 0 both mean unlimited, so neither can be typed by accident into a real cap. */
  const parsedLimit = limit.trim() === '' ? null : Number(limit);
  const limitInvalid =
    parsedLimit !== null && (!Number.isInteger(parsedLimit) || parsedLimit < 0);
  const capped = parsedLimit !== null && parsedLimit > 0;

  // What these settings will do to a student, on the same wall clock the two boxes are typed
  // on. The database accepts a window that has already ended — only closes > opens is checked
  // — so nothing but this line stands between an admin and a form nobody can reach.
  const nowMs = Date.now();
  const opensLater = opensAt !== '' && new Date(opensAt).getTime() > nowMs;
  const alreadyPastClosing = closesAt !== '' && new Date(closesAt).getTime() <= nowMs;
  const belowCollected = parsedLimit !== null && parsedLimit > 0 && collected !== null && parsedLimit < collected;

  // Whether the cap in the box is one this form has already reached. With the counts visible
  // that is arithmetic; with them hidden the database's refusal is the only evidence there
  // is, and it describes the cap as saved — so it stops counting the moment the admin retypes
  // it, rather than telling someone who has just raised the limit that the form is still full.
  const reachedLimit =
    collected !== null
      ? parsedLimit !== null && parsedLimit > 0 && collected >= parsedLimit
      : !seatsUnread && atCapacity && limit.trim() === savedLimit.trim();

  // A cap in the box with no count behind it cannot be called either way: the form may
  // already be full, or the cap being typed may already be under the tally. Only a form
  // saving no cap at all is safe to call open on the status and the dates alone.
  const seatsInDoubt = seatsUnread && capped;

  const outlook: { tone: 'ok' | 'info' | 'warn'; text: string } =
    status === 'draft'
      ? { tone: 'info', text: 'Draft — students will not see this form at all, even by its link.' }
      : status === 'closed'
        ? { tone: 'info', text: 'Closed — students are told it is no longer accepting responses.' }
        : alreadyPastClosing
          ? {
              tone: 'warn',
              text: `That closing time has already passed, so this form will be shut to students the moment you save.`,
            }
          : opensLater
            ? { tone: 'info', text: `Students see a "not open yet" notice until ${whenLabel(opensAt)}.` }
            : reachedLimit
              ? {
                  tone: 'warn',
                  text: 'The response limit has already been reached, so the database is turning new responses away.',
                }
              : seatsInDoubt
                ? {
                    tone: 'info',
                    text: 'Open as far as the status and the dates go. How many responses are already in could not be read, so a form that has already hit this limit would look exactly like this.',
                  }
                : { tone: 'ok', text: 'Open — students can submit as soon as you save.' };

  const outlookText = { ok: 'text-emerald-700', info: 'text-slate-500', warn: 'text-amber-700' }[outlook.tone];
  const outlookDot = { ok: 'bg-emerald-500', info: 'bg-slate-300', warn: 'bg-amber-500' }[outlook.tone];

  async function save() {
    setError(null);
    if (!title.trim()) return setError('Give your form a title.');
    const totalFields = pages.reduce((n, p) => n + p.fields.length, 0);
    if (totalFields === 0) return setError('Add at least one field.');
    if (pages.some((p) => p.fields.some((f) => !f.label.trim()))) return setError('Every field needs a label.');
    if (limitInvalid) return setError('The response limit must be a whole number, or empty for unlimited.');
    if (opensAt && closesAt && new Date(closesAt) <= new Date(opensAt)) {
      return setError('The closing time must come after the opening time.');
    }

    setBusy(true);
    try {
      // strip empty options
      const clean = pages.map((p) => ({
        ...p,
        fields: p.fields.map((f) => ({
          ...f,
          options: fieldTypeMeta[f.type].hasOptions
            ? (f.options ?? []).filter((o) => o.label.trim())
            : undefined,
        })),
      }));
      const availability = {
        status,
        opensAt: fromLocalInput(opensAt),
        closesAt: fromLocalInput(closesAt),
        // A cap of 0 would close the form to everyone, so it is stored as no cap at all.
        maxResponses: capped ? parsedLimit : null,
        // Nothing to count down to without a cap; saving it true would be a lie on reload.
        showRemaining: capped && showRemaining,
      };
      if (editing) await formsService.update(id!, { title, description, pages: clean, ...availability });
      else await formsService.create({ title, description, pages: clean, ...availability });
      navigate('/portal/forms');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the form.');
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <>
        <AdminTopbar title="Form Builder" />
        <div className="p-6">
          <div className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopbar title={editing ? 'Edit Form' : 'New Form'} />
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        {/* meta */}
        <div className="rounded-2xl border-l-4 border-l-ieee-orange border border-slate-200 bg-white p-5 shadow-sm">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Form title"
            className="w-full border-none bg-transparent text-xl font-bold text-slate-900 outline-none placeholder:text-slate-300"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Form description (optional)"
            rows={2}
            className="mt-2 w-full resize-y border-none bg-transparent text-sm text-slate-600 outline-none placeholder:text-slate-300"
          />
        </div>

        {/* availability */}
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Ticket className="h-3.5 w-3.5 text-ieee-orange" /> Availability &amp; seats
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-600">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as FormStatus)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-ieee-orange"
              >
                <option value="draft">Draft — only the team can see it</option>
                <option value="open">Open — accepting responses</option>
                <option value="closed">Closed — no new responses</option>
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-600">Opens (optional)</span>
              <input
                type="datetime-local"
                value={opensAt}
                onChange={(e) => setOpensAt(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-ieee-orange"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-600">Closes (optional)</span>
              <input
                type="datetime-local"
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-ieee-orange"
              />
            </label>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <label className="flex flex-col gap-1.5 sm:max-w-xs">
              <span className="text-xs font-semibold text-slate-600">Close automatically after</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  placeholder="Unlimited"
                  className={`w-32 rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none ${
                    limitInvalid ? 'border-rose-300 focus:border-rose-400' : 'border-slate-200 focus:border-ieee-orange'
                  }`}
                />
                <span className="text-sm text-slate-500">responses</span>
              </div>
            </label>
            <p className={`mt-1.5 text-xs ${limitInvalid ? 'text-rose-600' : 'text-slate-500'}`}>
              {limitInvalid
                ? 'Use a whole number, or leave it empty.'
                : capped
                  ? `The form stops accepting responses on its own once ${parsedLimit} come in.`
                  : 'Leave empty (or 0) to accept responses without a limit.'}
            </p>

            <label
              className={`mt-3 flex w-max items-center gap-2 text-sm ${
                capped ? 'cursor-pointer text-slate-700' : 'cursor-not-allowed text-slate-400'
              }`}
            >
              <input
                type="checkbox"
                checked={capped && showRemaining}
                disabled={!capped}
                onChange={(e) => setShowRemaining(e.target.checked)}
                className="accent-ieee-orange"
              />
              Show students how many seats are left
            </label>
            {!capped && (
              <p className="mt-1 text-xs text-slate-400">Set a limit above to offer this.</p>
            )}
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className={`flex items-start gap-2 text-xs font-medium ${outlookText}`}>
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${outlookDot}`} />
              {outlook.text}
            </p>

            {editing &&
              capped &&
              (collected !== null ? (
                <p className={`mt-1.5 pl-3.5 text-xs ${belowCollected ? 'text-rose-600' : 'text-slate-500'}`}>
                  {belowCollected
                    ? `${collected} responses are already in, so a limit of ${parsedLimit} shuts the form the moment you save.`
                    : `${collected} of ${parsedLimit} taken so far.`}
                </p>
              ) : seatsUnread ? (
                <p className="mt-1.5 pl-3.5 text-xs text-amber-700">
                  The seat check did not come back, so nothing here can say whether {parsedLimit} is above or below
                  what this form has already collected. Its{' '}
                  <Link to={`/portal/forms/${id}/responses`} className="font-semibold text-ieee-orange hover:underline">
                    responses
                  </Link>{' '}
                  are counted straight from the table.
                </p>
              ) : (
                <p className="mt-1.5 pl-3.5 text-xs text-slate-400">
                  This form does not publish its seat counts, so the number collected shows only on its{' '}
                  <Link to={`/portal/forms/${id}/responses`} className="font-semibold text-ieee-orange hover:underline">
                    responses
                  </Link>
                  .
                </p>
              ))}
          </div>
        </div>

        {/* pages */}
        {pages.map((page, pi) => (
          <div key={page.id} className="mt-6">
            {pages.length > 1 && (
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <FileStack className="h-3.5 w-3.5" /> Page {pi + 1} of {pages.length}
                </span>
                <button
                  onClick={() => removePage(page.id)}
                  className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove page
                </button>
              </div>
            )}

            {pages.length > 1 && (
              <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <input
                  value={page.title ?? ''}
                  onChange={(e) => patchPage(page.id, { title: e.target.value })}
                  placeholder="Page heading (optional)"
                  className="w-full border-none bg-transparent text-base font-semibold text-slate-800 outline-none placeholder:text-slate-300"
                />
                <input
                  value={page.description ?? ''}
                  onChange={(e) => patchPage(page.id, { description: e.target.value })}
                  placeholder="Page description (optional)"
                  className="mt-1 w-full border-none bg-transparent text-sm text-slate-500 outline-none placeholder:text-slate-300"
                />
              </div>
            )}

            <div className="flex flex-col gap-3">
              {page.fields.map((field, fi) => {
                const hasOptions = fieldTypeMeta[field.type].hasOptions;
                return (
                  <div key={field.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-2">
                      <GripVertical className="mt-2 h-4 w-4 shrink-0 text-slate-300" />
                      <div className="flex-1">
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            value={field.label}
                            onChange={(e) => patchField(page.id, field.id, { label: e.target.value })}
                            placeholder={`Question ${fi + 1}`}
                            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-ieee-orange"
                          />
                          <select
                            value={field.type}
                            onChange={(e) => setType(page.id, field.id, e.target.value as FormFieldType)}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-ieee-orange"
                          >
                            {fieldTypeOrder.map((t) => (
                              <option key={t} value={t}>
                                {fieldTypeMeta[t].label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <input
                          value={field.description ?? ''}
                          onChange={(e) => patchField(page.id, field.id, { description: e.target.value })}
                          placeholder="Helper text (optional)"
                          className="mt-2 w-full rounded-lg border border-transparent bg-transparent px-1 text-xs text-slate-500 outline-none placeholder:text-slate-300 focus:border-slate-200 focus:bg-slate-50"
                        />

                        {hasOptions && (
                          <div className="mt-3 flex flex-col gap-1.5">
                            {(field.options ?? []).map((o, oi) => (
                              <div key={o.id} className="flex items-center gap-2">
                                <span className="text-xs text-slate-400">{oi + 1}.</span>
                                <input
                                  value={o.label}
                                  onChange={(e) => patchOption(page.id, field.id, o.id, e.target.value)}
                                  placeholder={`Option ${oi + 1}`}
                                  className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm outline-none focus:border-ieee-orange"
                                />
                                <button onClick={() => removeOption(page.id, field.id, o.id)} className="text-slate-300 hover:text-rose-500">
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                            <button
                              onClick={() => addOption(page.id, field.id)}
                              className="mt-1 flex w-max items-center gap-1 text-xs font-semibold text-ieee-orange hover:underline"
                            >
                              <Plus className="h-3.5 w-3.5" /> Add option
                            </button>
                          </div>
                        )}

                        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={(e) => patchField(page.id, field.id, { required: e.target.checked })}
                              className="accent-ieee-orange"
                            />
                            Required
                          </label>
                          <div className="flex items-center gap-1 text-slate-400">
                            <button onClick={() => moveField(page.id, field.id, -1)} className="rounded p-1 hover:bg-slate-100" aria-label="Move up">
                              <ArrowUp className="h-4 w-4" />
                            </button>
                            <button onClick={() => moveField(page.id, field.id, 1)} className="rounded p-1 hover:bg-slate-100" aria-label="Move down">
                              <ArrowDown className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => removeField(page.id, field.id)}
                              className="rounded p-1 hover:bg-rose-50 hover:text-rose-600"
                              aria-label="Remove field"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => addField(page.id)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-500 transition hover:border-ieee-orange hover:text-ieee-orange"
            >
              <Plus className="h-4 w-4" /> Add field
            </button>
          </div>
        ))}

        <button
          onClick={addPage}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-500 transition hover:border-ieee-orange hover:text-ieee-orange"
        >
          <FileStack className="h-4 w-4" /> Add page
        </button>

        {error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">{error}</p>}

        <div className="sticky bottom-0 mt-6 flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 py-4">
          <button
            onClick={() => navigate('/portal/forms')}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:border-slate-300"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-ieee-orange px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark disabled:opacity-70"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {editing ? 'Save changes' : 'Create form'}
          </button>
        </div>
      </div>
    </>
  );
}
