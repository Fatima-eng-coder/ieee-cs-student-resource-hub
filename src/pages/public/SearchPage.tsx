import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import SearchBar from '@/components/ui/SearchBar';
import EmptyState from '@/components/ui/EmptyState';
import {
  search,
  getSiteContentVersion,
  getUnavailableCollections,
  getPendingCollections,
  primeSiteContent,
  subscribeSiteContent,
} from '@/utils/search';
import { searchNavigation } from '@/utils/navigationSearch';
import { announcementsService, subscribeAnnouncementsChanged } from '@/services/announcementsService';
import { papersService, subscribeMaterialsChanged } from '@/services/papersService';
import type { SearchResult } from '@/types';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** "courses" / "courses and events" / "FAQs, courses and events", ready to start a sentence. */
const namesToSentence = (names: string[]) => {
  const joined =
    names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return joined.charAt(0).toUpperCase() + joined.slice(1);
};

export default function SearchPage() {
  const [params] = useSearchParams();
  const urlQuery = params.get('q') ?? '';
  const [query, setQuery] = useState(urlQuery);
  const [announcementResults, setAnnouncementResults] = useState<SearchResult[]>([]);
  const [paperResults, setPaperResults] = useState<SearchResult[]>([]);
  const [roomResults, setRoomResults] = useState<SearchResult[]>([]);

  /**
   * `?q=` is a shareable entry point, so it has to apply on every navigation — not only
   * the first render. Without this, arriving at /search?q=X while the page is already
   * open (a link, browser back/forward) leaves the previous query on screen.
   */
  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    let ignore = false;

    const load = () => announcementsService
      .list()
      .then((announcements) => {
        if (ignore) return;
        setAnnouncementResults(
          announcements.map((a) => ({
            id: a.id,
            title: a.title,
            type: 'Announcement',
            description: a.summary,
            tags: [a.category],
            link: `/announcements/${a.id}`,
          }))
        );
      })
      .catch((error) => {
        console.error('Failed to load announcements for search', error);
      });
    const unsubscribe = subscribeAnnouncementsChanged(load);

    void load();

    return () => {
      ignore = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    const load = () => papersService
      .list()
      .then((papers) => {
        if (ignore) return;
        setPaperResults(
          papers
            .filter((paper) => paper.verification === 'verified')
            .map((paper) => ({
              id: paper.id,
              title: paper.title,
              type: paper.examType === 'Quiz' || paper.examType === 'Assignment' ? 'Course Material' : 'Past Paper',
              description: `${paper.courseName} - ${paper.session} ${paper.year} ${paper.examType}`,
              tags: paper.tags,
              link: paper.examType === 'Quiz' || paper.examType === 'Assignment' ? `/courses/${paper.courseId}` : `/past-papers/${paper.id}`,
            }))
        );
      })
      .catch((error) => {
        console.error('Failed to load papers for search', error);
      });
    const unsubscribe = subscribeMaterialsChanged(load);

    void load();

    return () => {
      ignore = true;
      unsubscribe();
    };
  }, []);

  // Rooms come from the wayfinding index (which knows that "cl11" means CL-11), so they
  // are searched by that matcher rather than the generic substring filter below.
  useEffect(() => {
    let ignore = false;
    if (!query.trim()) {
      setRoomResults([]);
      return;
    }
    searchNavigation(query)
      .then((found) => {
        if (!ignore) setRoomResults(found);
      })
      .catch((error) => {
        console.error('Failed to search rooms', error);
      });
    return () => {
      ignore = true;
    };
  }, [query]);

  // The FAQ, quick-link, course and event part of the index is fetched, so it is not there for
  // the first search of a visit. Subscribing turns that arrival into a re-render instead of a
  // result set that stays wrong until the visitor types something else.
  const [siteContentVersion, setSiteContentVersion] = useState(getSiteContentVersion);
  // Which of those four could not be read at all. "No results found" over an index that is
  // quietly missing every course is the one answer this page must never give.
  const [unavailable, setUnavailable] = useState(getUnavailableCollections);
  // Still in flight. A slow read is not an empty index, and saying "no results" while one is
  // outstanding is the same wrong answer as saying it after one failed.
  const [pending, setPending] = useState(getPendingCollections);

  useEffect(() => {
    primeSiteContent();
    return subscribeSiteContent(() => {
      setSiteContentVersion(getSiteContentVersion());
      setUnavailable(getUnavailableCollections());
      setPending(getPendingCollections());
    });
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const nq = norm(q);
    const liveResults = [...announcementResults, ...paperResults].filter((item) => {
      const hay = `${item.title} ${item.description} ${item.tags.join(' ')}`.toLowerCase();
      return hay.includes(q) || (nq.length >= 2 && norm(hay).includes(nq));
    });
    return [...search(query), ...liveResults, ...roomResults];
    // siteContentVersion is not read in the body and the linter is right about that — it is
    // here precisely to re-run this when search()'s module-level snapshot of the fetched
    // collections fills. Removing it puts back the bug where the first search of a visit
    // silently omits all of them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcementResults, paperResults, roomResults, query, siteContentVersion]);

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="Find Anything"
        breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Search' }]}
        title="Search the Hub"
        subtitle="Search across past papers, courses, events, projects, rooms and more — everything in one box."
      >
        <div className="w-full max-w-2xl">
          <div className="rounded-2xl bg-white/95 shadow-[0_10px_40px_rgba(0,0,0,0.25)]">
            <SearchBar
              placeholder="Try 'DSA', 'hackathon', or 'CL-11'..."
              onSearch={setQuery}
              initialValue={urlQuery}
              size="lg"
            />
          </div>
        </div>
      </PageHero>

      <PageSection tone="cream" top width="narrow">
        {unavailable.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p>
              {namesToSentence(unavailable)} could not be loaded, so nothing from{' '}
              {unavailable.length === 1 ? 'that list' : 'those lists'} is included below.
            </p>
            <button
              type="button"
              onClick={primeSiteContent}
              data-cursor="link"
              className="shrink-0 rounded-full border border-amber-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
            >
              Try again
            </button>
          </div>
        )}

        {!query ? (
          <EmptyState
            icon="search"
            title="Start typing to search"
            description="Results across the entire resource hub will appear here."
          />
        ) : results.length === 0 && pending.length > 0 ? (
          <EmptyState
            title="Still searching…"
            description={`Nothing has matched "${query}" yet — ${namesToSentence(pending)} ${
              pending.length === 1 ? 'is' : 'are'
            } still loading.`}
          />
        ) : results.length === 0 ? (
          <EmptyState title="No results found" description={`Nothing matched "${query}".`} />
        ) : (
          <>
            <p className="mb-4 font-mono text-xs uppercase tracking-wider text-slate-500">
              {results.length} {results.length === 1 ? 'result' : 'results'} for “{query}”
            </p>
            <AnimatePresence>
              <div className="flex flex-col gap-3">
                {results.map((r, idx) => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: idx * 0.03 }}
                  >
                    <Link
                      to={r.link}
                      data-cursor="link"
                      className="group flex items-start justify-between gap-3 rounded-2xl border border-black/5 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-ieee-orange/30 hover:shadow-md"
                    >
                      <div>
                        <span className="rounded-full bg-ieee-orange/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-ieee-orange">
                          {r.type}
                        </span>
                        <h3 className="mt-2 font-display font-semibold text-slate-900">{r.title}</h3>
                        <p className="mt-1 text-sm text-slate-600">{r.description}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {r.tags.map((t) => (
                            <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                              #{t}
                            </span>
                          ))}
                        </div>
                      </div>
                      <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-slate-300 transition-all group-hover:translate-x-1 group-hover:text-ieee-orange" />
                    </Link>
                  </motion.div>
                ))}
              </div>
            </AnimatePresence>
          </>
        )}
      </PageSection>
    </div>
  );
}
