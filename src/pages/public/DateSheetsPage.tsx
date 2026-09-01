import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, CalendarClock, Download, FileText, Megaphone } from 'lucide-react';
import ComingSoon, { type MeanwhileLink } from '@/components/layout/ComingSoon';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import EmptyState from '@/components/ui/EmptyState';
import DownloadButton from '@/components/ui/DownloadButton';
import { dateSheetsService, type AdminDateSheet } from '@/services/dateSheetsService';

const meanwhile: MeanwhileLink[] = [
  {
    label: 'Past Papers',
    description: 'Verified midterms, finals and quizzes across every course.',
    to: '/past-papers',
    icon: FileText,
  },
  {
    label: 'Courses',
    description: 'Course description forms, lab manuals and study resources.',
    to: '/courses',
    icon: BookOpen,
  },
  {
    label: 'Announcements',
    description: 'Department notices, including exam updates as they are posted.',
    to: '/announcements',
    icon: Megaphone,
  },
];

const breadcrumb = [{ label: 'Home', to: '/' }, { label: 'Date Sheets' }];

const parkedScreen = (
  <ComingSoon
    eyebrow="Exams"
    breadcrumb={breadcrumb}
    title="Exam date sheets are coming back."
    description="Per-program, per-semester date sheets are being moved onto a schedule the department can update directly, so they're paused until that changeover is done."
    icon={CalendarClock}
    meanwhile={meanwhile}
  />
);

/**
 * Held while the read is in flight.
 *
 * Deliberately neutral: it must not say the section is paused, because the very next render may
 * be a full listing, and it must not say there is nothing here, because nobody has looked yet.
 */
const loadingScreen = (
  <div className="relative">
    <PageHero
      compact
      eyebrow="Exams"
      breadcrumb={breadcrumb}
      title="Date Sheets"
      subtitle="Checking for published date sheets…"
    />
    <PageSection tone="cream" top>
      <div className="h-64 animate-pulse rounded-3xl border border-black/5 bg-white" />
    </PageSection>
  </div>
);

/**
 * Program name -> its sheets, newest term first and then by semester.
 *
 * Sorted here rather than leaned on from the read. listPublished() already returns them in this
 * order, but a student scanning for "semester 3" down a column is the whole point of the layout,
 * and a page that reads correctly only while a server-side ORDER BY stays exactly as it is today
 * is one query edit away from shuffling itself with nothing to catch it.
 */
function groupByProgram(sheets: AdminDateSheet[]): [string, AdminDateSheet[]][] {
  const groups = new Map<string, AdminDateSheet[]>();
  for (const sheet of sheets) {
    const existing = groups.get(sheet.program);
    if (existing) existing.push(sheet);
    else groups.set(sheet.program, [sheet]);
  }

  for (const programSheets of groups.values()) {
    programSheets.sort((a, b) => b.year - a.year || a.semester - b.semester || a.title.localeCompare(b.title));
  }

  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

const downloadName = (sheet: AdminDateSheet) =>
  `${sheet.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'date-sheet'}.pdf`;

/**
 * Deliberately two pages in one.
 *
 * The parked "coming back" screen is still what a visitor sees, and is what they will keep
 * seeing until somebody publishes a date sheet in the portal — the table is empty today, so
 * nothing about the site changes on the day this ships. The moment there is at least one
 * published sheet, this page turns itself into the real listing without anyone editing code.
 *
 * The three outcomes are kept distinct on purpose. An empty result means "nothing published
 * yet" and shows the parked screen; a failed read means "we do not know" and says so. Falling
 * back to the parked screen when the read fails would tell a student their date sheet does not
 * exist because a request timed out.
 */
export default function DateSheetsPage() {
  const [sheets, setSheets] = useState<AdminDateSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    dateSheetsService
      .listPublished()
      .then((items) => {
        if (!ignore) setSheets(items);
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : 'Failed to load date sheets.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  if (error) {
    return (
      <div className="relative">
        <PageHero
          compact
          eyebrow="Exams"
          breadcrumb={breadcrumb}
          title="Date Sheets"
          subtitle="We could not load the exam date sheets just now."
        />
        <PageSection tone="cream" top width="narrow">
          <EmptyState title="Date sheets unavailable" description={error} />
        </PageSection>
      </div>
    );
  }

  /*
   * Nothing published: the parked screen is the page's default and stays it.
   *
   * "Still loading" used to be folded in here, which told every visitor the section was paused
   * before the read had answered — and then swapped it for a real listing a moment later. A
   * page that says "this is unavailable" and then contradicts itself is worse than one that
   * takes a beat.
   */
  if (loading) return loadingScreen;
  if (sheets.length === 0) return parkedScreen;

  const groups = groupByProgram(sheets);

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="Exams"
        breadcrumb={breadcrumb}
        title="Date Sheets"
        subtitle="Exam schedules published by the department, per program and semester."
        meta={[
          { value: `${sheets.length}`, label: sheets.length === 1 ? 'Sheet' : 'Sheets' },
          { value: `${groups.length}`, label: groups.length === 1 ? 'Program' : 'Programs' },
        ]}
      />

      <PageSection tone="cream" top>
        <div className="flex flex-col gap-10">
          {groups.map(([program, programSheets], groupIndex) => (
            <div key={program}>
              <div className="flex items-center gap-4">
                <h2 className="font-display text-lg font-bold text-slate-900">{program}</h2>
                <span aria-hidden="true" className="h-px flex-1 bg-black/10" />
                <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
                  {programSheets.length} {programSheets.length === 1 ? 'sheet' : 'sheets'}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {programSheets.map((sheet, index) => (
                  <motion.div
                    key={sheet.id}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ duration: 0.3, delay: Math.min(groupIndex * 0.04 + index * 0.03, 0.3) }}
                    className="flex flex-col gap-3 rounded-2xl border border-black/5 bg-white p-5 shadow-sm transition hover:border-ieee-orange/30 hover:shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ieee-orange/10 text-ieee-orange">
                        <CalendarClock aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0">
                        <p className="font-display text-base font-bold text-slate-900">{sheet.title}</p>
                        <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-slate-400">
                          Semester {sheet.semester} · {sheet.term} {sheet.year}
                        </p>
                      </div>
                    </div>

                    <DownloadButton
                      url={sheet.fileUrl}
                      filename={downloadName(sheet)}
                      label="Download date sheet"
                      icon={<Download aria-hidden="true" className="h-4 w-4" />}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ieee-orange-dark"
                    />
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PageSection>
    </div>
  );
}
