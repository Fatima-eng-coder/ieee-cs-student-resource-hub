import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Course } from '@/types';

interface CourseCardProps {
  course: Course;
}

export default function CourseCard({ course }: CourseCardProps) {
  return (
    <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.2 }} className="h-full">
      <Link
        to={`/courses/${course.id}`}
        className="flex min-h-[190px] h-full flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-ieee-orange/30 hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="inline-flex rounded-full bg-ieee-orange/10 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase text-ieee-orange">
              {course.code}
            </span>
            <h3 className="mt-3 font-display text-lg font-bold leading-snug text-slate-900">{course.name}</h3>
          </div>
        </div>
        <p className="line-clamp-3 text-sm leading-relaxed text-slate-500">{course.description}</p>
        <div className="mt-auto flex items-center justify-between text-xs text-slate-500">
          <span>{course.creditHours} credit hours</span>
          <span>{course.department}</span>
        </div>
      </Link>
    </motion.div>
  );
}
