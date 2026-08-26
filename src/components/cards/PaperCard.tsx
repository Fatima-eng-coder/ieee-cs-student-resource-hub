import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import type { Paper } from '@/types';

interface PaperCardProps {
  paper: Paper;
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
            <h3 className="font-semibold text-slate-900">{paper.title}</h3>
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
          <span>{paper.session} {paper.year} · {paper.examType}</span>
          <span>{paper.downloads} downloads</span>
        </div>
      </Link>
    </motion.div>
  );
}
