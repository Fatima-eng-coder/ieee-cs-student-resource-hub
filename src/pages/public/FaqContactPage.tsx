import { useEffect, useRef, useState } from 'react';
import { Mail, ArrowUpRight } from 'lucide-react';
import { faqsService } from '@/services/siteContentService';
import FAQAccordion from '@/components/cards/FAQAccordion';
import EmptyState from '@/components/ui/EmptyState';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import SectionHeading from '@/components/layout/SectionHeading';
import { FormField, TextInput, TextArea, Select } from '@/components/ui/FormField';
import SuccessState from '@/components/ui/SuccessState';
import { submissionsService, MAX_MESSAGE_LENGTH } from '@/services/submissionsService';
import type { FAQ } from '@/types';

const categories: FAQ['category'][] = [
  'IEEE CS',
  'Past Papers',
  'Courses',
  'Events',
  'Navigation',
  'Projects Expo',
  'Contributions',
  'Technical Issues',
];

/** The chapter's real contact points. See the note beside the list for why these are inline. */
const CONTACT_EMAIL = 'ieeecscui@gmail.com';

const SOCIALS = [
  { label: 'Instagram', href: 'https://www.instagram.com/ieee.cs.cui/' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/ieee-cs-cui/posts/?feedView=all' },
];

export default function FaqContactPage() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [faqError, setFaqError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<FAQ['category'] | 'All'>('All');
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  /*
   * The `sending` state drives the button; this drives the guard, and they cannot be the same
   * thing. Clicks that arrive in one tick are batched into a single render, so all of them read
   * the `sending` their shared render closed over — measured, three clicks sent three messages.
   * A ref is written the instant the first click is handled, before any render has to happen.
   */
  const sendingRef = useRef(false);
  const [form, setForm] = useState({ name: '', email: '', category: 'IEEE CS', message: '' });

  // contact_messages_message_check measures the trimmed text, so this counts what the database
  // will count rather than what the box happens to hold.
  const messageLength = form.message.trim().length;
  const messageTooLong = messageLength > MAX_MESSAGE_LENGTH;

  useEffect(() => {
    let ignore = false;

    faqsService
      .list()
      .then((items) => {
        if (!ignore) setFaqs(items);
      })
      .catch((err) => {
        if (!ignore) setFaqError(err instanceof Error ? err.message : 'Failed to load the questions.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const filteredFaqs = activeCategory === 'All' ? faqs : faqs.filter((f) => f.category === activeCategory);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sendingRef.current) return;

    sendingRef.current = true;
    setSending(true);
    setSendError(null);

    try {
      await submissionsService.sendContactMessage({
        name: form.name,
        email: form.email,
        category: form.category,
        message: form.message,
      });
      setSubmitted(true);
    } catch (err) {
      // The message stays in the box. It is the longest thing anyone types on this site, and
      // asking for it again is how a question goes unasked.
      setSendError(err instanceof Error ? err.message : 'Your message could not be sent right now. Please try again.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="Help Center"
        breadcrumb={[{ label: 'Home', to: '/' }, { label: 'FAQ & Contact' }]}
        title="FAQ & Contact"
        subtitle="Find quick answers to common questions, or reach out to the IEEE CS team directly — we're happy to help."
        meta={[{ value: loading || faqError ? '—' : `${faqs.length}`, label: 'Answered Questions' }]}
      />

      <PageSection tone="cream" top>
        <SectionHeading eyebrow="Common Questions" title="Frequently asked" flourish />

        {loading ? (
          <div className="mt-8">
            <EmptyState title="Loading questions" description="Fetching the answers the team has published." />
          </div>
        ) : faqError ? (
          <div className="mt-8">
            <EmptyState title="Questions unavailable" description={faqError} />
          </div>
        ) : faqs.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              title="No questions yet"
              description="Answers will appear here once the team publishes them. Use the contact form below in the meantime."
            />
          </div>
        ) : (
          <>
            <div className="mt-8 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveCategory('All')}
                data-cursor="link"
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  activeCategory === 'All'
                    ? 'bg-ieee-orange text-white shadow-[0_6px_20px_rgba(255,108,12,0.3)]'
                    : 'border border-black/10 bg-white text-slate-600 hover:border-ieee-orange/50 hover:text-ieee-orange'
                }`}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setActiveCategory(c)}
                  data-cursor="link"
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                    activeCategory === c
                      ? 'bg-ieee-orange text-white shadow-[0_6px_20px_rgba(255,108,12,0.3)]'
                      : 'border border-black/10 bg-white text-slate-600 hover:border-ieee-orange/50 hover:text-ieee-orange'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="mt-6">
              <FAQAccordion faqs={filteredFaqs} />
            </div>
          </>
        )}
      </PageSection>

      <PageSection tone="white">
        <div className="grid gap-8 md:grid-cols-[1.2fr_1fr]">
          <div className="rounded-3xl border border-black/5 bg-cream p-6 shadow-sm sm:p-8">
            <h2 className="font-display text-xl font-bold text-slate-900">Contact Us</h2>
            {submitted ? (
              <div className="mt-6">
                <SuccessState title="Message sent!" description="We'll get back to you as soon as possible." />
              </div>
            ) : (
              <form onSubmit={(submitEvent) => void handleSubmit(submitEvent)} className="mt-6 flex flex-col gap-4">
                {sendError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                    {sendError}
                  </div>
                )}
                <FormField label="Name" required>
                  <TextInput required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </FormField>
                <FormField label="Email" required>
                  <TextInput
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </FormField>
                <FormField label="Category" required>
                  <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Message" required>
                  {/*
                    Deliberately not capped with maxLength: a pasted message would be truncated
                    without a word about it. Going over is allowed, shown, and refused at the send.
                  */}
                  <TextArea required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
                  <p className={`text-xs ${messageTooLong ? 'font-medium text-rose-600' : 'text-slate-400'}`}>
                    {messageLength.toLocaleString()} / {MAX_MESSAGE_LENGTH.toLocaleString()} characters
                    {messageTooLong && ' — please shorten this before sending.'}
                  </p>
                </FormField>
                <button
                  type="submit"
                  disabled={sending}
                  className="mt-2 rounded-xl bg-ieee-orange px-5 py-3 font-semibold text-white shadow-[0_10px_30px_rgba(255,108,12,0.3)] transition hover:bg-ieee-orange-dark active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {sending ? 'Sending...' : 'Send Message'}
                </button>
              </form>
            )}
          </div>

          <div className="rounded-3xl border border-black/5 bg-cream p-6 shadow-sm sm:p-8">
            <h2 className="font-display text-xl font-bold text-slate-900">Reach Us Directly</h2>
            {/*
              Real destinations. Every one of these was a placeholder: the address was at
              example.edu -- a domain reserved by the IETF precisely so it can never receive
              mail -- and the two social links pointed at instagram.com and linkedin.com, the
              platforms' own front pages rather than this chapter's profiles. A contact panel
              that cannot be contacted is worse than no panel, because somebody trusts it.

              Hardcoded, unlike the footer's icon row which reads social_links. That is a real
              inconsistency and worth resolving later; hardcoding was asked for here, and these
              three destinations are stable.
            */}
            <ul className="mt-5 flex flex-col gap-3 text-sm">
              <li>
                <a
                  href={`https://mail.google.com/mail/?view=cm&fs=1&to=${CONTACT_EMAIL}`}
                  target="_blank"
                  rel="noreferrer"
                  data-cursor="link"
                  className="group flex items-center gap-3 rounded-xl border border-black/5 bg-white px-4 py-3 text-slate-700 transition hover:border-ieee-orange/40 hover:text-ieee-orange"
                >
                  <Mail className="h-4 w-4 shrink-0 text-ieee-orange" />
                  <span className="break-all">{CONTACT_EMAIL}</span>
                </a>
              </li>
              {SOCIALS.map((social) => (
                <li key={social.label}>
                  <a
                    href={social.href}
                    target="_blank"
                    rel="noreferrer"
                    data-cursor="link"
                    className="group flex items-center justify-between gap-3 rounded-xl border border-black/5 bg-white px-4 py-3 text-slate-700 transition hover:border-ieee-orange/40 hover:text-ieee-orange"
                  >
                    {social.label}
                    <ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:text-ieee-orange" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </PageSection>
    </div>
  );
}
