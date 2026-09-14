import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import PageHero, { type Crumb } from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';

/** A single prominent call to action, for a parked page that still has somewhere to send you. */
export interface ComingSoonAction {
  label: string;
  to: string;
  /** One line under the button saying what happens next. */
  hint?: string;
}

export interface MeanwhileLink {
  label: string;
  description: string;
  to: string;
  icon: LucideIcon;
}

interface ComingSoonProps {
  /** Small mono label above the title, e.g. "Projects". */
  eyebrow: string;
  title: ReactNode;
  /** One or two sentences on what is happening and what to expect. */
  description: ReactNode;
  breadcrumb?: Crumb[];
  /** The module's own icon, shown large in the medallion. */
  icon: LucideIcon;
  /** Onward destinations so the page is never a dead end. */
  meanwhile?: MeanwhileLink[];
  /**
   * The one thing a visitor can still do here, shown as a primary button.
   *
   * A parked page is not always a page with nothing behind it. The projects showcase, for
   * instance, is empty only because nothing has been approved yet -- submissions are open the
   * whole time, and the page that takes them was reachable from nowhere while this screen was
   * up. Without this prop the parked state had to either lie about that or hide it.
   */
  action?: ComingSoonAction;
}

const listVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

/**
 * Placeholder screen for a module that is deliberately parked rather than
 * broken. Reuses the standard hero/section shell so a parked page still reads
 * as a designed part of the site, and always offers somewhere else to go.
 */
export default function ComingSoon({
  eyebrow,
  title,
  description,
  breadcrumb,
  icon: Icon,
  meanwhile = [],
  action,
}: ComingSoonProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative">
      <PageHero
        compact
        align="center"
        eyebrow={eyebrow}
        breadcrumb={breadcrumb}
        title={title}
        subtitle={description}
      />

      <PageSection tone="cream" top width="narrow">
        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="relative flex h-40 w-40 items-center justify-center sm:h-48 sm:w-48"
          >
            <span
              aria-hidden="true"
              className="absolute inset-2 rounded-full bg-ieee-orange/20 blur-3xl"
            />
            <span aria-hidden="true" className="absolute inset-0 rounded-full border border-ieee-orange/15" />
            <span aria-hidden="true" className="absolute inset-5 rounded-full border border-ieee-orange/25" />
            <motion.span
              aria-hidden="true"
              className="absolute inset-10 rounded-full bg-white shadow-[0_20px_45px_rgba(255,108,12,0.2)]"
              animate={reduceMotion ? undefined : { scale: [1, 1.05, 1] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            />
            <Icon
              aria-hidden="true"
              strokeWidth={1.25}
              className="relative h-12 w-12 text-ieee-orange sm:h-14 sm:w-14"
            />
          </motion.div>

          <span className="mt-8 inline-flex items-center gap-2 rounded-full border border-ieee-orange/25 bg-ieee-orange/10 px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-ieee-orange-dark">
            <motion.span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-ieee-orange"
              animate={reduceMotion ? undefined : { opacity: [1, 0.45, 1], scale: [1, 1.4, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
            In development
          </span>

          <p className="mt-5 max-w-md text-sm leading-relaxed text-slate-600">
            Nothing here is broken — this page is parked while the section is rebuilt, and it will
            return at this same address. The rest of the site is working as usual.
          </p>

          {action && (
            <div className="mt-7 flex flex-col items-center">
              <Link
                to={action.to}
                data-cursor="link"
                className="inline-flex items-center gap-2 rounded-xl bg-ieee-orange px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(255,108,12,0.3)] transition hover:bg-ieee-orange-dark"
              >
                {action.label}
                <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              {action.hint && (
                <p className="mt-2.5 max-w-sm text-xs leading-relaxed text-slate-500">{action.hint}</p>
              )}
            </div>
          )}
        </div>

        {meanwhile.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center gap-4">
              <h2 className="font-mono text-[11px] font-medium uppercase tracking-widest text-slate-400">
                In the meantime
              </h2>
              <span aria-hidden="true" className="h-px flex-1 bg-black/10" />
            </div>

            <motion.ul
              variants={listVariants}
              initial={reduceMotion ? false : 'hidden'}
              animate="visible"
              className="mt-5 flex flex-col gap-3"
            >
              {meanwhile.map(({ label, description: linkDescription, to, icon: LinkIcon }) => (
                <motion.li key={to} variants={cardVariants}>
                  <Link
                    to={to}
                    data-cursor="link"
                    className="group flex items-center gap-4 rounded-2xl border border-black/5 bg-white p-4 shadow-sm transition hover:border-ieee-orange/40 hover:shadow-md sm:p-5"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ieee-orange/10 text-ieee-orange transition group-hover:bg-ieee-orange group-hover:text-white">
                      <LinkIcon aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block font-display text-base font-bold text-slate-900">
                        {label}
                      </span>
                      <span className="mt-0.5 block text-sm text-slate-500">{linkDescription}</span>
                    </span>
                    <ArrowUpRight
                      aria-hidden="true"
                      className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ieee-orange"
                    />
                  </Link>
                </motion.li>
              ))}
            </motion.ul>
          </div>
        )}
      </PageSection>
    </div>
  );
}
