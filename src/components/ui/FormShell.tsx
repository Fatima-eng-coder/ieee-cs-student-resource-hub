import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface FormShellProps {
  /** Optional in-card heading. Omit when a PageHero already carries the title. */
  title?: string;
  description?: string;
  children: ReactNode;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  submitLabel?: string;
  /**
   * Blocks the button while a submission is in flight. Changing only the label left it live, so
   * a second click during a slow network sent a second submission — the pages guard themselves
   * with a ref, but a button that still looks pressable is an invitation to keep pressing.
   */
  submitDisabled?: boolean;
}

export default function FormShell({
  title,
  description,
  children,
  onSubmit,
  submitLabel = 'Submit',
  submitDisabled = false,
}: FormShellProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto w-full max-w-2xl rounded-3xl border border-black/5 bg-white p-6 shadow-[0_8px_30px_rgba(10,10,12,0.08)] sm:p-8"
    >
      {title && <h2 className="font-display text-2xl font-bold text-slate-900">{title}</h2>}
      {description && <p className="mt-2 text-sm text-slate-500">{description}</p>}
      <form onSubmit={onSubmit} className={`flex flex-col gap-5 ${title || description ? 'mt-6' : ''}`}>
        {children}
        <button
          type="submit"
          disabled={submitDisabled}
          aria-busy={submitDisabled || undefined}
          className="mt-2 w-full rounded-xl bg-ieee-orange px-5 py-3 font-semibold text-white shadow-sm transition enabled:hover:bg-ieee-orange-dark enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitLabel}
        </button>
      </form>
    </motion.div>
  );
}
