import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import FormShell from '@/components/ui/FormShell';
import { FormField, TextInput, Select } from '@/components/ui/FormField';
import SuccessState from '@/components/ui/SuccessState';
import EmptyState from '@/components/ui/EmptyState';
import { eventsService } from '@/services/eventsService';
import { appendToStorage, makeId } from '@/utils/storage';
import type { EventItem, Submission } from '@/types';

export default function EventRegisterPage() {
  const { id } = useParams();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', rollNumber: '', batch: '' });

  useEffect(() => {
    let active = true;
    setLoading(true);
    eventsService
      .getPublic(id)
      .then((item) => {
        if (active) setEvent(item);
      })
      .catch(() => {
        if (active) setEvent(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  if (loading || !event) {
    return (
      <div className="relative">
        <PageHero
          compact
          eyebrow="Events"
          breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Events', to: '/events' }, { label: loading ? 'Loading...' : 'Not found' }]}
          title={loading ? 'Loading event' : 'Event not found'}
          subtitle={loading ? 'Fetching registration details.' : 'This event may have ended or the link is incorrect.'}
        />
        <PageSection tone="cream" top>
          <EmptyState
            title="Nothing here"
            action={
              <Link to="/events" className="rounded-lg bg-ieee-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-ieee-orange-dark">
                Back to Events
              </Link>
            }
          />
        </PageSection>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submission: Submission = {
      id: makeId('sub'),
      type: 'event-registration',
      submittedBy: form.name,
      submittedAt: new Date().toISOString().slice(0, 10),
      status: 'approved',
      data: { event: event.title, email: form.email, rollNumber: form.rollNumber, batch: form.batch },
    };
    appendToStorage<Submission>('ieeecs_submissions', [], submission);
    setSubmitted(true);
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
            description={`We've saved your spot for "${event.title}". A confirmation has been noted — see you there!`}
            action={
              <Link
                to="/events"
                className="rounded-lg bg-ieee-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-ieee-orange-dark"
              >
                Back to Events
              </Link>
            }
          />
        ) : (
          <FormShell onSubmit={handleSubmit} submitLabel="Confirm Registration">
            <FormField label="Full Name" required>
              <TextInput
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Your full name"
              />
            </FormField>
            <FormField label="Email" required>
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
