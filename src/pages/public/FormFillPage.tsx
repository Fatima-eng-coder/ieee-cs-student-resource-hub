import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Loader2, Check, AlertCircle, Ticket } from 'lucide-react';
import type { FormCapacity, FormDef, FormAnswer } from '@/types';
import { formsService } from '@/services/formsService';
import { useAuth } from '@/context/AuthContext';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import EmptyState from '@/components/ui/EmptyState';
import SuccessState from '@/components/ui/SuccessState';
import FormFieldInput from '@/components/forms/FormFieldInput';
import RichText from '@/components/ui/RichText';

function isEmpty(v: FormAnswer | undefined) {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  return v.trim() === '';
}

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * The opening and closing instants are the only things on this page that move without the
 * reader touching anything, so a form that opens in two minutes has to start rendering
 * itself. Half a minute is finer than any deadline an admin can type, and the interval only
 * runs while there is a boundary left to cross.
 */
function useNow(watching: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!watching) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [watching]);

  return now;
}

export default function FormFillPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [form, setForm] = useState<FormDef | null>(null);
  const [capacity, setCapacity] = useState<FormCapacity | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Whether the seat read has come back at all — success or failure. Deciding before it has
  // would show a fillable form to someone who cannot submit, then yank it a moment later.
  const [seatsRead, setSeatsRead] = useState(false);
  const [page, setPage] = useState(0);
  const [answers, setAnswers] = useState<Record<string, FormAnswer>>({});
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [seatsUnknown, setSeatsUnknown] = useState(false);
  const [done, setDone] = useState(false);

  const now = useNow(Boolean(form?.opensAt || form?.closesAt) && !done);

  const opensLater = Boolean(form?.opensAt && new Date(form.opensAt).getTime() > now);
  const windowPassed = Boolean(form?.closesAt && new Date(form.closesAt).getTime() <= now);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(null);
    // Everything below belongs to the form being left behind: a refusal message from the last
    // form would otherwise keep this one's submit button switched off.
    setForm(null);
    setCapacity(null);
    setSeatsRead(false);
    setSeatsUnknown(false);
    setFailure(null);
    setDone(false);
    setPage(0);
    setAnswers({});
    setErrors(new Set());

    formsService
      .get(id ?? '')
      .then((f) => {
        if (alive) setForm(f);
      })
      .catch((cause: unknown) => {
        // The rejection used to fall into nothing, which left the loading skeleton on screen
        // for good: a failed read looked exactly like a slow one.
        if (alive) setLoadError(cause instanceof Error ? cause.message : 'This form could not be loaded.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [id]);

  // Seats are read separately: a form that loads fine can still be full, and a failure here
  // must cost the counter only — never the form itself. It is read again once the opening
  // time passes, because the answer given before then was to a different question.
  useEffect(() => {
    if (!id) {
      setSeatsRead(true);
      return;
    }

    let alive = true;
    setSeatsUnknown(false);
    formsService
      .capacity(id)
      .then((c) => {
        if (alive) setCapacity(c);
      })
      // A failed seat read must not read as "there are seats". The database is the real gate
      // either way, so the form still opens — but the page says it could not check rather
      // than quietly implying it did.
      .catch(() => {
        if (alive) setSeatsUnknown(true);
      })
      .finally(() => {
        if (alive) setSeatsRead(true);
      });

    return () => {
      alive = false;
    };
  }, [id, opensLater]);

  const fieldLabels = useMemo(() => {
    const map: Record<string, string> = {};
    form?.pages.forEach((p) => p.fields.forEach((f) => (map[f.id] = f.label)));
    return map;
  }, [form]);

  if (loading || !seatsRead) {
    return (
      <div className="relative">
        <PageHero compact eyebrow="Forms" title="Loading…" breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Forms', to: '/forms' }, { label: '…' }]} />
        <PageSection tone="cream" top width="narrow">
          <div className="h-96 animate-pulse rounded-3xl border border-black/5 bg-white" />
        </PageSection>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="relative">
        <PageHero
          compact
          eyebrow="Forms"
          breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Forms', to: '/forms' }, { label: 'Unavailable' }]}
          title="This form could not be loaded"
          subtitle={loadError}
        />
        <PageSection tone="cream" top width="narrow">
          <EmptyState
            title="Something went wrong"
            action={
              <Link to="/forms" className="rounded-lg bg-ieee-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-ieee-orange-dark">
                Back to Forms
              </Link>
            }
          />
        </PageSection>
      </div>
    );
  }

  // is_open is the database's own answer and stays correct even when the seat counts are
  // withheld — so a form that is open, inside its window and still refused is refused for the
  // one remaining reason: it is full. That is how a hidden-count form is named correctly.
  const refusedBySeats = capacity !== null && !capacity.isOpen;
  const isFull =
    (capacity?.remaining != null && capacity.remaining <= 0) ||
    (refusedBySeats && form?.status === 'open' && !opensLater && !windowPassed);
  const unavailable = !form || form.status !== 'open' || opensLater || windowPassed || isFull;

  // A submission that was refused has to be explained where the student is standing. Taking
  // the page over instead would delete everything they typed and the reason along with it.
  const attempted = failure !== null;

  /*
   * The same rule, for the clock.
   *
   * `windowPassed` is recomputed on a 30-second ticker, so a closing time that arrives while
   * somebody is halfway through the form flips `unavailable` to true under them. Taking the
   * page over at that moment threw away every answer they had typed and replaced it with a
   * notice — punishing the student who was filling it in most carefully. Once there is
   * anything in the form, the takeover is off and the closure is delivered as a banner over
   * the answers, which are still there to read, copy, or submit if a seat frees up.
   *
   * With nothing typed there is nothing to lose, so the takeover stays: it is the clearer
   * screen for somebody who has just arrived.
   */
  const hasTyped = Object.values(answers).some((value) => !isEmpty(value));

  // `done` guards the success screen: a closing time that passes in the same second a
  // response lands must not replace "thanks, we have it" with "this form is closed".
  if (!form || (unavailable && !attempted && !done && !hasTyped)) {
    // Reasons are tested in the order private.enforce_form_response_limits() tests them —
    // status, then the opening time, then the closing time, then the seats — so the student
    // is told the same thing the database would have told them.
    const reason = !form
      ? { title: 'Form unavailable', subtitle: 'This form may have been closed or removed.', heading: 'Not open' }
      : form.status === 'draft'
        ? {
            title: 'Not published yet',
            subtitle: `"${form.title}" is still being built, so it is not collecting responses.`,
            heading: 'Draft',
          }
        : form.status !== 'open'
          ? {
              title: 'Form closed',
              subtitle: `"${form.title}" is no longer accepting responses.`,
              heading: 'Closed',
            }
          : opensLater
            ? {
                title: 'Not open yet',
                subtitle: `"${form.title}" opens on ${formatWhen(form.opensAt!)}.`,
                heading: 'Come back soon',
              }
            : windowPassed
              ? {
                  title: 'Form closed',
                  subtitle: `"${form.title}" stopped accepting responses on ${formatWhen(form.closesAt!)}.`,
                  heading: 'Closed',
                }
              : {
                  title: 'Registrations are full',
                  subtitle: `"${form.title}" has reached its limit, so no more responses can be accepted.`,
                  heading: 'No seats left',
                };

    return (
      <div className="relative">
        <PageHero
          compact
          eyebrow="Forms"
          breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Forms', to: '/forms' }, { label: 'Unavailable' }]}
          title={reason.title}
          subtitle={reason.subtitle}
        />
        <PageSection tone="cream" top width="narrow">
          <EmptyState
            title={reason.heading}
            action={
              <Link to="/forms" className="rounded-lg bg-ieee-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-ieee-orange-dark">
                Back to Forms
              </Link>
            }
          />
        </PageSection>
      </div>
    );
  }

  const pages = form.pages;
  const current = pages[page];
  const isLast = page === pages.length - 1;
  const progress = Math.round(((page + 1) / pages.length) * 100);

  const set = (fieldId: string) => (value: FormAnswer) => {
    setAnswers((a) => ({ ...a, [fieldId]: value }));
    setErrors((e) => {
      if (!e.has(fieldId)) return e;
      const next = new Set(e);
      next.delete(fieldId);
      return next;
    });
  };

  const validatePage = () => {
    const missing = current.fields.filter((f) => f.required && isEmpty(answers[f.id]));
    setErrors(new Set(missing.map((f) => f.id)));
    return missing.length === 0;
  };

  const next = () => {
    if (!validatePage()) return;
    setPage((p) => Math.min(p + 1, pages.length - 1));
  };
  const back = () => setPage((p) => Math.max(p - 1, 0));

  const submit = async () => {
    if (!validatePage()) return;
    setBusy(true);
    setFailure(null);
    try {
      await formsService.submitResponse(form.id, answers, fieldLabels, user?.name);
      setDone(true);
    } catch (cause) {
      // Without this the button simply stopped spinning and the student was left staring at a
      // form they believed they had sent. A refused submission has to say so.
      setFailure(cause instanceof Error ? cause.message : 'Your response could not be submitted right now.');
      // The refusal is usually the seat limit, so pull the fresh count before they retry.
      formsService
        .capacity(form.id)
        .then(setCapacity)
        .catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="Form"
        breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Forms', to: '/forms' }, { label: form.title }]}
        title={form.title}
        // The description is not passed here on purpose. PageHero renders its subtitle inside a
        // <p>, and structured text is a <div> of <p> and <ul> -- nesting those is invalid, and
        // the browser's repair for it is to force the outer paragraph closed, which breaks both
        // the layout and the entrance animation. It is rendered below instead, where it has room
        // and reads as dark text on cream rather than white-on-dark at 60% opacity. A form
        // description is usually instructions, and instructions want to be legible.
      />

      <PageSection tone="cream" top width="narrow">
        {done ? (
          <SuccessState
            title="Response submitted!"
            description="Thanks — your response has been recorded. The IEEE CS team will see it."
            action={
              <Link to="/forms" className="rounded-lg bg-ieee-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-ieee-orange-dark">
                Back to Forms
              </Link>
            }
          />
        ) : (
          <div className="rounded-3xl border border-black/5 bg-white p-6 shadow-[0_8px_30px_rgba(10,10,12,0.08)] sm:p-8">
            {form.description && (
              <RichText
                text={form.description}
                className="mb-6 border-b border-black/5 pb-5 text-sm leading-relaxed text-slate-600"
              />
            )}

            {/* seats left — only when the admin chose to publish the count */}
            {capacity?.remaining != null && capacity.maxResponses != null && (
              <div
                className={`mb-5 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${
                  capacity.remaining === 0
                    ? 'bg-rose-50 text-rose-700'
                    : capacity.remaining <= 5
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-slate-50 text-slate-600'
                }`}
              >
                <Ticket className="h-4 w-4 shrink-0" />
                {capacity.remaining === 0 ? (
                  <span>
                    <strong className="font-semibold">No seats left</strong> — all {capacity.maxResponses} have been
                    taken.
                  </span>
                ) : (
                  <span>
                    <strong className="font-semibold">
                      {capacity.remaining} {capacity.remaining === 1 ? 'seat' : 'seats'}
                    </strong>{' '}
                    left of {capacity.maxResponses}
                    {capacity.remaining <= 5 && ' — this fills up fast.'}
                  </span>
                )}
              </div>
            )}

            {/* Closed, full, or expired while this form was open on screen. Everything typed is
                still on the page — this explains why the button stopped working. */}
            {unavailable && hasTyped && !done && (
              <div
                role="status"
                className="mb-5 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {isFull
                    ? 'This form filled up while you were filling it in, so it can no longer take your response.'
                    : windowPassed
                      ? `This form closed at ${formatWhen(form.closesAt!)}, while you were filling it in.`
                      : 'This form stopped accepting responses while you were filling it in.'}{' '}
                  Your answers are still here if you want to copy them.
                </span>
              </div>
            )}

            {seatsUnknown && (
              <p className="mb-5 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                We could not check how many places are left. You can still submit — if it turns
                out to be full, we will say so.
              </p>
            )}

            {/* progress */}
            {pages.length > 1 && (
              <div className="mb-6">
                <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wide text-slate-400">
                  <span>
                    Page {page + 1} of {pages.length}
                  </span>
                  <span>{progress}%</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <motion.div
                    className="h-full rounded-full bg-ieee-orange"
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}

            <AnimatePresence mode="wait">
              <motion.div
                key={current.id}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.3 }}
              >
                {current.title && <h2 className="font-display text-xl font-bold text-slate-900">{current.title}</h2>}
                {current.description && (
                  <RichText text={current.description} className="mt-1 text-sm text-slate-600" />
                )}

                <div className={`flex flex-col gap-6 ${current.title || current.description ? 'mt-6' : ''}`}>
                  {current.fields.map((field) => (
                    <div key={field.id}>
                      <label className="text-sm font-semibold text-slate-800">
                        {field.label}
                        {field.required && <span className="ml-0.5 text-ieee-orange">*</span>}
                      </label>
                      {field.description && (
                        <RichText
                          text={field.description}
                          compact
                          className="mb-2 mt-0.5 text-xs text-slate-500"
                        />
                      )}
                      <div className={field.description ? '' : 'mt-2'}>
                        <FormFieldInput field={field} value={answers[field.id]} onChange={set(field.id)} error={errors.has(field.id)} />
                      </div>
                      {errors.has(field.id) && <p className="mt-1.5 text-xs font-medium text-rose-600">This field is required.</p>}
                    </div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>

            {failure && (
              <div
                role="alert"
                className="mt-6 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p>{failure}</p>
                  {unavailable && (
                    <p className="mt-1 text-xs font-normal text-rose-600/90">
                      Your answers are still here, but this form has stopped accepting them.{' '}
                      <Link to="/forms" className="font-semibold underline">
                        See what else is open
                      </Link>
                      .
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* nav */}
            <div className="mt-8 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={back}
                disabled={page === 0}
                className="flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>

              {isLast ? (
                <button
                  type="button"
                  onClick={submit}
                  // Retrying against a form the database has already refused only produces the
                  // same refusal, so the button stops offering it.
                  disabled={busy || unavailable}
                  data-cursor="link"
                  className="flex items-center gap-2 rounded-xl bg-ieee-orange px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(255,108,12,0.3)] transition hover:bg-ieee-orange-dark disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Submit
                </button>
              ) : (
                <button
                  type="button"
                  onClick={next}
                  data-cursor="link"
                  className="flex items-center gap-1.5 rounded-xl bg-ieee-orange px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(255,108,12,0.3)] transition hover:bg-ieee-orange-dark"
                >
                  Next <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </PageSection>
    </div>
  );
}
