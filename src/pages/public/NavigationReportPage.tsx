import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import FormShell from '@/components/ui/FormShell';
import { FormField, TextInput, TextArea } from '@/components/ui/FormField';
import SuccessState from '@/components/ui/SuccessState';
import { submissionsService, MAX_ISSUE_LENGTH } from '@/services/submissionsService';

export default function NavigationReportPage() {
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ route: '', issue: '', name: '' });
  /*
   * The `saving` state drives the button; this drives the guard, and they cannot be the same
   * thing. Clicks that arrive in one tick are batched into a single render, so all of them read
   * the `saving` their shared render closed over — measured, three clicks sent three inserts.
   * A ref is written the instant the first click is handled, before any render has to happen.
   */
  const savingRef = useRef(false);

  // navigation_reports_issue_check measures the trimmed text, so this counts what the database
  // will count rather than what the box happens to hold.
  const issueLength = form.issue.trim().length;
  const issueTooLong = issueLength > MAX_ISSUE_LENGTH;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (savingRef.current) return;

    savingRef.current = true;
    setSaving(true);
    setError(null);

    try {
      await submissionsService.reportRoute({
        route: form.route,
        issue: form.issue,
        reporterName: form.name,
      });
      setSubmitted(true);
    } catch (err) {
      // Everything typed stays in the form. Describing a wrong route takes effort, and losing
      // it to a dropped connection is how a report stops being filed at all.
      setError(err instanceof Error ? err.message : 'Your report could not be sent right now. Please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="Help us map it"
        breadcrumb={[
          { label: 'Home', to: '/' },
          { label: 'Navigation', to: '/navigation' },
          { label: 'Report' },
        ]}
        title="Report a Wrong Route"
        subtitle="Spotted a route that's off? Tell us what went wrong and our navigation team will fix it."
      />

      <PageSection tone="cream" top>
        {submitted ? (
          <SuccessState
            title="Thanks for the report!"
            description="It's with our navigation team, who will check the route against the survey and correct it."
            action={
              <Link
                to="/navigation"
                className="rounded-lg bg-ieee-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-ieee-orange-dark"
              >
                Back to Navigation
              </Link>
            }
          />
        ) : (
          <FormShell
            onSubmit={(submitEvent) => void handleSubmit(submitEvent)}
            submitLabel={saving ? 'Sending...' : 'Submit Report'}
            submitDisabled={saving}
          >
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {error}
              </div>
            )}
            <FormField label="Your Name (optional)">
              <TextInput
                placeholder="Anonymous"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </FormField>
            <FormField label="Which route?" required hint="e.g. Entrance 2 to Lab 3">
              <TextInput
                required
                value={form.route}
                onChange={(e) => setForm({ ...form, route: e.target.value })}
                placeholder="Entrance 2 to Lab 3"
              />
            </FormField>
            <FormField label="What's wrong with it?" required>
              {/*
                Deliberately not capped with maxLength: a pasted description would be truncated
                without a word about it. Going over is allowed, shown, and refused at the send.
              */}
              <TextArea
                required
                value={form.issue}
                onChange={(e) => setForm({ ...form, issue: e.target.value })}
                placeholder="Describe the issue..."
              />
              <p className={`text-xs ${issueTooLong ? 'font-medium text-rose-600' : 'text-slate-400'}`}>
                {issueLength.toLocaleString()} / {MAX_ISSUE_LENGTH.toLocaleString()} characters
                {issueTooLong && ' — please shorten this before sending.'}
              </p>
            </FormField>
          </FormShell>
        )}
      </PageSection>
    </div>
  );
}
