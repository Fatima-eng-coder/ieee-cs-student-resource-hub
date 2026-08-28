import { motion } from 'framer-motion';
import type { Teacher } from '@/types';
import Icon from '@/components/ui/Icon';

interface TeacherCardProps {
  teacher: Teacher;
  onSelect?: (teacher: Teacher) => void;
  highlighted?: boolean;
}

const initialsFor = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'FA';

export default function TeacherCard({ teacher, onSelect, highlighted }: TeacherCardProps) {
  const hasPhoto = Boolean(teacher.photo?.trim());
  const hasEmail = Boolean(teacher.email.trim());
  const hasOffice = Boolean(teacher.office.trim());

  return (
    <motion.button
      type="button"
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      onClick={() => onSelect?.(teacher)}
      id={`teacher-${teacher.id}`}
      className={`flex h-full w-full scroll-mt-28 flex-col gap-4 rounded-2xl border bg-white p-6 text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ieee-orange/30 ${
        highlighted ? 'border-ieee-orange shadow-[0_12px_34px_rgba(255,107,0,0.18)]' : 'border-slate-200'
      }`}
      data-cursor="link"
      aria-label={`View details for ${teacher.name}`}
    >
      <div className="flex items-start gap-4">
        {hasPhoto ? (
          <img src={teacher.photo} alt={teacher.name} className="h-16 w-16 rounded-full object-cover ring-2 ring-white" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-ieee-orange/10 font-display text-xl font-bold text-ieee-orange">
            {initialsFor(teacher.name)}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900">{teacher.name}</h3>
          <p className="mt-1 text-sm text-slate-500">{teacher.designation}</p>
          <p className="mt-0.5 text-xs font-medium text-slate-400">{teacher.department}</p>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3 text-sm text-slate-600">
        <p className="flex items-center gap-2 truncate">
          <Icon name="mail" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          {hasEmail ? (
            <span className="truncate">{teacher.email}</span>
          ) : (
            <span className="text-slate-400">Email not listed</span>
          )}
        </p>
        <p className="mt-2 flex items-center gap-2">
          <Icon name="building" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          {hasOffice ? (
            <span>{teacher.office}</span>
          ) : (
            <span className="text-slate-400">Office not listed</span>
          )}
        </p>
      </div>

      {teacher.courses.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {teacher.courses.map((course) => (
            <span
              key={course}
              className="rounded-full border border-ieee-orange/10 bg-cream px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-500"
            >
              {course}
            </span>
          ))}
        </div>
      )}
    </motion.button>
  );
}
