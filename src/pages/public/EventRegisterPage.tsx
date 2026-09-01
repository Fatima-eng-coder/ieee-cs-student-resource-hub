import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import FormShell from '@/components/ui/FormShell';
import { FormField, TextInput, Select } from '@/components/ui/FormField';
import SuccessState from '@/components/ui/SuccessState';
import EmptyState from '@/components/ui/EmptyState';
import { eventsService } from '@/services/eventsService';
import { submissionsService } from '@/services/submissionsService';
import type { EventItem } from '@/types';

const backToEvents = (
  <Link
    to="/events"
    className="rounded-lg bg-ieee-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-ieee-orange-dark"
  >
    Back to Events
  </Link>
);

export default function EventRegisterPage() {
  const { id } = useParams();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  // An event that is not there and an event we could not read are different answers, and
  // telling a student "not found" when the server was unreachable sends them away from a page
  // that would have worked a minute later.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', rollNumber: '', batch: '' });
  /*
   * The `saving` state drives the button; this drives the guard, and they cannot be the same
   * thing. Clicks that arrive in one tick are batched into a single render, so all of them read
   * the `saving` their shared render closed over — measured, three clicks sent three inserts.
   * A ref is written the instant the first click is handled, before any render has to happen.
   */
  const savingRef = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    eventsService
      .getPublic(id)
      .then((item) => {
        if (active) setEvent(item);
      })
      .catch(() => {
        if (!active) return;
        // Cleared as well as flagged, so a failed reload cannot leave the previous event's
        // form on screen collecting registrations against an id we no longer trust.
        setEvent(null);
        setLoadError('We could not load this event. Please check your connection and reload the page.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  if (loading || !event) {
    const title = loading ? 'Loading event' : loadError ? 'Event unavailable' : 'Event not found';
    const subtitle = loading
      ? 'Fetching registration details.'
      : (loadError ?? 'This event may have ended or the link is incorrect.');

    return (
      <div className="relative">
        <PageHero
          compact
          eyebrow="Events"
          breadcrumb={[
            { label: 'Home', to: '/' },
            { label: 'Events', to: '/events' },
            { label: loading ? 'Loading...' : 'Unavailable' },
          ]}
          title={title}
          subtitle={subtitle}
        />
        <PageSection tone="cream" top>
          <EmptyState title={title} description={subtitle} action={backToEvents} />
        </PageSection>
      </div>
    );
  }

  /*
   * The event detail page renders a greyed, unclickable "Registration Closed" span for an event
   * with registration_open = false — and that link being absent was the only thing standing
   * between a closed event and this form. A bookmark, a shared link or a search result walked
   * straight past it, and the committee collected sign-ups for an event it had told students
   * was closed.
   *
   * An internal form gets the same treatment for a different reason: those sign-ups belong in
   * form_responses, and one collected here would sit in a table nobody thinks to look in for
   * that event.
   */
  if (!event.registrationOpen || event.registrationFormId) {
    const closedByForm = Boolean(event.registrationFormId);
    const title = closedByForm ? 'Register on the event form' : 'Registration closed';
    const subtitle = closedByForm
      ? `"${event.title}" collects sign-ups through its own form.`
      : `"${event.title}" is no longer taking sign-ups.`;

    return (
      <div className="relative">
        <PageHero
          compact
          eyebrow="Events"
          breadcrumb={[
            { label: 'Home', to: '/' },
            { label: 'Events', to: '/events' },
            { label: event.title, to: `/events/${event.id}` },
            { label: closedByForm ? 'Register' : 'Closed' },
          ]}
          title={title}
          subtitle={subtitle}
        />
        <PageSection tone="cream" top>
          <EmptyState
            title={title}
            description={subtitle}
            action={
              closedByForm ? (
                <Link
                  to={`/forms/${event.registrationFormId}`}
                  className="rounded-lg bg-ieee-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-ieee-orange-dark"
                >
                  Go to the form
                </Link>
              ) : (
                backToEvents
              )
            }
          />
        </PageSection>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // A second click while the first registration is in flight would reach the unique index
    // and come back as "you have already registered" — true, but about the click they just made.
    if (savingRef.current) return;

    savingRef.current = true;
    setSaving(true);
    setError(null);

    try {
      await submissionsService.registerForEvent({
        eventId: event.id,
        name: form.name,
        email: form.email,
        rollNumber: form.rollNumber,
        batch: form.batch,
      });
      setSubmitted(true);
    } catch (err) {
      // The form keeps everything that was typed: whatever went wrong, retyping a roll number
      // is not part of the fix.
      setError(err instanceof Error ? err.message : 'Your registration could not be sent right now. Please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="Reserve your seat"
        breadcrumb={[
          { label: 'Home', to: '/' },
          { label: 'Events', to: '/events' },
          { label: event.title, to: `/events/${event.id}` },
          { label: 'Register' },
        ]}
        title={`Register: ${event.title}`}
        subtitle={`${event.date} · ${event.venue}`}
      />

      <PageSection tone="cream" top>
        {submitted ? (
          <SuccessState
            title="You're registered!"
            description={`Your details for "${event.title}" are with the organising team. See you there!`}
            action={backToEvents}
          />
        ) : (
          <FormShell
            onSubmit={(submitEvent) => void handleSubmit(submitEvent)}
            submitLabel={saving ? 'Sending...' : 'Confirm Registration'}
            submitDisabled={saving}
          >
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {error}
              </div>
            )}
            <FormField label="Full Name" required>
              <TextInput
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Your full name"
              />
            </FormField>
            <FormField label="Email" required hint="One registration per address for each event.">
              <TextInput
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.edu"
              />
            </FormField>
            <FormField label="Roll Number" required>
              <TextInput
                required
                value={form.rollNumber}
                onChange={(e) => setForm({ ...form, rollNumber: e.target.value })}
                placeholder="e.g. 2023-CS-101"
              />
            </FormField>
            <FormField label="Batch" required>
              <Select value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} required>
                <option value="">Select batch</option>
                <option>2022</option>
                <option>2023</option>
                <option>2024</option>
                <option>2025</option>
              </Select>
            </FormField>
          </FormShell>
        )}
      </PageSection>
    </div>
  );
}
