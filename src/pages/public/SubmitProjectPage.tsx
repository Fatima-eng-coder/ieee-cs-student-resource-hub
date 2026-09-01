import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Check, Clock, Loader2, LogIn, Plus, X } from 'lucide-react';
import {
  projectsService,
  subscribeProjectsChanged,
  MAX_PROJECT_SCREENSHOTS,
  type Project,
} from '@/services/projectsService';
import { useAuth } from '@/context/AuthContext';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import { FormField, TextInput, TextArea } from '@/components/ui/FormField';
import PhotoFilePicker from '@/components/ui/PhotoFilePicker';
import StatusBadge from '@/components/ui/StatusBadge';

const SIGN_IN_REASON = 'Log in to submit a project — a submission is credited to your account.';

/** Small add/remove chip input used for creators and tech stack. */
function ChipInput({
  values,
  onChange,
  placeholder,
  tone = 'orange',
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  tone?: 'orange' | 'slate';
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
      {values.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span
              key={v}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                tone === 'orange' ? 'bg-ieee-orange/10 text-ieee-orange' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="w-full bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-slate-400"
        />
        <button
          type="button"
          onClick={add}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm transition hover:text-ieee-orange"
          aria-label="Add"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function SubmitProjectPage() {
  const { user, ensureAuth } = useAuth();
  const [form, setForm] = useState({ title: '', tagline: '', description: '', category: '', githubUrl: '', demoUrl: '' });
  const [creators, setCreators] = useState<string[]>([]);
  const [techStack, setTechStack] = useState<string[]>([]);
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState<Project | null>(null);
  const [mine, setMine] = useState<Project[]>([]);
  const [mineError, setMineError] = useState<string | null>(null);
  const prompted = useRef(false);

  /**
   * The insert policy pins author_id = auth.uid(), so this form has nowhere to send a guest's
   * work. Asked for on arrival rather than at the end, in the spirit of ContributePage: a guest
   * who is going to be turned away should hear it before they have written three paragraphs and
   * picked their screenshots, not after.
   */
  useEffect(() => {
    if (user || prompted.current) return;
    prompted.current = true;
    ensureAuth(undefined, SIGN_IN_REASON);
  }, [user, ensureAuth]);

  // Prefill the first creator with the signed-in student's name.
  useEffect(() => {
    if (user && creators.length === 0) setCreators([user.name]);
  }, [user, creators.length]);

  /**
   * "Did it arrive?" — the read policy exists so this question has an answer that is not "ask an
   * admin", and the subscription means an approval or a rejection lands here without a reload.
   */
  const loadMine = useCallback(() => {
    if (!user) {
      setMine([]);
      return;
    }
    projectsService
      .listMine()
      .then((projects) => {
        setMine(projects);
        setMineError(null);
      })
      .catch((cause: unknown) => {
        // An empty list and a failed read are the same state, and the panel hides on empty — so
        // swallowing this told a student who had just submitted that they had submitted nothing.
        // That is the one question this panel exists to answer, so the failure is shown.
        setMine([]);
        setMineError(
          cause instanceof Error && cause.message
            ? cause.message
            : 'We could not check your previous submissions just now.',
        );
      });
  }, [user]);

  // Guests have no submissions to watch, so they open no channel.
  useEffect(() => {
    if (!user) {
      setMine([]);
      return;
    }
    loadMine();
    return subscribeProjectsChanged(loadMine);
  }, [user, loadMine]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const valid = Boolean(form.title.trim() && form.tagline.trim() && form.description.trim() && creators.length > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ensureAuth(undefined, SIGN_IN_REASON)) return;
    if (!user || !valid) return;

    setError('');
    setBusy(true);
    try {
      const created = await projectsService.submit({
        title: form.title,
        tagline: form.tagline,
        description: form.description,
        category: form.category,
        githubUrl: form.githubUrl,
        demoUrl: form.demoUrl,
        authorName: user.name,
        creators,
        techStack,
        screenshots,
      });
      setSubmitted(created);
      setScreenshots([]);
      loadMine();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your project could not be submitted.');
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="relative">
        <PageHero
          compact
          eyebrow="Share your work"
          breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Projects', to: '/projects-expo' }, { label: 'Share' }]}
          title="Your project is with the team"
          subtitle="It is stored and waiting for a content manager to review it."
        />
        <PageSection tone="cream" top width="narrow">
          <div className="mx-auto max-w-md rounded-3xl border border-black/5 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Check className="h-7 w-7" />
            </div>
            <h2 className="mt-4 font-display text-xl font-bold text-slate-900">{submitted.title}</h2>
            <p className="mt-2 text-sm text-slate-600">
              Projects are checked before they appear in the showcase, so this one is not public yet. You can see it
              waiting in "Your submissions" below, and it will move to approved there once the team has looked at it.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  setSubmitted(null);
                  setForm({ title: '', tagline: '', description: '', category: '', githubUrl: '', demoUrl: '' });
                  setTechStack([]);
                }}
                className="rounded-xl bg-ieee-orange px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(255,108,12,0.3)] transition hover:bg-ieee-orange-dark"
              >
                Submit another project
              </button>
              <Link
                to="/projects-expo"
                className="rounded-xl border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-ieee-orange/40 hover:text-ieee-orange"
              >
                Back to Projects
              </Link>
            </div>
          </div>

          <MySubmissions projects={mine} error={mineError} />
        </PageSection>
      </div>
    );
  }

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="Share your work"
        breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Projects', to: '/projects-expo' }, { label: 'Share' }]}
        title="Post a Project"
        subtitle="Show the community what you built. Every project is checked by the team before it appears in the showcase."
      />

      <PageSection tone="cream" top width="narrow">
        <form
          onSubmit={handleSubmit}
          className="mx-auto w-full max-w-2xl rounded-3xl border border-black/5 bg-white p-6 shadow-[0_8px_30px_rgba(10,10,12,0.08)] sm:p-8"
        >
          <div className="flex flex-col gap-5">
            <FormField label="Project Title" required>
              <TextInput required value={form.title} onChange={set('title')} placeholder="e.g. CampusNav" />
            </FormField>
            <FormField label="Tagline" required hint="One punchy line about what it does">
              <TextInput required value={form.tagline} onChange={set('tagline')} placeholder="Indoor navigation for the CS block" />
            </FormField>
            <FormField label="Creators" required hint="Add everyone who built it — press Enter after each name">
              <ChipInput values={creators} onChange={setCreators} placeholder="Add a creator's name" />
            </FormField>
            <FormField label="Tech Stack" hint="Press Enter after each technology">
              <ChipInput values={techStack} onChange={setTechStack} placeholder="React, Node.js, PostgreSQL…" tone="slate" />
            </FormField>
            <FormField label="Category">
              <TextInput value={form.category} onChange={set('category')} placeholder="e.g. Web, AI, Mobile" />
            </FormField>
            <FormField label="Project Description" required hint="Problem, solution, features, what you learned…">
              <TextArea
                required
                value={form.description}
                onChange={set('description')}
                className="min-h-40"
                placeholder="Tell the story of your project…"
              />
            </FormField>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="GitHub URL">
                <TextInput value={form.githubUrl} onChange={set('githubUrl')} placeholder="https://github.com/…" />
              </FormField>
              <FormField label="Live Demo URL" hint="Optional hosting link">
                <TextInput value={form.demoUrl} onChange={set('demoUrl')} placeholder="https://your-demo.app" />
              </FormField>
            </div>
            <FormField
              label="Screenshots"
              hint={`Up to ${MAX_PROJECT_SCREENSHOTS} — the first is used as the cover`}
            >
              <PhotoFilePicker value={screenshots} onChange={setScreenshots} max={MAX_PROJECT_SCREENSHOTS} />
            </FormField>

            {error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </p>
            )}

            {user ? (
              <button
                type="submit"
                disabled={busy || !valid}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-ieee-orange px-5 py-3.5 font-semibold text-white shadow-[0_10px_30px_rgba(255,108,12,0.32)] transition hover:bg-ieee-orange-dark disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.99]"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? 'Sending…' : 'Submit for review'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => ensureAuth(undefined, SIGN_IN_REASON)}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-ieee-orange px-5 py-3.5 font-semibold text-white shadow-[0_10px_30px_rgba(255,108,12,0.32)] transition hover:bg-ieee-orange-dark"
              >
                <LogIn className="h-4 w-4" /> Log in to submit a project
              </button>
            )}
          </div>
        </form>

        <MySubmissions projects={mine} error={mineError} />
      </PageSection>
    </div>
  );
}

/** Only rendered when there is something to show — an empty panel would answer a question nobody asked. */
function MySubmissions({ projects, error }: { projects: Project[]; error: string | null }) {
  if (error) {
    return (
      <p
        role="status"
        className="mx-auto mt-8 w-full max-w-2xl rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800"
      >
        {error} Anything you have already sent is safe — this panel just could not read it back.
      </p>
    );
  }

  if (projects.length === 0) return null;

  return (
    <div className="mx-auto mt-8 w-full max-w-2xl rounded-3xl border border-black/5 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
        <Clock className="h-4 w-4 text-ieee-orange" /> Your submissions
      </h2>
      <ul className="mt-4 flex flex-col divide-y divide-black/5">
        {projects.map((project) => (
          <li key={project.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-800">{project.title}</p>
              <p className="truncate text-xs text-slate-500">{project.tagline}</p>
            </div>
            <StatusBadge status={project.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}
