interface StatusBadgeProps {
  status: 'pending' | 'approved' | 'rejected' | string;
}

const styles: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-300',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  fulfilled: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  noted: 'bg-sky-100 text-sky-800 border-sky-300',
  rejected: 'bg-rose-100 text-rose-800 border-rose-300',
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const style = styles[status] ?? 'bg-slate-100 text-slate-700 border-slate-300';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${style}`}
    >
      {status}
    </span>
  );
}
