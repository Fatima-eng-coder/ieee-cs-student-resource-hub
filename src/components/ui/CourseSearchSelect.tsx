import SearchSelect from '@/components/ui/SearchSelect';
import type { Course } from '@/types';

interface CourseSearchSelectProps {
  courses: Course[];
  selectedId: string;
  onChange: (courseId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

// Module scope keeps these stable across renders so SearchSelect's index is not rebuilt each time.
const courseKey = (course: Course) => course.id;
const courseLabel = (course: Course) => `${course.code} - ${course.name}`;
const courseSearchText = (course: Course) => `${course.code} ${course.name} ${course.department}`;

const renderCourse = (course: Course) => (
  <>
    <span className="block truncate text-sm font-semibold text-slate-800">
      <span className="font-mono text-ieee-orange">{course.code}</span> - {course.name}
    </span>
    <span className="block truncate text-xs text-slate-400">{course.department}</span>
  </>
);

export default function CourseSearchSelect({
  courses,
  selectedId,
  onChange,
  disabled = false,
  placeholder = 'Search by course code or name',
}: CourseSearchSelectProps) {
  return (
    <SearchSelect
      items={courses}
      value={selectedId}
      onChange={(courseId) => onChange(courseId)}
      getKey={courseKey}
      getLabel={courseLabel}
      getSearchText={courseSearchText}
      renderOption={renderCourse}
      label="Course"
      placeholder={placeholder}
      emptyMessage="No matching courses found."
      disabled={disabled}
    />
  );
}
