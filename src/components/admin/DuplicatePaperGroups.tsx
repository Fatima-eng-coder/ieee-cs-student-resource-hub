import { useState } from 'react';
import { AlertTriangle, Check, Copy, Pencil, Trash2 } from 'lucide-react';

import type { Paper } from '@/types';

/**
 * Papers that describe the same sitting, shown together so an admin can judge them side by side.
 *
 * Duplicates used to surface one at a time, and only reactively: you found out two rows collided
 * when a save or a verify was refused, at which point you were looking at one of them and had to
 * go hunting for the other. That is the wrong moment and the wrong view — deciding which copy to
 * keep means comparing them, and comparing them means seeing them at once.
 *
 * A group is (course, session, year, exam type), which is the same key
 * papersService.isSameDuplicateGroup uses to refuse a write. Deliberately NOT keyed on title or
 * instructor: the title is free text a student typed, and `instructor` is NOT NULL defaulting to
 * 'Not specified', so both differ constantly between rows that are plainly the same paper.
 * Grouping on them would hide the duplicates this panel exists to surface.
 *
 * "Keep all" is local to the session and stores no row. Two copies of a sitting is often correct
 * — a midterm with two versions, a clearer rescan — so the panel needs a way to say "yes, I
 * looked, they are both meant to be here" without writing a decision into the database that a
 * later admin would have no way to revisit.
 */

export interface PaperGroup {
  key: string;
  courseName: string;
  courseId: string;
  session: string;
  year: number;
  examType: string;
  papers: Paper[];
}

const groupKey = (paper: Paper) =>
  [paper.courseId, paper.session, paper.year, paper.examType].join('::');

export function groupDuplicatePapers(papers: Paper[]): PaperGroup[] {
  const groups = new Map<string, PaperGroup>();

  for (const paper of papers) {
    const key = groupKey(paper);
    const existing = groups.get(key);
    if (existing) {
      existing.papers.push(paper);
      continue;
    }
    groups.set(key, {
      key,
      courseName: paper.courseName,
      courseId: paper.courseId,
      session: paper.session,
      year: paper.year,
      examType: paper.examType,
      papers: [paper],
    });
  }

  return [...groups.values()]
    .filter((group) => group.papers.length > 1)
    // Biggest pile-ups first: those are the ones costing a student the most confusion.
    .sort((a, b) => b.papers.length - a.papers.length || a.courseName.localeCompare(b.courseName));
}

/** 'Not specified' is the column default, so it means nobody recorded a teacher. */
const NOT_A_TEACHER = new Set(['', 'not specified', 'unknown', 'n/a', '-']);
const teacherOf = (paper: Paper): string | null => {
  const name = paper.instructor?.trim() ?? '';
  return NOT_A_TEACHER.has(name.toLowerCase()) ? null : name;
};

export default function DuplicatePaperGroups({
  papers,
  canManage,
  onEdit,
  onRemove,
  onView,
}: {
  papers: Paper[];
  canManage: boolean;
  onEdit: (paper: Paper) => void;
  onRemove: (paper: Paper) => void;
  onView: (paper: Paper) => void;
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);

  const groups = groupDuplicatePapers(papers).filter((group) => !dismissed.includes(group.key));
  if (groups.length === 0) return null;

  const copies = groups.reduce((total, group) => total + group.papers.length, 0);

  return (
    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-base font-bold text-slate-900">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Possible duplicates
        </h3>
        <span className="font-mono text-[11px] text-amber-700">
          {groups.length} {groups.length === 1 ? 'sitting' : 'sittings'} · {copies} copies
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-amber-800/80">
        Same course, session, year and paper type. Two copies is often right — a second version,
        or a clearer scan. Open them to compare, correct anything wrong, then keep both or remove
        the one you do not want.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {groups.map((group) => (
          <div key={group.key} className="rounded-xl border border-amber-200/80 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">
                {group.courseName}
                <span className="ml-2 font-normal text-slate-500">
                  {group.session} {group.year} · {group.examType}
                </span>
              </p>
              <button
                type="button"
                onClick={() => setDismissed((current) => [...current, group.key])}
                className="flex items-center gap-1 rounded-lg border border-black/10 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700"
              >
                <Check className="h-3.5 w-3.5" /> Keep all
              </button>
            </div>

            <ul className="mt-2.5 flex flex-col gap-2">
              {group.papers.map((paper) => {
                const teacher = teacherOf(paper);
                return (
                  <li
                    key={paper.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-black/5 bg-cream/60 px-3 py-2"
                  >
                    <Copy className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      {/* The title is shown HERE and nowhere else on the public cards: it is
                          exactly the free text that differs between copies, so it is the thing
                          an admin needs to read to tell them apart. */}
                      <p className="truncate text-sm font-medium text-slate-800">{paper.title}</p>
                      <p className="truncate text-[11px] text-slate-500">
                        {teacher ?? 'No teacher recorded'} · uploaded {paper.uploadedDate} by {paper.uploadedBy}
                        {paper.verification === 'pending' ? ' · awaiting review' : ''}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        paper.verification === 'verified'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {paper.verification === 'verified' ? 'Approved' : 'Pending'}
                    </span>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onView(paper)}
                        className="rounded-lg border border-black/5 px-2 py-1 text-xs font-medium text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange"
                      >
                        View
                      </button>
                      {canManage && (
                        <>
                          <button
                            type="button"
                            onClick={() => onEdit(paper)}
                            aria-label={`Edit ${paper.title}`}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/5 text-slate-500 transition hover:border-ieee-orange/40 hover:text-ieee-orange"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemove(paper)}
                            aria-label={`Remove ${paper.title}`}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/5 text-slate-400 transition hover:border-rose-300 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
