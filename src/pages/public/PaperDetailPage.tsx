import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Download, FileText, FlagTriangleRight, BookOpen, ShieldCheck } from 'lucide-react';
import type { Paper } from '@/types';
import { papersService, subscribeMaterialsChanged } from '@/services/papersService';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import SectionHeading from '@/components/layout/SectionHeading';
import VerificationBadge from '@/components/ui/VerificationBadge';
import DownloadButton from '@/components/ui/DownloadButton';
import PaperCard from '@/components/cards/PaperCard';
import EmptyState from '@/components/ui/EmptyState';
import Magnetic from '@/components/effects/Magnetic';
import { hasFile, isImage, isPdf } from '@/utils/files';

export default function PaperDetailPage() {
  const { id } = useParams();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    const load = () => papersService
      .list()
      .then((items) => {
        if (!ignore) setPapers(items);
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : 'Failed to load paper.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    const unsubscribe = subscribeMaterialsChanged(load);

    void load();

    return () => {
      ignore = true;
      unsubscribe();
    };
  }, []);

  const paper = papers.find((p) => p.id === id);

  if (loading || error || !paper) {
    return (
      <div className="relative">
        <PageHero
          compact
          eyebrow="Resources"
          breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Past Papers', to: '/past-papers' }, { label: 'Not found' }]}
          title={loading ? 'Loading paper' : error ? 'Past papers unavailable' : 'Paper not found'}
          subtitle={loading ? 'Fetching the paper from the society database.' : error ?? 'This paper may have been removed or the link is incorrect.'}
        />
        <PageSection tone="cream" top>
          <EmptyState
            title={loading ? 'Loading' : error ? 'Unable to load' : 'Nothing here'}
            description="Head back to the archive to find what you need."
            action={
              <Link to="/past-papers" className="rounded-lg bg-ieee-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-ieee-orange-dark">
                Back to Past Papers
              </Link>
            }
          />
        </PageSection>
      </div>
    );
  }

  const related = papers
    .filter((p) => p.courseId === paper.courseId && p.id !== paper.id && p.verification === 'verified')
    .slice(0, 3);
  const fileReady = hasFile(paper.fileUrl);

  const details = [
    { label: 'Session', value: `${paper.session} ${paper.year}` },
    { label: 'Exam Type', value: paper.examType },
    { label: 'Instructor', value: paper.instructor },
    { label: 'Uploaded', value: paper.uploadedDate },
    { label: 'Downloads', value: String(paper.downloads) },
  ];

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow={paper.courseName}
        breadcrumb={[
          { label: 'Home', to: '/' },
          { label: 'Past Papers', to: '/past-papers' },
          { label: paper.title },
        ]}
        title={paper.title}
        subtitle={`${paper.session} ${paper.year} · ${paper.examType} · ${paper.instructor}`}
      />

      <PageSection tone="cream" top>
        <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
          {/* preview */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="aspect-[4/5] overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_8px_30px_rgba(10,10,12,0.08)]"
          >
            {fileReady && isPdf(paper.fileUrl) ? (
              <iframe title={paper.title} src={paper.fileUrl} className="h-full w-full" />
            ) : fileReady && isImage(paper.fileUrl) ? (
              <img src={paper.fileUrl} alt={paper.title} className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full items-center justify-center text-center text-slate-400">
                <div>
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-ieee-orange/10 text-ieee-orange">
                    <FileText className="h-8 w-8" strokeWidth={1.5} />
                  </div>
                  <p className="mt-3 text-sm">No file uploaded yet</p>
                </div>
              </div>
            )}
          </motion.div>

          {/* meta */}
          <div>
            <VerificationBadge status={paper.verification} />

            {/* verified-by credit */}
            {paper.verification === 'verified' && (
              <div className="mt-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-600">Verified by</p>
                  <p className="text-sm font-bold text-emerald-800">IEEE CS</p>
                </div>
              </div>
            )}

            {paper.tags.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-1.5">
                {paper.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-ieee-orange/10 px-2.5 py-1 font-mono text-[11px] text-ieee-orange">
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 rounded-3xl border border-black/5 bg-white p-6 shadow-sm">
              {details.map((d) => (
                <div key={d.label}>
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-slate-400">{d.label}</dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-800">{d.value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 flex flex-col gap-3">
              <Magnetic>
                <DownloadButton
                  url={paper.fileUrl}
                  filename={`${paper.courseName}-${paper.examType}-${paper.year}`}
                  label="Download Paper"
                  icon={<Download className="h-4 w-4" />}
                  className="flex items-center justify-center gap-2 rounded-xl bg-ieee-orange px-5 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(255,108,12,0.3)] transition hover:bg-ieee-orange-dark"
                />
              </Magnetic>
              <Link
                to={`/courses/${paper.courseId}`}
                data-cursor="link"
                className="flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-ieee-orange/40 hover:text-ieee-orange"
              >
                <BookOpen className="h-4 w-4" /> View Course
              </Link>
              <Link
                to="/faq-contact"
                className="flex items-center justify-center gap-1.5 text-sm font-medium text-rose-600 transition hover:text-rose-700"
              >
                <FlagTriangleRight className="h-3.5 w-3.5" /> Report an issue with this paper
              </Link>
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <div className="mt-16">
            <SectionHeading eyebrow="Same Course" title="Related papers" />
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((p) => (
                <PaperCard key={p.id} paper={p} />
              ))}
            </div>
          </div>
        )}
      </PageSection>
    </div>
  );
}
