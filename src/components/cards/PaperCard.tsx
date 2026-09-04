import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import type { Paper } from '@/types';

interface PaperCardProps {
  paper: Paper;
}

/**
 * The teacher's name, or null when nobody recorded one.
 *
 * Not a truthiness check. papersService writes the literal string 'Not specified' when the
 * field is left blank (papersService.ts:118), so an absent teacher arrives as a plausible
 * looking value rather than as an empty one -- and printing it would put "Not specified" on the
 * card in the confident position where a lecturer's name belongs. The older seeded rows use
 * 'Unknown' for the same thing, so both are treated as the absence they are.
 */
const NOT_A_TEACHER = new Set(['', 'not specified', 'unknown', 'n/a', '-']);

function teacherOf(paper: { instructor?: string }): string | null {
  const name = paper.instructor?.trim() ?? '';
  return NOT_A_TEACHER.has(name.toLowerCase()) ? null : name;
}

export default function PaperCard({ paper }: PaperCardProps) {
  return (
    <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.2 }} className="h-full">
      <Link
        to={`/past-papers/${paper.id}`}
        className="flex h-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            {/*
              The semester, not the title. A submitted title is free text -- "midterm paper",
              "CSC241 paper (2)", whatever the uploader typed -- so as the most prominent line on
              the card it was noise standing where the identifying fact should be. Which sitting
              of which course is what somebody scanning this grid is actually matching against.
              The title is still collected, still shown on the paper's own page, and still
              editable by an admin; it just stops being the headline.
            */}
            <h3 className="font-semibold text-slate-900">
              {paper.session} {paper.year} · {paper.examType}
            </h3>
            <p className="text-sm text-slate-500">{paper.courseName}</p>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700" title="Verified by IEEE CS">
            <ShieldCheck className="h-3 w-3" /> IEEE CS
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {paper.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              #{tag}
            </span>
          ))}
        </div>
        <div className="mt-auto flex items-center justify-between text-xs text-slate-500">
          {/* Empty rather than omitted, so `justify-between` keeps the download count on the
              right whether or not a teacher is recorded. */}
          <span>{teacherOf(paper) ?? ''}</span>
          <span>{paper.downloads} downloads</span>
        </div>
      </Link>
    </motion.div>
  );
}
