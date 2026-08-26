import { useState } from 'react';
import { useFaculty } from '@/hooks/useFaculty';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import SearchBar from '@/components/ui/SearchBar';
import TeacherCard from '@/components/cards/TeacherCard';
import EmptyState from '@/components/ui/EmptyState';

export default function TeachersPage() {
  const [query, setQuery] = useState('');
  const { teachers, loading, error } = useFaculty();
  const filtered = teachers.filter(
    (t) =>
      !query ||
      t.name.toLowerCase().includes(query.toLowerCase()) ||
      t.department.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="Faculty"
        breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Courses', to: '/courses' }, { label: 'Teachers' }]}
        title="Teacher Directory"
        subtitle="Contact information and assigned courses for faculty members. We keep this factual — no ratings or reviews are published here."
        meta={[{ value: `${teachers.length}`, label: 'Faculty Members' }]}
      />

      <PageSection tone="cream" top>
        <SearchBar placeholder="Search by name or department..." onSearch={setQuery} size="lg" />
        {error && (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}
        {loading ? (
          <div className="mt-8">
            <EmptyState title="Loading faculty" description="Please wait a moment." />
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-8">
            <EmptyState title="No teachers found" />
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t) => (
              <TeacherCard key={t.id} teacher={t} />
            ))}
          </div>
        )}
      </PageSection>
    </div>
  );
}
