import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, PencilLine } from 'lucide-react';
import { useCourses } from '@/hooks/useCourses';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import Magnetic from '@/components/effects/Magnetic';
import SearchBar from '@/components/ui/SearchBar';
import FilterPanel, { type FilterGroup } from '@/components/ui/FilterPanel';
import CourseCard from '@/components/cards/CourseCard';
import EmptyState from '@/components/ui/EmptyState';

const featuredCourseRules = [
  { codes: ['CSC103', 'CS-101', 'CS101'], names: ['programming fundamentals', 'fundamentals of programming'] },
  { codes: ['CSC241', 'CS-210', 'CS210'], names: ['object oriented programming', 'oop'] },
  { codes: ['CSC211', 'CS-301', 'CS301'], names: ['data structures'] },
  { codes: ['CSC270', 'CS-405', 'CS405'], names: ['database systems'] },
  { codes: ['CSC323', 'CS-450', 'CS450'], names: ['operating systems', 'operating system'] },
  { codes: ['CSC275', 'CS-360', 'CS360'], names: ['computer networks', 'computer network'] },
];

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

export default function CoursesPage() {
  const { courses, loading, error } = useCourses();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const hasSearch = query.trim().length > 0;
  const hasFilters = Object.values(filters).some(Boolean);

  const featuredCourses = useMemo(() => {
    const ranked = courses
      .map((course) => {
        const normalizedCode = normalize(course.code);
        const normalizedName = normalize(course.name);
        const featuredIndex = featuredCourseRules.findIndex((rule) => {
          const codeMatch = rule.codes.some((code) => normalize(code) === normalizedCode);
          const nameMatch = rule.names.some((name) => normalize(name) === normalizedName);
          return codeMatch || nameMatch;
        });

        return {
          course,
          rank: featuredIndex === -1 ? Number.POSITIVE_INFINITY : featuredIndex,
        };
      })
      .filter((item) => Number.isFinite(item.rank))
      .sort((a, b) => a.rank - b.rank || a.course.code.localeCompare(b.course.code));

    return ranked.slice(0, 6).map((item) => item.course);
  }, [courses]);

  const filterGroups: FilterGroup[] = useMemo(
    () => [
      {
        label: 'Credit Hours',
        key: 'creditHours',
        options: [...new Set(courses.map((c) => c.creditHours))]
          .sort((a, b) => a - b)
          .map((v) => ({ label: `${v} CH`, value: String(v) })),
      },
    ],
    [courses]
  );

  const filtered = useMemo(() => {
    const source = hasSearch || hasFilters ? courses : featuredCourses;
    return source.filter((c) => {
      const matchesQuery =
        !query ||
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.code.toLowerCase().includes(query.toLowerCase());
      const matchesCredit = !filters.creditHours || String(c.creditHours) === filters.creditHours;
      return matchesQuery && matchesCredit;
    });
  }, [courses, featuredCourses, hasSearch, hasFilters, query, filters]);

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="Academics"
        breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Courses' }]}
        title="Course Resources"
        subtitle="Course outlines, CDFs, lab manuals and study tips — everything you need to get ahead, in one place."
        meta={[
          { value: `${featuredCourses.length}`, label: 'Featured' },
          { value: `${courses.length}`, label: 'Catalog' },
        ]}
      >
        <Magnetic>
          <Link
            to="/courses/teachers"
            data-cursor="link"
            className="flex items-center gap-2 rounded-xl bg-ieee-orange px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(255,108,12,0.32)] transition hover:bg-ieee-orange-dark"
          >
            <Users className="h-4 w-4" /> Teacher Directory
          </Link>
        </Magnetic>
        <Magnetic>
          <Link
            to="/courses/suggest-correction"
            data-cursor="link"
            className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur transition hover:border-ieee-orange/50 hover:text-ieee-orange"
          >
            <PencilLine className="h-4 w-4" /> Suggest Correction
          </Link>
        </Magnetic>
      </PageHero>

      <PageSection tone="cream" top>
        <SearchBar placeholder="Search by course code or name..." onSearch={setQuery} size="lg" />

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <FilterPanel
              groups={filterGroups}
              activeFilters={filters}
              onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
              onReset={() => setFilters({})}
            />
          </div>
          {loading ? (
            <EmptyState title="Loading courses" description="Fetching the latest course catalog." />
          ) : error ? (
            <EmptyState title="Could not load courses" description={error} />
          ) : filtered.length === 0 ? (
            <EmptyState title="No courses found" description="Try a different search term or filter." />
          ) : (
            <div>
              <p className="mb-4 font-mono text-xs uppercase tracking-wider text-slate-500">
                {hasSearch || hasFilters ? `${filtered.length} matching courses` : 'Featured computer science courses'}
              </p>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((course) => (
                  <CourseCard key={course.id} course={course} />
                ))}
              </div>
            </div>
          )}
        </div>
      </PageSection>
    </div>
  );
}
