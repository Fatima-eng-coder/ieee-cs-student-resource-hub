import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { Course } from '@/types';

interface CourseSearchSelectProps {
  courses: Course[];
  selectedId: string;
  onChange: (courseId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

export default function CourseSearchSelect({
  courses,
  selectedId,
  onChange,
  disabled = false,
  placeholder = 'Search by course code or name',
}: CourseSearchSelectProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedCourse = courses.find((course) => course.id === selectedId) ?? null;

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const filteredCourses = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return courses.slice(0, 40);

    const normalizedQuery = normalize(trimmed);
    const lowerQuery = trimmed.toLowerCase();

    return courses
      .filter((course) => {
        const label = `${course.code} ${course.name} ${course.department}`;
        return label.toLowerCase().includes(lowerQuery) || normalize(label).includes(normalizedQuery);
      })
      .slice(0, 40);
  }, [courses, query]);

  const selectCourse = (courseId: string) => {
    onChange(courseId);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          disabled={disabled}
          value={open ? query : selectedCourse ? `${selectedCourse.code} - ${selectedCourse.name}` : ''}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-10 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-ieee-orange focus:ring-2 focus:ring-ieee-orange/20 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-black/5 hover:text-slate-700 disabled:cursor-not-allowed"
          aria-label="Toggle course list"
        >
          <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && !disabled && (
        <div className="absolute z-30 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border border-black/10 bg-white p-1.5 shadow-xl">
          {filteredCourses.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-400">No matching courses found.</p>
          ) : (
            filteredCourses.map((course) => (
              <button
                key={course.id}
                type="button"
                data-cursor="link"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectCourse(course.id)}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-cream"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-800">
                    <span className="font-mono text-ieee-orange">{course.code}</span> - {course.name}
                  </span>
                  <span className="block truncate text-xs text-slate-400">{course.department}</span>
                </span>
                {course.id === selectedId && <Check className="h-4 w-4 shrink-0 text-ieee-orange" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
